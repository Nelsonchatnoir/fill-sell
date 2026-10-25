// Captures PNG des maquettes de l'étape 2 du lot (25/10/2026, nuit) — outil
// de relecture, jamais livré. Même patron que capture-lot-publication.mjs.
//
//     node scripts/apercu/capture-maquettes-lot.mjs <lignes.json>
//
// <lignes.json> : les articles (id, titre, prix_vente, description, photos)
// lus hors dépôt ; ils sont posés dans la page avant son chargement.
// Écrit dans screenshots-review/maquettes-lot/ (ignoré par git), à 390 px
// (téléphone, 2x) et 1280 px (web). Contrôles :
//   · aucune erreur de page ;
//   · aucun défilement horizontal ;
//   · toute cible tactile de l'écran ≥ 44 px de haut (boutons, puces) ;
//   · aucun champ de saisie sous 16 px (pas de zoom iOS) ;
//   · les 32 articles sont là, et le bilan dit les bons nombres.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'maquettes-lot');
const PORT = 5241;
const BASE = `http://localhost:${PORT}/scripts/apercu/maquettes-lot.html`;
const lignes = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
fs.mkdirSync(SORTIE, { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' }); else vite.kill(); } catch { /* déjà arrêté */ } };
process.on('exit', stop);
{
  const fin = Date.now() + 90000;
  while (Date.now() < fin) { try { if ((await fetch(BASE)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 700)); }
}
const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`  ${cond ? '✓' : '✗'} ${quoi}${cond || !detail ? '' : `   ← ${String(detail).slice(0, 300)}`}`); if (!cond) echecs.push(quoi); };

const navigateur = await chromium.launch();
async function ouvrirPage(largeur, hauteur, echelle) {
  const ctx = await navigateur.newContext({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: echelle, hasTouch: largeur < 600, isMobile: largeur < 600 });
  await ctx.addInitScript((d) => { window.__DONNEES_MAQUETTE__ = d; }, lignes);
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(String(e)));
  return { p, ctx, erreurs };
}
async function mesures(p) {
  return p.evaluate(() => {
    const petites = [...document.querySelectorAll('.ml-ecran button, .ml-feuille button')]
      .filter((b) => b.offsetParent !== null && !b.classList.contains('ml-case'))
      .map((b) => ({ t: (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 30), h: Math.round(b.getBoundingClientRect().height) }))
      .filter((x) => x.h < 44);
    const champs = [...document.querySelectorAll('.ml input, .ml textarea')].map((i) => parseFloat(getComputedStyle(i).fontSize)).filter((f) => f < 16);
    const nombres = [...document.querySelectorAll('.ml-nombre b')].map((b) => b.textContent);
    return { debord: document.documentElement.scrollWidth - window.innerWidth, petites, champs, nombres, cases: document.querySelectorAll('.ml-case').length, ecran: Boolean(document.querySelector('.ml-ecran')) };
  });
}

for (const prop of ['A', 'B', 'C']) {
  console.log(`\nProposition ${prop}`);
  const { p, ctx, erreurs } = await ouvrirPage(390, 844, 2);
  await p.goto(`${BASE}?p=${prop}`, { waitUntil: 'load', timeout: 120000 }); await p.waitForSelector('.ml-ecran', { timeout: 120000 }); await p.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(600);
  const m = await mesures(p);
  verifier(m.ecran, "l'écran est monté");
  verifier(m.cases === 32, '32 cases, une par article', m.cases);
  verifier(m.nombres[0] === '22' && m.nombres[1] === '10', 'bilan : 22 prêts, 10 à revoir', m.nombres.join(' / '));
  verifier(m.debord <= 0, 'aucun défilement horizontal', m.debord);
  verifier(m.petites.length === 0, 'cibles tactiles ≥ 44 px', JSON.stringify(m.petites));
  verifier(m.champs.length === 0, 'champs à 16 px au moins', m.champs.join(','));
  await p.screenshot({ path: path.join(SORTIE, `${prop}-1-ecran.png`) });
  await p.screenshot({ path: path.join(SORTIE, `${prop}-2-ecran-entier.png`), fullPage: true });
  // La feuille du téléphone (toucher l'article).
  await p.locator('text=Téléphone intelligent noir').first().click();
  await p.waitForTimeout(450);
  const f = await mesures(p);
  verifier(await p.locator('.ml-feuille').count() === 1, "la feuille de l'article s'ouvre");
  verifier(f.petites.length === 0, 'feuille : cibles ≥ 44 px', JSON.stringify(f.petites));
  await p.screenshot({ path: path.join(SORTIE, `${prop}-3-feuille-telephone.png`) });
  await p.locator('.ml-fermer').click();
  // « Tout valider » : les 3 textes passent, le bilan bouge.
  await p.locator('.ml-textes button').first().click();
  await p.waitForTimeout(250);
  const apres = await mesures(p);
  verifier(apres.nombres[0] === '25', '« Tout valider » : 25 prêts (les 3 articles qui n\'attendaient que leur texte)', apres.nombres.join(' / '));
  await p.screenshot({ path: path.join(SORTIE, `${prop}-4-textes-valides.png`) });
  verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));
  await ctx.close();
}
// Le web : la proposition A à 1280 px, et la feuille du livre (ISBN posé seul).
{
  console.log('\nWeb 1280');
  const { p, ctx, erreurs } = await ouvrirPage(1280, 900, 1);
  await p.goto(`${BASE}?p=A`, { waitUntil: 'load', timeout: 120000 }); await p.waitForSelector('.ml-ecran', { timeout: 120000 }); await p.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(500);
  const m = await mesures(p);
  verifier(m.debord <= 0, 'web : aucun défilement horizontal', m.debord);
  await p.screenshot({ path: path.join(SORTIE, 'A-5-web.png') });
  await p.locator('.ml-prets-tete').click();
  await p.locator('text=EAT - Chroniques').first().click();
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(SORTIE, 'A-6-web-feuille-livre.png') });
  verifier(erreurs.length === 0, 'web : aucune erreur de page', erreurs.join(' | '));
  await ctx.close();
}
await navigateur.close();
stop();
console.log(echecs.length ? `\n${echecs.length} échec(s)` : '\nTout est vert.');
process.exit(echecs.length ? 1 : 0);
