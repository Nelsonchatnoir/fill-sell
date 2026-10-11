// Preuve du 11/10 : la liste « Ventes à confirmer » (cas Louis).
//   node scripts/apercu/capture-ventes-a-confirmer.mjs
// Le VRAI composant (ventes-a-confirmer.jsx), sur téléphone (390 et 360 px) et
// ordinateur (1280 px) : les 5 ventes de Louis lues en prod le 11/10, plus une
// vente au dernier exemplaire. Assertions écrites AVANT de regarder l'image :
//   · deux choix quand il reste du stock, un seul au dernier exemplaire ;
//   · « Ne pas remettre » → remettre = false, « Remettre en vente » → true,
//     le prix saisi part tel quel ; la vente décidée quitte la liste ;
//   · aucun débordement horizontal ; aucune erreur de page ; rien quand c'est vide.
// Captures : screenshots-review/ventes-a-confirmer-1110/.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'ventes-a-confirmer-1110');
fs.mkdirSync(SORTIE, { recursive: true });
const PORT = 5231;
const s = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-stock-refonte.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(s.pid), '/f', '/t'], { stdio: 'ignore' }); else s.kill(); } catch { /* arrêté */ } });
const base = `http://127.0.0.1:${PORT}/scripts/apercu/ventes-a-confirmer.html`;
for (let i = 0; i < 300; i += 1) { try { if ((await fetch(base)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };
const nav = await chromium.launch({ channel: 'chrome' });

for (const largeur of [390, 360, 1280]) {
  console.log(`\nLargeur ${largeur} px`);
  const ctx = await nav.newContext({ viewport: { width: largeur, height: 900 }, deviceScaleFactor: 2, locale: 'fr-FR' });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(`${base}?cas=louis`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__pret === true, null, { timeout: 300000 });
  await page.getByText('Ventes à confirmer (6)').waitFor({ timeout: 30000 });
  await page.screenshot({ path: path.join(SORTIE, `louis-${largeur}.png`), fullPage: true });
  const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  verifier(!deborde, 'aucun débordement horizontal');
  verifier(await page.getByRole('button', { name: 'Remettre en vente sur Vinted' }).count() === 5, '5 ventes Vinted à quantité : « Remettre en vente sur Vinted »');
  verifier(await page.getByRole('button', { name: 'Ne pas remettre' }).count() === 5, '… et « Ne pas remettre »');
  verifier(await page.getByRole('button', { name: 'Enregistrer la vente' }).count() === 1, 'dernier exemplaire : un seul bouton « Enregistrer la vente »');
  const texte = await page.locator('#ventes-a-confirmer').innerText();
  verifier(/il t’en restera 9\s996/u.test(texte), 'le reste du stock est dit (9 997 → 9 996, espace fine)', texte.slice(0, 300));
  verifier(!/🎉/.test(texte.split('\n')[0]), 'titre sans émoji');

  if (largeur === 390) {
    // « Ne pas remettre » sur la 1re vente, prix modifié.
    const carte1 = page.locator('#ventes-a-confirmer > div').nth(1);
    await carte1.locator('input').fill('10,50');
    await carte1.getByRole('button', { name: 'Ne pas remettre' }).click();
    await page.waitForTimeout(400);
    // « Remettre en vente » sur la suivante.
    await page.locator('#ventes-a-confirmer > div').nth(1).getByRole('button', { name: 'Remettre en vente sur Vinted' }).click();
    await page.waitForTimeout(400);
    const d = await page.evaluate(() => window.__decisions);
    verifier(d.length === 2 && d[0].annonce === '10289137208' && d[0].remettre === false && d[0].prix === 10.5,
      '« Ne pas remettre » → remettre = false, prix saisi 10,50', JSON.stringify(d));
    verifier(d[1]?.annonce === '10289147239' && d[1].remettre === true && d[1].prix === 7, '« Remettre en vente » → remettre = true, prix proposé 7', JSON.stringify(d));
    verifier(await page.getByText('Ventes à confirmer (4)').isVisible(), 'les ventes décidées quittent la liste (6 → 4)');
    await page.screenshot({ path: path.join(SORTIE, 'louis-390-apres-2-decisions.png'), fullPage: true });
  }
  verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));
  await ctx.close();
}

console.log('\nListe vide');
{
  const ctx = await nav.newContext({ viewport: { width: 390, height: 600 } });
  const page = await ctx.newPage();
  await page.goto(`${base}?cas=vide`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__pret === true, null, { timeout: 300000 });
  await page.waitForTimeout(500);
  verifier(await page.locator('#ventes-a-confirmer').count() === 0, 'rien à confirmer ⇒ rien d\'affiché');
  await ctx.close();
}

await nav.close();
console.log(`\n${echecs.length ? `✗ ${echecs.length} échec(s)` : '✓ tout est vert'} — captures : ${path.relative(RACINE, SORTIE)}`);
process.exit(echecs.length ? 1 : 0);
