// Preuve du 06/10 : « Synchroniser » Vinted avec un canal direct MUET.
//   node scripts/apercu/capture-synchro-repli.mjs
// Deux cas sur le VRAI composant (synchro-repli.jsx) : le relevé part par la
// file et se termine sans « échec » ; sans session Vinted, la phrase
// « Connecte-toi à Vinted sur ton ordinateur. » s'affiche.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'synchro-repli-0610');
fs.mkdirSync(SORTIE, { recursive: true });
const PORT = 5218;
const s = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-stock-refonte.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(s.pid), '/f', '/t'], { stdio: 'ignore' }); else s.kill(); } catch { /* arrêté */ } });
const base = `http://127.0.0.1:${PORT}/scripts/apercu/synchro-repli.html`;
for (let i = 0; i < 300; i += 1) { try { if ((await fetch(base)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };
const nav = await chromium.launch({ channel: 'chrome' });

for (const cas of ['muet', 'sans_session']) {
  console.log(`\nCas « ${cas} »`);
  const page = await (await nav.newContext({ viewport: { width: 420, height: 700 }, locale: 'fr-FR' })).newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.route(/https?:\/\/[^/]*(supabase\.co|fillsell\.app)\//, (r) => r.abort());
  await page.goto(`${base}?cas=${cas}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__pret === true, null, { timeout: 300000 });
  const bouton = page.getByRole('button', { name: /Synchroniser/ }).first();
  await bouton.waitFor({ timeout: 30000 });
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find((x) => /Synchroniser/.test(x.textContent)); return b && !b.disabled; }, null, { timeout: 30000 });
  const t0 = Date.now();
  await bouton.click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(SORTIE, `${cas}-1-apres-clic.png`) });
  await page.waitForTimeout(18000);
  await page.screenshot({ path: path.join(SORTIE, `${cas}-2-fin.png`) });
  const texte = await page.locator('#apercu').innerText();
  const journal = await page.evaluate(() => window.__supabaseJournal ?? []);
  const directes = await page.evaluate(() => window.__commandesDirectes);
  const rpcs = journal.filter((j) => j.rpc === 'demander_sync_dressing').length;
  verifier(directes === 1, 'le clic a bien tenté le canal direct (muet)', String(directes));
  verifier(rpcs === 1, 'repli : UNE demande à la file serveur', String(rpcs));
  verifier(!/n'a pas démarré|échec|échouée/i.test(texte), 'aucun « échec » à l\'écran', texte.slice(0, 300));
  if (cas === 'muet') {
    verifier(await page.evaluate(() => window.__fini === true), 'le relevé se termine (onDone)');
    verifier(/Annonces Vinted synchronisées/.test(texte), 'la fin réussie est dite', texte.slice(0, 300));
  } else {
    verifier(texte.includes('Connecte-toi à Vinted sur ton ordinateur.'), 'la phrase de connexion s\'affiche', texte.slice(0, 300));
  }
  verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));
  console.log(`  (durée ${Math.round((Date.now() - t0) / 1000)} s) texte : ${texte.replace(/\s+/g, ' ').slice(0, 220)}`);
}
await nav.close();
console.log(echecs.length ? `\n✗ ${echecs.length} échec(s)` : '\n✓ preuve verte');
process.exit(echecs.length ? 1 : 0);
