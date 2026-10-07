// Captures + contrôles de la synchro avec barre, temps restant et rapprochement
// (07/10/2026, rattachement avant stock). Outil de relecture, jamais livré.
//
//   node scripts/apercu/capture-synchro-avancement.mjs
//
// Le VRAI BlocSynchro, servi par le faux client Supabase : aucune requête ne
// part (playwright coupe en plus *.supabase.co et fillsell.app).
// Ce qu'il PROUVE, à 375 et 430 px :
//   · pendant les relevés : « Synchronisation de Leboncoin en cours »,
//     « Environ 4 min », une ligne par plateforme (120 sur 333, en attente) ;
//   · pendant le rapprochement : « Rapprochement de tes annonces en cours »,
//     « Moins d'une minute », la ligne « Rapprochement » ;
//   · à la fin : « Ton stock est prêt », « 3 annonces à vérifier » ;
//   · aucun débordement horizontal, aucune erreur de page.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'synchro-avancement');
const PORT = 5217;
fs.mkdirSync(SORTIE, { recursive: true });
const serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-stock-refonte.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
serveur.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(serveur.pid), '/f', '/t'], { stdio: 'ignore' }); else serveur.kill(); } catch { /* déjà arrêté */ } };
process.on('exit', stop);
const base = `http://127.0.0.1:${PORT}/scripts/apercu/synchro-avancement.html`;
{
  const fin = Date.now() + 120000;
  while (Date.now() < fin) { try { if ((await fetch(base)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }
}
let ko = 0, ok = 0;
const verifier = (c, quoi, d = '') => { if (c) ok++; else { ko++; console.log(`  ✗ ${quoi}${d ? `   ← ${String(d).slice(0, 400)}` : ''}`); } };

const navigateur = await chromium.launch({ channel: 'chrome' });
try {
  for (const largeur of [375, 430]) {
    const ctx = await navigateur.newContext({ viewport: { width: largeur, height: 900 }, deviceScaleFactor: 2, locale: 'fr-FR' });
    await ctx.route(/supabase\.co|fillsell\.app/, (r) => r.abort());
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    const ouvrir = async (etat) => {
      await page.goto(`${base}?etat=${etat}`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => window.__pret === true, null, { timeout: 120000 });
      await page.waitForTimeout(1500);
    };
    const lire = () => page.evaluate(() => ({
      t: document.querySelector('[data-zone="bloc"]')?.innerText ?? '',
      deborde: document.documentElement.scrollWidth > window.innerWidth + 0.5,
    }));
    await ouvrir('releves');
    await page.locator('[data-zone="bloc"]').screenshot({ path: path.join(SORTIE, `releves-${largeur}.png`) });
    let m = await lire();
    verifier(/Synchronisation de Leboncoin en cours/.test(m.t), `${largeur} relevés : la plateforme en cours est nommée`, m.t);
    verifier(/Environ 4 min/.test(m.t), `${largeur} relevés : « Environ 4 min »`, m.t);
    verifier(/120 sur 333/.test(m.t) && /en attente/.test(m.t), `${largeur} relevés : Leboncoin 120 sur 333, Beebs en attente`, m.t);
    verifier(!m.deborde, `${largeur} relevés : aucun débordement`);

    await ouvrir('rapprochement');
    await page.locator('[data-zone="bloc"]').screenshot({ path: path.join(SORTIE, `rapprochement-${largeur}.png`) });
    m = await lire();
    verifier(/Rapprochement de tes annonces en cours/.test(m.t), `${largeur} rapprochement : la phase est dite`, m.t);
    verifier(/Moins d’une minute/.test(m.t), `${largeur} rapprochement : « Moins d’une minute »`, m.t);
    verifier(/rien n.est créé en double/.test(m.t), `${largeur} rapprochement : « rien n'est créé en double »`, m.t);
    verifier(!m.deborde, `${largeur} rapprochement : aucun débordement`);

    // La fin : la page passe à « tout fini » et se relit au prochain tour (15 s).
    await page.evaluate(() => window.__finir());
    await page.waitForFunction(() => /Ton stock est prêt/.test(document.body.innerText), null, { timeout: 40000 }).catch(() => {});
    await page.locator('[data-zone="bloc"]').screenshot({ path: path.join(SORTIE, `fin-${largeur}.png`) });
    m = await lire();
    verifier(/Ton stock est prêt/.test(m.t), `${largeur} fin : « Ton stock est prêt »`, m.t);
    verifier(/3 annonces à vérifier/.test(m.t), `${largeur} fin : « 3 annonces à vérifier »`, m.t);
    verifier(!m.deborde, `${largeur} fin : aucun débordement`);
    verifier(erreurs.length === 0, `${largeur} : aucune erreur de page`, erreurs.join(' | '));
    await ctx.close();
  }
} finally {
  await navigateur.close();
  stop();
}
console.log(ko ? `\n${ko} échec(s), ${ok} vérification(s) passée(s)` : `aperçu synchro : ${ok} vérifications passées — captures dans screenshots-review/synchro-avancement/`);
process.exit(ko ? 1 : 0);
