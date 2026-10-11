// Captures téléphone du poids du colis Leboncoin (11/10/2026) — « Confirmer »
// du stepper et question « À régler » d'une publication retenue par le
// serveur. Outil de relecture, jamais livré.
//
//     node scripts/apercu/capture-poids-leboncoin.mjs
//
// Ce qu'il PROUVE (390 × 844 et 360 × 740) :
//   · « Confirmer » : le champ est là tant que le poids manque, « 1,2 kg » pose
//     1 200 g sur la copie, une saisie illisible est dite ;
//   · « À régler » : « Valider » grisé sans poids lisible ; la réponse part en
//     GRAMMES (1 200) ; « le même poids pour les 2 autres annonces du lot »
//     relance les 2 autres du MÊME lot, jamais celle d'un autre lot ; la fiche
//     reçoit le poids, jamais par-dessus un poids connu ;
//   · aucune erreur de page, aucun débordement horizontal, champs à 16 px.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'poids-leboncoin');
const PORT = 5213;
const BASE = `http://localhost:${PORT}/scripts/apercu/poids-leboncoin.html`;
fs.mkdirSync(SORTIE, { recursive: true });

const vite = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-modale-free.config.mjs', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' }); else vite.kill(); } catch { /* déjà mort */ } };
process.on('exit', stop);
async function attendreServeur(limiteMs = 60000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) { try { const r = await fetch(BASE); if (r.ok) return; } catch { /* pas encore */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('vite n’a pas répondu');
}
const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };
const filtre = (e) => e.filter((x) => !/favicon|fonts\.g|net::ERR|Download the React DevTools|127\.0\.0\.1:9/.test(x));

try {
  await attendreServeur();
  const nav = await chromium.launch({ channel: 'chrome' });
  for (const [largeur, hauteur] of [[390, 844], [360, 740]]) {
    console.log(`\n── ${largeur} × ${hauteur} ──`);
    const ctx = await nav.newContext({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });

    // 1. « Confirmer » : le champ, tant que le poids manque.
    await page.goto(`${BASE}?scene=confirmer`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    let texte = await page.locator('body').innerText();
    verifier(/Poids du colis \(Leboncoin\)/.test(texte) && /rien ne part sur Leboncoin/.test(texte), '« Confirmer » : le champ et le pourquoi');
    verifier(/Publier grisé/.test(texte), 'sans poids : Publier grisé');
    await page.screenshot({ path: path.join(SORTIE, `01-confirmer-vide-${largeur}.png`) });
    const champ = page.locator('#poids-lbc-stepper');
    await champ.fill('abc'); await champ.blur(); await page.waitForTimeout(150);
    verifier(/Un poids en grammes ou en kilos/.test(await page.locator('body').innerText()), 'saisie illisible : dite simplement');
    await champ.fill('1,2 kg'); await champ.blur(); await page.waitForTimeout(150);
    texte = await page.locator('body').innerText();
    verifier(/poids posé sur la copie : 1200 g/.test(texte), '« 1,2 kg » : 1 200 g sur la copie');
    verifier(/Poids du colis \(Leboncoin\)/.test(texte), 'le champ reste à l’écran après la saisie');
    await page.screenshot({ path: path.join(SORTIE, `02-confirmer-rempli-${largeur}.png`) });
    verifier(await page.evaluate(() => document.documentElement.scrollWidth) <= largeur, 'pas de défilement horizontal');

    // 2. « À régler » : la question du serveur, une fois pour le lot.
    await page.goto(`${BASE}?scene=regler`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    texte = await page.locator('body').innerText();
    verifier(/Poids du colis/.test(texte) && /rien ne part sur Leboncoin/.test(texte), '« À régler » : la question et le pourquoi');
    verifier(/Le même poids pour les 2 autres annonces Leboncoin du lot qui l'attendent/.test(texte), 'une fois pour le lot : les 2 autres du MÊME lot (pas celle d’un autre lot)');
    const bouton = page.getByRole('button', { name: /Valider et relancer/ });
    verifier(await bouton.isDisabled(), 'sans poids : « Valider » grisé');
    const champNu = page.locator('input[aria-label="Poids du colis"]');
    verifier(parseFloat(await champNu.evaluate((e) => getComputedStyle(e).fontSize)) >= 16, 'champ à 16 px (pas de zoom iOS)');
    await champNu.fill('1,2 kg');
    await page.screenshot({ path: path.join(SORTIE, `03-a-regler-${largeur}.png`) });
    verifier(!(await bouton.isDisabled()), '« 1,2 kg » : « Valider » actif');
    await bouton.click();
    await page.waitForSelector('#fini', { timeout: 10000 });
    const etat = await page.evaluate(() => ({ jobs: window.__FIXTURE.tables.cross_post_jobs, inv: window.__FIXTURE.tables.inventaire }));
    const [j1, j2, j3, j9] = etat.jobs;
    verifier(j1.status === 'pending' && j1.platform_fields.lbcPoidsGrammes === 1200 && !j1.platform_fields.needsUserField, 'l’annonce répondue repart avec 1 200 g (en grammes)');
    verifier([j2, j3].every((j) => j.status === 'pending' && j.platform_fields.lbcPoidsGrammes === 1200 && !j.platform_fields.needsUserField), 'les 2 autres du lot repartent avec 1 200 g');
    verifier(j9.status === 'needs_user' && j9.platform_fields.lbcPoidsGrammes == null, 'l’annonce d’un AUTRE lot n’est pas touchée');
    const poids = Object.fromEntries(etat.inv.map((i) => [i.id, i.poids_g]));
    verifier(poids[11] === 1200 && poids[12] === 1200, 'les fiches sans poids reçoivent 1 200 g');
    verifier(poids[13] === 800, 'une fiche qui avait un poids (800 g) le garde');
    verifier(poids[19] == null, 'la fiche de l’autre lot n’est pas touchée');
    verifier(filtre(erreurs).length === 0, 'aucune erreur de page', filtre(erreurs).join(' | ').slice(0, 300));
    await ctx.close();
  }
  await nav.close();
} catch (e) {
  console.error(e);
  echecs.push(String(e?.message ?? e));
} finally {
  stop();
}
console.log(echecs.length ? `\n✗ ${echecs.length} échec(s)` : '\nTout est vert.');
process.exit(echecs.length ? 1 : 0);
