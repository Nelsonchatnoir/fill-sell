// Preuve du 12/10 (A1 + A2) : plus de plafond à 20 dans le Stock, et la porte
// « Choisir des articles à publier » est un VRAI bouton, PC et mobile, clair et
// sombre.
//   node scripts/apercu/capture-lot-sans-plafond.mjs
// Le VRAI StockTab (harnais selection-publier.jsx → stock-refonte.jsx, faux
// client Supabase, données FICTIVES + 60 articles fictifs). Assertions écrites
// AVANT de regarder les images :
//   · A2 : la porte est un bouton visible, dans l'écran, ≥ 44 px de haut, plein
//     (fond coloré, pas un lien), à 1280, 768, 390 et 320 px ;
//   · A1 : « Tout (N) » coche les N articles de la vue, N > 20, sans plafond ;
//     la barre dit le quota du palier AVANT de lancer quand la sélection le
//     dépasse (données fictives : 37 annonces restantes) ;
//   · « Continuer » ouvre la publication en lot avec TOUS les articles ;
//   · aucune écriture tentée, aucune erreur de page, aucun débordement.
// Captures : screenshots-review/lot-sans-plafond-1210/.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'lot-sans-plafond-1210');
fs.mkdirSync(SORTIE, { recursive: true });
const PORT = Number(process.env.APERCU_PORT || 5243);
const NOMBRE = 60;
const URL_PAGE = `http://127.0.0.1:${PORT}/scripts/apercu/selection-publier.html?nombre=${NOMBRE}`;
const s = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-stock-refonte.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(s.pid), '/f', '/t'], { stdio: 'ignore' }); else s.kill(); } catch { /* arrêté */ } });
for (let i = 0; i < 300; i += 1) { try { if ((await fetch(URL_PAGE)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${detail ? `   (${String(detail).slice(0, 300)})` : ''}`); if (!cond) echecs.push(quoi); };
const nav = await chromium.launch({ channel: 'chrome' });

const VUES = [
  { largeur: 1280, hauteur: 900, theme: 'light' }, { largeur: 1280, hauteur: 900, theme: 'dark' },
  { largeur: 768, hauteur: 1000, theme: 'light' },
  { largeur: 390, hauteur: 844, theme: 'light' }, { largeur: 390, hauteur: 844, theme: 'dark' },
  { largeur: 320, hauteur: 640, theme: 'light' },
];
for (const { largeur, hauteur, theme } of VUES) {
  console.log(`\n${largeur} px, ${theme === 'dark' ? 'sombre' : 'clair'}`);
  const ctx = await nav.newContext({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: 2, locale: 'fr-FR', colorScheme: theme });
  await ctx.route(/supabase\.co|fillsell\.app/, (r) => r.abort());
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(URL_PAGE, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__pret === true || window.__erreurChargement, null, { timeout: 300000 });
  await page.waitForTimeout(3500);
  const suffixe = `${largeur}-${theme === 'dark' ? 'sombre' : 'clair'}`;

  // ── A2 : un vrai bouton ──
  const porte = page.getByRole('button', { name: 'Choisir des articles à publier' });
  verifier(await porte.count() === 1, 'la porte « Choisir des articles à publier » est un <button>');
  await porte.scrollIntoViewIfNeeded();
  const boite = await porte.boundingBox();
  const style = await porte.evaluate((b) => { const c = getComputedStyle(b); return { fond: c.backgroundImage !== 'none' ? 'dégradé' : c.backgroundColor, couleur: c.color, souligne: c.textDecorationLine }; });
  verifier(!!boite && boite.height >= 44 && boite.x >= 0 && boite.x + boite.width <= largeur + 1, 'visible, dans l’écran, ≥ 44 px de haut (cible tactile)', boite ? `${Math.round(boite.width)}×${Math.round(boite.height)} à x=${Math.round(boite.x)}` : 'absente');
  verifier(style.fond === 'dégradé' || !/rgba\(0, 0, 0, 0\)|transparent/.test(style.fond), 'un fond plein (pas un lien)', JSON.stringify(style));
  verifier(style.souligne !== 'underline', 'pas souligné comme un lien');
  await page.screenshot({ path: path.join(SORTIE, `${suffixe}-1-bouton.png`) });

  // ── A1 : sans plafond ──
  await porte.click();
  await page.waitForTimeout(800);
  const tout = page.getByRole('button', { name: /^Tout \(\d+\)$/ });
  verifier(await tout.count() === 1, '« Tout (N) » proposé');
  const nVue = Number(((await tout.innerText()).match(/\d+/) ?? ['0'])[0]);
  verifier(nVue > 20, `la vue montre plus de 20 articles cochables (${nVue})`);
  const t0 = Date.now();
  await tout.click();
  await page.waitForFunction((n) => document.body.innerText.includes(`${n} sélectionnés`), nVue, { timeout: 5000 }).catch(() => {});
  const duree = Date.now() - t0;
  verifier((await page.locator('.pa-bar .lbl').innerText()).startsWith(`${nVue} sélectionnés`), `« Tout (${nVue}) » → « ${nVue} sélectionnés » : aucun plafond à 20`);
  verifier(duree < 2000, 'l’écran reste fluide (tout cocher < 2 s)', `${duree} ms`);
  const quota = page.locator('[data-quota-depasse="1"]');
  verifier(nVue > 37 ? await quota.count() === 1 : true, 'la barre dit le quota du palier AVANT de lancer (37 restantes dans les données fictives)', await quota.count() ? await quota.innerText() : '');
  await page.locator('.pa-bar').evaluate((b) => b.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  verifier(!deborde, 'aucun débordement horizontal');
  await page.screenshot({ path: path.join(SORTIE, `${suffixe}-2-tout-coche.png`) });

  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await page.waitForTimeout(1800);
  verifier(await page.getByText('Où les publier ?').count() >= 1, '« Continuer » ouvre la publication en lot');
  const corps = await page.locator('body').innerText();
  const annonce = corps.match(/(\d+)\s+articles?/);
  verifier(!/20 au plus|au plus 20|20 articles au plus/i.test(corps), 'nulle part « 20 au plus »');
  console.log(`    (le lot annonce : ${annonce ? annonce[0] : '—'})`);
  await page.screenshot({ path: path.join(SORTIE, `${suffixe}-3-lot.png`) });
  const ecrites = await page.evaluate(() => window.__ecrituresRefusees || []);
  const horsMesure = ecrites.filter((e) => e.table !== 'usage_logs');
  verifier(horsMesure.length === 0, 'aucune écriture de données (seule la mesure usage_logs)', JSON.stringify(horsMesure));
  const mur = ecrites.find((e) => e.valeurs?.feature === 'lot_mur_quota_affiche');
  verifier(!!mur && mur.valeurs.metadata.articles_lot === nVue && mur.valeurs.metadata.articles_retenus === 37, 'le lot montre le mur du quota : 37 retenus, le reste reporté (mesure lot_mur_quota_affiche)', mur ? JSON.stringify(mur.valeurs.metadata).slice(0, 200) : 'absente');
  verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));
  await ctx.close();
}

await nav.close();
console.log(echecs.length ? `\n✗ ${echecs.length} échec(s)` : '\nTOUT PASSE');
console.log(`captures : ${SORTIE}`);
process.exit(echecs.length ? 1 : 0);
