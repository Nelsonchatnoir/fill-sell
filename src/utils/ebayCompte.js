// eBay par API — client des fonctions ebay-oauth-start / ebay-account (lot 0-1,
// 05/09/2026). Le navigateur ne voit JAMAIS ni client_secret ni jeton vendeur :
// il reçoit une URL de consentement, et une vue publique de l'état du compte.
//
// 06/09 — « le bouton Créer ne fait rien » (aucune requête émise, aucun message) :
// chaque étape trace dans la console et a une borne de temps. Un appel qui
// n'aboutit pas DIT pourquoi, toujours — plus jamais un silence.
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';

const TRACE = '[ebay-compte]';
const DELAI_SESSION_MS = 8000;
const DELAI_APPEL_MS = 30000;
const REF_PROJET = new URL(supabaseUrl).hostname.split('.')[0];

// Jeton de session : getSession() borné à 8 s (il a déjà été vu attendre un
// verrou d'auth sans jamais rendre la main), puis repli sur le stockage local
// de supabase-js — le même jeton, lu sans verrou.
async function lireJetonSession() {
  const TIMEOUT = Symbol('timeout');
  const viaSupabase = supabase.auth.getSession().then(({ data }) => data?.session?.access_token ?? null).catch((e) => {
    console.warn(`${TRACE} getSession a levé —`, e?.message ?? e);
    return null;
  });
  const borne = new Promise((resolve) => setTimeout(() => resolve(TIMEOUT), DELAI_SESSION_MS));
  const r = await Promise.race([viaSupabase, borne]);
  if (r !== TIMEOUT && r) return r;
  if (r === TIMEOUT) console.warn(`${TRACE} getSession ne répond pas après ${DELAI_SESSION_MS / 1000} s — repli sur le stockage local`);
  try {
    const brut = localStorage.getItem(`sb-${REF_PROJET}-auth-token`);
    const j = brut ? JSON.parse(brut) : null;
    return j?.access_token ?? j?.currentSession?.access_token ?? null;
  } catch {
    return null;
  }
}

async function appeler(nom, body) {
  const action = body?.action ?? nom;
  console.info(`${TRACE} → ${nom} (${action})`);
  const token = await lireJetonSession();
  if (!token) throw new Error('Session FillSell introuvable : recharge la page puis réessaie.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DELAI_APPEL_MS);
  let r;
  try {
    r = await fetch(`${supabaseUrl}/functions/v1/${nom}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
  } catch (e) {
    const timeout = e?.name === 'AbortError';
    console.warn(`${TRACE} ✗ ${nom} (${action}) — ${timeout ? 'délai dépassé' : 'réseau'} :`, e?.message ?? e);
    throw new Error(timeout
      ? `FillSell n'a pas répondu en ${DELAI_APPEL_MS / 1000} s. Réessaie dans un instant.`
      : `Appel impossible (réseau) : ${e?.message ?? e}`);
  } finally {
    clearTimeout(timer);
  }
  const json = await r.json().catch(() => ({}));
  console.info(`${TRACE} ← ${nom} (${action}) HTTP ${r.status}`);
  if (!r.ok) throw new Error(json?.error ?? `HTTP ${r.status}`);
  return json;
}

// URL de consentement eBay pour l'utilisateur courant (state signé côté serveur).
export const demarrerConnexionEbay = () => appeler('ebay-oauth-start');

// { etat } sans appel eBay ; { etat, checklist } avec relevé Account API.
export const lireEtatEbay = (action = 'statut') => appeler('ebay-account', { action });

// choisir_politique { type, id } · creer_politique { type, options } ·
// activer_politiques · deconnecter
export const agirEbay = (action, params = {}) => appeler('ebay-account', { action, ...params });

// Ouvre l'écran de consentement : plein écran sur le web (eBay revient sur
// /ebay/retour), navigateur système sur natif (le retour atterrit sur la page
// web /ebay/retour, l'utilisateur referme et revient dans l'app).
export async function ouvrirConsentementEbay(url) {
  if (Capacitor.isNativePlatform()) { await Browser.open({ url }); return; }
  window.location.assign(url);
}

// ── « Ce compte eBay est-il utilisable ? » — MIROIR EXACT du trigger ────────
// La décision de voie vit en base (cross_post_jobs_voie_ebay, migration
// 20260906150000) et nulle part ailleurs. Le prédicat ci-dessous en est le
// reflet À L'ÉCRAN, mot pour mot :
//   revoked_at IS NULL
//   AND fulfillment_policy_id IS NOT NULL
//   AND payment_policy_id IS NOT NULL
//   AND return_policy_id IS NOT NULL
//   AND (seller_state->>'bloque_par_etat_ebay') = 'false'
// `etat` est la vue publique rendue par ebay-account (action 'statut') : une
// simple lecture de ebay_accounts, AUCUN appel à eBay.
//
// ⚠️ Ce prédicat ne dit RIEN de la voie extension. Un compte sans le drapeau
// profiles.ebay_voie_api publie eBay par le formulaire (l'extension remplit
// ebay.fr) : ni les politiques de vente, ni la checklist Account API n'y
// entrent. Ne jamais s'en servir pour griser eBay à un compte non basculé.
//
// Tri-état : null = pas encore lu (on ne conclut pas), true/false sinon.
export function ebayCompteUtilisable(etat) {
  if (!etat) return etat === null || etat === undefined ? null : false;
  if (!etat.connecte || etat.a_reconnecter) return false;
  const pol = etat.politiques ?? {};
  if (!pol.fulfillment || !pol.payment || !pol.return) return false;
  // seller_state absent = checklist jamais relevée → le trigger ne bascule pas
  // non plus (NULL ->> renvoie NULL, jamais 'false'). Même verdict ici.
  return etat.seller_state?.bloque_par_etat_ebay === false;
}

// Motif LE PLUS EN AMONT du refus — une seule phrase à afficher, jamais un
// diagnostic. 'non_connecte' | 'a_reconnecter' | 'a_finir' (politiques ou
// checklist rouge : dans les deux cas le geste est le même, finir dans
// Réglages › Compte eBay).
export function motifEbayInutilisable(etat) {
  if (!etat || !etat.connecte) return etat?.a_reconnecter ? 'a_reconnecter' : 'non_connecte';
  if (etat.a_reconnecter) return 'a_reconnecter';
  return 'a_finir';
}
