// ============================================================================
// PIXEL META — ID 1425992186075849 (13/09/2026) + 921207750637065 (15/11/2026)
//
// POSÉ DANS LE SITE, PAS DANS GTM. Pourquoi :
//  1. L'événement de conversion doit partir à l'INSCRIPTION RÉUSSIE — un état
//     que seul le code React connaît (retour de supabase.auth.signUp). Le
//     déclencher depuis GTM supposerait soit une page de confirmation dédiée
//     (elle n'existe pas : l'inscription garde l'utilisateur sur place), soit
//     un événement dataLayer poussé par… ce même code. Un aller-retour par GTM
//     n'ajouterait qu'un intermédiaire.
//  2. Le chargement est conditionné au consentement. Dans le site, la
//     condition est lisible et testable ici ; dans GTM, elle vivrait dans une
//     interface tierce, hors du dépôt et hors relecture.
//  3. GTM reste en place pour la mesure d'audience : rien n'y est retiré.
//
// ⚠️ AUCUN chargement sans consentement explicite. chargerPixel() est un
// no-op tant que aConsentiPub() est faux, et l'événement de conversion est
// simplement perdu dans ce cas — c'est le comportement voulu.
//
// ⚠️ AUCUNE donnée personnelle envoyée : ni email, ni identifiant de compte,
// ni advanced matching. Seul l'événement nu part.
// ============================================================================

import { aConsentiPub } from './consentement';

// « FillSell Web », portefeuille FillSell (relié au compte FillSell Ads). Inchangé.
export const PIXEL_ID = '1425992186075849';
// (15/11/2026 soir, ordre de Nico) Le pixel que surveille le compte publicitaire PERSO de Nico (967689532550296), où
// tourne la campagne « FillSell - Installer l'app (continu) » : Meta le disait « inactif », il ne recevait rien.
// Initialisé EN PLUS du premier, jamais à sa place, sous le MÊME consentement. Les deux `init` passent AVANT tout
// événement : un `track` part vers tous les pixels initialisés (jamais `trackSingle` ici, qui n'en viserait qu'un).
// Verrou : selftest:meta-pixel-deux-pixels.
export const PIXEL_ID_COMPTE_PERSO = '921207750637065';
export const PIXEL_IDS = Object.freeze([PIXEL_ID, PIXEL_ID_COMPTE_PERSO]);

let charge = false;

/** Installe fbq et charge le script Meta. Sans consentement : ne fait rien. */
export function chargerPixel() {
  if (charge) return true;
  if (!aConsentiPub()) return false;
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  try {
    // Amorce officielle Meta, en clair plutôt qu'en une ligne minifiée : c'est
    // du code tiers, il doit rester relisible.
    (function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = true;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    for (const id of PIXEL_IDS) window.fbq('init', id);
    window.fbq('track', 'PageView');
    charge = true;
    return true;
  } catch (e) {
    console.warn('[pixel] chargement impossible :', e?.message ?? e);
    return false;
  }
}

/**
 * Conversion : INSCRIPTION RÉUSSIE. Appelée depuis le retour de signUp,
 * jamais au chargement d'une page.
 *
 * ⚠️ Ne doit jamais faire échouer l'inscription : tout est avalé.
 */
export function pixelInscription(eventId = null) {
  try {
    if (!aConsentiPub()) return;
    if (!chargerPixel()) return;
    // CompleteRegistration = l'événement standard Meta pour une inscription. (15/11/2026 soir) `eventId` : le même que
    // celui que le serveur envoie par l'API de conversions (metaInscription.js) — Meta n'en compte qu'un.
    if (eventId) window.fbq?.('track', 'CompleteRegistration', {}, { eventID: String(eventId) });
    else window.fbq?.('track', 'CompleteRegistration');
  } catch (e) {
    console.warn('[pixel] conversion non transmise :', e?.message ?? e);
  }
}
