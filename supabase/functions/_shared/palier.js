// ═══════════════════════════════════════════════════════════════════════════
// LE PALIER D'UN COMPTE — UN SEUL CALCUL, UTILISÉ PARTOUT (04/10/2026)
// Source UNIQUE depuis le 05/10 : l'app (src/utils/palier.js le ré-exporte),
// les fonctions edge (import de ce fichier) et la base (palier_de /
// palier_au_moins, migration 20261005110000) suivent la même règle.
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

// ── (11/11/2026, décision 1 de Nico, offres Cloud) LES DROITS d'un compte en essai du Cloud seul ──────────────────────
// Un essai du Cloud SEUL en cours sur un compte GRATUIT = droits Pro jusqu'à la fin de l'essai. Une RÈGLE dans le temps,
// pas un drapeau : stripe-webhook réécrit is_pro depuis Stripe à chaque événement. MÊME RÈGLE que palier_de en SQL
// (migration 20261111230000) — quotas, republication automatique et planifiée, bordereaux.
// palierDuProfil (ci-dessus) reste le palier PAYÉ (les drapeaux) : crédits mensuels, alertes de paiement, « avec
// formule », remboursements. Les DROITS se lisent ici : palierDesDroits.
const instantPalier = (v) => {
  if (v == null || v === '') return null;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
/** L'essai du Cloud seul est-il EN COURS (commencé, pas fini, pas arrêté, pas encore payé, jamais l'offert) ? */
export function essaiCloudSeulEnCours(p, maintenant = Date.now()) {
  const now = instantPalier(maintenant) ?? Date.now();
  const debut = instantPalier(p?.cloud_essai_debut);
  const fin = instantPalier(p?.cloud_essai_fin);
  return p?.is_cloud !== true && p?.cloud_essai_arrete !== true && p?.cloud_canal !== 'offert'
    && debut != null && fin != null && debut <= now && now < fin;
}
/** Le palier des DROITS (= palier_de en SQL) : le palier payé, ou Pro pendant un essai du Cloud seul d'un compte gratuit. */
export function palierDesDroits(p, maintenant = Date.now()) {
  const paye = palierDuProfil(p);
  if (paye === 'gratuit' && essaiCloudSeulEnCours(p, maintenant)) return 'pro';
  return paye;
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
