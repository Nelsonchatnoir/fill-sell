// ═══════════════════════════════════════════════════════════════════════════
// UN SEUL ESSAI CLOUD PAR PERSONNE, TOUTES FORMULES ET TOUS CANAUX (16/11/2026, règle de Nico) — pur, Node + Deno + app
// ═══════════════════════════════════════════════════════════════════════════
// Mot pour mot : « Règle unique, identique web, iPhone et Android : UN SEUL essai Cloud par personne, toutes formules
// confondues. Un client qui n'a jamais eu d'essai Cloud y a droit, même s'il est déjà abonné Premium ou Pro sans Cloud. Un
// client qui a déjà eu un essai Cloud (Premium + Cloud, Pro + Cloud, ou sur un autre canal) n'en a JAMAIS un deuxième :
// s'il passe de Premium + Cloud à Pro + Cloud, il paie directement. » Elle remplace la « décision b » du 16/11 midi (la
// semaine de la boutique ouverte quels que soient les verrous FillSell) en ce qu'elle exige NOTRE vérification ; elle en
// garde l'esprit : jamais une semaine sans service. Donc la vérification se fait AVANT la feuille de la boutique (une
// boutique qui accorde quand même sa semaine ouvre le service : verdictEssaiStore, droitsAchatBoutique — inchangés).
//
// 1. LE REGISTRE (essaiCloudDejaEu) — « cette personne a-t-elle déjà eu un essai Cloud ? », lu dans la base RÉELLE :
//    · profiles.cloud_essai_debut (non nul = un essai a commencé, tous canaux : Stripe — Cloud seul, formule, essai
//      d'abonné —, Apple et Google — Cloud seul ou formule ; jamais effacé : « L'essai pris reste écrit ») ; c'est ce que
//      rend la préparation (cloud_essai_preparer_moi : raison « essai_deja_pris », lue en prod le 16/11) et
//      cloud_essai_permis ;
//    · l'historique Stripe du client (abonnement Cloud seul, formule ou essai d'abonné portant un essai :
//      essaiCloudPermis de cloud-option.js, passé ici en `essaiStripe` par le serveur — l'app ne lit pas Stripe) ;
//    · le verrou de CARTE (cloud_essai_noter_carte) : l'essai refusé pour une carte déjà vue est annulé par
//      stripe-webhook, qui date l'essai dans profiles (cloud_essai_debut + cloud_essai_arrete) : il est donc compté.
//    Les VERROUS d'appareil et de compte de plateforme (cloud_essai_empreintes, cloud_essai_demandes) ne sont PAS le
//    registre : ce sont des indices « même personne, autre compte FillSell ». Ils jouent sur le web (Stripe : FillSell
//    donne l'essai lui-même), comme avant ; sur iPhone / Android, la boutique tient déjà son registre par identifiant
//    Apple / compte Google, et la décision b du 16/11 (test5 de Nico, appareil_deja_vu) les a retirés — gardé tel quel,
//    proposé à Nico (rapport).
// 2. LA DÉCISION PAR CANAL (decisionEssaiCloud) :
//    · web (Stripe) : l'essai si jamais eu (et aucun verrou), sinon payé tout de suite — le serveur décide
//      (create-checkout-session : essaiCloudPermis + cloud_essai_permis) ;
//    · Android : binaire ≥ 2.9.205 (vc39, offerChoice) → l'offre « essai » si jamais eu et que Google la propose, sinon
//      l'offre « base » (payé tout de suite) ; binaire plus ancien (il prend la PREMIÈRE offre du forfait, essai ou non)
//      → si Google propose une offre d'essai pour ce produit, REFUS avant la feuille (« Mets à jour FillSell ») : ni la
//      semaine due ni l'absence de 2e semaine ne seraient garanties ;
//    · iPhone : Apple applique SEULE son offre d'introduction (par identifiant Apple et par groupe) et le binaire en vente
//      (2.9.164) ne sait pas la retirer → quand Apple offrirait sa semaine (ou qu'on ne sait pas lire son historique) à
//      une personne qui a déjà eu son essai FillSell, REFUS avant la feuille ; sinon la feuille s'ouvre (Apple dit
//      l'essai ou le prix). Un abonné du groupe « FillSell Plan » n'a jamais la semaine d'une formule : son essai passe
//      par le Cloud seul (groupe « FillSell Cloud »), comme sur Android.
//    · ⛔ Business + Cloud : jamais d'essai, sur aucun canal.
// Aucune dépendance (sauf le contrat des formules), aucun appel réseau, aucune écriture.
import { essaiPossiblePourFormule } from './formules-cloud.js';

/** Le binaire Android qui NOMME l'offre de Google (patches/@capgo+native-purchases+8.3.3.patch, vc39, publié le 16/11). */
export const ANDROID_BINAIRE_OFFRE_NOMMEE = '2.9.205';
/** La raison de la préparation qui dit « essai déjà eu » (cloud_essai_preparer_moi : profiles.cloud_essai_debut). */
export const RAISON_ESSAI_DEJA_EU = 'essai_deja_pris';
/** Les verrous anti-abus de la préparation (indices, pas le registre) : web seulement. */
export const VERROUS_ESSAI = Object.freeze(['appareil_deja_vu', 'compte_plateforme_deja_vu', 'appareil_inconnu']);

/** Un produit qui peut porter un essai Cloud : le Cloud seul, Premium + Cloud, Pro + Cloud — jamais Business + Cloud. */
export const produitAvecEssai = (produit) => produit === 'cloud' || essaiPossiblePourFormule(produit);

/** Compare deux versions « a.b.c » (pur) : -1 | 0 | 1, ou null si l'une est illisible. */
export function comparerVersionsBinaire(a, b) {
  const lire = (v) => (/^\d+(\.\d+)*$/.test(String(v ?? '').trim()) ? String(v).trim().split('.').map(Number) : null);
  const x = lire(a), y = lire(b);
  if (!x || !y) return null;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}
/** Le binaire Android sait-il nommer l'offre de Google ? true | false | null (version illisible — impossible au moment
 *  d'un achat : la vente est bornée au binaire lu, config/cloudOffer.js). */
export function androidNommeLOffre(binaire) {
  const c = comparerVersionsBinaire(binaire, ANDROID_BINAIRE_OFFRE_NOMMEE);
  return c === null ? null : c >= 0;
}

/**
 * LE REGISTRE : cette personne a-t-elle déjà eu un essai Cloud ? (pur)
 *   profil       : (serveur) une ligne profiles (au moins cloud_essai_debut) — une clé ABSENTE = non lue ;
 *   etatServeur  : (app) la réponse de cloud_etat_moi (`essaiPris` = profiles.cloud_essai_debut non nul, lu par le serveur :
 *                  l'app ne lit jamais les colonnes Cloud elle-même, verrou selftest:cloud-ecrans) ;
 *   preparation  : la réponse de cloud_essai_preparer_moi ({ ok, essai, raison }) ;
 *   essaiStripe  : (serveur) l'historique Stripe porte un essai Cloud — !essaiCloudPermis({}, abonnements, prix).
 * Rend { deja: true | false | null, sources } — null = rien de lu (aucune décision de refus ne s'y fonde).
 */
export function essaiCloudDejaEu({ profil = null, etatServeur = null, preparation = null, essaiStripe = null } = {}) {
  const sources = [];
  let lu = false;
  if (profil && typeof profil === 'object' && 'cloud_essai_debut' in profil) {
    lu = true;
    // (16/11, prod relue : 12 profils datés, 0 essai « arrêté » sans date de début) La date de début seule fait foi, comme
    // cloud_essai_preparer_moi, cloud_essai_permis, cloud_etat et essaiCloudPermis : un essai arrêté (carte, remboursement)
    // est daté.
    if (profil.cloud_essai_debut != null) sources.push('profil');
  }
  if (etatServeur && typeof etatServeur === 'object' && typeof etatServeur.essaiPris === 'boolean') {
    lu = true;
    if (etatServeur.essaiPris) sources.push('etat');
  }
  if (preparation && preparation.ok !== false && typeof preparation.essai === 'boolean') {
    lu = true;
    if (preparation.essai === false && preparation.raison === RAISON_ESSAI_DEJA_EU) sources.push('serveur');
  }
  if (typeof essaiStripe === 'boolean') {
    lu = true;
    if (essaiStripe) sources.push('stripe');
  }
  return { deja: sources.length ? true : (lu ? false : null), sources };
}

/**
 * LA DÉCISION, par canal (pur).
 *   canal     : 'stripe' | 'web' | 'apple' | 'google'
 *   produit   : 'cloud' | 'premium_cloud' | 'pro_cloud' | 'business_cloud'
 *   deja      : le registre (essaiCloudDejaEu().deja) — true | false | null (pas encore lu)
 *   verrou    : (web) la raison d'un verrou anti-abus de la préparation, ou null
 *   boutique  : (mobile) ce que la boutique ferait — Apple : 'oui' | 'non' | 'inconnu' (offre d'introduction, par
 *               groupe ; un abonné en cours du groupe : 'non') ; Google : 'oui' si une offre d'essai de CE produit est
 *               proposée à ce compte, sinon 'non'
 *   binaire   : (Android) la version du binaire
 *   remplacement : (Android) un abonnement Play est remplacé (jamais d'essai sur un remplacement : offre de base)
 * Rend { essai, issue: 'essai' | 'paye' | 'incertain' | 'refus', offre: 'essai' | 'base' | null, raison }.
 *   offre : ce que l'app demande à Google (binaire ≥ 2.9.205) ; null ailleurs (iPhone : Apple applique son offre).
 */
export function decisionEssaiCloud({ canal, produit, deja = null, verrou = null, boutique = null, binaire = null, remplacement = false } = {}) {
  const possible = produitAvecEssai(produit);
  if (canal === 'apple') {
    // Apple offrirait sa semaine (ou on ne sait pas) à une personne dont l'essai FillSell a servi : jamais un 2e essai.
    if (deja === true && possible && (boutique === 'oui' || boutique === 'inconnu')) {
      return { essai: false, issue: 'refus', offre: null, raison: boutique === 'oui' ? 'deuxieme_essai_apple' : 'deuxieme_essai_apple_incertain' };
    }
    if (!possible) return { essai: false, issue: 'paye', offre: null, raison: 'formule_sans_essai' };
    // Apple applique sa semaine seule : deja null (pas encore lu) ne refuse rien — le contrôle après la préparation tranche.
    if (boutique === 'oui') return { essai: true, issue: 'essai', offre: null, raison: null };
    if (boutique === 'inconnu') return { essai: false, issue: 'incertain', offre: null, raison: 'historique_apple_illisible' };
    return { essai: false, issue: 'paye', offre: null, raison: deja === true ? RAISON_ESSAI_DEJA_EU : 'boutique_sans_essai' };
  }
  if (canal === 'google') {
    const visible = boutique === 'oui';
    const nomme = androidNommeLOffre(binaire);
    // Un binaire qui prend la première offre du forfait, face à une offre d'essai proposée : rien n'est garanti.
    if (visible && nomme === false) return { essai: false, issue: 'refus', offre: null, raison: 'mettre_a_jour_android' };
    const essai = possible && deja === false && visible && remplacement !== true;
    const offre = nomme === false ? null : (essai ? 'essai' : 'base');
    return { essai, issue: essai ? 'essai' : 'paye', offre,
      raison: essai ? null : !possible ? 'formule_sans_essai' : deja === true ? RAISON_ESSAI_DEJA_EU : remplacement === true ? 'remplacement' : !visible ? 'boutique_sans_essai' : 'registre_non_lu' };
  }
  // Web : FillSell donne l'essai lui-même (Stripe) ; le serveur tranche (create-checkout-session).
  const essai = possible && deja !== true && !verrou;
  return { essai, issue: essai ? 'essai' : 'paye', offre: null,
    raison: essai ? null : !possible ? 'formule_sans_essai' : deja === true ? RAISON_ESSAI_DEJA_EU : verrou ?? null };
}

/** La phrase d'un refus AVANT la feuille de la boutique (une phrase, fr / en, aucune durée promise). nom : « Pro + Cloud »,
 *  « FillSell Cloud »… ; null pour une raison qui n'est pas un refus. */
export function texteRefusEssaiCloud(raison, { lang = 'fr', nom = 'FillSell Cloud' } = {}) {
  const en = lang === 'en';
  switch (raison) {
    case 'deuxieme_essai_apple':
      return en ? `Your FillSell Cloud free trial has already been used and the App Store would give you a second one, so ${nom} isn't available on iPhone for your account, and nothing was charged.`
        : `Ton essai gratuit FillSell Cloud a déjà servi et l'App Store t'en offrirait un second : ${nom} n'est donc pas disponible sur iPhone pour ton compte, et rien n'a été payé.`;
    case 'deuxieme_essai_apple_incertain':
      return en ? `Your FillSell Cloud free trial has already been used and the App Store might give you a second one, so ${nom} isn't available on iPhone for now, and nothing was charged.`
        : `Ton essai gratuit FillSell Cloud a déjà servi et l'App Store pourrait t'en offrir un second : ${nom} n'est donc pas disponible sur iPhone pour l'instant, et rien n'a été payé.`;
    case 'mettre_a_jour_android':
      return en ? `Update FillSell from Google Play to take ${nom}: this version of the app can't pick the right Google Play offer, and nothing was charged.`
        : `Mets à jour FillSell depuis Google Play pour prendre ${nom} : cette version de l'app ne sait pas choisir la bonne offre de Google Play, et rien n'a été payé.`;
    default:
      return null;
  }
}

/**
 * LES RÉGLAGES DES BOUTIQUES qui donnent EXACTEMENT la règle avec la vérification FillSell (données : le rapport, le
 * selftest). Google : un critère par offre d'essai, relu dans la Play Console le 16/11 (« avant ») ; Apple : rien à changer.
 *   Critères Google : 'jamais_eu_d_abonnement' (« Acquisition de nouveaux clients — N'ont jamais eu d'abonnement », dans
 *   l'app), 'jamais_eu_cet_abonnement' (« … — N'ont jamais eu cet abonnement »), 'mise_a_niveau', 'developpeur'
 *   (« Défini par le développeur »).
 */
export const REGLAGES_STORES = Object.freeze({
  google: Object.freeze([
    Object.freeze({ produit: 'app.fillsell.premium.cloud', offre: 'premium-cloud-trial-7d', avant: 'jamais_eu_d_abonnement', apres: 'jamais_eu_cet_abonnement' }),
    Object.freeze({ produit: 'app.fillsell.pro.cloud', offre: 'pro-cloud-trial-7d', avant: 'jamais_eu_d_abonnement', apres: 'jamais_eu_cet_abonnement' }),
    Object.freeze({ produit: 'app.fillsell.cloud.sub', offre: 'cloud-trial-3d', avant: 'jamais_eu_cet_abonnement', apres: 'jamais_eu_cet_abonnement' }),
    Object.freeze({ produit: 'app.fillsell.business.cloud', offre: null, avant: null, apres: null }),
  ]),
  apple: Object.freeze([
    Object.freeze({ produit: 'app.fillsell.premium.cloud', groupe: 'plan', introduction: 'FREE_TRIAL_1_SEMAINE', apres: 'inchange' }),
    Object.freeze({ produit: 'app.fillsell.pro.cloud', groupe: 'plan', introduction: 'FREE_TRIAL_1_SEMAINE', apres: 'inchange' }),
    Object.freeze({ produit: 'app.fillsell.cloud.sub', groupe: 'cloud', introduction: 'FREE_TRIAL_1_SEMAINE', apres: 'inchange' }),
    Object.freeze({ produit: 'app.fillsell.business.cloud', groupe: 'plan', introduction: null, apres: 'inchange' }),
  ]),
});
