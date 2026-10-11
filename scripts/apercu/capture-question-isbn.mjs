// Capture PNG + contrôles de la question « ISBN » (Morgane, 12/10). Outil de
// relecture, jamais livré.
//     node scripts/apercu/capture-question-isbn.mjs
// Assertions écrites AVANT de regarder les images :
//   · AVANT : le message de la sonde (jargon : « sonde réseau », « HTTP 400 ») ;
//   · APRÈS : message sans jargon, un VRAI champ ISBN (pas un « Autre valeur… »),
//     le bouton « Ce livre n'a pas d'ISBN », l'aide (où trouver l'ISBN) ;
//   · REFUSÉ : plus de bouton « pas d'ISBN », le message dit que Vinted l'exige.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'isbn-morgane-1210');
const PORT = 5247;
const URL = (vue) => `http://localhost:${PORT}/scripts/apercu/question-isbn.html?vue=${vue}`;
fs.mkdirSync(SORTIE, { recursive: true });
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
const stop = () => { try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' }); else vite.kill(); } catch { /* déjà mort */ } };
process.on('exit', stop);
async function attendre(limiteMs = 180000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) { try { const r = await fetch(URL('avant')); if (r.ok) return; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error("vite n'a pas répondu");
}
const echecs = [];
const verifier = (c, quoi, detail = '') => { console.log(`${c ? '  ✓' : '  ✗'} ${quoi}${detail ? `   (${detail})` : ''}`); if (!c) echecs.push(quoi); };
try {
  await attendre();
  const nav = await chromium.launch({ channel: 'chrome' });
  for (const vue of ['avant', 'apres', 'refuse']) {
    for (const largeur of [390, 1280]) {
      console.log(`\n── ${vue}, ${largeur} px ──`);
      const page = await nav.newPage({ viewport: { width: largeur, height: 900 }, deviceScaleFactor: 2 });
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(String(e)));
      await page.route(/supabase\.co/, (r) => r.abort());
      await page.goto(URL(vue), { waitUntil: 'domcontentloaded', timeout: 240000 });
      await page.waitForSelector('[data-surface="message"]', { timeout: 240000 });
      await page.waitForTimeout(1500);
      verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | ').slice(0, 300));
      const message = await page.locator('[data-surface="message"]').innerText();
      const champ = page.locator('input[aria-label="ISBN du livre"]');
      const bouton = page.getByRole('button', { name: "Ce livre n'a pas d'ISBN" });
      if (vue === 'avant') {
        verifier(/sonde réseau|HTTP 400/.test(message), 'AVANT : le message montrait le jargon de la sonde');
      } else {
        verifier(!/sonde|HTTP|payload|\{/.test(message), 'message sans jargon');
        verifier(await champ.count() === 1, 'un vrai champ ISBN à taper');
        verifier(await page.getByText('Au dos du livre, sous le code-barres').count() >= 1, 'l’aide dit où trouver l’ISBN');
        if (vue === 'apres') verifier(await bouton.count() === 1, '« Ce livre n’a pas d’ISBN » en un tap');
        else {
          verifier(await bouton.count() === 0, 'REFUSÉ : plus l’option « pas d’ISBN »');
          verifier(/Vinted a refusé ce livre sans ISBN/.test(message), 'REFUSÉ : le message le dit');
        }
      }
      await page.screenshot({ path: path.join(SORTIE, `isbn-${vue}-${largeur}.png`), fullPage: true });
      await page.close();
    }
  }
  await nav.close();
} finally { stop(); }
console.log(echecs.length ? `\n✗ ${echecs.length} échec(s)` : '\n✓ tout est vert');
console.log(`captures : ${SORTIE}`);
process.exit(echecs.length ? 1 : 0);
