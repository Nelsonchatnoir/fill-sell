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
