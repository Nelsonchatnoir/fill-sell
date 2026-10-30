// ═══════════════════════════════════════════════════════════════════════════
// UN CANAL QUI S'ARRÊTE NE RETIRE QUE SON DROIT — JAMAIS CELUI D'UN AUTRE (30/10, lot D point 2)
// ═══════════════════════════════════════════════════════════════════════════
// Cas BONCOIN (3f91c02e, 29-30/10) : Premium Google acheté le 26/10, REMBOURSÉ le 29/10 à 10:04
// (SUBSCRIPTION_REVOKED + EXPIRED + voidedPurchase), puis Premium Stripe pris à 18:14. La base gardait
// google_purchase_token, google_product_id et la fin Google (26/11) : le canal Google semblait vivant. Deux trous :
//   1. un arrêt Google (révocation, expiration, remboursement) n'effaçait JAMAIS le canal ;
//   2. il écrivait les drapeaux du palier sans regarder les autres canaux — un REVOKED tardif aurait coupé le
//      Premium Stripe, et une résiliation Stripe coupait un abonnement des stores.
// Les drapeaux (is_premium / is_pro / is_business) sont partagés par les canaux ; le palier se lit dessus
// (_shared/palier.js, palier_de()). Règle : à l'arrêt d'un canal, les drapeaux = le plus haut des AUTRES canaux
// encore vivants. Pur (testé par scripts/droits-canaux-selftest.mjs).

const RANG_PALIER = { premium: 1, standard: 1, founder: 1, pro: 2, business: 3 };

/** Le rang d'un produit des stores (app.fillsell.<palier>.…) ; 0 inconnu ou Cloud. */
export function rangProduitGoogleOuApple(produit) {
  const m = /^app\.fillsell\.(premium|pro|business|founder)(?:\.|$)/.exec(String(produit ?? ""));
  return m ? RANG_PALIER[m[1]] : 0;
}

/** Les drapeaux d'un rang (cumulatifs : Business ⊇ Pro ⊇ Premium). */
export function drapeauxDuRang(rang) {
  const r = Math.max(0, Number(rang) || 0);
  return { is_premium: r >= 1, is_pro: r >= 2, is_business: r >= 3 };
}

/** Le rang que portent les drapeaux d'un profil. */
export function rangDesDrapeaux(p) {
  return p?.is_business ? 3 : (p?.is_pro ? 2 : (p?.is_premium ? 1 : 0));
}

/** Le rang des abonnements Stripe PAYÉS (active | trialing), Cloud exclu. `rangDe(sub)` : le rang d'un abonnement. */
export function rangStripeVivant(subs, rangDe, estCloud = () => false) {
  let r = 0;
  for (const s of Array.isArray(subs) ? subs : []) {
    if (!s || !["active", "trialing"].includes(String(s.status ?? ""))) continue;
    if (estCloud(s)) continue;
    r = Math.max(r, Number(rangDe(s)) || 0);
  }
  return r;
}

/**
 * Le canal Google du profil est-il vivant (pur) ? Jeton, produit de palier, et fin de période À VENIR — jamais la
 * seule présence d'un jeton.
 */
export function rangGoogleVivant(p, maintenant = Date.now()) {
  if (!p?.google_purchase_token || !p?.google_product_id) return 0;
  const fin = Date.parse(String(p.subscription_period_end ?? ""));
  if (!Number.isFinite(fin) || fin <= maintenant) return 0;
  return rangProduitGoogleOuApple(p.google_product_id);
}

/**
 * Le canal Apple du profil est-il vivant (pur) ? Les webhooks Apple tiennent les drapeaux et la fin ; Apple ne
 * stocke pas son produit sur le profil : son rang est celui des drapeaux, s'il a une fin à venir.
 */
export function rangAppleVivant(p, maintenant = Date.now()) {
  if (!p?.apple_original_transaction_id) return 0;
  const fin = Date.parse(String(p.subscription_period_end ?? ""));
  if (!Number.isFinite(fin) || fin <= maintenant) return 0;
  return rangDesDrapeaux(p);
}

/**
 * Le patch du profil quand le canal GOOGLE s'arrête (pur).
 * @param p        le profil (google_*, apple_original_transaction_id, drapeaux, subscription_period_end)
 * @param opts     { terminal: bool — révocation / expiration / remboursement (le canal est effacé) ;
 *                   rangStripe: rang Stripe vivant, relu chez Stripe (0 sans client) ;
 *                   produit: le produit Google notifié ; maintenant }
 * Un arrêt PASSAGER (en attente, grâce, pause) coupe le droit Google mais garde le jeton : la reprise
 * (RECOVERED) arrive sur le même jeton.
 */
export function patchArretGoogle(p, { terminal = false, rangStripe = 0, produit = null, maintenant = Date.now() } = {}) {
  const rangApple = rangAppleVivant(p, maintenant);
  const autres = Math.max(Number(rangStripe) || 0, rangApple);
  const patch = { ...drapeauxDuRang(autres) };
  // is_founder : un attribut à vie, jamais retiré ici (règle d'avant inchangée).
  if (terminal) {
    patch.google_purchase_token = null;
    patch.google_product_id = null;
    patch.subscription_cancel_at_period_end = false;
    // La fin de période est celle du canal Google ; Apple vivant garde la sienne.
    if (!rangApple) patch.subscription_period_end = null;
  }
  return { patch, rangAutres: autres, rangGoogleAvant: rangProduitGoogleOuApple(produit ?? p?.google_product_id) };
}

/**
 * Les drapeaux recalculés depuis Stripe, sans jamais descendre sous un abonnement des stores VIVANT (pur).
 * @param d   les drapeaux rendus par drapeauxDepuisStripe (is_premium / is_pro / is_business)
 */
export function drapeauxStripeAvecStores(d, p, maintenant = Date.now()) {
  const store = Math.max(rangGoogleVivant(p, maintenant), rangAppleVivant(p, maintenant));
  const rangStripe = rangDesDrapeaux(d);
  return { ...drapeauxDuRang(Math.max(store, rangStripe)), rangStore: store, rangStripe };
}

/** L'état d'un abonnement Google relu par l'API (subscriptionsv2) donne-t-il un droit MAINTENANT ? (pur) */
export function abonnementGoogleActif(purchase, maintenant = Date.now()) {
  const etat = String(purchase?.subscriptionState ?? "");
  const lignes = Array.isArray(purchase?.lineItems) ? purchase.lineItems : [];
  const fin = Math.max(0, ...lignes.map((l) => Date.parse(String(l?.expiryTime ?? "")) || 0));
  if (etat === "SUBSCRIPTION_STATE_ACTIVE") return true;
  // Résilié mais payé jusqu'à la fin de la période : le droit court encore.
  if (etat === "SUBSCRIPTION_STATE_CANCELED") return fin > maintenant;
  return false;
}
