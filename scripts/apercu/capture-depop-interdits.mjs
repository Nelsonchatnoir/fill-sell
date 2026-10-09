// Captures téléphone des catégories interdites par Depop (09/10/2026 soir).
// Outil de relecture, jamais livré.   node scripts/apercu/capture-depop-interdits.mjs
// PROUVE : la case Depop est GRISÉE (désactivée) pour une console, avec la
// phrase de la règle, les autres plateformes restent cochables ; l'écran
// « Avant l'envoi » d'un lot mélangé dit combien d'articles sont exclus de
// Depop et pourquoi ; aucun débordement ; téléphone en clair ET en sombre
// (l'app n'a pas de thème sombre : elle reste claire, sans tache noire).
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'depop-interdits');
const PORT = 5208;
const BASE = `http://localhost:${PORT}/scripts/apercu/depop-interdits.html`;
fs.mkdirSync(SORTIE, { recursive: true });
const vite = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-modale-free.config.mjs', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' }); else vite.kill(); } catch { /* */ } };
process.on('exit', stop);
async function attendre(limiteMs = 60000) { const fin = Date.now() + limiteMs; while (Date.now() < fin) { try { const r = await fetch(BASE); if (r.ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error('vite muet'); }
const echecs = [];
const verifier = (c, quoi, d = '') => { console.log(`${c ? '  ✓' : '  ✗'} ${quoi}${c || !d ? '' : `   ← ${d}`}`); if (!c) echecs.push(quoi); };
try {
  await attendre();
  const nav = await chromium.launch({ channel: 'chrome' });
  for (const theme of ['clair', 'sombre']) {
    console.log(`\n── 390 × 844, téléphone en ${theme} ──`);
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: theme === 'sombre' ? 'dark' : 'light' });
    const page = await ctx.newPage();
    const erreurs = []; page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto(`${BASE}?scene=simple`, { waitUntil: 'load', timeout: 120000 }); await page.waitForSelector('.fsn', { timeout: 120000 }); await page.waitForTimeout(900);
    verifier(erreurs.length === 0, 'publication simple : aucune erreur de page', erreurs.join(' | ').slice(0, 300));
    const depop = page.locator('button.fsn-pf', { hasText: 'Depop' });
    verifier(await depop.isDisabled(), 'la case Depop est désactivée (non sélectionnable)');
    verifier(/n'accepte pas les objets électriques ou électroniques/.test(await depop.innerText()), 'sa phrase : « Depop n\'accepte pas les objets électriques ou électroniques »');
    verifier(!(await page.locator('button.fsn-pf', { hasText: 'Vinted' }).isDisabled()), 'Vinted reste cochable');
    verifier(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'aucun débordement horizontal');
    await depop.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SORTIE, `1-publication-simple-depop-grisee-${theme}.png`), fullPage: true });
    await page.goto(`${BASE}?scene=lot`, { waitUntil: 'load', timeout: 120000 }); await page.waitForSelector('.fsn', { timeout: 120000 }); await page.waitForTimeout(900);
    verifier(erreurs.length === 0, 'lot : aucune erreur de page', erreurs.join(' | ').slice(0, 300));
    const carte = page.locator('.fsn-card', { hasText: 'ne partiront pas sur Depop' });
    verifier(await carte.count() === 1, 'lot : « 2 articles ne partiront pas sur Depop »');
    const texte = await carte.innerText();
    verifier(/objets électriques ou électroniques/.test(texte) && /consoles/.test(texte) && /sèche-cheveux/.test(texte), 'lot : la raison et ce qui est refusé (consoles, sèche-cheveux)', texte.slice(0, 200));
    verifier(/Le reste du lot n'est pas touché/.test(texte), 'lot : le reste du lot part normalement');
    verifier(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'lot : aucun débordement horizontal');
    await page.screenshot({ path: path.join(SORTIE, `2-lot-avant-envoi-melange-${theme}.png`), fullPage: true });
    await ctx.close();
  }
  await nav.close();
} catch (e) { console.error(e); echecs.push(String(e)); }
finally { stop(); console.log(`\n${echecs.length ? '✗' : '✓'} captures interdits Depop : ${echecs.length} échec(s) — ${SORTIE}`); process.exit(echecs.length ? 1 : 0); }
