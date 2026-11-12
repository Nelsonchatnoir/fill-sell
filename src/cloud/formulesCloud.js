// ═══════════════════════════════════════════════════════════════════════════
// LES FORMULES AVEC CLOUD — CE QUE LES ÉCRANS DÉCIDENT (11/11/2026, décisions de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Fonctions PURES (aucun React, aucun réseau) : la fenêtre d'offres (ConversionModal), le parcours d'entrée, Réglages ›
// Abonnement et la fin d'essai lisent ce qu'elles rendent ; scripts/formules-cloud-offres-selftest.mjs les exécute.
// Le contrat (formules, essai, supplément, produits, interrupteurs) vient de supabase/functions/_shared/formules-cloud.js
// par config/cloudOffer.js. Le point de décision « les formules se montrent-elles ? » est formulesCloudVendables
// (config/cloudOffer.js) : FERMÉ, aucune de ces fonctions n'est appelée par un écran.
//
// ⛔ ESSAI : 7 jours sur Premium + Cloud et Pro + Cloud SEULEMENT, et seulement quand l'état Cloud LU dit que l'essai
//    n'a jamais été pris (le parcours d'aujourd'hui : la préparation serveur et ses verrous tranchent ensuite, au geste)
//    et, sur iPhone / Android, que la boutique propose une semaine gratuite pour CE produit. Business + Cloud : jamais —
//    ni pastille, ni « Essayer », ni « 0 € aujourd'hui » ; son bouton dit « Passer à Business + Cloud ».
// ⛔ JAMAIS DEUX ABONNEMENTS : un abonné change sur SON canal. Vu ailleurs, la carte le dit et n'achète rien.
import {
  FORMULES_CLOUD, PALIER_DE_FORMULE, FORMULE_MISE_EN_AVANT, essaiPossiblePourFormule,
} from '../../supabase/functions/_shared/formules-cloud.js';

export const RANG_PALIER = Object.freeze({ gratuit: 0, free: 0, premium: 1, pro: 2, business: 3 });
const rangFormule = (f) => RANG_PALIER[PALIER_DE_FORMULE[f]] ?? 0;

// ── La position de l'interrupteur « Sans Cloud | Avec Cloud » ───────────────────────────────────────────────────────
// Le parcours d'entrée note la voie choisie (« As-tu un ordinateur ? ») : avec ordinateur → « Sans Cloud », sans → « Avec
// Cloud ». Une préférence d'AFFICHAGE (localStorage, try/catch) : la base n'en dépend jamais.
export const CLE_VUE_OFFRES = 'fs_offres_vue';
export function noterVueOffres(vue, stockage = globalThis.localStorage) {
  try { if (vue === 'avec' || vue === 'sans') stockage?.setItem(CLE_VUE_OFFRES, vue); } catch { /* affichage seul */ }
}
export function lireVueOffres(stockage = globalThis.localStorage) {
  try { const v = stockage?.getItem(CLE_VUE_OFFRES); return v === 'avec' || v === 'sans' ? v : null; } catch { return null; }
}
/**
 * La position de départ (pure) : la demande explicite de l'hôte d'abord ; un compte qui a déjà le Cloud (essai, payé,
 * formule avec Cloud) ou une ouverture depuis une porte Cloud (trigger 'cloud') → « Avec Cloud » ; sinon la voie
 * notée par le parcours d'entrée ; sinon « Sans Cloud ».
 */
export function vueOffresParDefaut({ demande = null, trigger = null, choixEntree = null, cloudActif = false } = {}) {
  if (demande === 'avec' || demande === 'sans') return demande;
  if (cloudActif) return 'avec';
  if (trigger === 'cloud') return 'avec';
  if (choixEntree === 'avec' || choixEntree === 'sans') return choixEntree;
  return 'sans';
}

/** Le canal qui facture la formule d'un compte (APPROXIMATION d'affichage : le serveur tranche et refuse un second
 *  abonnement) : Google Play, App Store, carte (Stripe), ou null (aucun, offert, géré à la main). Pur. */
export function canalAbonnementDuProfil(p) {
  if (!p || !(p.is_premium === true || p.is_pro === true || p.is_business === true)) return null;
  if (p.google_purchase_token) return 'google';
  if (p.apple_original_transaction_id) return 'apple';
  if (p.stripe_customer_id) return 'stripe';
  return null;
}

/** L'essai d'une formule avec Cloud est-il permis à CE compte, d'après l'état Cloud LU (useCloudProfil) ? (pur)
 *  true / false ; null tant que la lecture n'a pas répondu (jamais un essai promis sans lecture sûre). */
export function essaiPermisDuCompte(lecture) {
  if (!lecture || lecture.etat === 'lecture') return null;
  if (lecture.etat !== 'ok' || !lecture.cloud) return false;
  return lecture.cloud.etat === 'aucun' && lecture.cloud.essaiPris !== true;
}

/**
 * Les cartes « Avec Cloud » pour CE compte (pure, testée).
 *   palier          : 'gratuit' | 'premium' | 'pro' | 'business' (palierDesDrapeaux)
 *   formuleActuelle : la formule avec Cloud que porte déjà l'abonnement (profiles.cloud_formule), ou null
 *   canalApp        : 'stripe' (web) | 'apple' (iPhone) | 'google' (Android) — canalDeVente
 *   canalAbonnement : canalAbonnementDuProfil(profil)
 *   essaiPermis     : essaiPermisDuCompte(lecture) — true | false | null
 *   essaiBoutique   : (formule) => bool — mobile : la boutique propose-t-elle une semaine gratuite pour ce produit ?
 *   businessVisible : l'offre Business est-elle ouverte à ce compte (businessOfferVisible) ?
 *   founder         : profiles.is_founder
 * Rend { cartes: [...], founder: bool, essaiAffiche: bool }. Une carte :
 *   { formule, palier, misEnAvant, maFormule, actuelle, essai, pastille, cta, note, lignePrix, achetable, enLecture }
 *   cta       : 'essai' | 'essai_abonne' | 'ajouter' | 'passer' | null (formule déjà prise)
 *   note      : 'prorata' | 'note_essai' | 'boutique' (son abonnement App Store / Google Play) | 'carte_sur_mobile' | null
 *   lignePrix : 'essai' (« Puis {P}/mois… 0 € aujourd'hui… ») | 'simple' (« {P}/mois, sans engagement. »)
 */
export function cartesFormulesCloud({
  palier = 'gratuit', formuleActuelle = null, canalApp = 'stripe', canalAbonnement = null, essaiPermis = null,
  essaiBoutique = () => true, businessVisible = true, founder = false,
} = {}) {
  const rangIci = RANG_PALIER[palier] ?? 0;
  const actuelle = FORMULES_CLOUD.includes(formuleActuelle) ? formuleActuelle : null;
  const plancher = Math.max(rangIci, actuelle ? rangFormule(actuelle) : 0);
  const abonne = rangIci >= 1;
  // Un abonné vu sur un AUTRE canal que celui qui le facture : rien ne s'achète ici (jamais deux abonnements).
  const autreCanal = abonne && canalAbonnement != null && canalAbonnement !== canalApp;
  const noteAutreCanal = autreCanal ? (canalAbonnement === 'stripe' ? 'carte_sur_mobile' : 'boutique') : null;
  const cartes = FORMULES_CLOUD
    .filter((f) => rangFormule(f) >= plancher && (f !== 'business_cloud' || businessVisible || palier === 'business'))
    .map((f) => {
      const estActuelle = actuelle === f;
      const maFormule = abonne && !actuelle && PALIER_DE_FORMULE[f] === palier;
      // L'essai : la règle de la formule (contrat), le droit du compte (lu), la boutique (mobile). Un abonné ne
      // l'a que sur SA formule, et seulement sur le web (Stripe : il ne paie que sa formule pendant 7 jours).
      const droitEssai = essaiPossiblePourFormule(f) && essaiPermis === true && essaiBoutique(f) === true && !estActuelle && !autreCanal;
      const essai = droitEssai && (!abonne || (maFormule && canalApp === 'stripe'));
      const cta = estActuelle ? null
        : f === 'business_cloud' ? 'passer'
          : maFormule ? (essai ? 'essai_abonne' : 'ajouter')
            : essai ? 'essai' : 'passer';
      let note = null;
      if (!estActuelle) {
        if (noteAutreCanal) note = noteAutreCanal;
        else if (abonne && canalAbonnement != null) note = canalApp === 'stripe' ? (cta === 'essai_abonne' ? 'note_essai' : 'prorata') : 'boutique';
      }
      return {
        formule: f, palier: PALIER_DE_FORMULE[f], misEnAvant: f === FORMULE_MISE_EN_AVANT, maFormule, actuelle: estActuelle,
        essai, pastille: cta === 'essai', cta, note, lignePrix: cta === 'essai' ? 'essai' : 'simple',
        achetable: cta != null && !autreCanal, enLecture: essaiPermis === null && f !== 'business_cloud' && cta != null,
      };
    });
  return {
    cartes,
    founder: Boolean(founder) && abonne && !actuelle,
    essaiAffiche: cartes.some((c) => c.pastille),
  };
}

/** La boutique d'un canal, pour « ton abonnement {App Store|Google Play} » ; null pour la carte. */
export const nomBoutique = (canal) => (canal === 'apple' ? 'App Store' : canal === 'google' ? 'Google Play' : null);
/** Les abonnements d'une boutique, pour « tes abonnements {Apple|Google Play} » (Réglages). */
export const nomAbonnementsBoutique = (canal) => (canal === 'apple' ? 'Apple' : canal === 'google' ? 'Google Play' : null);

/** La formule avec Cloud plus basse (Premium + Cloud) et plus haute que celle-ci, pour la fin d'essai (pure). */
export const formuleInferieure = (f) => (f === 'pro_cloud' ? 'premium_cloud' : f === 'business_cloud' ? 'pro_cloud' : null);
/** Rang de prix d'un produit (formule seule ou avec Cloud) — Business + Cloud > Business > Pro + Cloud > Premium + Cloud >
 *  Pro > Premium, l'ordre des niveaux du groupe Apple « FillSell Plan » (relu le 11/11) : une montée ou une descente. */
export const RANG_PRIX = Object.freeze({ premium: 1, pro: 2, premium_cloud: 3, pro_cloud: 4, business: 5, business_cloud: 6 });
