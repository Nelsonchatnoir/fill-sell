// Le palier d'un compte : la règle vit dans supabase/functions/_shared/palier.js
// depuis le 05/10 (une seule source pour l'app, les fonctions edge et, en SQL,
// palier_de / palier_au_moins). Ce fichier garde les imports de l'app.
export * from "../../supabase/functions/_shared/palier.js";
// (05/10) Les règles de l'option Cloud ci-dessous (affichage de l'app) en ont
// besoin ; la même règle côté serveur est cloud_etat (20261004233000).
import { aAuMoins, palierDuProfil, droitsDuPalier } from "../../supabase/functions/_shared/palier.js";

// ═══════════════════════════════════════════════════════════════════════════
// L'OPTION CLOUD — « SANS ORDINATEUR » (conception du 04/10/2026, NON LIVRÉE)
// ═══════════════════════════════════════════════════════════════════════════
// Décisions FINALES de Nico (04/10 soir) : le Cloud n'est PAS un 4e palier.
// C'est une OPTION à 20 €/mois, essai gratuit de 7 jours (carte demandée), un
// seul essai par personne. Elle se prend SEULE sur un compte Free (qui garde
// ses quotas Free) ou EN PLUS de Premium, Pro ou Business. Résilier la formule
// ne l'arrête pas : le compte repasse en Free + Sans ordinateur.
//
// Les colonnes lues (migration 20261004233000_option_cloud_paiements.sql ;
// le pool d'IP dédiées les suit : 20261005120000_cloud_socle_ip_dediee.sql) :
//   · is_cloud                — option PAYÉE, posée par les flux de paiement
//                               comme is_premium (jamais par l'app) ;
//   · cloud_essai_debut       — début de l'essai (null = jamais d'essai) ;
//   · cloud_essai_fin         — fin de l'essai (début + 7 jours ; ramenée à
//                               l'instant de l'arrêt si la personne l'arrête) ;
//   · cloud_essai_arrete      — l'essai a été arrêté par la personne (effet
//                               IMMÉDIAT, rien n'est facturé) ;
//   · cloud_periode_fin       — fin de la période payée en cours ;
//   · cloud_arret_fin_periode — arrêt demandé une fois payée : l'option
//                               tourne jusqu'à cloud_periode_fin, puis s'arrête.
// MÊME RÈGLE QUE LE SERVEUR : `cloud_etat(p_user)` (20261004233000). C'est
// le serveur qui décide si un navigateur Cloud tourne ; ce calcul sert à
// l'AFFICHAGE, et il ne doit jamais dire autre chose que le serveur.
//
// CLOUD_EXIGE_UN_PALIER reste comme interrupteur : à false (décision du 04/10
// soir), l'état « suspendu » n'est plus jamais rendu. Le repasser à true se
// fait ici ET dans cloud_etat, le même jour.

export const CLOUD_EXIGE_UN_PALIER = false;
export const CLOUD_ESSAI_JOURS = 7;
// Prix AFFICHÉ — le vrai vit chez Stripe / Apple / Google, comme PLAN_PRICES
// (ConversionModal). Il n'est vrai que si les trois canaux facturent 20 €.
export const CLOUD_PRIX_AFFICHE = '20 €';

const JOUR_MS = 86_400_000;
const instant = (v) => {
  if (v == null || v === '') return null;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/**
 * L'état Cloud d'une ligne `profiles`, jamais deviné.
 *   etat : 'aucun' | 'essai' | 'paye' | 'essai_termine' | 'suspendu'
 *   actif : un navigateur Cloud doit-il tourner pour ce compte ?
 *   essaiPris : l'essai a-t-il déjà été pris (un seul par compte) ?
 *   essaiArrete : l'essai a été arrêté par la personne (rien facturé) ;
 *   joursRestants : jours d'essai restants, arrondis au jour entamé (essai seul) ;
 *   avecFormule : un palier payant est-il pris en plus (sinon Free + option) ;
 *   periodeFin / arretPrevuLe : payée, la fin de période, et la date d'arrêt
 *   si l'arrêt a été demandé (elle tourne jusque-là).
 */
export function cloudDuProfil(p, maintenant = Date.now()) {
  const now = instant(maintenant) ?? Date.now();
  const debut = instant(p?.cloud_essai_debut);
  const fin = instant(p?.cloud_essai_fin);
  const essaiPris = debut != null;
  // Un essai arrêté par la personne s'arrête TOUT DE SUITE (fin ramenée à
  // l'arrêt côté serveur) ; le drapeau suffit, même si la fin n'a pas bougé.
  const essaiEnCours = debut != null && fin != null && debut <= now && now < fin && p?.cloud_essai_arrete !== true;
  const paye = p?.is_cloud === true;
  const avecFormule = aAuMoins(palierDuProfil(p), 'premium');
  const palierOk = !CLOUD_EXIGE_UN_PALIER || avecFormule;
  const periodeFin = instant(p?.cloud_periode_fin);
  const base = {
    essaiPris,
    essaiArrete: essaiPris && p?.cloud_essai_arrete === true,
    essaiFin: fin != null ? new Date(fin).toISOString() : null,
    joursRestants: null,
    avecFormule,
    periodeFin: paye && periodeFin != null ? new Date(periodeFin).toISOString() : null,
    arretPrevuLe: paye && p?.cloud_arret_fin_periode === true && periodeFin != null ? new Date(periodeFin).toISOString() : null,
  };
  if ((paye || essaiEnCours) && !palierOk) return { ...base, etat: 'suspendu', actif: false };
  if (paye) return { ...base, etat: 'paye', actif: true };
  if (essaiEnCours) {
    return { ...base, etat: 'essai', actif: true, joursRestants: Math.max(1, Math.ceil((fin - now) / JOUR_MS)) };
  }
  if (essaiPris && (p?.cloud_essai_arrete === true || (fin != null && now >= fin))) return { ...base, etat: 'essai_termine', actif: false };
  return { ...base, etat: 'aucun', actif: false };
}

/** Peut-on PROPOSER l'essai à ce compte ? Free compris (04/10 soir). L'appareil,
 *  les comptes de plateforme et la place se vérifient côté serveur AVANT le
 *  paiement (cloud_essai_preparer_moi), la carte au début de l'essai
 *  (cloud_essai_noter_carte) ; la carte est demandée avant tout essai. */
export function essaiCloudProposable(p, maintenant = Date.now()) {
  const c = cloudDuProfil(p, maintenant);
  return c.etat === 'aucun' && !c.essaiPris;
}

/** Les droits d'un compte : le palier (emboîté) + l'option Cloud. */
export function droitsDuCompte(p, maintenant = Date.now()) {
  const palier = palierDuProfil(p);
  return { palier, ...droitsDuPalier(palier), cloud: cloudDuProfil(p, maintenant) };
}
