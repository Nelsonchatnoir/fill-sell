// ═══════════════════════════════════════════════════════════════════════════
// REFONTE (16/10) — LES ÉCRANS VIDES, SUR L'APP RÉELLE, AVEC LE COMPTE DE TEST
// ═══════════════════════════════════════════════════════════════════════════
// Playwright (Chromium headless, profil ISOLÉ : jamais le Chrome de Nico) sur
// l'app servie en local (npx vite --port 5217, vraie base) ou sur la prod, avec
// le compte de TEST de la refonte (support+refonte.test.1610@fillsell.app :
// aucun article, aucune vente, gratuit, désinscrit des mails). Téléphone 390 px.
// Pour chaque onglet vide (Tableau, Stock IA, Ventes, Stats) : capture pleine
// page, capture de l'EN-TÊTE et de la BARRE D'ONGLETS (comparées entre la prod
// et la version locale), texte visible, débordement, émojis.
// ⛔ Ne clique JAMAIS un geste qui écrit (synchroniser, ajouter, offres) : il lit.
//
//   node scripts/refonte/ecrans-vides-1610.mjs --base=http://127.0.0.1:5217 --nom=apres
//   node scripts/refonte/ecrans-vides-1610.mjs --base=https://fillsell.app --nom=avant
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const BASE = args.base || 'http://127.0.0.1:5217';
const NOM = args.nom || 'apres';
const COMPTE = JSON.parse(fs.readFileSync(args.compte || 'C:/Users/nicol/AppData/Local/Temp/claude/C--Users-nicol-fill-and-sell/233a5a5d-4406-4bc5-ab18-f427b85873dc/scratchpad/compte-test.json', 'utf8'));
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(RACINE, 'screenshots-review', 'refonte-1610', `vides-${NOM}`);
fs.mkdirSync(OUT, { recursive: true });
const EMOJI = /\p{Extended_Pictographic}/u;
const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };

const nav = await chromium.launch({ headless: true });
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', reducedMotion: args.reduit ? 'reduce' : 'no-preference' });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e.message)));

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Refuser', exact: true }).click({ timeout: 5000 }).catch(() => {});
await page.locator('input[type=email]').first().fill(COMPTE.email);
await page.locator('input[type=password]').first().fill(COMPTE.password);
await page.getByRole('button', { name: 'Se connecter', exact: true }).last().click();
await page.waitForURL(/\/app/, { timeout: 30000 }).catch(() => {});
await page.locator('.bnav').first().waitFor({ timeout: 40000 });
await page.waitForTimeout(3000);

const ONGLETS = [['Tableau', 'tableau'], ['Stock IA', 'stock'], ['Ventes', 'ventes'], ['Stats', 'stats']];
for (const [libelle, cle] of ONGLETS) {
  console.log(`\n── ${cle}`);
  await page.locator('.bnav button', { hasText: libelle }).first().click();
  await page.waitForTimeout(2600);
  await page.locator('.topbar').first().screenshot({ path: path.join(OUT, `${cle}-entete.png`) });
  await page.locator('.bnav').first().screenshot({ path: path.join(OUT, `${cle}-barre.png`) });
  const m = await page.evaluate(() => {
    const zone = document.querySelector('.app-root');
    const debordement = Math.max(document.documentElement.scrollWidth, zone?.scrollWidth ?? 0) - window.innerWidth;
    // Texte VISIBLE seulement (un élément caché de l'app n'est pas « affiché »), hors en-tête.
    const vus = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const el = w.currentNode.parentElement; if (!el || el.closest('style, script, .topbar') || el.offsetParent === null) continue; vus.push(w.currentNode.nodeValue); }
    return { debordement, texte: document.body.innerText, texteEcran: vus.join(' ') };
  });
  // Pleine page : la zone qui défile est .app-root (hauteur 100dvh) — on la libère le temps de la capture.
  await page.evaluate(() => { const z = document.querySelector('.app-root'); if (z) { z.dataset.h = z.style.height; z.style.height = 'auto'; } });
  await page.screenshot({ path: path.join(OUT, `${cle}.png`), fullPage: true });
  // Et en vues de téléphone successives (pour la relecture à l'œil).
  const hPage = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let k = 0; k * 760 < hPage; k++) await page.screenshot({ path: path.join(OUT, `${cle}-vue${k + 1}.png`), fullPage: true, clip: { x: 0, y: k * 760, width: 390, height: Math.min(844, hPage - k * 760) } });
  await page.evaluate(() => { const z = document.querySelector('.app-root'); if (z) z.style.height = z.dataset.h || ''; });
  fs.writeFileSync(path.join(OUT, `${cle}.txt`), m.texte);
  verifier(m.debordement <= 0, `${cle} : aucun débordement horizontal`, `${m.debordement} px`);
  const emo = [...m.texteEcran].filter((x) => EMOJI.test(x));
  verifier(emo.length === 0 || NOM === 'avant', `${cle} : aucun émoji affiché`, emo.join(' '));
}
verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | ').slice(0, 300));
await nav.close();
console.log(echecs.length ? `\n${echecs.length} échec(s)` : '\nTout est vert.');
