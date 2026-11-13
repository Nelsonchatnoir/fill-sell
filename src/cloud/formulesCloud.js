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

/**
 * (12/11/2026, lot « zéro problème », point 4c de Nico) LE CANAL QUI FACTURE, PAS L'APPAREIL. Ce que l'écran peut faire
 * pour un compte dont l'abonnement (ou le Cloud seul) est facturé par `canalFacture`, vu dans l'app de `canalApp` (pur) :
 *   'ici'                 — même canal (ou aucun abonnement) : l'achat se fait ici ;
 *   'carte_sur_mobile'    — payé par carte, vu sur iPhone / Android : le changement se fait sur le web ;
 *   'boutique'            — facturé par l'App Store / Google Play, formules OUVERTES sur ce canal : dans l'app de ce téléphone ;
 *   'boutique_fermee'     — (13/11, décision de Nico : « on ouvre partout », les textes « … y arrivent bientôt » retirés)
 *                           facturé par une boutique dont l'interrupteur est FERMÉ (retour arrière seulement) : les formules
 *                           sont MASQUÉES pour ce compte, comme avant leur ouverture — ni carte, ni bouton, ni promesse ;
 *   'cloud_seul_boutique' — (13/11) le Cloud SEUL de ce compte est facturé par l'App Store / Google Play : une formule avec
 *                           Cloud serait un SECOND abonnement (Apple : deux groupes, « FillSell Cloud » et « FillSell Plan » ;
 *                           Google : le remplacement ne vise pas app.fillsell.cloud.sub) — formules MASQUÉES, sur tout appareil,
 *                           tant que Nico n'a pas décidé le passage (jamais deux abonnements).
 * `canalOuvert(canal)` : l'interrupteur serveur des formules de CE canal (formulesCloudOuvertes) ; absent = ouvert
 * (l'appel d'avant ne change pas). `canalCloud` : canalDuCloudSeul(lecture) (le canal du Cloud SEUL vivant), ou null.
 */
export function voieFormulesDuCompte({ canalApp = 'stripe', canalFacture = null, canalOuvert = () => true, canalCloud = null } = {}) {
  if (canalCloud === 'apple' || canalCloud === 'google') return 'cloud_seul_boutique';
  if (!canalFacture || canalFacture === canalApp) return 'ici';
  if (canalFacture === 'stripe') return 'carte_sur_mobile';
  if (canalFacture === 'apple' || canalFacture === 'google') return canalOuvert(canalFacture) === true ? 'boutique' : 'boutique_fermee';
  return 'ici';
}
/** (13/11) Les voies où les formules avec Cloud ne se montrent PAS à ce compte (aucune carte, aucun texte). */
export const VOIES_FORMULES_MASQUEES = Object.freeze(['boutique_fermee', 'cloud_seul_boutique']);
export const formulesMasqueesPourLaVoie = (voie) => VOIES_FORMULES_MASQUEES.includes(voie);

/**
 * (13/11/2026, dernière réponse de Nico — « une formule + le Cloud, c'est NORMAL et c'est ce qu'on veut vendre : par le pack
 * ou par le Cloud seul en complément, sur n'importe quel canal ») Réglages › Abonnement CACHE-t-il le bloc du Cloud seul ? (pur)
 *   formulesVisibles : formulesCloudVendables (les formules avec Cloud se montrent à ce compte) ;
 *   formuleActuelle  : profiles.cloud_formule (le compte a déjà un pack) ;
 *   cloudSeulEnCours : le Cloud seul est en essai ou payé (lecture Cloud) ;
 *   canalAbonnement  : canalAbonnementDuProfil — le canal qui facture une formule PAYANTE (null : aucune, offerte).
 * Formules fermées : le bloc d'avant (jamais caché ici). Ouvertes : caché à un compte qui a un pack (il a le Cloud), et à un
 * compte SANS formule payante qui n'a pas le Cloud seul (11/11 : il prend une formule avec Cloud) ; MONTRÉ à un abonné
 * payant (Stripe, App Store ou Google Play) sans Cloud — il ajoute le Cloud seul ici, sur le canal de cet appareil — et à
 * un client du Cloud seul (inchangé). Verrou : selftest:cloud-en-plus-de-formule.
 */
export function blocCloudSeulCache({ formulesVisibles = false, formuleActuelle = null, cloudSeulEnCours = false, canalAbonnement = null } = {}) {
  if (!formulesVisibles) return false;
  if (formuleActuelle != null) return true;
  if (cloudSeulEnCours) return false;
  return !(canalAbonnement === 'stripe' || canalAbonnement === 'apple' || canalAbonnement === 'google');
}

/** Le canal qui facture le CLOUD SEUL d'un compte (pur) : profiles.cloud_canal tant que ce Cloud est vivant (essai en cours
 *  ou payé, d'après la lecture Cloud), sinon null. */
export function canalDuCloudSeul(lecture) {
  const etat = lecture?.cloud?.etat;
  if (etat !== 'essai' && etat !== 'paye') return null;
  const c = lecture?.profil?.cloud_canal;
  return c === 'apple' || c === 'google' || c === 'stripe' ? c : null;
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
 *   (12/11, points 4c et 4d de Nico)
 *   canalOuvert     : (canal) => bool — l'interrupteur des formules du canal QUI FACTURE (formulesCloudOuvertes) ;
 *   canalCloud      : canalDuCloudSeul(lecture) — le canal qui facture le Cloud SEUL d'un compte sans formule ;
 *   essaiEnCours    : un essai (formule avec Cloud ou Cloud seul) est en cours sur ce compte (lecture Cloud).
 * Rend { cartes: [...], founder: bool, essaiAffiche: bool, voie }. Une carte :
 *   { formule, palier, misEnAvant, maFormule, actuelle, essai, pastille, cta, note, lignePrix, achetable, enLecture, canalFacture }
 *   cta       : 'essai' | 'essai_abonne' | 'ajouter' | 'passer' | null (formule déjà prise)
 *   note      : 'prorata' | 'note_essai' | 'boutique' (son abonnement App Store / Google Play) | 'carte_sur_mobile'
 *               | 'essai_continue' (web, pendant l'essai : l'essai continue, le 1er débit au prix choisi)
 *               | 'essai_arrete' (web, pendant l'essai, vers Business + Cloud : l'essai s'arrête, payé aujourd'hui)
 *               | 'essai_boutique' (iPhone / Android, pendant l'essai : la boutique peut l'arrêter, elle montre le montant)
 *               | null
 *   lignePrix : 'essai' (« Puis {P}/mois… 0 € aujourd'hui… ») | 'simple' (« {P}/mois, sans engagement. »)
 */
export function cartesFormulesCloud({
  palier = 'gratuit', formuleActuelle = null, canalApp = 'stripe', canalAbonnement = null, essaiPermis = null,
  essaiBoutique = () => true, businessVisible = true, founder = false,
  canalOuvert = () => true, canalCloud = null, essaiEnCours = false,
} = {}) {
  // (13/11, point b de Nico) La boutique dit 'oui' | 'non' | 'inconnu' (lib/prixBoutique.js etatEssaiBoutique) ; un
  // booléen (appel d'avant) vaut 'oui' / 'non'. Jamais « 7 jours gratuits » sans un 'oui'.
  const etatBoutique = (f) => { const v = essaiBoutique(f); return v === true || v === 'oui' ? 'oui' : v === 'inconnu' ? 'inconnu' : 'non'; };
  const rangIci = RANG_PALIER[palier] ?? 0;
  const actuelle = FORMULES_CLOUD.includes(formuleActuelle) ? formuleActuelle : null;
  const plancher = Math.max(rangIci, actuelle ? rangFormule(actuelle) : 0);
  const abonne = rangIci >= 1;
  // Un compte vu sur un AUTRE canal que celui qui le facture (sa formule, ou son Cloud seul) : rien ne s'achète ici
  // (jamais deux abonnements). (12/11, 4c) La note suit le canal QUI FACTURE et son interrupteur, jamais l'appareil.
  const canalFacture = (abonne && canalAbonnement != null ? canalAbonnement : null) ?? canalCloud ?? null;
  // Le Cloud d'une formule avec Cloud (formuleActuelle) n'est pas un Cloud SEUL : seul ce dernier masque les formules.
  const voie = voieFormulesDuCompte({ canalApp, canalFacture, canalOuvert, canalCloud: actuelle ? null : canalCloud });
  // (13/11, décision de Nico) Plus aucun « … y arrivent bientôt » : une voie masquée ne rend AUCUNE carte (l'hôte cache la
  // position « Avec Cloud » : formulesMasqueesPourLaVoie).
  if (formulesMasqueesPourLaVoie(voie)) return { cartes: [], founder: false, essaiAffiche: false, voie };
  const autreCanal = voie !== 'ici';
  const noteAutreCanal = autreCanal ? voie : null;
  const cartes = FORMULES_CLOUD
    .filter((f) => rangFormule(f) >= plancher && (f !== 'business_cloud' || businessVisible || palier === 'business'))
    .map((f) => {
      const estActuelle = actuelle === f;
      const maFormule = abonne && !actuelle && PALIER_DE_FORMULE[f] === palier;
      // L'essai : la règle de la formule (contrat), le droit du compte (lu), la boutique (mobile). Un abonné ne
      // l'a que sur SA formule, et seulement sur le web (Stripe : il ne paie que sa formule pendant 7 jours).
      const boutique = canalApp === 'stripe' ? 'oui' : etatBoutique(f);
      const droitEssai = essaiPossiblePourFormule(f) && essaiPermis === true && boutique === 'oui' && !estActuelle && !autreCanal;
      const essai = droitEssai && (!abonne || (maFormule && canalApp === 'stripe'));
      const cta = estActuelle ? null
        : f === 'business_cloud' ? 'passer'
          : maFormule ? (essai ? 'essai_abonne' : 'ajouter')
            : essai ? 'essai' : 'passer';
      // (13/11, demande de Nico : « quelle formule, quel prix, essai ou pas, date du premier prélèvement, AVANT de
      // valider ») La ligne de prix d'une souscription NEUVE dit quand part le premier prélèvement, d'après la règle du
      // canal : 'essai' (0 aujourd'hui, le prix à J+7) ; 'aujourdhui' (pas d'essai : le prix aujourd'hui) ;
      // 'semaine_sans_droits' (boutique qui offre sa semaine à un compte dont l'essai FillSell a servi : rien prélevé 7
      // jours, la formule démarre au 1er paiement — décision 8) ; 'essai_incertain' / 'semaine_incertaine' (iPhone,
      // historique Apple illisible : les deux issues dites, Apple tranche dans sa feuille) ; 'simple' (lecture en cours,
      // abonné, essai en cours : la note dit le reste).
      let lignePrix = cta === 'essai' ? 'essai' : 'simple';
      if (cta === 'passer' && !abonne && !autreCanal && !essaiEnCours && !(essaiPossiblePourFormule(f) && essaiPermis === null)) {
        const F = essaiPossiblePourFormule(f);
        if (canalApp !== 'stripe' && F && boutique === 'oui' && essaiPermis === false) lignePrix = 'semaine_sans_droits';
        else if (canalApp !== 'stripe' && F && boutique === 'inconnu') lignePrix = essaiPermis === true ? 'essai_incertain' : 'semaine_incertaine';
        else lignePrix = 'aujourdhui';
      }
      let note = null;
      if (!estActuelle) {
        if (noteAutreCanal) note = noteAutreCanal;
        // (12/11, 4d) PENDANT UN ESSAI, chaque texte dit ce que fait le serveur : web — l'essai continue (formule avec
        // essai, aucun prorata) ou s'arrête et la formule est payée aujourd'hui (Business + Cloud) ; boutique — c'est elle
        // qui décide, elle montre le montant avant de valider.
        else if (essaiEnCours && cta === 'passer') note = canalApp === 'stripe' ? (essaiPossiblePourFormule(f) ? 'essai_continue' : 'essai_arrete') : 'essai_boutique';
        else if (abonne && canalAbonnement != null) note = canalApp === 'stripe' ? (cta === 'essai_abonne' ? 'note_essai' : 'prorata') : 'boutique';
      }
      return {
        formule: f, palier: PALIER_DE_FORMULE[f], misEnAvant: f === FORMULE_MISE_EN_AVANT, maFormule, actuelle: estActuelle,
        essai, pastille: cta === 'essai', cta, note, lignePrix, boutique,
        achetable: cta != null && !autreCanal, enLecture: essaiPermis === null && f !== 'business_cloud' && cta != null,
        canalFacture: autreCanal ? canalFacture : null,
      };
    });
  return {
    cartes,
    founder: Boolean(founder) && abonne && !actuelle,
    essaiAffiche: cartes.some((c) => c.pastille),
    voie,
  };
}

/** La boutique d'un canal, pour « ton abonnement {App Store|Google Play} » ; null pour la carte. */
export const nomBoutique = (canal) => (canal === 'apple' ? 'App Store' : canal === 'google' ? 'Google Play' : null);

/**
 * (12/11, points 4c et 4d) Le texte de la note d'une carte (pur) : la fenêtre d'offres et Réglages › Abonnement disent la
 * MÊME chose. T = textesFormules(lang) ; nom / prix : ceux de la carte ; essaiFin : la fin de l'essai EN COURS (date
 * écrite) ; finEssai : la fin d'un essai qui commencerait maintenant (note_essai).
 */
export function texteNoteCarte(carte, { T, palierIci = null, echeance = null, finEssai = null, essaiFin = null, canalApp = 'stripe', nom = '', prix = '' } = {}) {
  switch (carte?.note) {
    // (13/11) Stripe, montée hors essai : create-checkout-session `proration_behavior: "always_invoice"` — la différence
    // est facturée et prélevée TOUT DE SUITE ; le texte le dit, avec le prix ensuite.
    case 'prorata': return T.prorata(echeance, prix);
    case 'note_essai': return T.noteEssai(palierIci ?? '', nom, finEssai ?? '', echeance ?? '');
    // (13/11, point c de Nico) Un abonné de la boutique de CE téléphone : pas d'essai (Apple : « Existing subscribers are
    // not eligible » ; Google : l'offre d'essai ne vaut que pour qui n'a jamais eu d'abonnement), et le texte dit quand le
    // prélèvement part (Apple : montée immédiate, le prix entier aujourd'hui ; Google : CHARGE_PRORATED_PRICE, la
    // différence au prorata aujourd'hui, le prix entier à l'échéance habituelle). Vu ailleurs (achat impossible ici) :
    // la phrase d'avant, qui dit où.
    case 'boutique': return carte.achetable && (canalApp === 'apple' || canalApp === 'google')
      ? T.boutiqueMontee(canalApp, prix)
      : T.boutique(nomBoutique(carte.achetable ? canalApp : carte.canalFacture) ?? 'App Store');
    case 'carte_sur_mobile': return T.carteSurMobile;
    case 'essai_continue': return T.essaiContinue(essaiFin, nom, prix);
    case 'essai_arrete': return T.essaiArrete(nom, prix);
    case 'essai_boutique': return T.essaiBoutique(nomBoutique(canalApp) ?? 'App Store', prix, canalApp);
    default: return null;
  }
}
/** (13/11) La ligne de prix d'une carte (pur) : la fenêtre d'offres et le parcours d'entrée disent la même chose. */
export function texteLignePrix(carte, { T, nom = '', prix = '', zero = '0 €', canalApp = 'stripe' } = {}) {
  const b = nomBoutique(canalApp) ?? 'App Store';
  switch (carte?.lignePrix) {
    case 'essai': return T.lignePrixEssai(prix, zero);
    case 'aujourdhui': return T.lignePrixAujourdhui(prix);
    case 'semaine_sans_droits': return T.lignePrixSemaineSansDroits(nom, prix, b);
    case 'essai_incertain': return T.lignePrixEssaiIncertain(prix);
    case 'semaine_incertaine': return T.lignePrixSemaineIncertaine(nom, prix);
    default: return T.lignePrix(prix);
  }
}
/** Les abonnements d'une boutique, pour « tes abonnements {Apple|Google Play} » (Réglages). */
export const nomAbonnementsBoutique = (canal) => (canal === 'apple' ? 'Apple' : canal === 'google' ? 'Google Play' : null);

/** La formule avec Cloud plus basse (Premium + Cloud) et plus haute que celle-ci, pour la fin d'essai (pure). */
export const formuleInferieure = (f) => (f === 'pro_cloud' ? 'premium_cloud' : f === 'business_cloud' ? 'pro_cloud' : null);
/** Rang de prix d'un produit (formule seule ou avec Cloud) — Business + Cloud > Business > Pro + Cloud > Premium + Cloud >
 *  Pro > Premium, l'ordre des niveaux du groupe Apple « FillSell Plan » (relu le 11/11) : une montée ou une descente. */
export const RANG_PRIX = Object.freeze({ premium: 1, pro: 2, premium_cloud: 3, pro_cloud: 4, business: 5, business_cloud: 6 });
