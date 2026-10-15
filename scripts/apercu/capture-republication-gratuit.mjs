// Captures de la republication automatique vue par un compte GRATUIT, à 360,
// 390 et 1 280 px (15/10, point 4). Outil de relecture, jamais livré — même
// patron que capture-republication-auto-depop.mjs.
//
//   node scripts/apercu/capture-republication-gratuit.mjs
//
// Ce qu'il PROUVE, sur les vrais composants et l'état réel d'un gratuit :
//   · la ligne du Stock ouvre l'ÉCRAN (pas l'offre) ;
//   · la liste montre les plateformes et « Voir l'offre Pro » ;
//   · l'écran Vinted : créneaux et jours se règlent (rien n'est écrit au
//     serveur), l'interrupteur ouvre l'offre ;
//   · aucun débordement horizontal, aucune erreur de page, aux trois largeurs.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'republication-gratuit');
const PORT = 5221;
fs.mkdirSync(SORTIE, { recursive: true });
if (!fs.existsSync(path.join(RACINE, 'build', 'apercu-gratuit', 'etat.json'))) {
  console.error('build/apercu-gratuit/etat.json manquant (état réel d\'un gratuit, relu en lecture seule).');
  process.exit(1);
}
const serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-stock-refonte.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
serveur.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(serveur.pid), '/f', '/t'], { stdio: 'ignore' }); else serveur.kill(); } catch { /* déjà arrêté */ } };
process.on('exit', stop);
const base = `http://127.0.0.1:${PORT}/scripts/apercu/republication-gratuit.html`;
{
  const fin = Date.now() + 120000;
  while (Date.now() < fin) { try { if ((await fetch(base)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }
}

let ko = 0, ok = 0;
const verifier = (cond, quoi, detail = '') => { if (cond) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${String(detail).slice(0, 300)}` : ''}`); } };

const navigateur = await chromium.launch({ channel: 'chrome' });
try {
  for (const largeur of [360, 390, 1280]) {
    const ctx = await navigateur.newContext({ viewport: { width: largeur, height: 860 }, deviceScaleFactor: 2 });
    await ctx.route(/supabase\.co|fillsell\.app/, (r) => r.abort());
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    const ouvrir = async (ecran) => {
      await page.goto(`${base}?ecran=${ecran}`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => window.__pret === true, null, { timeout: 120000 });
      await page.waitForTimeout(500);
    };
    const deborde = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const evts = () => page.evaluate(() => window.__evenements);

    // 1. La ligne du Stock → l'écran.
    await ouvrir('ligne');
    await page.screenshot({ path: path.join(SORTIE, `${largeur}-ligne.png`), fullPage: true });
    await page.getByRole('button', { name: /Republication automatique/ }).first().click();
    await page.waitForTimeout(400);
    verifier((await evts()).includes('ouvrir_reglages') && !(await evts()).includes('offres'), `${largeur} px : la ligne du Stock ouvre l'écran, pas l'offre`, JSON.stringify(await evts()));

    // 2. La liste.
    await ouvrir('liste');
    await page.screenshot({ path: path.join(SORTIE, `${largeur}-liste.png`), fullPage: true });
    const tListe = await page.evaluate(() => document.body.innerText);
    verifier(/Vinted/.test(tListe) && /Leboncoin/.test(tListe) && /Voir l’offre Pro/.test(tListe), `${largeur} px : tableau complet + « Voir l'offre Pro »`, tListe.slice(0, 200));
    verifier(!(await deborde()), `${largeur} px : liste sans débordement horizontal`);

    // 3. L'écran Vinted : on règle, rien n'est écrit ; l'interrupteur → l'offre.
    await ouvrir('vinted');
    await page.getByRole('button', { name: /Soir · 19h–22h/ }).click();
    await page.waitForTimeout(300);
    const soirActif = await page.getByRole('button', { name: /Soir · 19h–22h/ }).evaluate((b) => !b.disabled);
    await page.screenshot({ path: path.join(SORTIE, `${largeur}-vinted.png`), fullPage: true });
    await page.getByRole('switch').first().click();
    await page.waitForTimeout(300);
    const e = await evts();
    verifier(soirActif, `${largeur} px : le créneau se règle (bouton actif)`);
    verifier(!e.some((x) => String(x).startsWith('regler:')), `${largeur} px : rien n'est écrit au serveur`, JSON.stringify(e));
    verifier(e.includes('offres:republication_planifiee_activer'), `${largeur} px : l'interrupteur ouvre l'offre`, JSON.stringify(e));
    verifier(!(await deborde()), `${largeur} px : écran Vinted sans débordement horizontal`);
    verifier(erreurs.length === 0, `${largeur} px : aucune erreur de page`, erreurs.join(' | '));
    await ctx.close();
  }
} finally {
  await navigateur.close();
  stop();
}
console.log(`\n${ko ? '✗' : '✓'} ${ok} vérifications vertes, ${ko} rouges — captures : screenshots-review/republication-gratuit/`);
process.exit(ko ? 1 : 0);
