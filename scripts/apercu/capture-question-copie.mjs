// Capture PNG + contrôles de la question « Déjà vendu ? » sur une copie non
// prouvée (06/10). Outil de relecture, jamais livré — même patron que
// capture-question-jocabroc.mjs.
//
//     node scripts/apercu/capture-question-copie.mjs [compte]   (défaut : ornella)
//
// Ce qu'il PROUVE (à 440 px ET à 360 px), sur les questions réelles du compte :
// le texte demandé (titre, plateforme de la vente, plateforme de la copie,
// tutoiement), l'annonce qui sera retirée, les deux boutons « Oui, la retirer »
// / « Non, c'est un autre exemplaire », une seule fiche (la vendue), une
// question par copie ; rien ne déborde ; aucune erreur de page.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review');
const COMPTE = process.argv[2] || 'ornella';
const PORT = 5211;
const URL = `http://localhost:${PORT}/scripts/apercu/question-copie.html?compte=${COMPTE}`;
const donnees = JSON.parse(fs.readFileSync(path.join(RACINE, 'build', 'apercu', `${COMPTE}-copie.json`), 'utf8'));
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
const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', ebay: 'eBay', beebs: 'Beebs', opla: 'Opla' };

try {
  await attendreServeur();
  const navigateur = await chromium.launch({ channel: 'chrome' });
  for (const largeur of [440, 360]) {
    console.log(`\n── fenêtre ${largeur} px ──`);
    const page = await navigateur.newPage({ viewport: { width: largeur, height: 900 }, deviceScaleFactor: 2 });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.waitForSelector('text=Déjà vendu ?', { timeout: 240000 });
    await page.waitForTimeout(1500);
    verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | ').slice(0, 300));
    const texte = await page.evaluate(() => document.body.innerText);
    const q = donnees.questions[0];
    const fiche = donnees.items.find((i) => String(i.id) === String(q.garde));
    verifier(texte.includes(`1 sur ${donnees.questions.length}`), `une question par copie (${donnees.questions.length})`, texte.slice(0, 200));
    const vendu = NOMS[q.preuves.vendu_sur];
    const attendu = `« ${fiche.title} » ${vendu ? `s'est vendu sur ${vendu}` : 'est vendu'}. Ton annonce ${NOMS[q.preuves.platform]} du même nom, c'est le même article ?`;
    verifier(texte.includes(attendu), 'le texte demandé', attendu);
    verifier(texte.includes(`Si tu réponds oui, cette annonce sera retirée : ${NOMS[q.preuves.platform]}`), "l'annonce qui sera retirée est montrée");
    verifier(texte.includes('Oui, la retirer') && texte.includes("Non, c'est un autre exemplaire"), 'les deux boutons');
    verifier(!texte.includes('La fusion se défait'), "pas de mention de fusion (il n'y en a pas)");
    const cartes = await page.$$eval('div[style*="aspect-ratio"]', (els) => els.length);
    verifier(cartes === 1, 'une seule fiche montrée (la vendue)', String(cartes));
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    verifier(!deborde, 'aucun débordement horizontal');
    await page.screenshot({ path: path.join(SORTIE, `question-copie-${COMPTE}-${largeur}.png`), fullPage: false });
    await page.close();
  }
  await navigateur.close();
} finally {
  stop();
}
console.log(echecs.length ? `\n✗ ${echecs.length} contrôle(s) en échec` : `\n✓ tout est vert — captures dans screenshots-review/question-copie-${COMPTE}-*.png`);
process.exit(echecs.length ? 1 : 0);
