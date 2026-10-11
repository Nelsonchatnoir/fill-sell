// selftest:lien-ventes-apres-connexion — le lien du mail « Vendu »
// (https://fillsell.app/app?ventes=a-decider) ouvert DÉCONNECTÉ ramène, après
// connexion, à la liste « Ventes à confirmer » et la fait défiler (11/10, Nico).
//
//   npm run selftest:lien-ventes-apres-connexion
//
// Cause : RequireAuth renvoyait vers « / » avant que l'app lise le paramètre,
// et ne retenait que le CHEMIN (/app, hors liste) ; le défilement partait une
// seule fois à 400 ms, souvent avant que la liste (lue sans l'attendre) soit
// peinte.
//
// Contrôles :
//   1. la cible : /app?ventes=a-decider retenue, tout autre /app ignoré,
//      /extension inchangé, rien d'arbitraire ne sort du stockage, TTL 30 min,
//      consommation unique ;
//   2. RequireAuth passe la recherche ; les chemins de CONNEXION (e-mail,
//      Google web, Apple et Google natifs) honorent la cible ; l'inscription et
//      la confirmation d'inscription ne changent pas ;
//   3. l'app lit l'intention, ouvre le Stock et attend la liste (bornée, sans
//      relire la base) avant de défiler ;
//   4. aucun autre lien n'a changé de route.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');

let echecs = 0;
const ok = (cond, quoi, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`);
  if (!cond) echecs += 1;
};

// Un localStorage de poche (le module n'en lit pas d'autre).
const memoire = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoire.has(k) ? memoire.get(k) : null),
  setItem: (k, v) => memoire.set(k, String(v)),
  removeItem: (k) => memoire.delete(k),
};
const mod = await import(pathToFileURL(path.join(RACINE, 'src/lib/postLoginRedirect.js')).href);
const { cibleApresConnexion, rememberPostLoginTarget, consumePostLoginTarget, CIBLE_VENTES_A_DECIDER } = mod;

console.log('1. La cible');
ok(CIBLE_VENTES_A_DECIDER === '/app?ventes=a-decider', 'la cible du mail est /app?ventes=a-decider');
ok(cibleApresConnexion('/app', '?ventes=a-decider') === '/app?ventes=a-decider', '/app?ventes=a-decider → retenue');
ok(cibleApresConnexion('/app', '?utm_source=mail&ventes=a-decider') === '/app?ventes=a-decider', '… même avec d\'autres paramètres (seul celui-là voyage)');
ok(cibleApresConnexion('/app', '') === null, '/app nu → ignoré (comme avant)');
ok(cibleApresConnexion('/app', '?ventes=autre') === null, '/app?ventes=autre → ignoré');
ok(cibleApresConnexion('/app', '?tab=2') === null, '/app?tab=2 → ignoré');
ok(cibleApresConnexion('/extension') === '/extension', '/extension → retenue (inchangé)');
ok(cibleApresConnexion('/extension', '?x=1') === '/extension', '/extension?x=1 → /extension (inchangé : le chemin seul)');
ok(cibleApresConnexion('/legal') === null && cibleApresConnexion('/') === null, 'toute autre page → ignorée');

memoire.clear();
rememberPostLoginTarget('/app', '?ventes=a-decider');
ok(consumePostLoginTarget() === '/app?ventes=a-decider', 'mémorisée puis rendue après connexion');
ok(consumePostLoginTarget() === null, 'consommation unique');
rememberPostLoginTarget('/app', '');
ok(consumePostLoginTarget() === null, '/app nu : rien de mémorisé');
rememberPostLoginTarget('/extension');
ok(consumePostLoginTarget() === '/extension', '/extension : comme avant');
memoire.set('fs_next_after_login', JSON.stringify({ path: 'https://ailleurs.example/app?ventes=a-decider', ts: Date.now() }));
ok(consumePostLoginTarget() === null, 'une adresse arbitraire posée dans le stockage ne sort jamais');
memoire.set('fs_next_after_login', JSON.stringify({ path: '/app?ventes=a-decider', ts: Date.now() - 31 * 60 * 1000 }));
ok(consumePostLoginTarget() === null, 'au-delà de 30 min : ignorée');
memoire.set('fs_next_after_login', '{pas du json');
ok(consumePostLoginTarget() === null, 'stockage illisible : /app, sans erreur');

console.log('\n2. Le routeur et les chemins de connexion');
const ROUTEUR = lire('src/router/AppRouter.jsx');
const APP = lire('src/App.jsx');
const CALLBACK = lire('src/pages/AuthCallback.jsx');
const CONFIRM = lire('src/pages/AuthConfirm.jsx');
ok(/rememberPostLoginTarget\(location\.pathname, location\.search\)/.test(ROUTEUR), 'RequireAuth passe le chemin ET la recherche');
ok(/\[user, location\.pathname, location\.search\]/.test(ROUTEUR), '… et relit quand la recherche change');
ok(/<Route path="\/app" element={<RequireAuth><App \/><\/RequireAuth>} \/>/.test(ROUTEUR), '/app reste protégée par RequireAuth');
ok(/<Route path="\*" element={<Navigate to="\/" replace \/>} \/>/.test(ROUTEUR), 'route « * » inchangée');
const consos = (APP.match(/navigate\(consumePostLoginTarget\(\) \?\? ["']\/app["']\)/g) || []).length;
ok(consos === 3, 'App : e-mail, Apple natif, Google natif honorent la cible (3)', `vu ${consos}`);
ok(/navigate\(consumePostLoginTarget\(\) \?\? "\/app", \{ replace: true \}\)/.test(CALLBACK), 'Google / Apple web (AuthCallback) : inchangé, honore la cible');
ok(/const entrer = \(\) => navigate\("\/app", \{ replace: true \}\);/.test(CONFIRM), 'confirmation d\'inscription : inchangée');
// Inscription (signUp) et code OTP : un nouveau compte n'a pas de vente à confirmer.
const inscription = APP.slice(APP.indexOf('pixelInscription();'), APP.indexOf('pixelInscription();') + 400);
ok(/navigate\("\/app"\);/.test(inscription), 'inscription : navigate("/app") inchangé');

console.log('\n3. L\'app ouvre le Stock et attend la liste');
const bloc = APP.slice(APP.indexOf("// Le lien du mail « Vendu » (/app?ventes=a-decider)"), APP.indexOf('// « Non, je l\'ai retirée »'));
ok(/get\('ventes'\)==='a-decider'/.test(bloc) && /sessionStorage\.setItem\('fillsell:ventes-a-decider','1'\)/.test(bloc), 'l\'intention est lue dans l\'adresse et survit au chargement');
ok(/setTab\(1\)/.test(bloc), 'ouvre le Stock');
ok(/getElementById\(ANCRE_VENTES_A_CONFIRMER\)/.test(bloc) && /if\(\+\+essais<40\)setTimeout\(viser,250\)/.test(bloc), 'attend la liste (40 × 250 ms au plus) avant de défiler');
ok(!/supabase\./.test(bloc), 'l\'attente ne relit jamais la base');
ok(!/setInterval/.test(bloc), 'aucun setInterval');
const ancre = lire('src/components/VentesADecider.jsx');
ok(/export const ANCRE_VENTES_A_CONFIRMER = 'ventes-a-confirmer'/.test(ancre) && /id={ANCRE_VENTES_A_CONFIRMER}/.test(ancre), 'la liste porte l\'ancre visée');

console.log('\n4. Le lien du mail');
const MAIL = lire('supabase/functions/_shared/emails-fillsell.ts');
ok(MAIL.includes('URL_VENTES_A_CONFIRMER = `${URL_APP}/app?ventes=a-decider`'),'le mail « Vendu » mène toujours à /app?ventes=a-decider');

console.log(echecs ? `\n✗ ${echecs} échec(s)` : '\nTOUT PASSE');
process.exit(echecs ? 1 : 0);
