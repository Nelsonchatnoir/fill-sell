// Captures à 390 px de la republication automatique Depop dans l'app
// (10/10/2026). Outil de relecture, jamais livré — même patron que
// capture-palier-louis.mjs.
//
//   node scripts/apercu/capture-republication-auto-depop.mjs
//
// Serveur Vite avec le FAUX client Supabase (vite-stock-refonte.config.mjs) :
// aucune requête ne part vers la base, et playwright coupe en plus tout appel
// *.supabase.co et fillsell.app. Données : build/apercu-depop/nico.json
// (lecture seule, jamais commité).
//
// Ce qu'il PROUVE, à 390 px, sur les vrais composants et l'état réel de Nico :
//   · extension 0.6.106 : une ligne Depop, au même niveau que Vinted,
//     Leboncoin et Beebs ; aucune ligne Opla ;
//   · extension 0.6.105 : aucune ligne Depop (même règle que la publication) ;
//   · Depop active : « 1 plateforme active », son créneau, son plafond réglé ;
//   · l'écran Depop : « Retrait puis redépôt », l'interrupteur, aucun
//     « Ne ferait pas remonter » ni « Pas encore disponible » ;
//   · aucun débordement horizontal, aucune erreur de page.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'republication-auto-depop');
const PORT = 5216;
fs.mkdirSync(SORTIE, { recursive: true });
if (!fs.existsSync(path.join(RACINE, 'build', 'apercu-depop', 'nico.json'))) {
  console.error('build/apercu-depop/nico.json manquant (état réel de Nico, relu en lecture seule).');
  process.exit(1);
}

const serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-stock-refonte.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
serveur.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(serveur.pid), '/f', '/t'], { stdio: 'ignore' }); else serveur.kill(); } catch { /* déjà arrêté */ } };
process.on('exit', stop);
const base = `http://127.0.0.1:${PORT}/scripts/apercu/republication-auto-depop.html`;
{
  const fin = Date.now() + 120000;
  while (Date.now() < fin) { try { if ((await fetch(base)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }
}

let ko = 0, ok = 0;
const verifier = (cond, quoi, detail = '') => { if (cond) ok++; else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${String(detail).slice(0, 300)}` : ''}`); } };

const navigateur = await chromium.launch({ channel: 'chrome' });
try {
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.route(/supabase\.co|fillsell\.app/, (r) => r.abort());
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  const ouvrir = async (ecran) => {
    await page.goto(`${base}?ecran=${ecran}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__pret === true, null, { timeout: 120000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SORTIE, `${ecran}.png`), fullPage: true });
    const texte = await page.evaluate(() => document.body.innerText);
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 0.5);
    verifier(!deborde, `${ecran} : aucun débordement horizontal à 390 px`);
    return texte;
  };
  // Le logo Depop est un mot-symbole (« depop » en texte) : on lit le NOM de la
  // ligne parmi ses lignes de texte, pas la première.
  const lignes = async () => page.evaluate(() => [...document.querySelectorAll('button')]
    .map((b) => b.innerText.split('\n').map((t) => t.trim()).find((t) => ['Vinted', 'Leboncoin', 'Beebs', 'Opla', 'Depop'].includes(t)))
    .filter(Boolean));

  await ouvrir('liste');
  const l106 = await lignes();
  verifier(JSON.stringify(l106) === JSON.stringify(['Vinted', 'Leboncoin', 'Beebs', 'Depop']), 'extension 0.6.106 : Vinted, Leboncoin, Beebs, Depop — pas d’Opla', l106);

  await ouvrir('liste105');
  const l105 = await lignes();
  verifier(JSON.stringify(l105) === JSON.stringify(['Vinted', 'Leboncoin', 'Beebs']), 'extension 0.6.105 : pas de ligne Depop', l105);

  const a = await ouvrir('active');
  verifier(/1 plateforme active/.test(a), 'Depop active : « 1 plateforme active »', a);
  verifier(/9h45–11h45/.test(a), 'Depop active : son créneau 9h45–11h45', a);

  const d = await ouvrir('depop');
  verifier(/Retrait puis redépôt/.test(d), 'écran Depop : « Retrait puis redépôt »', d);
  verifier(!/Ne ferait pas remonter|Pas encore disponible/.test(d), 'écran Depop : ni « Ne ferait pas remonter » ni « Pas encore disponible »', d);
  verifier(await page.locator('[role="switch"], button[aria-pressed], input[type="checkbox"]').count() > 0, 'écran Depop : l’interrupteur est là');

  verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));
} finally {
  await navigateur.close();
  stop();
}
console.log(ko ? `\n${ko} échec(s), ${ok} vérification(s) passée(s)` : `aperçu republication auto Depop : ${ok} vérifications passées — captures dans screenshots-review/republication-auto-depop/`);
process.exit(ko ? 1 : 0);
