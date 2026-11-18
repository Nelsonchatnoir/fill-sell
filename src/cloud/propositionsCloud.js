// ═══════════════════════════════════════════════════════════════════════════
// QUAND L'APP PROPOSE LE CLOUD — et quand elle se tait (18/11/2026, lot T1, décisions 3 et 5 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas Butin d'Or (18/11, 20:13-20:14, Android) : il prend Business seul, l'app lui montre le bandeau Cloud une minute
// après, il reprend Business + Cloud → deux débits Google le même soir. Décisions de Nico du 18/11 :
//   3. Abonné payant : AUCUNE proposition Cloud pendant 7 jours après un paiement (ni bandeau, ni carte, ni pop-up).
//      Ensuite, seulement une carte DISCRÈTE dans le Stock, jamais de bandeau. L'ajout du Cloud reste toujours possible
//      par l'abonné lui-même depuis les offres (la fenêtre qu'il ouvre : jamais touchée ici).
//   5. Le bandeau « NOUVEAU · FillSell Cloud » est retiré du Tableau pendant les premiers jours (7 jours après
//      l'inscription) ; la carte Cloud du Stock suffit.
// « Un paiement » = une ligne coin_ledger de source 'payment' (grant_monthly / grant_upgrade : Stripe, Apple, Google —
// tous les canaux l'écrivent), ou un palier qui MONTE dans cette session (l'achat vient de réussir : la ligne peut
// arriver après). Tant que rien n'est lu : rien ne se propose (jamais une proposition qui apparaît puis disparaît).
// Pur + un petit magasin partagé (les cartes vivent dans des écrans montés de six endroits : pas de props à tirer).
import { useSyncExternalStore } from 'react';

export const SILENCE_APRES_PAIEMENT_MS = 7 * 24 * 3600 * 1000;
export const BANDEAU_APRES_INSCRIPTION_MS = 7 * 24 * 3600 * 1000;
const PALIERS_PAYANTS = Object.freeze(['premium', 'pro', 'business']);

/** Le palier est-il payant ? (gratuit / free / inconnu : non) */
export const estAbonnePayant = (palier) => PALIERS_PAYANTS.includes(String(palier ?? ''));

/**
 * Les propositions permises (pur).
 *   palier            : celui de l'app (App.jsx) ;
 *   dernierPaiementMs : la date du dernier paiement connu (ms), ou null ;
 *   compteCreeMs      : la date d'inscription (ms), ou null ;
 *   lu                : le dernier paiement a-t-il été LU (sinon : rien ne se propose) ;
 * Rend { lu, silence, abonnePayant, bandeau, carteStock: 'grande' | 'discrete' | null, cartes, popups }.
 *   bandeau : le bandeau du Tableau (en plus de ses règles à lui : bandeauCloud.js) ;
 *   cartes  : les cartes Cloud des écrans (mur de l'extension, lien sous « m'envoyer le lien ») ;
 *   popups  : les fenêtres qui s'ouvrent seules (place libérée, essai terminé, « Reprendre »).
 */
export function propositionsCloud({ palier = 'gratuit', dernierPaiementMs = null, compteCreeMs = null, lu = false, maintenant = Date.now() } = {}) {
  const abonnePayant = estAbonnePayant(palier);
  if (!lu) return { lu: false, silence: true, abonnePayant, bandeau: false, carteStock: null, cartes: false, popups: false };
  const d = Number(dernierPaiementMs);
  const silence = Number.isFinite(d) && d > 0 && maintenant - d >= 0 && maintenant - d < SILENCE_APRES_PAIEMENT_MS;
  const c = Number(compteCreeMs);
  const compteRecent = Number.isFinite(c) && c > 0 && maintenant - c < BANDEAU_APRES_INSCRIPTION_MS;
  return {
    lu: true,
    silence,
    abonnePayant,
    bandeau: !silence && !abonnePayant && !compteRecent,
    carteStock: silence ? null : abonnePayant ? 'discrete' : 'grande',
    cartes: !silence && !abonnePayant,
    popups: !silence,
  };
}

// ── Le magasin partagé (posé par App, lu par les cartes) ─────────────────────────────────────────────────────────
let etat = propositionsCloud({ lu: false });
const abonnes = new Set();
export function poserPropositionsCloud(e) {
  const suivant = e && typeof e === 'object' ? e : propositionsCloud({ lu: false });
  if (JSON.stringify(suivant) === JSON.stringify(etat)) return;
  etat = suivant;
  abonnes.forEach((f) => { try { f(); } catch { /* un écran qui casse ne casse pas les autres */ } });
}
export const lirePropositionsCloud = () => etat;
const abonner = (f) => { abonnes.add(f); return () => abonnes.delete(f); };
/** Le hook des cartes : { lu, silence, abonnePayant, bandeau, carteStock, cartes, popups }. */
export function usePropositionsCloud() {
  return useSyncExternalStore(abonner, lirePropositionsCloud, lirePropositionsCloud);
}

// ── Le dernier paiement, gardé sur l'appareil (cache d'affichage ; la base fait foi) ─────────────────────────────
export const cleDernierPaiement = (userId) => `fs_dernier_paiement:${userId}`;
export function noterPaiementLocal(userId, ms = Date.now(), stockage = globalThis.localStorage) {
  if (!userId) return;
  try { stockage?.setItem(cleDernierPaiement(userId), String(ms)); } catch { /* affichage seul */ }
}
export function lirePaiementLocal(userId, stockage = globalThis.localStorage) {
  if (!userId) return null;
  try { const v = Number(stockage?.getItem(cleDernierPaiement(userId))); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
}
/** Le plus récent de deux instants (ms), null si aucun. */
export const plusRecent = (a, b) => {
  const x = Number(a); const y = Number(b);
  const ok = (v) => Number.isFinite(v) && v > 0;
  if (ok(x) && ok(y)) return Math.max(x, y);
  return ok(x) ? x : ok(y) ? y : null;
};
