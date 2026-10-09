// AIGUILLAGES DU SITE VITRINE — script EN LIGNE dans le <head> (09/10/2026).
//
// Fonction source UNIQUE, bundlée en IIFE par le générateur (rolldown) et
// injectée en ligne dans chaque page ; testable avec un faux `window`
// (scripts/site-aiguillage-selftest.mjs). En ligne et pas dans site.js : elle
// doit survivre à un 404 du CDN sur site.js (incident du 01/10, revue A § 5) —
// une confirmation d'inscription ou l'entrée dans l'app ne dépendent jamais
// d'un fichier qui peut manquer.
//
// Sur TOUTES les pages vitrine : capterOffre() et capterSource(), depuis les
// MÊMES modules que l'app (revue A I5). La source d'acquisition est un premier
// contact IMMUABLE : relevée par un script différé, elle serait perdue chez le
// visiteur qui touche « Commencer » avant que site.js ait tourné (fs_acq
// « direct » pour toujours, ?offre= perdu).
//
// Sur « / » seulement (comme la route React d'aujourd'hui), dans cet ordre
// FIXE (revue A I1, I2) :
//   1. ?code= ou ?token_hash= → /auth/confirm + search, AVANT toute lecture de
//      session : le lien de confirmation ouvert dans un navigateur connecté à
//      un AUTRE compte entrait dans le mauvais compte (16/09, iPhone de Nico) ;
//   2. fragment #access_token= / #error_description=, ou ?error_description=
//      → /login + search + hash : supabase-js, chargé sur /login, consomme le
//      fragment (liens « magic link » du tableau de bord Supabase, liens
//      expirés). Un départ vers /app jetterait le fragment ;
//   3. jeton de session sb-<ref>-auth-token portant un refresh_token → /app +
//      search. Au plus 2 départs en 20 s (sessionStorage ; s'il lève, on part :
//      aucune boucle n'est possible aujourd'hui, cf. invariant ci-dessous).
//      Page masquée le temps de partir, démasquée par une minuterie de
//      secours (4 s) si le départ n'a pas lieu ; rejoué au retour par le cache
//      avant/arrière (pageshow persisté).
//
// INVARIANT qui rend la boucle impossible : aucune route de la SPA ne recharge
// « / » de force tant qu'un jeton peut subsister (AppRouter : le retour vers
// l'accueil statique n'a lieu que SANS jeton). Le garde de 2 départs n'est
// qu'un filet.
import { capterOffre } from '../../src/lib/offreMail.js';
import { capterSource } from '../../src/utils/acquisition.js';

export const CLE_DEPARTS = 'fs_aiguillage_departs';
export const FENETRE_DEPARTS_MS = 20000;
export const MAX_DEPARTS = 2;
export const SECOURS_MS = 4000;
export const CLASSE_DEPART = 'fs-depart';

/** Le jeton de session existe-t-il, avec de quoi se renouveler ? Ne lève jamais. */
export function lireJeton(stockage, cleJeton) {
  try {
    const brut = stockage && stockage.getItem(cleJeton);
    if (!brut) return false;
    const session = JSON.parse(brut);
    return !!(session && typeof session.refresh_token === 'string' && session.refresh_token);
  } catch {
    return false;
  }
}

/** Peut-on partir encore une fois ? Note le départ. Si le stockage lève : oui. */
function departAutorise(w, maintenant) {
  let departs;
  try {
    const brut = w.sessionStorage.getItem(CLE_DEPARTS);
    departs = (brut ? JSON.parse(brut) : []).filter((t) => typeof t === 'number' && maintenant - t < FENETRE_DEPARTS_MS);
  } catch {
    return true;
  }
  if (departs.length >= MAX_DEPARTS) return false;
  try {
    departs.push(maintenant);
    w.sessionStorage.setItem(CLE_DEPARTS, JSON.stringify(departs));
  } catch { /* stockage plein ou interdit : on part quand même */ }
  return true;
}

function demasquer(w) {
  try { w.document.documentElement.classList.remove(CLASSE_DEPART); } catch { /* rien à démasquer */ }
}

/** Étape 3 : connecté → /app. Rend 'app' si on part, null sinon. */
export function aiguillerJeton(w, { cleJeton, maintenant = Date.now() }) {
  let stockage = null;
  try { stockage = w.localStorage; } catch { return null; }
  if (!lireJeton(stockage, cleJeton)) return null;
  if (!departAutorise(w, maintenant)) { demasquer(w); return null; }
  try { w.document.documentElement.classList.add(CLASSE_DEPART); } catch { /* sans DOM : on part sans masquer */ }
  // Minuterie de secours : si le départ n'aboutit pas (navigation bloquée,
  // page restaurée), la page redevient visible. Jamais une page vide.
  w.setTimeout(() => demasquer(w), SECOURS_MS);
  w.location.replace('/app' + w.location.search);
  return 'app';
}

/**
 * Point d'entrée. `racine` : la page est « / ». Rend la décision prise
 * ('confirmation' | 'auth' | 'app' | null) — utile aux tests.
 */
export function aiguiller(w, { racine, cleJeton, maintenant = Date.now() }) {
  // Captures d'abord, sur toutes les pages : idempotentes, sans effet sur la
  // suite, et un départ vers /app emporte de toute façon `search`.
  capterOffre();
  capterSource({ plateforme: null });
  if (!racine) return null;

  const { search, hash } = w.location;
  let params;
  try { params = new URLSearchParams(search); } catch { params = new URLSearchParams(); }

  // 1. Confirmation d'inscription / lien d'e-mail PKCE.
  if (params.get('code') || params.get('token_hash')) {
    w.location.replace('/auth/confirm' + search);
    return 'confirmation';
  }
  // 2. Fragment d'authentification (flux implicite) ou erreur d'auth.
  if (/(^|[#&])(access_token|error_description)=/.test(hash || '') || params.get('error_description')) {
    w.location.replace('/login' + search + hash);
    return 'auth';
  }
  // 3. Déjà connecté.
  const decision = aiguillerJeton(w, { cleJeton, maintenant });
  // Retour par le cache avant/arrière : le script ne se rejoue pas tout seul.
  // Cas réel : « / » déconnecté → /login → connexion → retour arrière.
  try {
    w.addEventListener('pageshow', (e) => {
      if (!e || !e.persisted) return;
      demasquer(w);
      aiguillerJeton(w, { cleJeton, maintenant: Date.now() });
    });
  } catch { /* sans événements : rien à rejouer */ }
  return decision;
}
