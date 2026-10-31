// BANC « OUVERTURE DE LA FICHE » (31/10) — 2. mesurer (voir construire.mjs).
// Banc (31/10) : délai entre le TOUCHER d'une carte du Stock et l'affichage de la fiche « Modifier l'article ».
// node mesurer.mjs <dist> <moteur chromium|webkit> <ralenti CPU> <n articles> [profil] [vue liste|cartes]
// Chromium : appareil Pixel 7 (toucher réel), CPU ralenti par CDP ; mesure = Event Timing (durée de l'interaction
// jusqu'à la peinture suivante) ET horloge de la page (toucher → fiche dans le DOM → image suivante).
// WebKit : iPhone 13, sans ralenti possible ; mesure = horloge de la page.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { chromium, webkit, devices } = await import(pathToFileURL(path.join(DEPOT, 'node_modules/playwright/index.mjs')).href);

const [dist, moteur = 'chromium', ralenti = '1', n = '0', profil = '', vue = ''] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const serveur = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(dist, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const port = serveur.address().port;

const navigateur = await (moteur === 'webkit' ? webkit : chromium).launch({ headless: true });
const appareil = moteur === 'webkit' ? devices['iPhone 13'] : devices['Pixel 7'];
const ctx = await navigateur.newContext({ ...appareil, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await ctx.route('**/*', (route) => {
  const u = route.request().url();
  if (u.startsWith(`http://127.0.0.1:${port}`)) return route.continue();
  if (['image', 'font'].includes(route.request().resourceType()) && route.request().method() === 'GET') return route.continue();
  return route.abort();
});
const page = await ctx.newPage();
page.setDefaultTimeout(240_000);
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 200)));
await page.goto(`http://127.0.0.1:${port}/app?n=${n}`, { waitUntil: 'domcontentloaded' });
const CARTE = 'button[aria-label^="Modifier "]';
await page.waitForTimeout(6000);
const refuser = page.getByRole('button', { name: 'Refuser' });
if (await refuser.count()) await refuser.first().click();
await page.getByText(/^Stock/).last().click();
await page.waitForSelector(CARTE, { timeout: 90_000 });
await page.waitForTimeout(4000);
if (vue === 'liste') {
  // Vue Liste du Stock, si le bouton existe.
  const b = page.getByRole('button', { name: /^Liste$/ });
  if (await b.count()) { await b.first().click(); await page.waitForTimeout(1500); }
}
const banc = await page.evaluate(() => ({ ...window.__banc, cartes: document.querySelectorAll('button[aria-label^="Modifier "]').length, noeuds: document.querySelectorAll('*').length }));

let cdp = null;
if (moteur === 'chromium') {
  cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(ralenti) });
}
await page.evaluate(() => {
  window.__ev = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__ev.push({ n: e.name, id: e.interactionId, d: e.duration, s: e.startTime, ps: e.processingStart, pe: e.processingEnd }); })
    .observe({ type: 'event', durationThreshold: 16, buffered: false });
  window.__t = {};
  document.addEventListener('touchstart', (e) => { window.__t = { toucher: e.timeStamp }; }, { capture: true });
  new MutationObserver(() => {
    if (window.__t.toucher != null && window.__t.dom == null && document.evaluate("//*[text()=\"Modifier l'article\"]", document, null, 9, null).singleNodeValue) {
      window.__t.dom = performance.now();
      requestAnimationFrame(() => { window.__t.raf = performance.now(); setTimeout(() => { window.__t.image = performance.now(); }, 0); });
    }
  }).observe(document.body, { childList: true, subtree: true });
});

const resultats = [];
const tours = Number(process.env.BANC_TOURS || 6);
for (let i = 0; i < tours; i++) {
  const cartes = page.locator(CARTE);
  const c = cartes.nth(i % Math.max(1, await cartes.count()));
  // Sans attendre la « stabilité » (l'ancien code ne se pose jamais sous WebKit à 2 900 articles).
  await c.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(500);
  const bb = await c.boundingBox();
  await page.evaluate(() => { window.__ev = []; window.__t = {}; window.__stockDiff = []; });
  if (profil && i === 1 && cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + Math.min(bb.height / 2, 60));
  await page.waitForFunction(() => window.__t.image != null, null, { timeout: 240_000 });
  await page.waitForTimeout(1200);
  if (profil && i === 1 && cdp) {
    const { profile } = await cdp.send('Profiler.stop');
    fs.writeFileSync(profil, JSON.stringify(profile));
  }
  const m = await page.evaluate(() => {
    const t = window.__t;
    const ev = window.__ev.filter((e) => e.id);
    const max = ev.reduce((a, e) => (e.d > (a?.d ?? -1) ? e : a), null);
    return { dom: t.dom - t.toucher, image: t.image - t.toucher, interaction: max ? max.d : null, traitement: max ? max.pe - max.ps : null, evs: ev.map((e) => `${e.n}:${Math.round(e.d)}`).join(' ') };
  });
  if (process.env.BANC_DIFF) m.diff = await page.evaluate(() => JSON.stringify(window.__stockDiff));
  resultats.push(m);
  // Fermer la fiche (le fond).
  await page.evaluate(() => { const x = [...document.querySelectorAll('div')].find((d) => d.style.zIndex === '200' && d.style.position === 'fixed'); x?.click(); });
  await page.waitForTimeout(800);
}
const med = (k) => { const v = resultats.map((r) => r[k]).filter((x) => x != null).sort((a, b) => a - b); return v.length ? Math.round(v[Math.floor(v.length / 2)]) : null; };
console.log(JSON.stringify({ moteur, ralenti: Number(ralenti), ...banc, mediane: { toucher_dom: med('dom'), toucher_image: med('image'), event_timing: med('interaction'), traitement: med('traitement') }, tours: resultats.map((r) => ({ dom: Math.round(r.dom), image: Math.round(r.image), et: r.interaction != null ? Math.round(r.interaction) : null, evs: r.evs, diff: r.diff })), erreurs: erreurs.slice(0, 5) }));
await navigateur.close();
serveur.close();
