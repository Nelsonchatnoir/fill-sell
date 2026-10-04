// Captures à 390 px + contrôles du palier Business de Louis (04/10/2026).
// Outil de relecture, jamais livré — même patron que capture-stock-refonte.mjs.
//
//   node scripts/apercu/capture-palier-louis.mjs
//
// Serveur Vite avec le FAUX client Supabase (vite-stock-refonte.config.mjs) :
// aucune requête ne part vers la base, et playwright coupe en plus tout appel
// *.supabase.co et fillsell.app. Données : build/apercu-palier/louis.json
// (lecture seule, jamais commité).
//
// Ce qu'il PROUVE, à 390 px, sur les vrais composants et l'état réel de Louis :
//   · chargé : pastille « Business », aucun « réservée au plan Pro », « Non
//     réglée » sur Vinted SEULEMENT (lu sur configure), 19h–22h sur Leboncoin,
//     Beebs et Opla ;
//   · en lecture / lecture ratée : ni refus ni « Non réglée » ;
//   · Stock : « Publier plusieurs articles d'un coup » visible, entière, et
//     « Active sur Leboncoin, Beebs et Opla » ;
//   · aucun débordement horizontal, aucune erreur de page.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'palier-louis');
const PORT = 5214;
fs.mkdirSync(SORTIE, { recursive: true });
if (!fs.existsSync(path.join(RACINE, 'build', 'apercu-palier', 'louis.json'))) {
  console.error('build/apercu-palier/louis.json manquant (état réel de Louis, relu en lecture seule).');
  process.exit(1);
}

const serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-stock-refonte.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
serveur.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(serveur.pid), '/f', '/t'], { stdio: 'ignore' }); else serveur.kill(); } catch { /* déjà arrêté */ } };
process.on('exit', stop);
const base = `http://127.0.0.1:${PORT}/scripts/apercu/palier-louis.html`;
{
  const fin = Date.now() + 120000;
  while (Date.now() < fin) { try { if ((await fetch(base)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }
}

let ko = 0, ok = 0;
const verifier = (cond, quoi, detail = '') => { if (cond) ok++; else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${String(detail).slice(0, 300)}` : ''}`); } };
const RESERVE = /Réservée au plan Pro|La republication automatique est réservée au plan Pro/;

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

  const c = await ouvrir('charge');
  verifier(!RESERVE.test(c), 'chargé : aucun « réservée au plan Pro »', c);
  verifier(/BUSINESS|Business/.test(c), 'chargé : la pastille dit Business', c);
  verifier((c.match(/Non réglée/g) ?? []).length === 1, 'chargé : « Non réglée » sur Vinted seulement', c);
  verifier((c.match(/19h–22h/g) ?? []).length === 3, 'chargé : 19h–22h sur Leboncoin, Beebs et Opla', c);
  verifier(/3 plateformes actives/.test(c), 'chargé : « 3 plateformes actives »', c);

  const l = await ouvrir('lecture');
  verifier(!RESERVE.test(l) && !/Non réglée/.test(l), 'en lecture : ni refus ni « Non réglée »', l);
  verifier(/Business|BUSINESS/.test(l) && /Lecture de tes réglages/.test(l), 'en lecture : Business, et l’écran dit qu’il lit', l);

  const e = await ouvrir('echec');
  verifier(!RESERVE.test(e) && !/Non réglée/.test(e), 'lecture ratée : ni refus ni « Non réglée »', e);
  verifier(/n’ont pas pu être lus/.test(e) && /Réessayer/.test(e), 'lecture ratée : dit, avec « Réessayer »', e);

  const b = await ouvrir('leboncoin');
  verifier(!RESERVE.test(b) && /Business|BUSINESS/.test(b), 'Leboncoin : Business, aucun refus', b);
  verifier(/19h|Soir/.test(b), 'Leboncoin : le créneau du soir de Louis', b);

  const s = await ouvrir('stock');
  verifier(/Publier plusieurs articles d’un coup|Publier plusieurs articles d'un coup/.test(s), 'Stock : « Publier plusieurs articles d’un coup » est visible', s);
  verifier(/Active sur Leboncoin, Beebs et Opla/.test(s), 'Stock : « Active sur Leboncoin, Beebs et Opla »', s);
  const lot = await page.evaluate(() => {
    const z = document.querySelector('[data-zone="lot"] button');
    if (!z) return null;
    const r = z.getBoundingClientRect();
    const spans = [...z.querySelectorAll('span')].map((x) => ({ t: x.textContent, coupe: x.scrollWidth > x.clientWidth + 0.5 }));
    return { gauche: r.left, droite: r.right, hauteur: r.height, spans };
  });
  verifier(lot && lot.gauche >= 16 - 0.5 && lot.droite <= 390 - 16 + 0.5, 'Stock : la porte du lot tient dans les marges de 16 px', JSON.stringify(lot));
  verifier(lot && lot.hauteur >= 44, 'Stock : la porte du lot fait au moins 44 px de haut (toucher)', JSON.stringify(lot));
  verifier(lot && lot.spans.every((x) => !x.coupe), 'Stock : aucun texte de la porte du lot n’est coupé', JSON.stringify(lot?.spans));

  verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));
} finally {
  await navigateur.close();
  stop();
}
console.log(ko ? `\n${ko} échec(s), ${ok} vérification(s) passée(s)` : `aperçu palier Louis : ${ok} vérifications passées — captures dans screenshots-review/palier-louis/`);
process.exit(ko ? 1 : 0);
