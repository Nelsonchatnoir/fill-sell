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
//
// (03/10, point 29 — banc périmé depuis le 24/09) Trois défauts du banc :
//   · il AVALAIT ses erreurs (vite refusé, page injoignable) et sortait en 0 ;
//   · des modules du stepper lisent le VRAI client (plateformes_verite,
//     postes et sessions de l'extension, accès Opla) : le banc écrivait donc
//     en prod, sous un utilisateur factice. Toute requête Supabase est
//     désormais servie ICI (lecture = « rien », fonction = erreur nommée),
//     rien ne sort de la machine, et ces appels comptent dans la borne ;
//   · l'écran d'erreur de la rédaction a changé le 01/10 (782cbd6, parcours
//     « Publier » refait) : il dit la cause en clair, sans texte technique.
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
// vite qui meurt au démarrage (port pris, garde de build) : on le dit tout de
// suite, au lieu d'attendre une minute puis de passer pour vert.
let viteMort = null;
vite.on('exit', (code) => { viteMort = code ?? 'signal'; });
async function attendreServeur(limiteMs = 60000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) {
    if (viteMort !== null) throw new Error(`vite s’est arrêté au démarrage (code ${viteMort}) — cf. [vite] ci-dessus`);
    try { const r = await fetch(BASE); if (r.ok) return; } catch { /* pas encore debout */ }
    await new Promise((r) => setTimeout(r, 500));
  }
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
    // Réseau HERMÉTIQUE : Supabase est servi ici, tout autre domaine est coupé
    // (les polices exceptées, déjà tolérées par `filtre`).
    const appelsReseau = [];
    const sorties = [];
    // Seules les requêtes HORS de la page locale passent par ici (les modules de
    // vite restent intacts : les intercepter tous ralentissait le premier rendu).
    await page.route((url) => url.hostname !== 'localhost', (route) => {
      const req = route.request();
      const u = new URL(req.url());
      if (u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
      if (u.hostname.endsWith('.supabase.co')) {
        appelsReseau.push(`${req.method()} ${u.pathname}`);
        const json = (status, corps, entetes = {}) => route.fulfill({ status, contentType: 'application/json', headers: entetes, body: JSON.stringify(corps) });
        if (u.pathname.startsWith('/functions/')) return json(500, { error: `harnais : ${u.pathname.split('/').pop()} n'est pas appelée ici` });
        if (u.pathname.startsWith('/auth/')) return json(401, { message: 'harnais : pas de session' });
        if (u.pathname.startsWith('/rest/v1/rpc/')) return json(200, u.pathname.endsWith('/plateformes_verite') ? [] : null);
        if (u.pathname.startsWith('/rest/v1/')) {
          if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 204, body: '' });
          // Une lecture « objet » (single) sans ligne : la réponse exacte de PostgREST.
          if (String(req.headers().accept ?? '').includes('vnd.pgrst.object')) return json(406, { code: 'PGRST116', message: 'harnais : aucune ligne' });
          return json(200, [], { 'content-range': '*/0' });
        }
        return json(404, { message: 'harnais : route inconnue' });
      }
      if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return route.abort();
      sorties.push(u.href.slice(0, 120));
      return route.abort();
    });
    page.on('pageerror', (x) => erreurs.push(String(x)));
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
    // 120 s : au premier passage, vite pré-compile les dépendances à la demande.
    await page.goto(`${BASE}?variante=${variante}`, { waitUntil: 'networkidle', timeout: 120_000 });
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
      // (01/10, 782cbd6) L'écran dit la cause en clair, sans texte technique.
      verifier(/La rédaction n.a pas abouti/.test(t2) && /Le souci vient de nos serveurs/.test(t2)
        && !['harnais :', 'Une erreur est survenue', 'Edge Function', 'non-2xx'].some((x) => t2.includes(x)),
      'nouvelle : la cause est dite en clair, sans texte technique', t2.slice(0, 300));
      verifier(/Réessayer la rédaction/.test(t2), 'nouvelle : le bouton du pied propose de réessayer');
      verifier(filtre(erreurs).length === 0, 'nouvelle : aucune erreur de page après la navigation', filtre(erreurs).join(' | ').slice(0, 400));
      // Retour : U1 à nouveau.
      await page.getByRole('button', { name: /Étape précédente/ }).click();
      await page.waitForTimeout(600);
      verifier(/Où publier/.test(await page.locator('body').innerText()), 'nouvelle : le retour ramène à U1');
    }
    const appels = await page.evaluate(() => window.__appelsFactices.length);
    verifier(appels + appelsReseau.length < 400, `${variante} : appels Supabase bornés (${appels} au client factice + ${appelsReseau.length} servis par le banc)`);
    verifier(sorties.length === 0, `${variante} : aucune requête hors de la machine`, sorties.slice(0, 3).join(' '));
    await page.close();
  }
  await navigateur.close();
  if (echecs.length) { console.error(`\n❌ ${echecs.length} vérification(s) en échec`); process.exitCode = 1; }
  else console.log('\n✅ le stepper réel se monte dans ses deux peaux : tout passe');
} catch (e) {
  // Un banc qui ne tourne pas n'est jamais un banc vert (il sortait en 0).
  console.error('\n❌ le banc n’a pas pu tourner :', e?.stack ?? e);
  process.exitCode = 2;
} finally {
  stop();
  process.exit(process.exitCode ?? 0);
}
