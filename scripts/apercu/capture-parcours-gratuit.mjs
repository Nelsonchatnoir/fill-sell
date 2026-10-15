// Preuve du 15/10 (P17) : un compte GRATUIT, juste après sa synchro, voit
// d'abord ce que son mois lui offre, et la sélection n'en coche pas plus.
//   node scripts/apercu/capture-parcours-gratuit.mjs
// Le VRAI StockTab (harnais stock-refonte.jsx, faux client Supabase, données
// FICTIVES, compteurs : 2 articles et 3 republications offerts). Assertions
// écrites AVANT de regarder les images :
//   · la tuile « Publier » dit « Gratuit : encore 2 ce mois-ci » (forme longue sur les lignes « À faire maintenant ») ;
//   · la tuile « Republier » dit « Gratuit : encore 3 ce mois-ci » ;
//   · la sélection « Publier » coche 2 articles (pas tout) et le dit ;
//   · la sélection « Remonter » coche les 3 plus anciennes et le dit ;
//   · aucune écriture tentée, aucune erreur de page, aucun débordement — de 360 à 1280 px.
// Captures : screenshots-review/parcours-gratuit-1510/.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'parcours-gratuit-1510');
fs.mkdirSync(SORTIE, { recursive: true });
const PORT = Number(process.env.APERCU_PORT || 5241);
const URL_PAGE = `http://127.0.0.1:${PORT}/scripts/apercu/parcours-gratuit.html`;
const s = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-stock-refonte.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(s.pid), '/f', '/t'], { stdio: 'ignore' }); else s.kill(); } catch { /* arrêté */ } });
for (let i = 0; i < 300; i += 1) { try { if ((await fetch(URL_PAGE)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${String(detail).slice(0, 300)}`}`); if (!cond) echecs.push(quoi); };
const nav = await chromium.launch({ channel: 'chrome' });

for (const largeur of [360, 390, 1280]) {
  console.log(`\nLargeur ${largeur} px`);
  const ctx = await nav.newContext({ viewport: { width: largeur, height: largeur > 800 ? 900 : 844 }, deviceScaleFactor: 2, locale: 'fr-FR' });
  await ctx.route(/supabase\.co|fillsell\.app/, (r) => r.abort());
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(URL_PAGE, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__pret === true || window.__erreurChargement, null, { timeout: 300000 });
  await page.waitForTimeout(3500);
  verifier(/FICTIVES/.test(String(await page.evaluate(() => window.__donneesFictives?.origine ?? ''))), 'données FICTIVES (aucun compte réel)');

  const texte = await page.locator('body').innerText();
  verifier((texte.match(/Gratuit : encore 2 ce mois-ci/g) || []).length === 1, '« Publier » (tuile) : « Gratuit : encore 2 ce mois-ci »');
  verifier((texte.match(/Gratuit : encore 3 ce mois-ci/g) || []).length === 1, '« Republier » (tuile) : « Gratuit : encore 3 ce mois-ci »');
  const deborde = await page.evaluate(() => { const z = document.getElementById('zone-defilement'); return document.documentElement.scrollWidth > window.innerWidth + 1 || (z && z.scrollWidth > z.clientWidth + 1); });
  verifier(!deborde, 'aucun débordement horizontal (tuiles)');
  await page.screenshot({ path: path.join(SORTIE, `${largeur}-1-tuiles.png`) });

  // « Publier » : 2 cochés, et la phrase.
  await page.locator('[aria-label^="Publier :"]').first().click();
  await page.waitForTimeout(900);
  const tPub = await page.locator('body').innerText();
  verifier(/Ton mois gratuit publie encore 2 articles : les 2 premiers sont cochés\. Rien ne part avant ta confirmation\./.test(tPub), 'sélection « Publier » : la phrase des 2 articles offerts');
  verifier(/Publier 2 articles/.test(tPub), 'le bouton dit « Publier 2 articles » (pas tout le stock)');
  await page.screenshot({ path: path.join(SORTIE, `${largeur}-2-selection-publier.png`) });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const fermer = page.getByRole('button', { name: /^(Fermer|Retour)$/ });
  if (await page.getByText('Publier plusieurs articles').count()) { if (await fermer.count()) await fermer.first().click(); }
  await page.waitForTimeout(500);

  // « Remonter » : les 3 plus anciennes.
  const tuileRep = page.locator('[aria-label^="Republier :"]');
  if (await tuileRep.count()) {
    await tuileRep.first().click();
    await page.waitForTimeout(900);
    const tRep = await page.locator('body').innerText();
    verifier(/Ton mois gratuit compte encore 3 republications \(remise à zéro le [^)]+\) : les 3 plus anciennes sont cochées\./.test(tRep), 'sélection « Remonter » : la phrase des 3 republications offertes');
    verifier(/Remonter 3 annonces/.test(tRep), 'le bouton dit « Remonter 3 annonces »');
    await page.screenshot({ path: path.join(SORTIE, `${largeur}-3-selection-remonter.png`) });
  } else {
    verifier(false, 'la tuile « Republier » est là');
  }
  const ecritures = await page.evaluate(() => (window.__ecrituresRefusees || []).length);
  verifier(ecritures === 0, 'aucune écriture tentée', String(ecritures));
  verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));
  await ctx.close();
}

await nav.close();
console.log(echecs.length ? `\n✗ ${echecs.length} échec(s)` : '\nTOUT PASSE');
process.exit(echecs.length ? 1 : 0);
