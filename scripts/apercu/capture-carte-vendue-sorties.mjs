// Capture PNG + contrôles de la carte « Vendue » et de ses sorties (15/10,
// P1-0). Outil de relecture, jamais livré.
//     node scripts/apercu/capture-carte-vendue-sorties.mjs
// Assertions écrites AVANT de regarder les images :
//   · Swatch (fiche déjà vendue) : « Oui », « Déjà enregistrée », « Ce n'est pas vendu » ;
//   · adaptateurs (fiche en stock) : « Oui », « Ce n'est pas vendu », PAS « Déjà enregistrée » ;
//   · Rangement gris (plus en ligne, sans preuve) : « Non, je l'ai retirée », aucune des deux sorties ;
//   · aucune ligne ne déborde à 360 px.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'carte-vendue-sorties-1510');
const PORT = 5251;
const URL = `http://localhost:${PORT}/scripts/apercu/carte-vendue-sorties.html`;
fs.mkdirSync(SORTIE, { recursive: true });
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
const stop = () => { try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' }); else vite.kill(); } catch { /* déjà mort */ } };
process.on('exit', stop);
async function attendre(limiteMs = 180000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) { try { const r = await fetch(URL); if (r.ok) return; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error("vite n'a pas répondu");
}
const echecs = [];
const verifier = (c, quoi, detail = '') => { console.log(`${c ? '  ✓' : '  ✗'} ${quoi}${detail ? `   (${detail})` : ''}`); if (!c) echecs.push(quoi); };
try {
  await attendre();
  const nav = await chromium.launch({ channel: 'chrome' });
  for (const largeur of [360, 440]) {
    console.log(`\n── ${largeur} px ──`);
    const page = await nav.newPage({ viewport: { width: largeur, height: 1200 }, deviceScaleFactor: 2 });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.route(/supabase\.co/, (r) => r.abort());
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.waitForSelector('[data-ecran="plus-en-ligne"]', { timeout: 240000 });
    await page.waitForTimeout(800);
    verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | ').slice(0, 300));
    const cartes = page.locator('[data-question]');
    verifier(await cartes.count() === 3, 'trois cartes');
    const boutons = async (k) => (await cartes.nth(k).locator('button').allInnerTexts()).map((s) => s.trim());
    const b0 = await boutons(0), b1 = await boutons(1), b2 = await boutons(2);
    verifier(b0.includes('Oui, enregistrer la vente') && b0.includes('Déjà enregistrée') && b0.includes("Ce n'est pas vendu"), 'Swatch : « Oui », « Déjà enregistrée », « Ce n’est pas vendu »', b0.join(' | '));
    verifier(b1.includes('Oui, enregistrer la vente') && !b1.includes('Déjà enregistrée') && b1.includes("Ce n'est pas vendu"), 'adaptateurs : « Oui », « Ce n’est pas vendu », jamais « Déjà enregistrée »', b1.join(' | '));
    verifier(b2.includes("Non, je l'ai retirée") && !b2.includes("Ce n'est pas vendu") && !b2.includes('Déjà enregistrée'), 'Rangement gris : « Non, je l’ai retirée », aucune des deux sorties', b2.join(' | '));
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    verifier(!deborde, 'aucun débordement horizontal');
    await page.screenshot({ path: path.join(SORTIE, `carte-vendue-${largeur}.png`), fullPage: true });
    await page.close();
  }
  await nav.close();
} finally { stop(); }
console.log(echecs.length ? `\n✗ ${echecs.length} échec(s)` : '\n✓ tout est vert');
console.log(`captures : ${SORTIE}`);
process.exit(echecs.length ? 1 : 0);
