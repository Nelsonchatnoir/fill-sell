// eBay par API — client des fonctions ebay-oauth-start / ebay-account (lot 0-1,
// 05/09/2026). Le navigateur ne voit JAMAIS ni client_secret ni jeton vendeur :
// il reçoit une URL de consentement, et une vue publique de l'état du compte.
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';

async function appeler(nom, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Session FillSell absente');
  const r = await fetch(`${supabaseUrl}/functions/v1/${nom}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
    body: JSON.stringify(body ?? {}),
  });
  const json = await r.json().catch(() => ({}));
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
