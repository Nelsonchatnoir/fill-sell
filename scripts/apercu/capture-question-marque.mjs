// Capture PNG + contrôles de la question « Marque » hors catalogue (03/10).
// Outil de relecture, jamais livré — même patron que capture-question-jocabroc.
//
//     node scripts/apercu/capture-question-marque.mjs
//
// Ce qu'il PROUVE (440 px ET 360 px) : la phrase dit pourquoi ; « Sans
// marque » est un bouton ; la recherche filtre les marques du catalogue ; le
// nom tapé tel quel dit ce qui se passera ; aucun bouton gris ; rien ne
// déborde ; aucune erreur de page.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review');
const PORT = 5211;
const URL = `http://localhost:${PORT}/scripts/apercu/question-marque.html`;
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
    const page = await navigateur.newPage({ viewport: { width: largeur, height: 1000 }, deviceScaleFactor: 2 });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.waitForSelector('text=Sans marque', { timeout: 240000 });
    await page.waitForTimeout(1500);
    verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | ').slice(0, 300));
    const texte = await page.evaluate(() => document.body.innerText);
    verifier(texte.includes('Vinted ne connaît pas la marque « Bonobo » et ne permet plus d\'en créer une.'), 'la phrase dit pourquoi');
    const boutons = await page.$$eval('button', (els) => els.map((e) => ({ t: e.textContent.trim(), dis: e.disabled })));
    verifier(boutons.some((b) => b.t === 'Sans marque' && !b.dis), '« Sans marque » : un bouton actif', JSON.stringify(boutons));
    verifier(boutons.some((b) => b.t === 'Bonobo Jeans'), 'les marques du catalogue sont proposées');
    verifier(!boutons.some((b) => /Valider et relancer/.test(b.t)), 'pas de « Valider » (grisé) sous la question');
    verifier(boutons.filter((b) => b.dis).length === 0, 'aucun bouton gris', JSON.stringify(boutons.filter((b) => b.dis)));
    await page.fill('input[placeholder="Nom de la marque"]', 'jeans');
    await page.waitForTimeout(300);
    const apres = await page.$$eval('button', (els) => els.map((e) => e.textContent.trim()));
    verifier(apres.includes('Bonobo Jeans') && !apres.includes('Bonpoint'), 'la frappe filtre la liste', JSON.stringify(apres));
    verifier(apres.some((t) => t.startsWith('Essayer « jeans » tel quel') && t.includes('cette question revient')), 'le nom tapé tel quel dit ce qui se passera');
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    verifier(!deborde, 'rien ne déborde en largeur');
    await page.fill('input[placeholder="Nom de la marque"]', '');
    await page.screenshot({ path: path.join(SORTIE, `question-marque-${largeur}.png`), fullPage: true });
    await page.close();
  }
  await navigateur.close();
} finally {
  stop();
}
console.log(echecs.length ? `\n✗ ${echecs.length} contrôle(s) en échec` : '\n✓ question « Marque » : tous les contrôles passent');
process.exit(echecs.length ? 1 : 0);
