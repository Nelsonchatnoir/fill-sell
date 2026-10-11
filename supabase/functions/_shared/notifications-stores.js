// ═══════════════════════════════════════════════════════════════════════════
// CHAQUE NOTIFICATION D'APPLE ET DE GOOGLE A SA DÉCISION — AUCUNE JETÉE EN SILENCE (12/10, A8)
// ═══════════════════════════════════════════════════════════════════════════
// Ciddjy (07/10 20:54) : passage Premium → Pro payé chez Apple, arrivé en
// DID_CHANGE_RENEWAL_PREF / UPGRADE — le webhook ne lisait pas le sous-type et
// l'a jeté (« Unhandled type »), sans trace ni alerte : payé Pro, resté
// Premium quatre jours. Nico, 11/10 : « Le webhook doit désormais traiter TOUS
// les sous-types de notification Apple et Google. Un sous-type inconnu ne doit
// plus jamais être jeté en silence : il doit être enregistré et signalé. »
//
// LA TABLE : chaque (type, sous-type) connu → UN effet sur le droit :
//   'on'          : l'abonnement est payé et en cours (achat, renouvellement,
//                   passage immédiat à un palier supérieur, remboursement annulé) ;
//   'off'         : le droit s'arrête (expiration, remboursement, révocation,
//                   fin de période de grâce, mise en pause Google) ;
//   'annulation'  : renouvellement coupé, accès gardé jusqu'à la fin payée ;
//   'reprise'     : renouvellement réactivé ;
//   'pack'        : achat d'un pack (Apple ONE_TIME_CHARGE) ;
//   'aucun_effet' : connu, sans effet sur le droit maintenant (descente de
//                   palier effective au renouvellement, hausse de prix, test…) ;
// et tout ce qui n'est PAS dans la table → { connu: false } : la notification
// est enregistrée (stores_notifications_journal) et signalée (alerte à
// support@), jamais appliquée à l'aveugle, jamais jetée en silence.
// ⛔ Zéro régression : les effets des types déjà traités sont ceux d'avant
//    (DID_FAIL_TO_RENEW → off, sous-type compris, comme avant le 12/10).
// Références : App Store Server Notifications V2 (notificationType, subtype) ;
// Google Play RTDN, subscriptionNotification.notificationType.
// ES module sans import (Deno + node) : scripts/achats-store-issue-selftest.mjs.

const N = null; // sous-type absent

/** Apple : type → { sous-type (null = absent) → effet }. « * » = tout sous-type. */
export const APPLE_DECISIONS = Object.freeze({
  SUBSCRIBED: { INITIAL_BUY: "on", RESUBSCRIBE: "on" },
  DID_RENEW: { [N]: "on", BILLING_RECOVERY: "on" },
  // Les anciens tests du webhook connaissaient un « RESUBSCRIBE » de premier niveau.
  RESUBSCRIBE: { [N]: "on" },
  DID_CHANGE_RENEWAL_PREF: { UPGRADE: "on", DOWNGRADE: "aucun_effet", [N]: "aucun_effet" },
  OFFER_REDEEMED: { INITIAL_BUY: "on", RESUBSCRIBE: "on", UPGRADE: "on", DOWNGRADE: "aucun_effet", [N]: "aucun_effet" },
  DID_CHANGE_RENEWAL_STATUS: { AUTO_RENEW_ENABLED: "reprise", AUTO_RENEW_DISABLED: "annulation", [N]: "aucun_effet" },
  EXPIRED: { VOLUNTARY: "off", BILLING_RETRY: "off", PRICE_INCREASE: "off", PRODUCT_NOT_FOR_SALE: "off", [N]: "off" },
  GRACE_PERIOD_EXPIRED: { [N]: "off" },
  DID_FAIL_TO_RENEW: { [N]: "off", GRACE_PERIOD: "off" },
  REFUND: { [N]: "off" },
  REVOKE: { [N]: "off" },
  REFUND_REVERSED: { [N]: "on" },
  REFUND_DECLINED: { [N]: "aucun_effet" },
  CONSUMPTION_REQUEST: { [N]: "aucun_effet" },
  PRICE_INCREASE: { PENDING: "aucun_effet", ACCEPTED: "aucun_effet" },
  RENEWAL_EXTENDED: { [N]: "aucun_effet" },
  RENEWAL_EXTENSION: { SUMMARY: "aucun_effet", FAILURE: "aucun_effet" },
  ONE_TIME_CHARGE: { [N]: "pack" },
  TEST: { [N]: "aucun_effet" },
  EXTERNAL_PURCHASE_TOKEN: { UNREPORTED: "aucun_effet" },
  METADATA_UPDATE: { [N]: "aucun_effet" },
  MIGRATION: { [N]: "aucun_effet" },
  PRICE_CHANGE: { [N]: "aucun_effet" },
  RESCIND_CONSENT: { [N]: "aucun_effet" },
});

/** Google Play RTDN — subscriptionNotification.notificationType → effet. */
export const GOOGLE_DECISIONS = Object.freeze({
  1: { nom: "SUBSCRIPTION_RECOVERED", effet: "on" },
  2: { nom: "SUBSCRIPTION_RENEWED", effet: "on" },
  3: { nom: "SUBSCRIPTION_CANCELED", effet: "annulation" },
  4: { nom: "SUBSCRIPTION_PURCHASED", effet: "on" },
  5: { nom: "SUBSCRIPTION_ON_HOLD", effet: "off" },
  6: { nom: "SUBSCRIPTION_IN_GRACE_PERIOD", effet: "aucun_effet" },
  7: { nom: "SUBSCRIPTION_RESTARTED", effet: "on" },
  8: { nom: "SUBSCRIPTION_PRICE_CHANGE_CONFIRMED", effet: "aucun_effet" },
  9: { nom: "SUBSCRIPTION_DEFERRED", effet: "aucun_effet" },
  10: { nom: "SUBSCRIPTION_PAUSED", effet: "off" },
  11: { nom: "SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED", effet: "aucun_effet" },
  12: { nom: "SUBSCRIPTION_REVOKED", effet: "off" },
  13: { nom: "SUBSCRIPTION_EXPIRED", effet: "off" },
  17: { nom: "SUBSCRIPTION_ITEMS_CHANGED", effet: "aucun_effet" },
  18: { nom: "SUBSCRIPTION_CANCELLATION_SCHEDULED", effet: "aucun_effet" },
  19: { nom: "SUBSCRIPTION_PRICE_CHANGE_UPDATED", effet: "aucun_effet" },
  20: { nom: "SUBSCRIPTION_PENDING_PURCHASE_CANCELED", effet: "aucun_effet" },
  22: { nom: "SUBSCRIPTION_PRICE_STEP_UP_CONSENT_UPDATED", effet: "aucun_effet" },
});

/** La décision Apple : { effet, connu }. Inconnu = jamais appliqué, toujours signalé. */
export function decisionApple(type, sousType) {
  const t = APPLE_DECISIONS[String(type ?? "")];
  if (!t) return { effet: null, connu: false };
  const s = sousType == null || sousType === "" ? N : String(sousType);
  if (Object.prototype.hasOwnProperty.call(t, s)) return { effet: t[s], connu: true };
  return { effet: null, connu: false };
}

/** La décision Google (abonnements) : { effet, nom, connu }. */
export function decisionGoogle(notificationType) {
  const d = GOOGLE_DECISIONS[Number(notificationType)];
  return d ? { effet: d.effet, nom: d.nom, connu: true } : { effet: null, nom: `type_${notificationType}`, connu: false };
}

/**
 * La ligne du journal (stores_notifications_journal), sans données inutiles.
 * @param {{ canal: string, type: unknown, sousType?: string|null, decision: { effet: string|null, connu: boolean }, produit?: string|null, userId?: string|null, transaction?: string|null, transactionOriginale?: string|null, effetApplique?: string|null, detail?: unknown }} p
 */
export function ligneJournal({ canal, type, sousType = null, decision, produit = null, userId = null, transaction = null, transactionOriginale = null, effetApplique = null, detail = null }) {
  return {
    canal, type: String(type ?? ""), sous_type: sousType == null ? null : String(sousType),
    effet: decision?.effet ?? null, connu: !!decision?.connu,
    produit, user_id: userId && /^[0-9a-f-]{36}$/i.test(String(userId)) ? userId : null,
    transaction_id: transaction ? String(transaction) : null,
    transaction_originale: transactionOriginale ? String(transactionOriginale) : null,
    effet_applique: effetApplique, detail,
  };
}
