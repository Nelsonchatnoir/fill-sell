// Reproduction (20/11/2026 nuit, ordre de Nico — compte Business + Cloud Google f5fab0e0) : « Par créneaux » montre
// BUSINESS, « Aucune plateforme active », 0/4, « Non réglée » partout, et la personne « ne peut pas l'activer ».
//   node scripts/apercu/capture-creneaux-business-cloud.mjs
// Le chemin réel de ReglagesPage, aux formats Android (412 px) et iPhone (390 px) : la liste, un clic sur Vinted, son
// interrupteur. Faux client Supabase (vite-stock-refonte.config.mjs) et réseau coupé : rien ne part vers la base.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'creneaux-business-cloud');
const PORT = 5217;
fs.mkdirSync(SORTIE, { recursive: true });
const serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-stock-refonte.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { cwd: RACINE, shell: true, stdio: ['ignore', 'ignore', 'pipe'] });
serveur.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(serveur.pid), '/f', '/t'], { stdio: 'ignore' }); else serveur.kill(); } catch { /* déjà arrêté */ } };
process.on('exit', stop);
const base = `http://127.0.0.1:${PORT}/scripts/apercu/creneaux-business-cloud.html`;
{
  const fin = Date.now() + 120000;
  while (Date.now() < fin) { try { if ((await fetch(base)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }
}
let ko = 0, ok = 0;
const verifier = (c, quoi, detail = '') => { if (c) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${String(detail).slice(0, 300)}` : ''}`); } };
const navigateur = await chromium.launch({ channel: 'chrome' });
try {
  for (const [nom, viewport] of [['android-412', { width: 412, height: 915 }], ['iphone-390', { width: 390, height: 844 }]]) {
    const ctx = await navigateur.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await ctx.route(/supabase\.co|fillsell\.app/, (r) => r.abort());
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto(base, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__pret === true, null, { timeout: 120000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SORTIE, `${nom}-1-liste.png`), fullPage: true });
    const liste = await page.evaluate(() => document.body.innerText);
    verifier(/Business/i.test(liste) && /Aucune plateforme active/.test(liste) && /0\/4/.test(liste), `${nom} : la liste telle que la décrit le client (Business, aucune active, 0/4)`, liste.slice(0, 200));
    const switchesListe = await page.locator('[role="switch"]').count();
    console.log(`    ${nom} : interrupteurs visibles sur la liste : ${switchesListe}`);
    await page.locator('button.rp-tap', { hasText: 'Vinted' }).first().tap();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SORTIE, `${nom}-2-vinted.png`), fullPage: true });
    const sw = page.locator('[role="switch"][aria-label*="Vinted"]');
    const n = await sw.count();
    verifier(n === 1, `${nom} : l'écran Vinted montre son interrupteur`, `trouvés : ${n}`);
    if (n === 1) {
      const boite = await sw.boundingBox();
      verifier(await sw.isEnabled(), `${nom} : interrupteur actif (non grisé)`);
      verifier(boite && boite.y >= 0 && boite.x + boite.width <= viewport.width, `${nom} : interrupteur dans l'écran`, JSON.stringify(boite));
      await sw.tap();
      await page.waitForTimeout(600);
      const appels = await page.evaluate(() => window.__appels);
      verifier(appels.some((a) => a.pf === 'vinted' && a.patch?.actif === true), `${nom} : le geste part (regler actif:true)`, JSON.stringify(appels));
      await page.screenshot({ path: path.join(SORTIE, `${nom}-3-vinted-active.png`), fullPage: true });
    }
    verifier(erreurs.length === 0, `${nom} : aucune erreur de page`, erreurs.join(' | '));
    await ctx.close();
  }
} finally {
  await navigateur.close();
  stop();
}
console.log(ko ? `✗ ${ko} écart(s), ${ok} vérification(s) vertes — captures : ${SORTIE}` : `✓ ${ok} vérifications vertes — captures : ${SORTIE}`);
process.exit(ko ? 1 : 0);
