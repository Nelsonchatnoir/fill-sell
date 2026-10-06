// Captures à 390 px + contrôles de la modale « Republication automatique »
// d'un compte Free (06/10 soir, constat de Nico). Outil de relecture.
//   node scripts/apercu/capture-modale-free.mjs
// Assertions écrites AVANT les captures :
//   · plus jamais « une par une » ; « en lot » ET « une à une » dits ;
//   · stock vide (0) : aucun bouton « Republier mes annonces » ; stock 5 : le
//     bouton ; stock inconnu (hôte sans itemCount) : le bouton (comme avant) ;
//   · « Remise à zéro le 16 octobre » (date du serveur, inchangée) ;
//   · « Dans tous les forfaits » : l'import, toutes plateformes, plus « Vinted » ;
//   · la modale s'ouvre, l'achat Pro part : onUpgrade('pro') ;
//   · rien ne déborde à l'horizontale.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'modale-free');
const PORT = 5241;
fs.mkdirSync(SORTIE, { recursive: true });
const serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-modale-free.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
const stop = () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(serveur.pid), '/f', '/t'], { stdio: 'ignore' }); else serveur.kill(); } catch { /* déjà arrêté */ } };
process.on('exit', stop);
const base = `http://127.0.0.1:${PORT}/scripts/apercu/modale-free.html`;
{
  const fin = Date.now() + 120000;
  while (Date.now() < fin) { try { if ((await fetch(base)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }
}

let ko = 0, ok = 0;
const verifier = (c, quoi, d = '') => {
  if (c) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}${d ? `   ← ${String(d).slice(0, 300)}` : ''}`); }
};
const navigateur = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.route(/supabase\.co|fillsell\.app/, (r) => r.abort());
await ctx.clock.setFixedTime(new Date('2026-10-06T18:30:00Z'));
for (const [nom, q] of [['stock-vide', '?stock=0'], ['stock-5', '?stock=5'], ['stock-inconnu', '']]) {
  const page = await ctx.newPage();
  await page.goto(base + q, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByText('Tu as encore 50 republications').waitFor({ timeout: 120000 });
  const texte = await page.evaluate(() => document.body.innerText);
  console.log(`\n${nom}`);
  verifier(!/une par une/i.test(texte), 'plus jamais « une par une »');
  verifier(/en lot avec « Remonter mes annonces »/.test(texte) && /une à une avec « Republier »/.test(texte), '« en lot » et « une à une » dits');
  verifier(/Remise à zéro le 16 octobre/.test(texte), '« Remise à zéro le 16 octobre » (date du serveur)');
  verifier(/Import de tes annonces depuis toutes tes plateformes/.test(texte) && !/Import de ton dressing Vinted/.test(texte), '« Dans tous les forfaits » : import toutes plateformes');
  const bouton = await page.getByRole('button', { name: 'Republier mes annonces' }).count();
  verifier(nom === 'stock-vide' ? bouton === 0 : bouton === 1, nom === 'stock-vide' ? 'stock vide : aucun bouton' : 'le bouton « Republier mes annonces »', `boutons=${bouton}`);
  const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  verifier(!deborde, 'rien ne déborde à 390 px');
  await page.screenshot({ path: path.join(SORTIE, `${nom}.png`), fullPage: true });
  if (nom === 'stock-5') {
    const boutons = await page.locator('button').evaluateAll((els) => els.map((e) => e.innerText.trim()));
    const iPro = boutons.findIndex((t) => /Pro/.test(t) && !/Premium|Business/.test(t));
    verifier(iPro >= 0, 'un bouton d’achat Pro est rendu', boutons.join(' | '));
    if (iPro >= 0) {
      const pro = page.locator('button').nth(iPro);
      await pro.scrollIntoViewIfNeeded();
      await pro.click();
      const appels = await page.evaluate(() => window.__appels);
      verifier(appels.some((a) => a[0] === 'upgrade' && a[1] === 'pro'), "l'achat Pro part (onUpgrade('pro'))", JSON.stringify(appels));
    }
  }
  await page.close();
}
await navigateur.close();
stop();
console.log(ko ? `\n✗ ${ko} échec(s) sur ${ok + ko}` : `\n✓ ${ok} contrôles verts — captures : ${SORTIE}`);
process.exit(ko ? 1 : 0);
