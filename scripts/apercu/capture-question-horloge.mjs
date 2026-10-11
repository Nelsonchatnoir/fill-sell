// Capture PNG + contrôles de la question « Catégorie Vinted » de l'Horloge de
// Louis (A3, 12/10). Outil de relecture, jamais livré.
//
//     node scripts/apercu/capture-question-horloge.mjs
//
// Ce qu'il MONTRE : la modale « Compléter » telle qu'elle s'ouvrait chez Louis
// (vue=avant) — ce qu'elle propose, et pourquoi une réponse n'aboutissait pas
// (13 sous-rayons dont 10 intermédiaires : une réponse ne descend que d'un
// niveau) ; puis la question de dernier recours du moteur A3 (vue=apres) —
// uniquement des FEUILLES, une réponse suffit. À 390 et 1280 px.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'horloge-louis');
const PORT = 5233;
const URL = (vue) => `http://localhost:${PORT}/scripts/apercu/question-horloge.html?vue=${vue}`;
fs.mkdirSync(SORTIE, { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
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
  for (const vue of ['avant', 'apres']) {
    for (const largeur of [390, 1280]) {
      console.log(`\n── ${vue}, ${largeur} px ──`);
      const page = await nav.newPage({ viewport: { width: largeur, height: 1000 }, deviceScaleFactor: 2 });
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(String(e)));
      await page.route(/supabase\.co/, (r) => r.abort());
      await page.goto(URL(vue), { waitUntil: 'domcontentloaded', timeout: 240000 });
      await page.waitForSelector('[data-surface="liste"]', { timeout: 240000 });
      await page.waitForTimeout(2000);
      verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | ').slice(0, 300));
      const ouvrable = await page.getAttribute('[data-ouvrable]', 'data-ouvrable');
      verifier(ouvrable === 'true', 'le bouton « Compléter » existe pour ce job');
      const options = await page.$$eval('select option', (os) => os.map((o) => o.textContent.trim()).filter((t) => t && t !== '—'));
      console.log(`     options proposées (${options.length}) : ${options.slice(0, 6).join(' | ')}${options.length > 6 ? ' | …' : ''}`);
      if (vue === 'avant') {
        verifier(options.includes('Jeux éducatifs') && !options.some((o) => o.includes('›')), 'AVANT : 13 sous-rayons, dont 10 intermédiaires (« Jeux éducatifs » a 5 sous-rayons) — une réponse ne descend que d’UN niveau', `${options.length} options`);
      } else {
        verifier(options.some((o) => o === 'Jeux éducatifs › Autres jeux éducatifs') && options.some((o) => o === 'Peluches'), 'APRÈS : des FEUILLES seulement (« Jeux éducatifs › Autres jeux éducatifs », « Peluches ») — une réponse suffit', `${options.length} options`);
        verifier(!options.includes('Jeux éducatifs'), 'APRÈS : aucun niveau intermédiaire proposé');
      }
      await page.screenshot({ path: path.join(SORTIE, `horloge-${vue}-${largeur}.png`), fullPage: true });
      await page.close();
    }
  }
  await nav.close();
} finally { stop(); }
console.log(echecs.length ? `\n✗ ${echecs.length} échec(s)` : '\n✓ tout est vert');
console.log(`captures : ${SORTIE}`);
process.exit(echecs.length ? 1 : 0);
