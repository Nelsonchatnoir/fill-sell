// ═══════════════════════════════════════════════════════════════════════════
// L'INSCRIPTION MESURÉE CHEZ META — navigateur ET serveur, un seul event_id (15/11/2026 soir, ordre de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// À une inscription réussie sur le WEB, et SEULEMENT si la personne a accepté le bandeau (aConsentiPub) :
//   1. le pixel du navigateur envoie « CompleteRegistration » aux deux pixels avec un eventID tiré ici ;
//   2. le navigateur demande AUSSI au serveur (fonction meta-inscription, API de conversions) d'envoyer le même
//      événement, avec le même event_id — Meta n'en compte qu'un ; le serveur rattrape ce que le navigateur rate
//      (bloqueur de pub, page fermée aussitôt). navigator.sendBeacon : texte brut, aucune requête préalable, part même
//      si la page se ferme, n'attend rien.
// Jamais dans l'app native (ni bandeau ni traceur Meta, décision de Nico du 15/11) ; jamais deux fois pour un compte
// sur cet appareil ; jamais une erreur remontée : l'inscription ne dépend en rien de Meta.
// Pas dans metaPixel.js : ce module-là est aussi celui du site vitrine, qui ne charge jamais supabase.
// Verrou : selftest:meta-capi-inscription.
import { aConsentiPub } from './consentement';
import { pixelInscription } from './metaPixel';

export const URL_META_INSCRIPTION = 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/meta-inscription';
const CLE_FAIT = (userId) => `fs_meta_inscription_${userId}`;

function cookie(nom) {
  try {
    const m = String(document.cookie || '').match(new RegExp(`(?:^|;\\s*)${nom}=([^;]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
}
function nouvelId() {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch { /* repli */ }
  const h = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const estNatif = () => {
  try { return Boolean(globalThis.Capacitor?.isNativePlatform?.()); } catch { return false; }
};

/**
 * Une inscription réussie (compte NOUVEAU : `userId` de auth.users). → l'event_id envoyé, ou null (rien n'est parti).
 * Ne lève jamais.
 */
export function mesurerInscription(userId) {
  try {
    if (!userId || estNatif() || !aConsentiPub()) return null;
    try { if (localStorage.getItem(CLE_FAIT(userId))) return null; localStorage.setItem(CLE_FAIT(userId), '1'); } catch { /* stockage indisponible */ }
    const eventId = nouvelId();
    pixelInscription(eventId);
    const corps = JSON.stringify({
      user_id: userId, event_id: eventId, fbp: cookie('_fbp'), fbc: cookie('_fbc'),
      source_url: `${location.origin}${location.pathname}`,
    });
    let parti = false;
    try { parti = navigator.sendBeacon?.(URL_META_INSCRIPTION, new Blob([corps], { type: 'text/plain;charset=UTF-8' })) === true; } catch { /* repli */ }
    if (!parti) fetch(URL_META_INSCRIPTION, { method: 'POST', body: corps, keepalive: true, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }).catch(() => {});
    return eventId;
  } catch (e) {
    console.warn('[meta] inscription non transmise :', e?.message ?? e);
    return null;
  }
}
