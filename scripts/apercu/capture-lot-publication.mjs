// Captures PNG de la publication en lot, écran par écran et état par état —
// outil de relecture, jamais livré. Même patron que capture-stepper-moteur.mjs.
//
//     node scripts/apercu/capture-lot-publication.mjs
//
// Écrit dans screenshots-review/publication-en-lot/ (ignoré par git), à 390 px
// (téléphone) et, pour quelques écrans, à 1280 px. Contrôles :
//   · aucune erreur de page ;
//   · aucun défilement horizontal (≤ 390 px de large) ;
//   · le texte clé de chaque état est là ;
//   · aucun champ de saisie sous 16 px dans la coque (pas de zoom iOS).
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'publication-en-lot');
const PORT = 5207;
const BASE = `http://localhost:${PORT}/scripts/apercu/lot-publication.html`;
fs.mkdirSync(SORTIE, { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' }); else vite.kill(); } catch { /* déjà mort */ } };
process.on('exit', stop);
async function attendreServeur(limiteMs = 60000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) { try { const r = await fetch(BASE); if (r.ok) return; } catch { /* pas encore debout */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('vite n’a pas répondu dans le délai');
}
const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`  ${cond ? '✓' : '✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };
const filtre = (erreurs) => erreurs.filter((x) => !/favicon|fonts\.g|net::ERR|ERR_INTERNET|Download the React DevTools|supabase\.co/.test(x));

// [nom de fichier, scène, texte attendu, hauteur]
const ECRANS = [
  ['01-stock-porte', 'stock-porte', /Publier plusieurs articles d’un coup|Publier plusieurs articles d'un coup/, 520],
  ['02-stock-filtre-pas-encore', 'stock-filtre', /Publier ces 12 articles sur Leboncoin/, 420],
  ['03-stock-selection', 'stock-selection', /3 sélectionnés/, 844],
  ['04-ou-publier', 'ou-publier', /Où les publier \?/i, 844],
  ['05-ou-publier-session-fermee', 'ou-publier-session', /Tu n'es pas connecté à Leboncoin/, 844],
  ['06-ou-publier-quota-atteint', 'ou-publier-quota', /attendront ton nouveau mois/, 844],
  ['07-ou-publier-extension-absente', 'ou-publier-extension', /L'extension FillSell n'est pas encore installée/, 844],
  ['08-preparation-en-cours', 'preparation', /préparés/, 844],
  ['09-questions-a-completer', 'questions', /Relis le texte qui part/, 844],
  ['09b-questions-a-completer-long', 'questions', /Poids du colis/, 1700],
  ['10-tout-est-pret', 'pret', /Envoyer \d+ annonces/, 844],
  ['11-envoi-en-cours', 'envoi', /Mise en file/, 844],
  ['12-c-est-parti', 'fin', /annonces en file/, 844],
  ['13-erreur-rien-n-est-parti', 'fin-erreur', /Rien n'est parti/, 844],
  ['14-suivi-du-lot', 'suivi', /Lot du/, 844],
  ['15-suivi-arret-confirmation', 'suivi-arret', /Laisser continuer/, 844],
  ['16-selection-vide', 'stock-vide', /Aucun article de cette vue ne peut partir/, 420],
];

try {
  await attendreServeur();
  const navigateur = await chromium.launch({ channel: 'chrome' });
  for (const [fichier, scene, attendu, hauteur] of ECRANS) {
    const page = await navigateur.newPage({ viewport: { width: 390, height: hauteur }, deviceScaleFactor: 2 });
    const erreurs = [];
    page.on('pageerror', (x) => erreurs.push(String(x)));
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
    await page.goto(`${BASE}#scene=${scene}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => document.getElementById('apercu')?.childElementCount > 0 || document.querySelector('.fsn'), null, { timeout: 120000 });
    await page.waitForTimeout(900);
    const sortie = path.join(SORTIE, `${fichier}.png`);
    await page.screenshot({ path: sortie });
    const texte = await page.locator('body').innerText();
    const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
    const petits = await page.evaluate(() => [...document.querySelectorAll('.fsn input:not([type=checkbox]), .fsn textarea, .fsn select')]
      .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).length);
    console.log(`\n${fichier} (${scene})`);
    verifier(filtre(erreurs).length === 0, 'aucune erreur de page', filtre(erreurs).join(' | ').slice(0, 300));
    verifier(attendu.test(texte), `texte attendu : ${attendu}`);
    verifier(largeur <= 390, `pas de défilement horizontal (${largeur} px)`);
    verifier(petits === 0, `champs de saisie à 16 px (${petits} sous 16 px)`);
    await page.close();
  }
  // Deux écrans à 1280 px : la coque reste à 640 px de large, centrée.
  for (const [fichier, scene] of [['20-ordinateur-ou-publier', 'ou-publier'], ['21-ordinateur-questions', 'questions']]) {
    const page = await navigateur.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(`${BASE}#scene=${scene}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => document.getElementById('apercu')?.childElementCount > 0 || document.querySelector('.fsn'), null, { timeout: 120000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SORTIE, `${fichier}.png`) });
    const col = await page.evaluate(() => Math.round(document.querySelector('.fsn-scroll .fsn-col')?.getBoundingClientRect().width ?? 0));
    console.log(`\n${fichier} (${scene})`);
    verifier(col > 0 && col <= 640, `colonne de lecture ≤ 640 px (${col} px)`);
    await page.close();
  }
  await navigateur.close();
} catch (e) {
  console.error(e);
  echecs.push(String(e?.message ?? e));
} finally {
  stop();
}
console.log(`\n${echecs.length ? `✗ ${echecs.length} contrôle(s) en échec` : '✓ tout est vert'} — captures dans ${path.relative(RACINE, SORTIE)}`);
process.exit(echecs.length ? 1 : 0);
