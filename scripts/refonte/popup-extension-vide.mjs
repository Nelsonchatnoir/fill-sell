// ═══════════════════════════════════════════════════════════════════════════
// REFONTE (16/10) — LE POPUP DE L'EXTENSION QUAND IL N'Y A RIEN
// ═══════════════════════════════════════════════════════════════════════════
// Chromium de Playwright (profil JETABLE, jamais le Chrome de Nico) avec
// build/extension chargée en non empaqueté. Deux écrans : sans session
// FillSell, puis avec le compte de TEST connecté (aucun job, aucune plateforme).
// Le popup est ouvert comme une page (chrome-extension://<id>/popup.html).
//
//   npm run build:extension && node scripts/refonte/popup-extension-vide.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const EXT = path.join(RACINE, 'build', 'extension');
const OUT = path.join(RACINE, 'docs', 'refonte', 'captures', 'extension');
fs.mkdirSync(OUT, { recursive: true });
const COMPTE = JSON.parse(fs.readFileSync(process.argv[2] || 'C:/Users/nicol/AppData/Local/Temp/claude/C--Users-nicol-fill-and-sell/233a5a5d-4406-4bc5-ab18-f427b85873dc/scratchpad/compte-test.json', 'utf8'));
const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'fillsell-popup-'));
const journal = [];

const ctx = await chromium.launchPersistentContext(profil, {
  channel: 'chromium', headless: true, locale: 'fr-FR', viewport: { width: 420, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 20000 });
const id = new URL(sw.url()).host;
console.log('extension', id);

const capture = async (page, nom, note) => {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, `${nom}.png`), fullPage: true });
  const texte = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  journal.push({ nom, note, texte: texte.slice(0, 1500) });
  console.log(`${nom}.png — ${texte.slice(0, 160)}`);
};

// 1. Sans session FillSell.
const popup = await ctx.newPage();
await popup.goto(`chrome-extension://${id}/popup.html`, { waitUntil: 'load' });
await capture(popup, '01-popup-sans-session', 'Popup à l’installation, avant toute connexion');

// 2. Session relayée : connexion sur fillsell.app DANS CE PROFIL JETABLE
// (le content script fillsell-auth.js lit la session et la passe au background).
const app = await ctx.newPage();
await app.goto('https://fillsell.app/login', { waitUntil: 'networkidle' });
await app.getByText('Refuser', { exact: true }).first().click().catch(() => {});
await app.locator('input[type=email]').first().fill(COMPTE.email);
await app.locator('input[type=password]').first().fill(COMPTE.password);
await app.getByRole('button', { name: 'Se connecter', exact: true }).last().click();
await app.waitForURL(/\/app/, { timeout: 30000 }).catch(() => {});
await app.waitForTimeout(6000);
await popup.reload({ waitUntil: 'load' });
await popup.waitForTimeout(4000);
await capture(popup, '02-popup-connecte-aucun-job', 'Compte de test connecté : aucune annonce, aucune plateforme');
await popup.waitForTimeout(8000);
await popup.reload({ waitUntil: 'load' });
await capture(popup, '03-popup-connecte-apres-premier-passage', 'Après le premier passage du poll (plateformes jamais vérifiées)');

fs.writeFileSync(path.join(OUT, 'journal.json'), JSON.stringify({ extension: id, le: new Date().toISOString(), ecrans: journal }, null, 2));
await ctx.close();
fs.rmSync(profil, { recursive: true, force: true });
console.log(`→ ${OUT}`);
