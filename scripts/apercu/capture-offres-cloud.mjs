// Captures + relevés de la VRAIE feuille des offres, Cloud ouvert, par palier (08/11/2026 soir, C1 et C3).
// Outil de relecture, jamais livré. Chrome 390 et 1440, WebKit iPhone SE et 15 Pro Max ; fuseau Europe/Paris.
//
//   node scripts/apercu/capture-offres-cloud.mjs [--grille] [--seulement=business]
//
// Relève, par palier : le bloc Cloud (présentation + essai) présent ou non, son texte, le titre de la feuille, les
// débordements, les boutons de moins de 44 px, et range une capture pleine page par palier et par format.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review');
const PORT = 5215;
const ARGS = process.argv.slice(2);
const grille = ARGS.includes('--grille') ? '1' : '0';
const seulement = ARGS.find((a) => a.startsWith('--seulement='))?.split('=')[1];
const formatsVoulus = ARGS.find((a) => a.startsWith('--formats='))?.split('=')[1]?.split(',');
fs.mkdirSync(SORTIE, { recursive: true });

const serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-bandeau-cloud.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
const stop = () => {
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(serveur.pid), '/f', '/t'], { stdio: 'ignore' });
      const net = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout || '';
      for (const l of net.split(/\r?\n/)) if (new RegExp(`:${PORT}\\s.*LISTENING`).test(l)) spawnSync('taskkill', ['/pid', l.trim().split(/\s+/).pop(), '/f', '/t'], { stdio: 'ignore' });
    } else serveur.kill();
  } catch { /* déjà arrêté */ }
};
process.on('exit', stop);
const BASE = `http://127.0.0.1:${PORT}/scripts/apercu/offres-cloud.html`;
for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }

const RELEVE = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const cloud = [...document.querySelectorAll('[data-cloud]')].filter(vis);
  const boutons = [...document.querySelectorAll('button, a[href]')].filter(vis);
  return {
    titre: document.querySelector('h1,h2')?.textContent?.trim() ?? null,
    blocsCloud: cloud.map((e) => ({ type: e.getAttribute('data-cloud'), texte: e.textContent.replace(/\s+/g, ' ').trim().slice(0, 400) })),
    texte: document.body.innerText.replace(/\s+/g, ' ').slice(0, 4000),
    debordePage: document.documentElement.scrollWidth > window.innerWidth + 1,
    petitsBoutons: boutons.map((b) => ({ t: b.textContent.trim().slice(0, 40), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) }))
      .filter((b) => b.t && (b.h < 44 || b.w < 44)),
  };
};

const FORMATS = [
  { nom: 'web-390', moteur: 'chromium', ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } },
  { nom: 'web-1440', moteur: 'chromium', ctx: { viewport: { width: 1440, height: 900 } } },
  { nom: 'iphone-se', moteur: 'webkit', ctx: { ...devices['iPhone SE (3rd gen)'] } },
  { nom: 'iphone-15-pro-max', moteur: 'webkit', ctx: { ...devices['iPhone 15 Pro Max'] } },
].filter((f) => !formatsVoulus || formatsVoulus.includes(f.nom));
const PALIERS = ['free', 'premium', 'pro', 'business'].filter((x) => !seulement || seulement.split(',').includes(x));
const navs = { chromium: await chromium.launch({ channel: 'chrome' }), webkit: await webkit.launch() };
const sortie = {};
try {
  for (const f of FORMATS) {
    for (const palier of PALIERS) {
      for (const cloud of ['aucun', 'actif']) {
        const ctx = await navs[f.moteur].newContext({ ...f.ctx, timezoneId: 'Europe/Paris', locale: 'fr-FR' });
        const page = await ctx.newPage();
        await page.goto(`${BASE}?palier=${palier}&cloud=${cloud}&grille=${grille}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForTimeout(2500);
        const r = await page.evaluate(RELEVE);
        sortie[`${f.nom}/${palier}/${cloud}`] = r;
        console.log(`${f.nom.padEnd(18)} ${palier.padEnd(9)} cloud=${cloud.padEnd(6)} titre="${r.titre}" blocs=${r.blocsCloud.map((b) => b.type).join(',') || '—'} déborde=${r.debordePage} petits=${r.petitsBoutons.length}`);
        if (cloud === 'aucun') await page.screenshot({ path: path.join(SORTIE, `offres-${f.nom}-${palier}${grille === '1' ? '-grille' : ''}.png`), fullPage: true });
        await ctx.close();
      }
    }
  }
} finally {
  await navs.chromium.close();
  await navs.webkit.close();
  stop();
}
fs.writeFileSync(path.join(SORTIE, `offres-releve${grille === '1' ? '-grille' : ''}.json`), JSON.stringify(sortie, null, 1));
console.log(`Relevé : ${path.join(SORTIE, `offres-releve${grille === '1' ? '-grille' : ''}.json`)}`);
process.exit(0);
