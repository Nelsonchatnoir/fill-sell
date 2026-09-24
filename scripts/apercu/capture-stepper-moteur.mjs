// Le stepper RÉEL, deux peaux, sur un Supabase factice — outil de relecture,
// jamais livré. Même patron que capture-stepper-nouveau.mjs.
//
//     node scripts/apercu/capture-stepper-moteur.mjs
//
// Ce qu'il PROUVE :
//   · l'ancienne peau (variante par défaut) se monte, passe l'initialisation,
//     arrive à l'étape Photos et rend sa rangée de plateformes — sans erreur de
//     page, avec le bloc « moteur » construit à chaque rendu ;
//   · la nouvelle peau se monte sur le MÊME moteur, affiche U1, et « Rédiger
//     l'annonce » mène à l'étape de rédaction (la génération factice échoue :
//     l'écran d'erreur et « Réessayer la rédaction » apparaissent) ;
//   · aucune boucle d'effets : le nombre d'appels Supabase reste borné.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'stepper-nouveau');
const PORT = 5204;
const BASE = `http://localhost:${PORT}/scripts/apercu/stepper-moteur.html`;
fs.mkdirSync(SORTIE, { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' }); else vite.kill(); } catch { /* déjà mort */ } };
process.on('exit', stop);
async function attendreServeur(limiteMs = 60000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) { try { const r = await fetch(BASE); if (r.ok) return; } catch { /* pas encore debout */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('vite n’a pas répondu dans le délai');
}
const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`  ${cond ? '✓' : '✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };
const filtre = (erreurs) => erreurs.filter((x) => !/favicon|fonts\.g|net::ERR|ERR_INTERNET|Download the React DevTools/.test(x));

try {
  await attendreServeur();
  const navigateur = await chromium.launch({ channel: 'chrome' });
  for (const variante of ['classique', 'nouvelle']) {
    const page = await navigateur.newPage({ viewport: { width: 380, height: 1400 }, deviceScaleFactor: 2 });
    const erreurs = [];
    page.on('pageerror', (x) => erreurs.push(String(x)));
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
    await page.goto(`${BASE}?variante=${variante}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SORTIE, `moteur-${variante}-etape-photos.png`) });
    console.log(`écrit : screenshots-review/stepper-nouveau/moteur-${variante}-etape-photos.png`);
    verifier(filtre(erreurs).length === 0, `${variante} : aucune erreur de page au montage`, filtre(erreurs).join(' | ').slice(0, 400));
    const texte = await page.locator('body').innerText();
    if (variante === 'classique') {
      verifier(/Vinted/.test(texte) && /Leboncoin/.test(texte) && /Beebs/.test(texte), 'classique : la rangée de plateformes est rendue');
      verifier(/Générer les annonces|Generate/.test(texte), 'classique : le bouton « Générer les annonces » est là (étape Photos atteinte)');
      verifier(!page.locator('.fsn').first() || (await page.locator('.fsn').count()) === 0, 'classique : aucune trace de la nouvelle coque (.fsn)');
    } else {
      verifier((await page.locator('.fsn').count()) === 1, 'nouvelle : la coque .fsn est rendue');
      verifier(/Où publier/.test(texte), 'nouvelle : U1 « Où publier ? »');
      verifier(/Rédiger l’annonce|Rédiger l'annonce/.test(texte), 'nouvelle : le bouton compte les plateformes cochées');
      // Vers la rédaction : la génération factice échoue → écran d'erreur.
      await page.getByRole('button', { name: /Rédiger l/ }).click();
      await page.waitForTimeout(1500);
      const t2 = await page.locator('body').innerText();
      await page.screenshot({ path: path.join(SORTIE, `moteur-${variante}-etape-redaction.png`) });
      console.log(`écrit : screenshots-review/stepper-nouveau/moteur-${variante}-etape-redaction.png`);
      verifier(/Ce qui va partir/.test(t2), 'nouvelle : U2 atteint (« Ce qui va partir »)');
      verifier(/harnais : generate-listing/.test(t2), 'nouvelle : l’erreur de génération est dite en clair (pas « Une erreur est survenue »)');
      verifier(/Réessayer la rédaction/.test(t2), 'nouvelle : le bouton du pied propose de réessayer');
      verifier(filtre(erreurs).length === 0, 'nouvelle : aucune erreur de page après la navigation', filtre(erreurs).join(' | ').slice(0, 400));
      // Retour : U1 à nouveau.
      await page.getByRole('button', { name: /Étape précédente/ }).click();
      await page.waitForTimeout(600);
      verifier(/Où publier/.test(await page.locator('body').innerText()), 'nouvelle : le retour ramène à U1');
    }
    const appels = await page.evaluate(() => window.__appelsFactices.length);
    verifier(appels < 400, `${variante} : appels Supabase bornés (${appels})`);
    await page.close();
  }
  await navigateur.close();
  if (echecs.length) { console.error(`\n❌ ${echecs.length} vérification(s) en échec`); process.exitCode = 1; }
  else console.log('\n✅ le stepper réel se monte dans ses deux peaux : tout passe');
} finally {
  stop();
  process.exit(process.exitCode ?? 0);
}
