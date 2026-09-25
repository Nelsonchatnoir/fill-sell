// Capture PNG + contrôles de la question eBay de Jocabroc (25/09). Outil de
// relecture, jamais livré — même patron que capture-lot-2309.mjs.
//
//     node scripts/apercu/capture-question-jocabroc.mjs
//
// Ce qu'il PROUVE (à 440 px ET à 360 px) : les trois champs (Hauteur, Largeur,
// Longueur) sont dans la modale, chacun avec une case de saisie LIBRE suivie
// de « cm » ; la liste « à compléter » et la fiche nomment les trois ; rien ne
// déborde ; aucune erreur de page.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review');
const PORT = 5207;
const URL = `http://localhost:${PORT}/scripts/apercu/question-jocabroc.html`;
fs.mkdirSync(SORTIE, { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' }); else vite.kill(); } catch { /* déjà mort */ } };
process.on('exit', stop);

async function attendreServeur(limiteMs = 90000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) { try { const r = await fetch(URL); if (r.ok) return; } catch { /* pas encore debout */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error("vite n'a pas répondu dans le délai");
}

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };

try {
  await attendreServeur();
  const navigateur = await chromium.launch({ channel: 'chrome' });
  for (const largeur of [440, 360]) {
    console.log(`\n── fenêtre ${largeur} px ──`);
    const page = await navigateur.newPage({ viewport: { width: largeur, height: 1100 }, deviceScaleFactor: 2 });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    // StockTab ouvre des connexions (Supabase) : jamais « networkidle ».
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.waitForSelector('[data-libelle="fiche"]', { timeout: 240000 });
    await page.waitForTimeout(2500);
    verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | ').slice(0, 300));
    const liste = await page.textContent('[data-libelle="liste"]');
    const fiche = await page.textContent('[data-libelle="fiche"]');
    verifier(liste === 'eBay : il manque Hauteur, Largeur et Longueur', 'liste « à compléter » : les trois champs', liste);
    verifier(fiche === 'Compléter « Hauteur, Largeur, Longueur »', 'fiche / stepper : les trois champs', fiche);
    const cases = await page.$$eval('input[inputmode="decimal"]', (els) => els.map((e) => ({
      type: e.type, suite: (e.nextElementSibling?.textContent ?? '').trim(), vide: e.value === '',
      titre: (e.closest('div')?.parentElement?.previousElementSibling?.previousElementSibling?.textContent ?? '').trim(),
    })));
    verifier(cases.length === 3, 'trois cases de saisie libre', JSON.stringify(cases));
    verifier(cases.every((c) => c.type === 'text' && c.suite === 'cm'), 'chacune suivie de « cm »', JSON.stringify(cases));
    verifier(cases.every((c) => c.vide), "cases vides (rien d'inventé)", JSON.stringify(cases));
    const texteModale = await page.evaluate(() => document.body.innerText);
    for (const c of ['Hauteur', 'Largeur', 'Longueur']) {
      verifier(texteModale.split('\n').some((l) => l.trim() === c), `titre « ${c} » dans la modale`);
    }
    await page.fill('input[inputmode="decimal"] >> nth=0', '30');
    verifier((await page.inputValue('input[inputmode="decimal"] >> nth=0')) === '30', "la saisie « 30 » s'affiche telle quelle (l'unité est à côté)");
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    verifier(!deborde, 'aucun débordement horizontal');
    await page.screenshot({ path: path.join(SORTIE, `question-jocabroc-${largeur}.png`), fullPage: true });
    await page.close();
  }
  await navigateur.close();
} finally {
  stop();
}
console.log(echecs.length ? `\n✗ ${echecs.length} contrôle(s) en échec` : '\n✓ tout est vert — captures dans screenshots-review/question-jocabroc-*.png');
process.exit(echecs.length ? 1 : 0);
