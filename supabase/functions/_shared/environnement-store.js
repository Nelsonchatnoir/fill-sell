// UN ACHAT DE TEST N'ENVOIE JAMAIS DE MAIL À UN CLIENT (12/11/2026, lot « zéro problème », étape 1, point 4a de Nico).
//
// Cause : le compte de test 5322fa18 recevait chaque soir à 18:50 un vrai mail « paiement FillSell Cloud 24,99 € » né
// d'un renouvellement Apple du BAC À SABLE (TestFlight renouvelle tous les jours) — apple-iap-webhook lisait
// l'environnement de la notification pour son journal seulement. Même trou chez Google (achat d'un testeur de licence,
// jamais servi encore) ; Stripe n'était fermé que par chance (un seul secret de signature, aucun test de livemode).
//
// La règle (décisions de Nico du 12/11) :
//   - aucun mail CLIENT pour un achat de test, quel que soit l'événement (essai, paiement, arrêt, impayé, veille) ;
//   - l'alerte à support@ est GARDÉE, marquée « [TEST] » ;
//   - les droits sont GARDÉS (le relecteur d'Apple achète dans le bac à sable : il doit voir l'achat marcher).
//
// Fonctions pures, sans dépendance (testées par scripts/store-test-sans-mail-selftest.mjs).

/** Les environnements Apple qui ne sont PAS la production (App Store Server Notifications V2, `data.environment`). */
const APPLE_TEST = new Set(['sandbox', 'xcode', 'localtesting']);

/**
 * Une valeur d'environnement telle qu'elle est écrite au journal des boutiques (stores_notifications_journal) ou rendue
 * par le lecteur de prix (cloud-prix.js) : « Sandbox », « Xcode », « LocalTesting » (Apple), « test » (Google, Stripe).
 * Une valeur absente ou inconnue n'est JAMAIS un test (un vrai client garde toujours ses mails).
 * @param {unknown} environnement
 * @returns {boolean}
 */
export function environnementDeTest(environnement) {
  if (typeof environnement !== 'string') return false;
  const v = environnement.trim().toLowerCase();
  if (!v) return false;
  return v === 'test' || APPLE_TEST.has(v);
}

/**
 * La notification (ou l'achat lu à la source) vient-elle d'un achat de test ?
 *   - Apple : `environnement` = data.environment de la notification (« Production » ou non).
 *   - Google : l'achat lu chez Google — `testPurchase` présent (abonnement d'un testeur de licence, subscriptionsv2) ou
 *     `purchaseType === 0` (produit ponctuel d'un testeur) ; `testNotification` (notification de test de la console).
 *   - Stripe : `livemode === false` (événement ou objet du mode test).
 * @param {{ canal: string, environnement?: unknown, achat?: any, testNotification?: unknown, livemode?: unknown }} p
 * @returns {boolean}
 */
export function notificationDeTest({ canal, environnement = null, achat = null, testNotification = null, livemode } = {}) {
  if (canal === 'apple') return environnementDeTest(environnement);
  if (canal === 'google') {
    if (testNotification != null) return true;
    if (achat && typeof achat === 'object') {
      if (achat.testPurchase != null) return true;
      if (achat.purchaseType === 0) return true;
    }
    return environnementDeTest(environnement);
  }
  if (canal === 'stripe') return livemode === false || environnementDeTest(environnement);
  return false;
}
