// APERÇU — lot « zéro friction » du 14/11/2026 (A3, Nico : « le dernier écran doit toujours laisser partir ce qui est
// prêt »). Le stepper RÉEL (nouvelle peau) sur la fiche du harnais stepper-marque (Supabase factice, aucun réseau) :
// la copie Vinted attend « Marque » (une marque ne se devine jamais), les autres plateformes sont prêtes.
// Outil de relecture, jamais livré.
//     node scripts/apercu/capture-zero-friction-1411.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'zero-friction-1411');
const PORT = 5211;
const BASE = `http://localhost:${PORT}/scripts/apercu/stepper-marque.html`;
fs.mkdirSync(SORTIE, { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' }); else vite.kill(); } catch { /* déjà mort */ } };
process.on('exit', stop);
let viteMort = null;
vite.on('exit', (code) => { viteMort = code ?? 'signal'; });
async function attendreServeur(limiteMs = 60000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) {
    if (viteMort !== null) throw new Error(`vite s'est arrêté au démarrage (code ${viteMort})`);
    try { const r = await fetch(BASE); if (r.ok) return; } catch { /* pas encore debout */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("vite n'a pas répondu dans le délai");
}
const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`  ${cond ? '✓' : '✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };
const filtre = (erreurs) => erreurs.filter((x) => !/favicon|fonts\.g|net::ERR|ERR_INTERNET|Download the React DevTools|Failed to load resource/.test(x));
const texte = (page) => page.locator('body').innerText();
const cta = (page) => page.locator('.fsn-foot .fsn-col > button').first();

async function ouvrir(navigateur, scenario) {
  const page = await navigateur.newPage({ viewport: { width: 390, height: 1500 }, deviceScaleFactor: 2 });
  const erreurs = [];
  await page.route((url) => url.hostname !== 'localhost', (route) => {
    const u = new URL(route.request().url());
    if (u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
    if (u.hostname.endsWith('.supabase.co')) {
      if (u.pathname.startsWith('/rest/v1/') && route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return route.fulfill({ status: 204, body: '' });
    }
    return route.abort();
  });
  page.on('pageerror', (x) => erreurs.push(String(x)));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  await page.goto(`${BASE}?scenario=${scenario}`, { waitUntil: 'load', timeout: 300_000 });
  await page.waitForSelector('.fsn', { timeout: 300_000 });
  await page.waitForTimeout(2500);
  return { page, erreurs };
}
async function versEcran(page, n) {
  for (let i = 0; i < 4; i++) {
    const ecran = Number(await page.locator('.fsn').getAttribute('data-ecran'));
    if (ecran >= n) return ecran;
    await cta(page).click();
    await page.waitForTimeout(1800);
  }
  return Number(await page.locator('.fsn').getAttribute('data-ecran'));
}

try {
  await attendreServeur();
  const navigateur = await chromium.launch({ channel: 'chrome' });
  console.log('\nscénario « sans-marque » : Vinted attend « Marque », les autres plateformes sont prêtes');
  const { page, erreurs } = await ouvrir(navigateur, 'sans-marque');
  const ecran = await versEcran(page, 3);
  verifier(ecran === 3, "l'écran « Confirmer » est atteint", `écran ${ecran}`);
  let t = await texte(page);
  await page.screenshot({ path: path.join(SORTIE, '1-vinted-retenue.png'), fullPage: true });
  const bouton = cta(page);
  const libelle = await bouton.innerText();
  verifier(!(await bouton.isDisabled()), 'le bouton Publier est ACTIF (une seule plateforme attend)', libelle);
  verifier(/Publier sur/.test(libelle), 'le bouton dit sur combien de plateformes il publie', libelle);
  const carte = page.locator('[data-retenues]');
  verifier(await carte.count() === 1 && /Vinted/.test(await carte.innerText()) && /Marque/.test(await carte.innerText()), "la carte au-dessus du bouton NOMME Vinted et ce qu'elle attend", t.slice(-700));
  verifier(/Partira sur Opla/.test(t) && /Vinted ne partira pas/.test(t), 'la carte « Partira sur … » dit la même chose que le bouton (Vinted attend)', t.slice(0, 600));
  verifier(!/Continuer sans Vinted/.test(t), "« Continuer sans Vinted » n'est plus un second geste obligé");
  const question = page.locator('.fsn-q', { hasText: 'Marque' }).first();
  verifier(await question.count() === 1, 'la question « Marque » reste posée (jamais une marque devinée)');
  const champ = question.locator('input[type="text"]').first();
  await champ.click(); await champ.fill(''); await champ.pressSequentially('Bonobo', { delay: 50 });
  await page.waitForTimeout(1500);
  t = await texte(page);
  await page.screenshot({ path: path.join(SORTIE, '2-vinted-repondue.png'), fullPage: true });
  verifier(await page.locator('[data-retenues]').count() === 0, 'la réponse donnée, plus aucune plateforme retenue', t.slice(-500));
  const libelle2 = await cta(page).innerText();
  verifier(libelle2 !== libelle, 'le bouton compte maintenant Vinted aussi', `${libelle} → ${libelle2}`);
  verifier(filtre(erreurs).length === 0, 'aucune erreur de page', filtre(erreurs).join(' | ').slice(0, 400));
  await page.close();
  await navigateur.close();
} catch (e) {
  console.error('✗ capture interrompue :', e?.message ?? e);
  process.exitCode = 2;
} finally {
  stop();
  console.log(echecs.length ? `\n✗ ${echecs.length} échec(s)` : '\n✓ tout est vert');
  process.exit(process.exitCode ?? (echecs.length ? 1 : 0));
}
