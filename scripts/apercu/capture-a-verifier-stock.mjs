// Preuve du 15/10 (P16) : les fiches « à vérifier » se voient AU STOCK (à part,
// badge), un tap ouvre SA question, et les questions viennent dix par dix.
//   node scripts/apercu/capture-a-verifier-stock.mjs
// Le VRAI StockTab (harnais stock-refonte.jsx, faux client Supabase, données
// FICTIVES, 12 fiches « à vérifier »). Assertions écrites AVANT les images :
//   · la section « À vérifier · 12 articles » est dans le Stock, 6 cartes au plus, badge « À vérifier » ;
//   · elles ne sont PAS dans la grille des articles (hors totaux, lots, publication) ;
//   · « Répondre — dix à la fois (12 en tout) » ouvre l'écran : « Question 1 sur 10 · encore 2 ensuite » ;
//   · un tap sur une carte ouvre l'écran avec CETTE fiche en premier ;
//   · aucune écriture tentée, aucune erreur de page, aucun débordement — 360 et 1280 px.
// Captures : screenshots-review/a-verifier-stock-1510/.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'a-verifier-stock-1510');
fs.mkdirSync(SORTIE, { recursive: true });
const PORT = Number(process.env.APERCU_PORT || 5243);
const URL_PAGE = `http://127.0.0.1:${PORT}/scripts/apercu/a-verifier-stock.html`;
const s = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-stock-refonte.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(s.pid), '/f', '/t'], { stdio: 'ignore' }); else s.kill(); } catch { /* arrêté */ } });
for (let i = 0; i < 300; i += 1) { try { if ((await fetch(URL_PAGE)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${String(detail).slice(0, 300)}`}`); if (!cond) echecs.push(quoi); };
const nav = await chromium.launch({ channel: 'chrome' });

for (const largeur of [360, 1280]) {
  console.log(`\nLargeur ${largeur} px`);
  const ctx = await nav.newContext({ viewport: { width: largeur, height: largeur > 800 ? 900 : 844 }, deviceScaleFactor: 2, locale: 'fr-FR' });
  await ctx.route(/supabase\.co|fillsell\.app/, (r) => r.abort());
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(URL_PAGE, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__pret === true || window.__erreurChargement, null, { timeout: 300000 });
  await page.waitForTimeout(3500);
  const section = page.locator('[data-zone="a-verifier"]');
  verifier(await section.count() === 1, 'la section « À vérifier » est dans le Stock');
  const texte = await section.innerText().catch(() => '');
  verifier(/À vérifier · 12 articles/.test(texte), 'titre « À vérifier · 12 articles »', texte.slice(0, 120));
  verifier(await section.locator('[role="listitem"]').count() === 6, '6 cartes au plus (deux rangées de trois sur un téléphone)');
  verifier((await section.getByText('À vérifier', { exact: true }).count()) >= 6, 'chaque carte porte le badge « À vérifier »');
  const grille = await page.locator('#zone-defilement').innerText();
  const dansLaGrille = (grille.split('Article à vérifier n°').length - 1) - (texte.split('Article à vérifier n°').length - 1);
  verifier(dansLaGrille === 0, 'aucune fiche « à vérifier » dans la grille des articles (hors totaux, lots, publication)', String(dansLaGrille));
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SORTIE, `${largeur}-1-section.png`) });
  const deborde = await page.evaluate(() => { const z = document.getElementById('zone-defilement'); return document.documentElement.scrollWidth > window.innerWidth + 1 || (z && z.scrollWidth > z.clientWidth + 1); });
  verifier(!deborde, 'aucun débordement horizontal');

  // « Répondre — dix à la fois »
  await section.getByRole('button', { name: /Répondre — dix à la fois/ }).click();
  await page.waitForTimeout(1200);
  const ecran = await page.locator('[role="dialog"]').innerText().catch(() => '');
  verifier(/Question 1 sur 10 · encore 2 ensuite/.test(ecran), '« Question 1 sur 10 · encore 2 ensuite »', ecran.slice(0, 200));
  verifier(/Article à vérifier n° 12/.test(ecran), 'la plus chère d\'abord (n° 12, 38 €)', ecran.slice(0, 300));
  await page.screenshot({ path: path.join(SORTIE, `${largeur}-2-questions.png`) });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // un tap sur une carte : SA question en premier
  const carte = section.locator('[role="listitem"]').nth(3);
  const titreCarte = (await carte.innerText()).split('\n').find((l) => /Article à vérifier/.test(l)) ?? '';
  await carte.click();
  await page.waitForTimeout(1200);
  const ecran2 = await page.locator('[role="dialog"]').innerText().catch(() => '');
  verifier(titreCarte && ecran2.includes(titreCarte), `un tap sur « ${titreCarte} » l'ouvre en premier`, ecran2.slice(0, 300));
  await page.screenshot({ path: path.join(SORTIE, `${largeur}-3-sa-question.png`) });
  const ecritures = await page.evaluate(() => (window.__ecrituresRefusees || []).length);
  verifier(ecritures === 0, 'aucune écriture tentée', String(ecritures));
  verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));
  await ctx.close();
}

await nav.close();
console.log(echecs.length ? `\n✗ ${echecs.length} échec(s)` : '\nTOUT PASSE');
process.exit(echecs.length ? 1 : 0);
