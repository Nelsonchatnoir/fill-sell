// Capture PNG de l'aperçu « rayon à choisir » (25/09). Outil de relecture,
// jamais livré — même patron que capture-lot-2309.mjs.
//
//     node scripts/apercu/capture-rayon-a-choisir.mjs
//
// Ce qu'il PROUVE, en plus de montrer (à 440 px ET à 360 px de fenêtre) :
//   · la carte d'un rayon TROUVÉ est celle d'avant : pas de bandeau, pas de
//     question, la liste fermée ;
//   · la question nomme la plateforme, l'objet, le rayon écarté, et dit que la
//     plateforme ne partira pas sans réponse — et que rien n'est débité ;
//   · la liste est OUVERTE d'office, nos candidats en tête, sans le rayon
//     refusé ;
//   · choisir un candidat répond à la question (le bandeau tombe) ;
//   · sans candidat, la recherche reste offerte ;
//   · aucun débordement horizontal, aucune erreur de page.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review');
const PORT = 5207;
const URL = `http://localhost:${PORT}/scripts/apercu/rayon-a-choisir.html`;
fs.mkdirSync(SORTIE, { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
vite.stdout.on('data', () => {});
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
// SYNCHRONE : process.exit suit juste après, un taskkill asynchrone n'aurait
// pas le temps de partir et le serveur vite resterait en vie.
const stop = () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' }); else vite.kill(); } catch { /* déjà mort */ } };
process.on('exit', stop);

async function attendreServeur(limiteMs = 60000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) { try { const r = await fetch(URL); if (r.ok) return; } catch { /* pas encore debout */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('vite n’a pas répondu dans le délai');
}

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };

try {
  await attendreServeur();
  const navigateur = await chromium.launch({ channel: 'chrome' });
  for (const largeur of [440, 360]) {
    console.log(`\n── fenêtre ${largeur} px ──`);
    const page = await navigateur.newPage({ viewport: { width: largeur, height: 1500 }, deviceScaleFactor: 2 });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | ').slice(0, 300));

    const texte = async (sel) => (await page.locator(sel).first().textContent()) ?? '';
    const trouve = await texte('[data-cas="trouve"]');
    verifier(/Peintures/.test(trouve) && /trouvé pour toi/.test(trouve), 'rayon trouvé : la carte d’avant (« trouvé pour toi »)');
    verifier(!/RAYON À CHOISIR|ne partira pas/.test(trouve), 'rayon trouvé : ni bandeau ni question');
    verifier(!(await page.locator('[data-cas="trouve"] input[type="text"]').count()), 'rayon trouvé : la liste reste fermée');

    const q = await texte('[data-cas="question"]');
    verifier(/RAYON À CHOISIR/.test(q), 'question : le bandeau « RAYON À CHOISIR »');
    verifier(/Vinted/.test(q) && /bobine de film/.test(q) && /DVD/.test(q), 'question : la plateforme, l’objet, le rayon écarté');
    verifier(/ne partira pas/.test(q) && /Rien n’est débité/.test(q), 'question : ce qui arrive sans réponse, et rien de débité');
    verifier(await page.locator('[data-cas="question"] input[type="text"]').count() === 1, 'question : la liste est ouverte d’office');
    const options = await page.locator('[data-cas="question"] button').allTextContents();
    const iSouvenirs = options.findIndex((t) => /Souvenirs TV et cinéma/.test(t));
    verifier(iSouvenirs >= 0 && iSouvenirs <= 1, 'question : nos candidats en tête de liste', options.slice(0, 4).join(' | '));
    verifier(!options.some((t) => /›\s*DVD$|^DVD/.test(t.trim())), 'question : le rayon refusé n’est pas proposé');

    const vide = await texte('[data-cas="vide"]');
    verifier(/eBay/.test(vide) && /routeur/.test(vide), 'sans candidat : la question est posée quand même');
    verifier(await page.locator('[data-cas="vide"] input[type="text"]').count() === 1, 'sans candidat : la recherche est offerte');

    const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    verifier(debordement <= 0, 'aucun débordement horizontal', `${debordement}px`);

    await page.screenshot({ path: path.join(SORTIE, `rayon-a-choisir-${largeur}.png`), fullPage: true });

    // Répondre : on choisit le premier candidat.
    await page.locator('[data-cas="question"] button', { hasText: 'Souvenirs TV et cinéma' }).first().click();
    await page.waitForTimeout(300);
    const apres = await texte('[data-cas="question"]');
    verifier(/choisi : Loisirs et collections › Souvenirs › Souvenirs TV et cinéma/.test(apres), 'répondre : le choix remonte');
    verifier(!/RAYON À CHOISIR/.test(apres) && /ton choix/.test(apres), 'répondre : le bandeau tombe, « ton choix »');
    await page.screenshot({ path: path.join(SORTIE, `rayon-a-choisir-${largeur}-repondu.png`), fullPage: true });
    await page.close();
  }

  // ── Le nouveau parcours, écran « Confirmer » : la question y est posée ────
  for (const largeur of [440, 360]) {
    console.log(`\n── « Confirmer » (nouveau parcours), ${largeur} px ──`);
    const page = await navigateur.newPage({ viewport: { width: largeur, height: 1600 }, deviceScaleFactor: 2 });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto(`http://localhost:${PORT}/scripts/apercu/stepper-nouveau.html?ecran=3&rayon=1`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | ').slice(0, 300));
    const corps = (await page.locator('body').textContent()) ?? '';
    verifier(/RAYON À CHOISIR/.test(corps) && /Souvenirs TV et cinéma/.test(corps), 'la question est posée sur « Confirmer », candidats en tête');
    verifier(/Attend une réponse : [^\n]*Rayon/.test(corps), 'la ligne Vinted dit « Attend une réponse : Rayon »');
    verifier(/Continuer sans Vinted/.test(corps), '« Continuer sans Vinted » est proposé');
    verifier(/Rayon Vinted à choisir/.test(corps) || /Réponds aux? \d* ?questions? ci-dessus/.test(corps), 'le bouton gris dit pourquoi');
    const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    verifier(debordement <= 0, 'aucun débordement horizontal', `${debordement}px`);
    await page.screenshot({ path: path.join(SORTIE, `rayon-a-choisir-confirmer-${largeur}.png`), fullPage: true });
    await page.locator('button', { hasText: 'Souvenirs TV et cinéma' }).first().click();
    await page.waitForTimeout(400);
    const apres = (await page.locator('body').textContent()) ?? '';
    verifier(!/RAYON À CHOISIR/.test(apres) && !/Continuer sans Vinted/.test(apres), 'choisir répond : la question et « Continuer sans » tombent');
    await page.screenshot({ path: path.join(SORTIE, `rayon-a-choisir-confirmer-${largeur}-repondu.png`), fullPage: true });
    await page.close();
  }
  await navigateur.close();
} finally {
  stop();
}
console.log(echecs.length ? `\n✗ ${echecs.length} échec(s)` : '\n✓ rayon à choisir : tout passe');
process.exit(echecs.length ? 1 : 0);
