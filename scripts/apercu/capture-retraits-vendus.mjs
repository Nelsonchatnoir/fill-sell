// Capture PNG + contrôles du bandeau « Vendu, encore en ligne » (A6, 12/10).
// Outil de relecture, jamais livré.
//     node scripts/apercu/capture-retraits-vendus.mjs
// Assertions écrites AVANT de regarder les images :
//   · Ornella : la boutique à ouvrir est NOMMÉE (@ornella-vend) ;
//   · boutique non prouvée : la boutique est nommée quand on la connaît
//     (@marie-vintage), jamais « nous n'arrivons pas à prouver » ;
//   · ordinateur éteint : « ouvre Chrome sur ton ordinateur » ;
//   · reconnexion Beebs : « reconnectes » ;
//   · le risque de double vente est dit ; tout tient dans l'écran (320 → 1280) ;
//   · retraits aboutis (vue=avant) : AUCUN bandeau.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'retraits-vendus-1210');
const PORT = 5245;
const URL = (vue) => `http://localhost:${PORT}/scripts/apercu/retraits-vendus.html${vue ? `?vue=${vue}` : ''}`;
fs.mkdirSync(SORTIE, { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
const stop = () => { try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' }); else vite.kill(); } catch { /* déjà mort */ } };
process.on('exit', stop);
async function attendre(limiteMs = 180000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) { try { const r = await fetch(URL('')); if (r.ok) return; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error("vite n'a pas répondu");
}
const echecs = [];
const verifier = (c, quoi, detail = '') => { console.log(`${c ? '  ✓' : '  ✗'} ${quoi}${detail ? `   (${detail})` : ''}`); if (!c) echecs.push(quoi); };

try {
  await attendre();
  const nav = await chromium.launch({ channel: 'chrome' });
  for (const largeur of [320, 390, 1280]) {
    console.log(`\n── ${largeur} px ──`);
    const page = await nav.newPage({ viewport: { width: largeur, height: 900 }, deviceScaleFactor: 2 });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.route(/supabase\.co/, (r) => r.abort());
    await page.goto(URL(''), { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.waitForSelector('[data-bandeau="retraits-vendus-bloques"]', { timeout: 240000 });
    const t = await page.locator('[data-bandeau="retraits-vendus-bloques"]').innerText();
    verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | ').slice(0, 300));
    verifier(/5 articles vendus sont encore en ligne/.test(t), 'le titre compte les articles vendus encore en ligne');
    verifier(/ta boutique @ornella-vend/.test(t), 'Ornella : la boutique à ouvrir est nommée (@ornella-vend)');
    verifier(/ta boutique @marie-vintage/.test(t), 'boutique non prouvée : nommée quand on la connaît (@marie-vintage)');
    verifier(!/n'arrivons pas|prouver/i.test(t), 'jamais « nous n’arrivons pas à prouver »');
    verifier(/ouvre Chrome sur ton ordinateur/.test(t), 'ordinateur éteint : « ouvre Chrome sur ton ordinateur »');
    verifier(/reconnectes pas à Beebs/.test(t), 'Beebs : la reconnexion est demandée');
    verifier((t.match(/double vente/g) ?? []).length >= 3, 'le risque de double vente est dit');
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    verifier(!deborde, 'aucun débordement horizontal');
    await page.screenshot({ path: path.join(SORTIE, `bandeau-${largeur}.png`), fullPage: true });
    await page.close();
  }
  console.log('\n── retraits aboutis ──');
  const page = await nav.newPage({ viewport: { width: 390, height: 600 } });
  await page.goto(URL('avant'), { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForSelector('[data-surface="vide"]', { timeout: 240000 });
  verifier(await page.locator('[data-bandeau="retraits-vendus-bloques"]').count() === 0 && (await page.getAttribute('[data-surface="vide"]', 'data-vide')) === 'true', 'plus aucun retrait en file : le bandeau se lève, rien ne reste');
  await page.screenshot({ path: path.join(SORTIE, 'leve-390.png'), fullPage: true });
  await nav.close();
} finally { stop(); }
console.log(echecs.length ? `\n✗ ${echecs.length} échec(s)` : '\n✓ tout est vert');
console.log(`captures : ${SORTIE}`);
process.exit(echecs.length ? 1 : 0);
