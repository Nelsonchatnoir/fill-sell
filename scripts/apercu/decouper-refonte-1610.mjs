// Découpe les écrans du banc refonte-1610 en vues de téléphone (390 × 844),
// pour les relire une à une. Outil de relecture, jamais livré.
//   APERCU_PORT=5216 node scripts/apercu/decouper-refonte-1610.mjs [ecran …]
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'refonte-1610', 'vues');
fs.mkdirSync(SORTIE, { recursive: true });
const PORT = Number(process.env.APERCU_PORT || 5216);
const ecrans = process.argv.slice(2).length ? process.argv.slice(2) : ['tableau', 'ventes', 'stats'];
const nav = await chromium.launch({ headless: true });
for (const ecran of ecrans) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.route(/supabase\.co|fillsell\.app/, (r) => (/\/storage\/v1\/object\/public\//.test(r.request().url()) ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/scripts/apercu/refonte-1610.html?ecran=${ecran}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3200);
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let k = 0; k * 760 < h; k++) {
    await page.screenshot({ path: path.join(SORTIE, `${ecran}-${String(k + 1).padStart(2, '0')}.png`), fullPage: true, clip: { x: 0, y: k * 760, width: 390, height: Math.min(844, h - k * 760) } });
  }
  console.log(ecran, h, Math.ceil(h / 760), 'vues');
  await ctx.close();
}
await nav.close();
