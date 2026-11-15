// ═══════════════════════════════════════════════════════════════════════════
// API DE CONVERSIONS META — L'INSCRIPTION ENVOYÉE PAR LE SERVEUR (15/11/2026 soir, ordre de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Pur (aucun réseau, aucune base) : partagé par la fonction edge meta-inscription (Deno) et son verrou
// (scripts/meta-capi-inscription-selftest.mjs, Node). Verrou : selftest:meta-capi-inscription.
//
// Pourquoi : le pixel du navigateur rate des inscriptions (bloqueur de pub, page fermée trop tôt). Le serveur envoie
// AUSSI « CompleteRegistration » aux DEUX pixels (compte pub perso de Nico 921207750637065, « FillSell Web »
// 1425992186075849), avec le MÊME event_id que l'événement du navigateur : Meta n'en compte qu'un.
// Décisions de Nico (15/11 soir) : SEULEMENT avec l'accord au bandeau (comme le pixel), web seulement (les apps natives
// n'ont ni bandeau ni traceur Meta) ; la politique de confidentialité le dit (Legal.jsx, même commit).
// Données envoyées, et RIEN d'autre : e-mail et identifiant de compte en empreinte SHA-256 (jamais en clair), fbp/fbc
// quand ils existent, IP et navigateur de la personne, adresse de la page.

export const PIXELS_META = Object.freeze(['921207750637065', '1425992186075849']);
export const VERSION_GRAPH = 'v23.0';
// Le compte doit être né il y a moins de 30 min : seule une inscription réelle, et récente, part (jamais un compte
// existant, jamais un rejeu tardif).
export const AGE_MAX_COMPTE_MS = 30 * 60_000;
// L'adresse de la page : notre site seulement, sans paramètres (rien d'autre ne part).
const SITES = /^https:\/\/(www\.)?fillsell\.app(\/[A-Za-z0-9\-._~/]*)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FBP = /^fb\.[0-9]\.[0-9]{10,16}\.[0-9]{1,24}$/;
const FBC = /^fb\.[0-9]\.[0-9]{10,16}\.[A-Za-z0-9_-]{1,400}$/;

/** Le nom du secret qui porte le jeton d'un pixel (jamais le jeton lui-même dans le code). */
export const nomSecretJeton = (pixel) => `META_CAPI_TOKEN_${pixel}`;

/**
 * La demande du navigateur (pure) : { user_id, event_id, fbp?, fbc?, source_url } — ou null si elle n'est pas
 * conforme (le serveur ne fait alors rien, et ne le dit pas au navigateur).
 */
export function lireDemande(texte) {
  let d;
  try { d = typeof texte === 'string' ? JSON.parse(texte) : texte; } catch { return null; }
  if (!d || typeof d !== 'object') return null;
  if (!UUID.test(String(d.user_id ?? '')) || !UUID.test(String(d.event_id ?? ''))) return null;
  const url = String(d.source_url ?? '');
  return {
    user_id: String(d.user_id).toLowerCase(),
    event_id: String(d.event_id).toLowerCase(),
    fbp: FBP.test(String(d.fbp ?? '')) ? String(d.fbp) : null,
    fbc: FBC.test(String(d.fbc ?? '')) ? String(d.fbc) : null,
    source_url: SITES.test(url) ? url : 'https://fillsell.app/app',
  };
}

/** L'adresse IP de la personne d'après les en-têtes (pure) : la première de x-forwarded-for, sinon cf-connecting-ip. */
export function ipDuClient(entetes) {
  const lire = (n) => (typeof entetes?.get === 'function' ? entetes.get(n) : entetes?.[n]) ?? '';
  const brute = String(lire('x-forwarded-for')).split(',')[0].trim() || String(lire('cf-connecting-ip')).trim();
  return /^[0-9a-f.:]{3,45}$/i.test(brute) ? brute : null;
}

/** L'empreinte SHA-256 en hexadécimal minuscule (Web Crypto : Deno et Node). */
export async function sha256Hex(texte) {
  const octets = new TextEncoder().encode(String(texte));
  const h = await globalThis.crypto.subtle.digest('SHA-256', octets);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * L'événement « CompleteRegistration » (pure, async pour le hachage) — ou { refus } :
 *   compte : { id, email, created_at } lu par le serveur (auth.users), jamais ce que dit le navigateur ;
 *   demande : lireDemande(...) ; ip, ua : la requête du navigateur ; maintenant : l'horloge (injectable).
 */
export async function evenementInscription({ compte, demande, ip, ua, maintenant = Date.now() }) {
  if (!demande) return { refus: 'demande_invalide' };
  if (!compte?.id || String(compte.id).toLowerCase() !== demande.user_id) return { refus: 'compte_inconnu' };
  const email = String(compte.email ?? '').trim().toLowerCase();
  if (!email.includes('@')) return { refus: 'email_absent' };
  const ne = Date.parse(String(compte.created_at ?? ''));
  if (!Number.isFinite(ne) || maintenant - ne > AGE_MAX_COMPTE_MS || ne - maintenant > 60_000) return { refus: 'compte_pas_recent' };
  const ua_ = String(ua ?? '').slice(0, 512);
  if (!ip || !ua_) return { refus: 'ip_ou_navigateur_absent' };
  const user_data = {
    em: [await sha256Hex(email)],
    external_id: [await sha256Hex(String(compte.id).toLowerCase())],
    client_ip_address: ip,
    client_user_agent: ua_,
    ...(demande.fbp ? { fbp: demande.fbp } : {}),
    ...(demande.fbc ? { fbc: demande.fbc } : {}),
  };
  return {
    evenement: {
      event_name: 'CompleteRegistration',
      event_time: Math.floor(ne / 1000),
      event_id: demande.event_id,
      action_source: 'website',
      event_source_url: demande.source_url,
      user_data,
    },
  };
}

/** L'adresse d'envoi d'un pixel (pure). */
export const urlEnvoi = (pixel, version = VERSION_GRAPH) => `https://graph.facebook.com/${version}/${pixel}/events`;
