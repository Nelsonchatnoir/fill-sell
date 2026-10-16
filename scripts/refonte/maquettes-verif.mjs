// ═══════════════════════════════════════════════════════════════════════════
// REFONTE (16/10) — VÉRIFICATION DES MAQUETTES (docs/refonte/maquettes/)
// ═══════════════════════════════════════════════════════════════════════════
// Ouvre la page d'accueil des maquettes à 390 px (téléphone), suit chaque lien,
// et refuse : une erreur de console, un écran vide, un débordement horizontal,
// un temps estimé (« dans N min », « vers HH:MM », « ~N h », « quelques minutes »),
// un mot d'état hors des six. Mesure le temps de peinture de chaque écran avec
// le processeur ralenti ×6 (téléphone d'entrée de gamme) et capture chaque écran.
//
//   node scripts/refonte/maquettes-verif.mjs [adresse]
//   (sans adresse : le fichier local docs/refonte/maquettes/index.html)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
// MAQUETTES_CAPTURES=<dossier> : captures ailleurs (vérifier une adresse publiée sans toucher aux captures commitées).
const OUT = process.env.MAQUETTES_CAPTURES || path.join(RACINE, 'docs', 'refonte', 'captures', 'maquettes');
fs.mkdirSync(OUT, { recursive: true });
const adresse = process.argv[2] || 'file:///' + path.join(RACINE, 'docs', 'refonte', 'maquettes', 'index.html').replace(/\\/g, '/');
// Les estimations interdites (mêmes familles que scripts/aucune-estimation-selftest.mjs).
const ESTIMATION_RE = /\b(dans|d'ici|sous|vers|pendant|environ|avant)\s+(~\s*)?\d+\s*(s|sec|secondes?|min|minutes?|h|heures?|j|jours?)\b|~\s*\d+\s*(min|h)\b|\b(quelques|deux|trois|cinq|dix|vingt)\s+(secondes|minutes|heures)\b|\bvers\s+\d{1,2}[:h]\d{2}\b|\bà\s+\d{1,2}:\d{2}\b|\bcompte à rebours\b|\btemps restant\b|\bEnviron\b/i;
const MOTS = ['En file', 'En cours', 'Fait', 'À toi de jouer', 'En pause', 'Arrêtée'];
const ANCIENS = /\bEn attente\b|\bDans la file\b|\bEn file d'attente\b|\bÉchec\b|\bErreur\b|\bFailed\b|\bPending\b/;

const nav = await chromium.launch({ headless: true });
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fr-FR', isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const erreursConsole = [];
page.on('console', (m) => { if (m.type() === 'error') erreursConsole.push(m.text()); });
page.on('pageerror', (e) => erreursConsole.push(String(e)));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });

await page.goto(adresse, { waitUntil: 'load' });
await page.waitForSelector('.accueil');
const liens = await page.$$eval('a.tuile', (as) => as.map((a) => ({ href: a.getAttribute('href'), titre: a.querySelector('b')?.textContent ?? '' })));
console.log(`${liens.length} maquettes listées sur l'accueil`);
await page.screenshot({ path: path.join(OUT, '00-accueil.png'), fullPage: true });

const rapport = [];
let ko = 0;
const dit = (ok, msg) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${msg}`); };
for (const [i, l] of liens.entries()) {
  const cle = l.href.replace(/^#\/?/, '');
  const nom = `${String(i + 1).padStart(2, '0')}-${cle.replace(/\//g, '-')}`;
  const t0 = Date.now();
  await page.evaluate((h) => { location.hash = h; }, l.href);
  await page.waitForFunction((c) => document.querySelector(`.ecran[key="${c}"]`), cle, { timeout: 5000 });
  // Peinture : deux images après le rendu (CPU ×6).
  const peint = await page.evaluate(() => new Promise((r) => { const a = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => r(Math.round(performance.now() - a)))); }));
  const total = Date.now() - t0;
  const texte = (await page.locator('.tel').innerText()).replace(/\s+/g, ' ').trim();
  const change = (await page.locator('.change').innerText()).replace(/\s+/g, ' ').trim();
  const largeur = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  const estim = texte.match(ESTIMATION_RE);
  const ancien = texte.match(ANCIENS);
  const motsVus = MOTS.filter((m) => texte.includes(m));
  console.log(`\n${nom} — ${l.titre}`);
  dit(texte.length > 60, `écran rempli (${texte.length} caractères)`);
  dit(largeur[0] <= largeur[1], `aucun débordement horizontal (${largeur[0]} ≤ ${largeur[1]})`);
  dit(!estim, estim ? `temps estimé trouvé : « ${estim[0]} »` : 'aucun temps estimé');
  dit(!ancien, ancien ? `ancien mot d'état : « ${ancien[0]} »` : 'aucun ancien mot d’état');
  dit(/Ce qui change/.test(change) && change.length > 40, 'une ligne « ce qui change » sous l’écran');
  dit(peint < 400, `peinture ${peint} ms (CPU ×6), navigation ${total} ms`);
  await page.screenshot({ path: path.join(OUT, `${nom}.png`), fullPage: false });
  rapport.push({ cle, titre: l.titre, peintMs: peint, navMs: total, mots: motsVus, texte: texte.slice(0, 600), change });
}
// Le fil « Suivant » traverse toutes les maquettes, puis revient à la liste.
await page.evaluate(() => { location.hash = '#onboarding-1'; });
let pas = 0;
while (pas < 60) {
  const suiv = page.locator('.nav-ecran a', { hasText: /Suivant/ });
  if (!(await suiv.count())) break;
  await suiv.first().click();
  pas++;
}
dit(pas === liens.length - 1, `le fil « Suivant » enchaîne ${pas + 1} écrans sur ${liens.length}`);
await page.locator('.nav-ecran a', { hasText: /retour à la liste/ }).first().click();
await page.waitForSelector('.accueil');
dit(true, 'le dernier écran ramène à la liste');
// « Réduire les animations » : aucune animation ne tourne.
const ctx2 = await nav.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'fr-FR' });
const p2 = await ctx2.newPage();
await p2.goto(adresse + '#attentes-file', { waitUntil: 'load' });
await p2.waitForSelector('.ecran');
const animations = await p2.evaluate(() => document.getAnimations().length);
dit(animations === 0, `« réduire les animations » : ${animations} animation en cours`);
await ctx2.close();
dit(erreursConsole.length === 0, erreursConsole.length ? `erreurs de console : ${erreursConsole.slice(0, 3).join(' | ')}` : 'aucune erreur de console');

fs.writeFileSync(path.join(OUT, 'journal.json'), JSON.stringify({ adresse, le: new Date().toISOString(), ecrans: rapport }, null, 2));
await nav.close();
const lent = rapport.filter((r) => r.peintMs >= 100).map((r) => `${r.cle} ${r.peintMs} ms`);
console.log(`\nPeinture médiane ${[...rapport].sort((a, b) => a.peintMs - b.peintMs)[Math.floor(rapport.length / 2)].peintMs} ms, max ${Math.max(...rapport.map((r) => r.peintMs))} ms (CPU ×6)${lent.length ? ' — ≥ 100 ms : ' + lent.join(', ') : ''}`);
console.log(ko ? `\n✗ ${ko} point(s) rouge(s)` : `\n✓ ${liens.length} maquettes vérifiées à 390 px → ${OUT}`);
process.exit(ko ? 1 : 0);
