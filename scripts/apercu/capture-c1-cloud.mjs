// Captures + relevés du point C1 « plus besoin d'ordinateur » (09/11/2026 nuit, point 6 de Nico).
// Outil de relecture, jamais livré. Chrome 1440, 390 et 320 ; WebKit iPhone SE (375) et 15 Pro Max (430) ; FR et EN.
//
//   node scripts/apercu/capture-c1-cloud.mjs
//
// Les VRAIS composants (scripts/apercu/c1-cloud.jsx : bloc Cloud des Réglages, étapes Cloud du parcours d'entrée) et la
// VRAIE feuille des offres ouverte sur le Cloud (offres-cloud.html?trigger=cloud : son titre). Faux client Supabase,
// Playwright coupe en plus *.supabase.co et fillsell.app. Assertions écrites AVANT de regarder les captures :
//   · la promesse est dite (« Plus besoin d'ordinateur » / « sans ordinateur » ; en : « No computer needed ») et
//     « ordinateur éteint » / « computer off » n'apparaît nulle part ;
//   · rien ne déborde à l'horizontale, aucun texte coupé (scrollWidth > clientWidth sur un élément qui cache) ;
//   · tout bouton visible fait au moins 44 px de haut (les liens dans le texte exceptés) ;
//   · l'accroche des Réglages passe 4,5:1 sur son fond réel.
// Sorties : screenshots-review/c1-<format>-<écran>-<lang>.png (ignoré par git).
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review');
const PORT = 5216;
const BASE = `http://127.0.0.1:${PORT}/scripts/apercu/`;
fs.mkdirSync(SORTIE, { recursive: true });
const COMPARER = process.argv.find((a) => a.startsWith('--comparer='))?.split('=')[1];
const AVANT = COMPARER ? JSON.parse(fs.readFileSync(COMPARER, 'utf8')) : null;
const NOM_RELEVE = process.argv.find((a) => a.startsWith('--releve='))?.split('=')[1] ?? 'c1-releve.json';

const serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-bandeau-cloud.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
const stop = () => {
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(serveur.pid), '/f', '/t'], { stdio: 'ignore' });
      const net = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout || '';
      for (const l of net.split(/\r?\n/)) if (new RegExp(`:${PORT}\\s.*LISTENING`).test(l)) spawnSync('taskkill', ['/pid', l.trim().split(/\s+/).pop(), '/f', '/t'], { stdio: 'ignore' });
    } else serveur.kill();
  } catch { /* déjà arrêté */ }
};
process.on('exit', stop);
{
  const fin = Date.now() + 90_000;
  while (Date.now() < fin) { try { if ((await fetch(`${BASE}c1-cloud.html`)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }
}

let ko = 0;
let n = 0;
const ok = (c, m, d) => { n++; if (!c) { ko++; console.log(`  ✗ ${m}${d ? `   ← ${String(d).slice(0, 600)}` : ''}`); } };

const RELEVE = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const parse = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const q = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [q[0], q[1], q[2], q.length > 3 ? q[3] : 1]; };
  const lum = (c) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const fond = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0.5) return c; } return [255, 255, 255, 1]; };
  const ratio = (el) => { const a = lum(parse(getComputedStyle(el).color)); const b = lum(fond(el)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const tous = [...document.querySelectorAll('body *')].filter(vis);
  // innerText (jamais textContent) : le contenu d'une balise <style> (l'effet brillant des pastilles) n'est pas du texte.
  // Coupé = le TEXTE lui-même dépasse la boîte qui cache (un reflet animé qui glisse dans la pastille n'est pas du texte).
  const texteDepasse = (e) => {
    const b = e.getBoundingClientRect();
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.parentElement?.closest('style,script') || !t.textContent.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const rg = document.createRange(); rg.selectNodeContents(t);
      for (const r of rg.getClientRects()) if (r.width > 0 && (r.right > b.right + 1 || r.left < b.left - 1 || r.bottom > b.bottom + 1)) return true;
    }
    return false;
  };
  const coupes = tous.filter((e) => {
    const s = getComputedStyle(e);
    const cache = /hidden|clip/.test(s.overflowX) || /hidden|clip/.test(s.overflowY) || s.textOverflow === 'ellipsis';
    return cache && (e.innerText || '').trim() && texteDepasse(e);
  }).map((e) => `${e.tagName}:${e.innerText.trim().slice(0, 50)}`);
  const sortants = tous.filter((e) => { const r = e.getBoundingClientRect(); return r.right > window.innerWidth + 1 || r.left < -1; })
    .filter((e) => getComputedStyle(e).position !== 'fixed').map((e) => `${e.tagName}.${String(e.className).slice(0, 30)}:${(e.innerText || '').trim().slice(0, 30)}`);
  // La ZONE DE TOUCHER : le bouton, ou un enfant posé en absolu qui l'agrandit (le « i » de 20 px et sa zone
  // `inset:-12px` = 44 px). Un lien DANS une phrase (mentions légales) suit le texte : exception reconnue (WCAG 2.5.8).
  const zone = (b) => {
    let h = b.getBoundingClientRect().height;
    for (const k of b.querySelectorAll('*')) if (getComputedStyle(k).position === 'absolute') h = Math.max(h, k.getBoundingClientRect().height);
    return Math.round(h);
  };
  // Un lien de phrase : sans fond ni bordure, dans un paragraphe plus long que lui (« … les Conditions générales et la
  // Politique de confidentialité »). Un vrai bouton (fond, bordure) est toujours mesuré.
  const dansUnePhrase = (b) => {
    const s = getComputedStyle(b);
    const p = b.closest('p');
    const sansFond = (parse(s.backgroundColor)?.[3] ?? 0) === 0 && !/gradient/.test(s.backgroundImage);
    const sansBord = ['Top', 'Right', 'Bottom', 'Left'].every((c) => parseFloat(s[`border${c}Width`]) === 0);
    return Boolean(p) && sansFond && sansBord && (p.innerText || '').trim().length > (b.innerText || '').trim().length + 20;
  };
  const boutons = [...document.querySelectorAll('button, [role="button"], a[href]')].filter(vis)
    .filter((b) => !dansUnePhrase(b))
    .map((b) => ({ t: ((b.innerText || '').trim() || b.getAttribute('aria-label') || '').slice(0, 40), h: zone(b) }))
    .filter((b) => b.h < 44);
  const liensDansPhrase = [...document.querySelectorAll('button, a[href]')].filter(vis).filter(dansUnePhrase).map((b) => (b.innerText || '').trim().slice(0, 30));
  const acc = document.querySelector('[data-cloud-accroche]');
  // LE PLAN : la place de chaque morceau de texte visible (ce que l'œil voit). Deux relevés au même plan = rien n'a bougé,
  // même si une zone de toucher invisible a grandi.
  const plan = [];
  {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.parentElement?.closest('style,script') || !t.textContent.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const rg = document.createRange(); rg.selectNodeContents(t);
      const r = rg.getBoundingClientRect();
      if (r.width > 0) plan.push(`${t.textContent.trim().slice(0, 16)}@${Math.round(r.left)},${Math.round(r.top + window.scrollY)},${Math.round(r.width)},${Math.round(r.height)}`);
    }
  }
  return {
    plan,
    texte: document.body.innerText.replace(/\s+/g, ' '),
    deborde: document.documentElement.scrollWidth > window.innerWidth + 1,
    coupes, sortants: sortants.slice(0, 6), petits: boutons, liensDansPhrase,
    accroche: acc ? { t: acc.textContent, ratio: Math.round(ratio(acc) * 100) / 100, h: Math.round(acc.getBoundingClientRect().height) } : null,
    titre: document.querySelector('h1,h2')?.textContent?.trim() ?? null,
  };
};

const ECRANS = [
  { nom: 'web-1440', moteur: 'chromium', ctx: { viewport: { width: 1440, height: 900 } } },
  { nom: 'web-390', moteur: 'chromium', ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { nom: 'web-320', moteur: 'chromium', ctx: { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { nom: 'iphone-se', moteur: 'webkit', ctx: { ...devices['iPhone SE'] } },
  { nom: 'iphone-15-pro-max', moteur: 'webkit', ctx: { ...devices['iPhone 15 Pro Max'] } },
];
const PAGES = [
  ...['reglages', 'reglages-paye', 'voie', 'essai', 'connexion', 'debut'].map((e) => ({ id: e, url: (l) => `c1-cloud.html?ecran=${e}&lang=${l}` })),
  { id: 'offres-cloud-free', url: (l) => `offres-cloud.html?palier=free&cloud=aucun&trigger=cloud&lang=${l}` },
  { id: 'offres-cloud-pro', url: (l) => `offres-cloud.html?palier=pro&cloud=aucun&trigger=cloud&lang=${l}` },
];
const PROMESSE = { fr: /Plus besoin d.ordinateur|sans ordinateur/, en: /No computer needed|no computer needed|without a computer/ };
const VIEUX = /ordinateur éteint|ordinateur est éteint|tout est éteint|computer off|computer is off|everything is off/;

const navs = { chromium: await chromium.launch({ channel: 'chrome', headless: true }), webkit: await webkit.launch({ headless: true }) };
const releves = {};
try {
  for (const f of ECRANS) {
    const contexte = await navs[f.moteur].newContext({ ...f.ctx, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    await contexte.route(/supabase\.co|fillsell\.app/, (r) => r.abort());
    const page = await contexte.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 200)));
    for (const pg of PAGES) {
      for (const l of ['fr', 'en']) {
        erreurs.length = 0;
        await page.goto(BASE + pg.url(l), { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForFunction(() => document.body.innerText.trim().length > 40, null, { timeout: 120000 });
        await page.evaluate(() => document.fonts?.ready);
        await page.waitForTimeout(400);
        const r = await page.evaluate(RELEVE);
        const cle = `${f.nom}/${pg.id}/${l}`;
        releves[cle] = r;
        const quoi = `${f.nom} ${pg.id} ${l}`;
        ok(erreurs.length === 0, `${quoi} : aucune erreur de page`, erreurs.join(' | '));
        ok(PROMESSE[l].test(r.texte), `${quoi} : la promesse est dite`, r.texte.slice(0, 300));
        ok(!VIEUX.test(r.texte), `${quoi} : jamais « ordinateur éteint » / « computer off »`, r.texte.match(VIEUX)?.[0]);
        ok(!r.deborde && r.sortants.length === 0, `${quoi} : rien ne déborde`, r.sortants.join(' | '));
        ok(r.coupes.length === 0, `${quoi} : aucun texte coupé`, r.coupes.join(' | '));
        if (!pg.id.startsWith('offres')) ok(r.petits.length === 0, `${quoi} : boutons ≥ 44 px`, JSON.stringify(r.petits));
        if (pg.id === 'reglages') ok(r.accroche && r.accroche.ratio >= 4.5 && r.accroche.t === (l === 'en' ? 'No computer needed' : "Plus besoin d'ordinateur"),
          `${quoi} : l'accroche dite et lisible (4,5:1)`, JSON.stringify(r.accroche));
        if (pg.id.startsWith('offres-cloud')) ok(r.texte.includes(l === 'en' ? 'No computer needed.' : "Plus besoin d'ordinateur."), `${quoi} : le titre de la feuille ouverte sur le Cloud`, r.titre);
        // --comparer=<relevé> : le plan de chaque page doit être IDENTIQUE à celui du relevé donné (rien n'a bougé).
        if (AVANT) {
          const a = AVANT[cle]?.plan ?? [];
          const diff = r.plan.filter((x, i) => x !== a[i]);
          ok(a.length === r.plan.length && diff.length === 0, `${quoi} : rien n'a bougé (${r.plan.length} morceaux de texte à la même place)`, diff.slice(0, 4).join(' | '));
        }
        await page.screenshot({ path: path.join(SORTIE, `c1-${f.nom}-${pg.id}-${l}.png`), fullPage: true });
      }
    }
    await contexte.close();
    console.log(`${f.nom} : relu`);
  }
} finally {
  await navs.chromium.close().catch(() => {});
  await navs.webkit.close().catch(() => {});
  fs.writeFileSync(path.join(SORTIE, NOM_RELEVE), JSON.stringify(releves, null, 1));
  stop();
}
console.log(ko ? `\n✗ ${ko} rouge(s) sur ${n}` : `\n✓ ${n} contrôles verts — captures dans screenshots-review/c1-*.png`);
process.exit(ko ? 1 : 0);
