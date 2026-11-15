// VERROU (15/11/2026 soir, ordre de Nico) : LE SITE ET LA WEB APP ENVOIENT LEURS ÉVÉNEMENTS META AUX DEUX PIXELS.
//
// Ce qui se passait : la campagne « FillSell - Installer l'app (continu) » tourne sur le compte publicitaire PERSO de Nico
// (967689532550296), qui surveille le pixel 921207750637065 — déclaré « inactif » par Meta : il ne recevait rien. fillsell.app
// (site et /app) n'initialisait QUE le pixel « FillSell Web » 1425992186075849 (portefeuille FillSell), seul à recevoir
// PageView et CompleteRegistration.
//
// Ce verrou garde, pour le site (site/js/site.js) et la web app (BandeauConsentement, inscription d'App.jsx) — une seule
// source, src/utils/metaPixel.js :
//   1. les DEUX pixels sont initialisés, l'ancien inchangé, AVANT le PageView (un `track` part vers tous les pixels
//      initialisés : un PageView posé avant le second `init` ne partirait pas vers lui) ;
//   2. PageView et CompleteRegistration partent par `track` (jamais `trackSingle`, qui n'en viserait qu'un) ;
//   3. le consentement fait la loi pour les deux : sans « accepte », aucun script, aucun init, aucun événement ;
//   4. aucune donnée personnelle (ni advanced matching, ni 3e argument à `init`) ;
//   5. aucun autre envoi vers Meta dans le dépôt (API de conversions, eventID) qui garderait un seul pixel.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

const ANCIEN = '1425992186075849';
const PERSO = '921207750637065';

// Un navigateur minimal : localStorage (le consentement), document (le script Meta inséré, jamais exécuté ici).
function navigateur(consentement) {
  const stock = new Map(consentement ? [['fs_consent_pub_v2', consentement]] : []);
  const scripts = [];
  const premier = { parentNode: { insertBefore: (s) => scripts.push(s.src) } };
  globalThis.localStorage = { getItem: (k) => (stock.has(k) ? stock.get(k) : null), setItem: (k, v) => stock.set(k, String(v)), removeItem: (k) => stock.delete(k) };
  globalThis.window = globalThis;
  delete globalThis.fbq; delete globalThis._fbq;
  globalThis.document = { createElement: () => ({}), getElementsByTagName: () => [premier] };
  return { scripts };
}
const appels = () => (globalThis.fbq?.queue ?? []).map((a) => [...a]);

// Chaque cas sur un module NEUF (son drapeau « déjà chargé » est interne).
let tour = 0;
const charger = () => import(`../src/utils/metaPixel.js?cas=${++tour}`);

console.log('1. Consentement accepté : les deux pixels, puis le PageView');
{
  const nav = navigateur('accepte');
  const m = await charger();
  ok(m.chargerPixel() === true, 'chargerPixel() répond oui');
  const a = appels();
  const inits = a.filter((x) => x[0] === 'init').map((x) => x[1]);
  ok(inits.includes(ANCIEN), `l'ancien pixel ${ANCIEN} est initialisé (inchangé)`);
  ok(inits.includes(PERSO), `le pixel du compte pub perso ${PERSO} est initialisé`);
  ok(inits.length === 2 && new Set(inits).size === 2, `exactement deux init, sans doublon (${inits.join(', ')})`);
  const iPv = a.findIndex((x) => x[0] === 'track' && x[1] === 'PageView');
  ok(iPv > -1 && a.slice(0, iPv).filter((x) => x[0] === 'init').length === 2, 'le PageView part APRÈS les deux init (donc vers les deux pixels)');
  ok(a.filter((x) => x[1] === 'PageView').length === 1, 'un seul PageView par chargement');
  ok(a.filter((x) => x[0] === 'init').every((x) => x.length === 2), 'init sans 3e argument : aucune donnée personnelle (advanced matching)');
  ok(nav.scripts.length === 1 && /connect\.facebook\.net\/.+\/fbevents\.js$/.test(nav.scripts[0]), 'un seul script Meta chargé');
  ok(m.chargerPixel() === true && appels().filter((x) => x[0] === 'init').length === 2, 'un second appel ne réinitialise rien');
  m.pixelInscription();
  const cr = appels().filter((x) => x[1] === 'CompleteRegistration');
  ok(cr.length === 1 && cr[0][0] === 'track', 'CompleteRegistration part par `track` (vers les deux pixels)');
  ok(!appels().some((x) => x[0] === 'trackSingle' || x[0] === 'trackSingleCustom'), 'jamais `trackSingle`');
  m.pixelInscription('5d0c9a1e-2b3c-4d5e-8f90-112233445566');
  const cr2 = appels().filter((x) => x[1] === 'CompleteRegistration').at(-1);
  ok(cr2?.[0] === 'track' && cr2?.[3]?.eventID === '5d0c9a1e-2b3c-4d5e-8f90-112233445566', 'avec un eventID (déduplication avec l\'envoi serveur), toujours par `track`');
}

console.log('2. Sans consentement : rien, pour aucun des deux');
for (const etat of [null, 'refuse']) {
  const nav = navigateur(etat);
  const m = await charger();
  ok(m.chargerPixel() === false && !globalThis.fbq && nav.scripts.length === 0, `consentement ${etat ?? 'absent'} : aucun script, aucun init`);
  m.pixelInscription();
  ok(!globalThis.fbq, `consentement ${etat ?? 'absent'} : aucune inscription transmise`);
}

console.log('3. Les sources');
const lire = (f) => readFileSync(path.join(racine, f), 'utf8');
const pixel = lire('src/utils/metaPixel.js');
ok(pixel.includes(`'${ANCIEN}'`) && pixel.includes(`'${PERSO}'`), 'les deux identifiants écrits dans metaPixel.js');
ok(/import \{ chargerPixel \} from '\.\.\/\.\.\/src\/utils\/metaPixel\.js'/.test(lire('site/js/site.js')), 'le site charge le pixel par la MÊME source');
ok(/import \{ chargerPixel \} from '\.\.\/utils\/metaPixel'/.test(lire('src/components/BandeauConsentement.jsx')), 'la web app (bandeau) aussi');
ok(/mesurerInscription\(data\.user\.id\)/.test(lire('src/App.jsx')) && /pixelInscription\(eventId\)/.test(lire('src/utils/metaInscription.js')),
  'l\'inscription réussie passe par mesurerInscription → pixelInscription(eventId) (verrou de l\'envoi serveur : selftest:meta-capi-inscription)');
ok(/\{!isNative && <BandeauConsentement \/>\}/.test(lire('src/router/AppRouter.jsx')), 'apps natives : aucun bandeau, donc aucun pixel (inchangé)');
// 5. Aucun autre chemin vers Meta (fbq ailleurs, API de conversions, identifiant d'un seul pixel en dur).
const fichiers = [];
const parcourir = (d) => {
  for (const e of readdirSync(path.join(racine, d))) {
    const p = path.join(d, e);
    if (/node_modules|\.test\.|selftest/.test(p)) continue;
    const st = statSync(path.join(racine, p));
    if (st.isDirectory()) parcourir(p);
    else if (/\.(m?js|jsx|ts|html)$/.test(e)) fichiers.push(p);
  }
};
for (const d of ['src', 'site/js', 'site/gabarits', 'supabase/functions', 'api']) { try { parcourir(d); } catch { /* dossier absent */ } }
// (15/11 soir) Le seul autre chemin permis : l'API de conversions (serveur), qui vise les MÊMES deux pixels.
const capi = lire('supabase/functions/_shared/meta-capi.js');
ok(capi.includes(`'${ANCIEN}'`) && capi.includes(`'${PERSO}'`), 'l\'API de conversions vise les mêmes deux pixels');
const autres = fichiers.filter((f) => !/metaPixel\.js$|_shared[\\/]meta-capi\.js$/.test(f)).filter((f) => {
  const t = lire(f);
  return /\bfbq\s*\(|graph\.facebook\.com\/v[\d.]+\/\d+\/events|facebook\.com\/tr\b/.test(t) || t.includes(ANCIEN) || t.includes(PERSO);
});
ok(!autres.length, `aucun autre envoi vers Meta dans le dépôt${autres.length ? ` : ${autres.join(', ')}` : ''}`);

console.log(`\n${n - ko}/${n} vérifications`);
process.exit(ko ? 1 : 0);
