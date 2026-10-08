// Capture PNG + contrôles de la fenêtre « Vendre » (point 8, 02/10 soir).
// Outil de relecture, jamais livré — même patron que capture-question-jocabroc.mjs.
//
//     node scripts/apercu/capture-vente-modale.mjs
//
// Ce qu'il PROUVE (à 440 px ET à 360 px) : les plateformes RÉELLES de
// l'article sont proposées en premier (pastille « en ligne »), « Ailleurs / en
// main propre » toujours là, les autres derrière « Autre plateforme… » ; le
// prix est pré-rempli ; le verdict est vrai (annonce vendue gardée, autres
// retirées tout de suite ; plusieurs exemplaires → rien de retiré) ; aucune
// présélection quand rien n'est choisi ; rien ne déborde ; aucune erreur.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'vente-modale-0210');
const PORT = 5211;
const URL = `http://localhost:${PORT}/scripts/apercu/vente-modale.html`;
fs.mkdirSync(SORTIE, { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' }); else vite.kill(); } catch { /* déjà mort */ } };
process.on('exit', stop);

async function attendreServeur(limiteMs = 90000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) { try { const r = await fetch(URL); if (r.ok) return; } catch { /* pas encore debout */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error("vite n'a pas répondu dans le délai");
}

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };

try {
  await attendreServeur();
  const navigateur = await chromium.launch({ channel: 'chrome' });
  for (const largeur of [440, 360]) {
    console.log(`\n── fenêtre ${largeur} px ──`);
    const page = await navigateur.newPage({ viewport: { width: largeur, height: 1400 }, deviceScaleFactor: 2 });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.waitForSelector('[data-cas="vide"] [data-verdict-vente]', { timeout: 240000 });
    await page.waitForTimeout(1200);
    verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | ').slice(0, 300));
    const puces = async (cas) => page.$$eval(`[data-cas="${cas}"] [data-plateforme-vente]`, (els) => els.map((e) => e.getAttribute('data-plateforme-vente')));
    const verdict = async (cas) => (await page.textContent(`[data-cas="${cas}"] [data-verdict-vente]`)) ?? '';

    // 1. Un exemplaire, en ligne sur Vinted et Beebs, vendu sur Vinted.
    verifier((await puces('un-exemplaire')).join(',') === 'vinted,beebs,ailleurs', 'plateformes réelles d\'abord, puis Ailleurs', (await puces('un-exemplaire')).join(','));
    verifier((await page.inputValue('[data-cas="un-exemplaire"] [data-champ="prix"]')) === '12', 'prix pré-rempli (12)');
    const v1 = await verdict('un-exemplaire');
    verifier(/Ton annonce Vinted est marquée vendue — elle n'est jamais retirée/.test(v1) && /L'annonce sur Beebs sera retirée automatiquement, tout de suite/.test(v1), 'verdict : Vinted gardée, Beebs retirée', v1);
    verifier(!/10 minutes/.test(v1), 'plus de « 10 minutes »');
    // On change d'avis : Ailleurs → les deux partent.
    await page.click('[data-cas="un-exemplaire"] [data-plateforme-vente="ailleurs"]');
    const v1b = await verdict('un-exemplaire');
    verifier(/Les annonces sur Vinted et Beebs seront retirées automatiquement/.test(v1b), 'Ailleurs : toutes les annonces partent', v1b);

    // 2. Trois exemplaires, un vendu : rien de retiré.
    const v2 = await verdict('plusieurs');
    verifier(/Il restera 2 exemplaires en stock : aucune annonce n'est retirée/.test(v2), 'plusieurs exemplaires : un décompté, rien de retiré', v2);

    // 3. Aucune annonce en ligne : toutes les plateformes visibles, prix vide, rien de choisi.
    verifier((await puces('aucune')).join(',') === 'ailleurs,vinted,leboncoin,beebs,ebay,opla', 'aucune annonce : Ailleurs + toutes les plateformes', (await puces('aucune')).join(','));
    verifier((await page.inputValue('[data-cas="aucune"] [data-champ="prix"]')) === '', 'aucun prix connu : champ vide');
    verifier(/Choisis où l'article a été vendu/.test(await verdict('aucune')), 'aucune présélection : on demande');

    // 4. Rien de choisi, « Autre plateforme… » replié.
    verifier((await puces('vide')).join(',') === 'vinted,ebay,ailleurs', 'autres plateformes repliées', (await puces('vide')).join(','));
    await page.click('[data-cas="vide"] >> text=Autre plateforme…');
    verifier((await puces('vide')).join(',') === 'vinted,ebay,ailleurs,leboncoin,beebs,opla', '« Autre plateforme… » les déplie', (await puces('vide')).join(','));

    // (09/10) DEPOP : invisible pour tout compte non autorisé, proposée au seul compte bêta.
    for (const cas of ['un-exemplaire', 'plusieurs', 'aucune', 'vide']) {
      const texte = (await page.textContent(`[data-cas="${cas}"]`)) ?? '';
      verifier(!/depop/i.test(texte) && !(await puces(cas)).includes('depop'), `compte non bêta (« ${cas} ») : Depop nulle part`);
    }
    verifier((await puces('beta-depop')).join(',') === 'ailleurs,vinted,leboncoin,beebs,ebay,opla,depop', 'compte bêta : Depop proposée, en dernier', (await puces('beta-depop')).join(','));

    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    verifier(!deborde, 'aucun débordement horizontal');
    await page.screenshot({ path: path.join(SORTIE, `vente-modale-${largeur}.png`), fullPage: true });
    await page.close();
  }
  await navigateur.close();
} finally {
  stop();
}
console.log(echecs.length ? `\n✗ ${echecs.length} contrôle(s) en échec` : '\n✓ tout est vert — captures dans screenshots-review/vente-modale-0210/');
process.exit(echecs.length ? 1 : 0);
