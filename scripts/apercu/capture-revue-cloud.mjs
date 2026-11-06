// La capture d'écran de RELECTURE de l'abonnement « FillSell Cloud » (App Store Connect, Play Console), 06/11/2026.
// Outil de relecture, jamais livré.
//
//   node scripts/apercu/capture-revue-cloud.mjs
//
// La vraie feuille des formules ouverte sur l'offre Cloud (revue-cloud.jsx), au format iPhone (390 × 844, ×3 =
// 1170 × 2532), en français et en anglais, avec le pont natif iOS injecté (les mentions disent « compte Apple »).
// Playwright coupe tout appel *.supabase.co et fillsell.app. Sorties : build/revue-cloud/ (ignoré par git).
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'build', 'revue-cloud');
const PORT = 5297;
fs.mkdirSync(SORTIE, { recursive: true });

const serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-revue-cloud.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
serveur.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(serveur.pid), '/f', '/t'], { stdio: 'ignore' }); else serveur.kill(); } catch { /* déjà arrêté */ } };
await new Promise((ok, ko) => {
  const t = setTimeout(() => ko(new Error('vite ne démarre pas')), 60000);
  serveur.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) { clearTimeout(t); ok(); } });
});

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const navigateur = await chromium.launch();
try {
  for (const lang of ['fr', 'en']) {
    const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, userAgent: UA_IPHONE, hasTouch: true,
      locale: lang === 'en' ? 'en-US' : 'fr-FR', timezoneId: 'Europe/Paris' });
    await ctx.route(/supabase\.co|fillsell\.app/, (r) => r.abort());
    // Le pont natif iOS de Capacitor : getPlatform() = 'ios', isNativePlatform() = vrai.
    await ctx.addInitScript(() => { window.webkit = { messageHandlers: { bridge: { postMessage() {} } } }; });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/scripts/apercu/revue-cloud.html?lang=${lang}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SORTIE, `cloud-feuille-${lang}.png`) });
    // La même feuille, déroulée jusqu'aux mentions d'abonnement (prix, renouvellement, liens).
    await page.evaluate(() => document.querySelector('[data-mentions-abonnement]')?.scrollIntoView({ block: 'end' }));
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SORTIE, `cloud-feuille-${lang}-mentions.png`) });
    const texte = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(path.join(SORTIE, `cloud-feuille-${lang}.txt`), texte);
    await ctx.close();
  }
} finally {
  await navigateur.close();
  stop();
}
console.log(`captures : ${SORTIE}`);
