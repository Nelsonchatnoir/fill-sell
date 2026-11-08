// ════════════════════════════════════════════════════════════════════════════
// LE BANDEAU « NOUVEAU · FillSell Cloud » DU TABLEAU — règles pures (08/11/2026 soir, point 4 de Nico : maquette B
// « Le relais » de https://claude.ai/artifact/KeD76ohqxxTNmmFEVsjVQh, clair seulement)
// ════════════════════════════════════════════════════════════════════════════
// Montré en haut du Tableau (web et iPhone) SEULEMENT si, tout à la fois :
//   · le Cloud se VEND sur cet appareil (cloudOffreVendable : offre ouverte, France, binaire qui porte le Cloud —
//     Android : la vc37 publiée par Google, jamais avant ; témoins compris) ;
//   · l'état du compte est LU et le compte n'a pas le Cloud (essai compris) ;
//   · le compte n'a JAMAIS eu le Cloud (essai déjà pris, arrêté, refusé, abonnement passé) : « Essayer 7 jours » y
//     mentirait (l'essai ne se reprend pas) ;
//   · il n'a pas été refermé (×) depuis moins de 7 jours SUR CET APPAREIL ;
//   · aucun autre écran ne le recouvre (parcours d'entrée, « Me connecter »).
// Tant qu'une de ces lectures manque : RIEN (jamais un bandeau qui apparaît puis disparaît).
// Mesure (usage_logs) : cloud_bandeau_vu (une fois par ouverture de l'app), cloud_bandeau_clic, cloud_bandeau_ferme ;
// l'achat qui suit garde sa trace habituelle (cloud_cta_click, origine « bandeau_tableau »).

// Les colonnes Cloud ne se lisent qu'à deux endroits (useCloudProfil, utils/palier.js — garde de selftest:cloud-ecrans) :
// « a déjà eu le Cloud » est calculé par palier.js.
import { aDejaEuLeCloud } from '../utils/palier.js';

export { aDejaEuLeCloud };
export const BANDEAU_CLOUD_PAUSE_MS = 7 * 24 * 3600 * 1000;
export const ORIGINE_BANDEAU_CLOUD = 'bandeau_tableau';
export const cleFermetureBandeauCloud = (userId) => `fs_bandeau_cloud_ferme:${userId}`;

/** La fermeture est-elle encore en cours (moins de 7 jours) ? (pur) Une valeur illisible ne ferme rien. */
export function fermetureEnCours(fermeLe, maintenant = Date.now()) {
  const f = Number(fermeLe);
  if (!Number.isFinite(f) || f <= 0) return false;
  return maintenant - f >= 0 && maintenant - f < BANDEAU_CLOUD_PAUSE_MS;
}

/**
 * LA règle d'affichage (pure).
 * @param {{ vendable: boolean, compteLu: boolean, clientCloud: boolean, profilLu: boolean, profil: object|null,
 *           fermeLe: number|string|null, ecranLibre: boolean, maintenant?: number }} e
 */
export function bandeauCloudVisible(e) {
  if (!e || e.vendable !== true || e.ecranLibre !== true) return false;
  if (e.compteLu !== true || e.clientCloud === true) return false;
  if (e.profilLu !== true || aDejaEuLeCloud(e.profil)) return false;
  if (fermetureEnCours(e.fermeLe, e.maintenant ?? Date.now())) return false;
  return true;
}

/** Lecture / écriture de la fermeture (stockage de l'appareil). Jamais d'exception. */
export function lireFermetureBandeauCloud(userId, stockage = globalThis.localStorage) {
  try { return userId && stockage ? stockage.getItem(cleFermetureBandeauCloud(userId)) : null; } catch { return null; }
}
export function noterFermetureBandeauCloud(userId, maintenant = Date.now(), stockage = globalThis.localStorage) {
  try { if (userId && stockage) stockage.setItem(cleFermetureBandeauCloud(userId), String(maintenant)); } catch { /* stockage indisponible */ }
  return maintenant;
}

/** Les textes (FR / EN). Aucun prix, jamais (règle de Nico). */
export function textesBandeauCloud(lang = 'fr') {
  return lang === 'en' ? {
    aria: 'New: FillSell Cloud',
    pastille: 'NEW',
    titre: 'FillSell Cloud',
    accroche: 'No computer needed',
    sous: 'Your computer goes off, FillSell Cloud takes over: your listings posted and bumped.',
    cta: 'Try 7 days',
    fermer: 'Close',
  } : {
    aria: 'Nouveau : FillSell Cloud',
    pastille: 'NOUVEAU',
    titre: 'FillSell Cloud',
    accroche: "Plus besoin d'ordinateur",
    sous: "Ton PC s'éteint, FillSell Cloud prend le relais : tes annonces publiées et remises en avant.",
    cta: 'Essayer 7 jours',
    fermer: 'Fermer',
  };
}
