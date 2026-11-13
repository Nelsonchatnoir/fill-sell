// ═══════════════════════════════════════════════════════════════════════════
// LA SEMAINE GRATUITE D'APPLE EST-ELLE OFFERTE À CET IDENTIFIANT APPLE ? (13/11/2026, point b de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Corrige tout de suite le “7 jours” montré à un Apple ID qui a déjà eu un essai : il doit lire le vrai prix et
// “prélevé aujourd'hui”, AVANT la fenêtre d'Apple. » — Nico, 13/11.
//
// LA RÈGLE D'APPLE (developer.apple.com, « Implementing introductory offers in your app », relu le 13/11) :
//   · « New subscribers are always eligible. »
//   · « Lapsed subscribers who renew are eligible if they haven't previously used an introductory offer for the given
//     product (or any product within the same subscription group). »
//   · « Existing subscribers are not eligible for an introductory offer for any product within the same subscription
//     group … upgrading, downgrading, or crossgrading … regardless of whether they consumed an introductory offer. »
// Donc, PAR GROUPE d'abonnements : un abonnement en cours dans le groupe → non ; une offre d'introduction déjà utilisée
// dans le groupe → non ; sinon → oui.
//
// LA SOURCE, SANS NOUVEAU BINAIRE : le module d'achat du binaire en vente (@capgo/native-purchases 8.3.3, iPhone 2.9.164)
// expose `getPurchases()` = `Transaction.all` de StoreKit 2 (TransactionHelpers.collectAllPurchases) : « all the
// customer's transactions for your app … Auto-renewable subscriptions, including all renewals » — l'historique de
// l'identifiant Apple CONNECTÉ à l'App Store du téléphone (celui qui paiera), tous appareils, déjà utilisé par
// « Restaurer les achats ». Chaque transaction porte `jwsRepresentation` (la transaction signée vérifiée par StoreKit) dont
// la charge porte `offerType` (1 = offre d'introduction) ; et `isActive` / `expirationDate` / `subscriptionState`.
// Ce que le module NE rend PAS : `introductoryPrice` des produits, ni `isEligibleForIntroOffer` (un binaire neuf).
//
// Les GROUPES (App Store Connect, relus le 11/11 à 22:22 et le 12/11) : « FillSell Plan » (22045363) = toutes les
// formules (Founder, Premium Standard, Pro, Pro 2, Business et les trois « + Cloud ») ; « FillSell Cloud » (22440194) =
// app.fillsell.cloud.sub seul. Un produit FillSell inconnu (ni un pack de Pépites) compte dans « FillSell Plan ».
// Pur (aucun import natif) : testé par scripts/textes-paiement-verite-selftest.mjs.

export const PRODUIT_CLOUD_APPLE = 'app.fillsell.cloud.sub';
export const GROUPES_APPLE = Object.freeze({
  plan: Object.freeze([
    'app.fillsell.premium.sub', 'app.fillsell.premium.standard', 'app.fillsell.pro.sub', 'app.fillsell.pro2.sub',
    'app.fillsell.business.sub', 'app.fillsell.premium.cloud', 'app.fillsell.pro.cloud', 'app.fillsell.business.cloud',
  ]),
  cloud: Object.freeze([PRODUIT_CLOUD_APPLE]),
});

/** Le groupe Apple d'un identifiant de produit : 'cloud' | 'plan' | null (pack de Pépites, autre chose). */
export function groupeAppleDeLIdentifiant(id) {
  const s = String(id ?? '');
  if (!s) return null;
  if (GROUPES_APPLE.cloud.includes(s)) return 'cloud';
  if (GROUPES_APPLE.plan.includes(s)) return 'plan';
  if (s.startsWith('app.fillsell.coins.')) return null;
  return s.startsWith('app.fillsell.') ? 'plan' : null;
}
/** Le groupe Apple d'un produit de l'app ('cloud', 'premium', 'pro_cloud'…). */
export const groupeAppleDuProduit = (produit) => (produit === 'cloud' ? 'cloud' : 'plan');

/** La charge d'une transaction signée (JWS compact, base64url) ; null si illisible. Aucune vérification ici : StoreKit
 *  ne rend que des transactions VÉRIFIÉES (collectPurchases écarte les autres). */
export function chargeJws(jws) {
  if (typeof jws !== 'string') return null;
  const parties = jws.split('.');
  if (parties.length !== 3 || !parties[1]) return null;
  try {
    const b64 = parties[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parties[1].length / 4) * 4, '=');
    const json = decodeURIComponent(Array.from(atob(b64), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
    const o = JSON.parse(json);
    return o && typeof o === 'object' ? o : null;
  } catch { return null; }
}

const ETATS_ABONNE = new Set(['subscribed', 'inGracePeriod', 'inBillingRetryPeriod']);
/** Cette transaction fait-elle de la personne un abonné EN COURS du groupe ? (pur) */
export function transactionEnCours(tx, maintenant = Date.now()) {
  if (!tx || tx.revocationDate) return false;
  if (ETATS_ABONNE.has(tx.subscriptionState)) return true;
  if (tx.isActive === true) return true;
  const fin = tx.expirationDate ? Date.parse(tx.expirationDate) : NaN;
  return Number.isFinite(fin) && fin > maintenant;
}

/**
 * L'historique Apple de l'identifiant du téléphone, PAR GROUPE (pur).
 * `purchases` : NativePurchases.getPurchases().purchases (iOS : Transaction.all).
 * Rend { plan: { transactions, enCours, introUtilisee }, cloud: { … } } ; introUtilisee : true | false | null (null =
 * au moins une transaction du groupe dont la charge signée est illisible : on ne sait pas).
 */
export function historiqueApple(purchases, maintenant = Date.now()) {
  const vide = () => ({ transactions: 0, enCours: false, introUtilisee: false });
  const h = { plan: vide(), cloud: vide() };
  for (const tx of Array.isArray(purchases) ? purchases : []) {
    const g = groupeAppleDeLIdentifiant(tx?.productIdentifier);
    if (!g) continue;
    const e = h[g];
    e.transactions += 1;
    if (transactionEnCours(tx, maintenant)) e.enCours = true;
    const charge = chargeJws(tx?.jwsRepresentation);
    if (!charge) { if (e.introUtilisee === false) e.introUtilisee = null; continue; }
    if (Number(charge.offerType) === 1) e.introUtilisee = true;
  }
  return h;
}

/**
 * L'identifiant Apple du téléphone a-t-il droit à l'offre d'introduction du groupe ? (pur — la règle d'Apple, plus haut)
 * true | false | null (pas lu, ou historique illisible : on ne sait pas — jamais « 7 jours » affirmé sans le savoir).
 */
export function eligibleIntroApple(historique, groupe) {
  const e = historique?.[groupe];
  if (!e) return null;
  if (e.enCours) return false;
  if (e.introUtilisee === true) return false;
  if (e.introUtilisee === null) return null;
  return true;
}

/** { plan, cloud } → true | false | null, à poser dans l'état des prix (lib/prixBoutique.js). Pur. */
export function eligibiliteApple(purchases, maintenant = Date.now()) {
  const h = historiqueApple(purchases, maintenant);
  return Object.freeze({ plan: eligibleIntroApple(h, 'plan'), cloud: eligibleIntroApple(h, 'cloud') });
}
