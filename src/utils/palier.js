// ═══════════════════════════════════════════════════════════════════════════
// LE PALIER D'UN COMPTE — UN SEUL CALCUL, UTILISÉ PARTOUT (04/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Les paliers s'EMBOÎTENT : Business inclut tout ce qu'a Pro, Pro tout ce
// qu'a Premium. Un écran ne teste donc jamais un drapeau seul (`is_pro`,
// `palier === 'pro'`) : il demande « au moins Pro ? » (aAuMoins).
//
// Pourquoi (Louis, Business, 04/10) : l'app posait `isPro = profiles.is_pro`
// et plusieurs écrans testaient `palier === 'pro'` ou `isPro` seul. Un compte
// Business dont un drapeau manque, ou un état serveur pas encore arrivé, se
// voyait refuser ce qu'il paie (« Réservée au plan Pro »).
//
// MÊME ORDRE QUE LE SERVEUR : `republish_palier(p_user)` (business, puis pro,
// puis premium/comped, sinon free). Le premium reste l'expression canonique du
// 25/07 (is_premium OR is_pro OR is_comped) ; Business et Pro l'ouvrent
// d'office puisqu'ils l'incluent. ⛔ is_founder et les identifiants Apple /
// Google ne valent JAMAIS un palier (bug « premium fantôme » du 25/07).
//
// Les noms : 'gratuit' côté app ; le serveur dit 'free' — les deux se lisent.

export const PALIERS = Object.freeze(['gratuit', 'premium', 'pro', 'business']);
const RANG = Object.freeze({ gratuit: 0, free: 0, premium: 1, pro: 2, business: 3 });

/** Le palier d'une ligne `profiles` (ou de ses drapeaux), jamais deviné. */
export function palierDuProfil(p) {
  if (p?.is_business === true) return 'business';
  if (p?.is_pro === true) return 'pro';
  if (p?.is_premium === true || p?.is_comped === true) return 'premium';
  return 'gratuit';
}

/** Le palier depuis les drapeaux de l'app ({ isPremium, isPro, isBusiness }). */
export function palierDesDrapeaux({ isPremium = false, isPro = false, isBusiness = false } = {}) {
  if (isBusiness === true) return 'business';
  if (isPro === true) return 'pro';
  if (isPremium === true) return 'premium';
  return 'gratuit';
}

/** Un palier lu ailleurs (serveur : 'free' | 'premium' | 'pro' | 'business'). Inconnu → null. */
export function palierNormalise(v) {
  if (v === 'free' || v === 'gratuit') return 'gratuit';
  return Object.prototype.hasOwnProperty.call(RANG, v) ? v : null;
}

/** « Ce palier a-t-il au moins `requis` ? » — LA question que posent les écrans. */
export function aAuMoins(palier, requis) {
  const a = RANG[palierNormalise(palier) ?? 'gratuit'];
  const r = RANG[palierNormalise(requis)];
  return r != null && a >= r;
}

/** Les trois drapeaux de l'app, emboîtés : business ⇒ pro ⇒ premium. */
export function droitsDuPalier(palier) {
  return {
    isPremium: aAuMoins(palier, 'premium'),
    isPro: aAuMoins(palier, 'pro'),
    isBusiness: aAuMoins(palier, 'business'),
  };
}

/** Le plus haut des deux (un achat ne fait jamais DESCENDRE le palier affiché). */
export function palierLePlusHaut(a, b) {
  return (RANG[palierNormalise(a) ?? 'gratuit'] >= RANG[palierNormalise(b) ?? 'gratuit'])
    ? (palierNormalise(a) ?? 'gratuit')
    : (palierNormalise(b) ?? 'gratuit');
}

/** Le nom affiché du palier : 'Business' | 'Pro' | 'Premium' | null (gratuit). */
export function nomDuPalier(palier) {
  const p = palierNormalise(palier);
  if (p === 'business') return 'Business';
  if (p === 'pro') return 'Pro';
  if (p === 'premium') return 'Premium';
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// L'OPTION CLOUD — « SANS ORDINATEUR » (conception du 04/10/2026, NON LIVRÉE)
// ═══════════════════════════════════════════════════════════════════════════
// Décisions de Nico (04/10) : le Cloud n'est PAS un 4e palier. C'est une
// OPTION à 20 €/mois cochée EN PLUS d'un palier payant (Premium, Pro ou
// Business), avec un essai gratuit de 7 jours, un seul par personne.
//
// Les colonnes lues (PROPOSITION de migration, non appliquée :
// supabase/migrations/PROPOSITION_20261004_cloud_option_et_pool_ip.sql.txt) :
//   · is_cloud           — option PAYÉE, posée par les flux de paiement comme
//                          is_premium (jamais à la main, jamais par l'app) ;
//   · cloud_essai_debut  — début de l'essai (null = jamais d'essai) ;
//   · cloud_essai_fin    — fin de l'essai (début + 7 jours).
// MÊME RÈGLE QUE LE SERVEUR : `cloud_etat(p_user)` (même proposition). C'est
// le serveur qui décide si un navigateur Cloud tourne ; ce calcul sert à
// l'AFFICHAGE, et il ne doit jamais dire autre chose que le serveur.
//
// ⛔ Une option sans palier ne tourne pas : un compte redevenu gratuit (palier
// résilié) garde son is_cloud le temps que le paiement le retire, mais son
// état est « suspendu », jamais « payé ». (Question ouverte pour Nico : un
// essai Cloud ouvert à un compte GRATUIT ? Si oui, CLOUD_EXIGE_UN_PALIER
// passe à false ici ET dans cloud_etat, le même jour.)

export const CLOUD_EXIGE_UN_PALIER = true;
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
 *   joursRestants : jours d'essai restants, arrondis au jour entamé (essai seul).
 */
export function cloudDuProfil(p, maintenant = Date.now()) {
  const now = instant(maintenant) ?? Date.now();
  const debut = instant(p?.cloud_essai_debut);
  const fin = instant(p?.cloud_essai_fin);
  const essaiPris = debut != null;
  const essaiEnCours = debut != null && fin != null && debut <= now && now < fin;
  const paye = p?.is_cloud === true;
  const palierOk = !CLOUD_EXIGE_UN_PALIER || aAuMoins(palierDuProfil(p), 'premium');
  const base = {
    essaiPris,
    essaiFin: fin != null ? new Date(fin).toISOString() : null,
    joursRestants: null,
  };
  if ((paye || essaiEnCours) && !palierOk) return { ...base, etat: 'suspendu', actif: false };
  if (paye) return { ...base, etat: 'paye', actif: true };
  if (essaiEnCours) {
    return { ...base, etat: 'essai', actif: true, joursRestants: Math.max(1, Math.ceil((fin - now) / JOUR_MS)) };
  }
  if (essaiPris && fin != null && now >= fin) return { ...base, etat: 'essai_termine', actif: false };
  return { ...base, etat: 'aucun', actif: false };
}

/** Peut-on PROPOSER l'essai à ce compte ? (L'appareil et les comptes de
 *  plateforme déjà vus se vérifient côté serveur : cloud_essai_ouvrir.) */
export function essaiCloudProposable(p, maintenant = Date.now()) {
  const c = cloudDuProfil(p, maintenant);
  return c.etat === 'aucun' && !c.essaiPris;
}

/** Les droits d'un compte : le palier (emboîté) + l'option Cloud. */
export function droitsDuCompte(p, maintenant = Date.now()) {
  const palier = palierDuProfil(p);
  return { palier, ...droitsDuPalier(palier), cloud: cloudDuProfil(p, maintenant) };
}
