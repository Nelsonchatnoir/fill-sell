// Preuve du 11/10 (Louis) : cocher DANS le Stock, filtre gardé, les articles à
// publier, puis ouvrir la publication en lot EXISTANTE.
//   node scripts/apercu/capture-selection-publier.mjs
// Le VRAI StockTab (harnais stock-refonte.jsx, faux client Supabase, données
// FICTIVES). Assertions écrites AVANT de regarder les images :
//   · la porte « Choisir des articles à publier » est là, discrète ;
//   · une recherche (« jean ») posée AVANT reste posée APRÈS : seules les cartes
//     qui y répondent ET qui peuvent partir sont cochables ;
//   · une carte se coche au toucher ; « Tout (N) » coche ce que la vue montre ;
//   · « Continuer » ouvre la publication en lot existante (« Où les publier ? »)
//     avec les articles cochés — et rien d'autre ;
//   · « Quitter la publication en lot » rend le Stock tel qu'il était ;
//   · la tuile « Publier » du haut ouvre toujours sa sélection (inchangée) ;
//   · aucune écriture tentée, aucune erreur de page, aucun débordement.
// Captures : screenshots-review/selection-publier-1110/.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'selection-publier-1110');
fs.mkdirSync(SORTIE, { recursive: true });
const PORT = Number(process.env.APERCU_PORT || 5232);
const URL_PAGE = `http://127.0.0.1:${PORT}/scripts/apercu/selection-publier.html`;
const s = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-stock-refonte.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(s.pid), '/f', '/t'], { stdio: 'ignore' }); else s.kill(); } catch { /* arrêté */ } });
for (let i = 0; i < 300; i += 1) { try { if ((await fetch(URL_PAGE)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${String(detail).slice(0, 300)}`}`); if (!cond) echecs.push(quoi); };
const nav = await chromium.launch({ channel: 'chrome' });

for (const largeur of [390, 360]) {
  console.log(`\nLargeur ${largeur} px`);
  const ctx = await nav.newContext({ viewport: { width: largeur, height: 844 }, deviceScaleFactor: 2, locale: 'fr-FR' });
  await ctx.route(/supabase\.co|fillsell\.app/, (r) => r.abort());
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(URL_PAGE, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__pret === true || window.__erreurChargement, null, { timeout: 300000 });
  await page.waitForTimeout(3500);
  verifier(/FICTIVES/.test(String(await page.evaluate(() => window.__donneesFictives?.origine ?? ''))), 'données FICTIVES (aucun compte réel)');

  const porte = page.getByRole('button', { name: 'Choisir des articles à publier' });
  verifier(await porte.count() === 1, 'la porte « Choisir des articles à publier » est là');
  const recherche = page.locator('input[aria-label="Rechercher un article"]');
  await recherche.fill('jean');
  await page.waitForTimeout(800);
  verifier(await porte.count() === 1, 'sous une recherche, la porte reste là');
  await porte.click();
  await page.waitForTimeout(700);
  verifier(await page.getByText('Quitter la publication en lot').count() === 1, 'le mode du lot s\'ouvre (en-tête « Quitter la publication en lot »)');
  verifier(await recherche.inputValue() === 'jean', 'la recherche « jean » est GARDÉE');
  const cartes = page.locator('#zone-defilement [role="checkbox"]');
  const titres = (await cartes.allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  verifier(titres.length === 2 && titres.every((t) => /jean/i.test(t)), 'seules les 2 cartes qui répondent à « jean » sont cochables', titres.join(' | '));
  verifier(await page.getByRole('button', { name: 'Tout (2)' }).count() === 1, '« Tout (2) » = ce que la vue montre');
  await page.screenshot({ path: path.join(SORTIE, `${largeur}-1-mode.png`) });

  await cartes.first().click();
  await page.waitForTimeout(300);
  verifier(await page.getByText('1 sélectionné', { exact: true }).count() === 1, 'une carte touchée = « 1 sélectionné »');
  verifier(await cartes.first().getAttribute('aria-checked') === 'true', 'la carte touchée est cochée');
  await page.getByRole('button', { name: 'Tout (2)' }).click();
  await page.waitForTimeout(300);
  verifier(await page.getByText('2 sélectionnés', { exact: true }).count() === 1, '« Tout (2) » → « 2 sélectionnés »');
  await page.screenshot({ path: path.join(SORTIE, `${largeur}-2-tout.png`) });
  const deborde = await page.evaluate(() => { const z = document.getElementById('zone-defilement'); return document.documentElement.scrollWidth > window.innerWidth + 1 || (z && z.scrollWidth > z.clientWidth + 1); });
  verifier(!deborde, 'aucun débordement horizontal');

  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await page.waitForTimeout(1500);
  verifier(await page.getByText('Où les publier ?').count() >= 1, '« Continuer » ouvre la publication en lot existante (« Où les publier ? »)');
  const texteLot = await page.locator('body').innerText();
  const vus = ['Veste en jean délavée', 'Jean droit taille haute'].filter((t) => texteLot.includes(t));
  const intrus = ['Robe d’été fleurie', 'Baskets blanches en cuir', 'Lampe de bureau vintage'].filter((t) => texteLot.includes(t));
  verifier(intrus.length === 0, 'aucun article hors sélection dans le lot', intrus.join(' | '));
  console.log(`    (articles nommés dans le lot : ${vus.length ? vus.join(', ') : 'aucun titre affiché à cette étape'})`);
  await page.screenshot({ path: path.join(SORTIE, `${largeur}-3-lot.png`) });
  const ecritures = await page.evaluate(() => (window.__ecrituresRefusees || []).length);
  verifier(ecritures === 0, 'aucune écriture tentée', String(ecritures));
  verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));
  await ctx.close();
}

// Sortie du mode et tuile « Publier » du haut : inchangées.
{
  console.log('\nSortie du mode, tuile « Publier »');
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  await ctx.route(/supabase\.co|fillsell\.app/, (r) => r.abort());
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(URL_PAGE, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__pret === true, null, { timeout: 300000 });
  await page.waitForTimeout(3500);
  const avant = await page.locator('#zone-defilement [role="checkbox"]').count();
  await page.getByRole('button', { name: 'Choisir des articles à publier' }).click();
  await page.waitForTimeout(500);
  await page.getByText('Quitter la publication en lot').click();
  await page.waitForTimeout(500);
  verifier(await page.locator('#zone-defilement [role="checkbox"]').count() === avant, 'Quitter : plus aucune case (Stock comme avant)');
  verifier(await page.getByRole('button', { name: 'Choisir des articles à publier' }).count() === 1, 'Quitter : la porte revient');
  await page.locator('[aria-label^="Publier :"]').first().click();
  await page.waitForTimeout(800);
  verifier(await page.getByText('Publier plusieurs articles').count() >= 1, 'la tuile « Publier » ouvre toujours sa sélection');
  verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));
  await ctx.close();
}

await nav.close();
console.log(echecs.length ? `\n✗ ${echecs.length} échec(s)` : '\nTOUT PASSE');
process.exit(echecs.length ? 1 : 0);
