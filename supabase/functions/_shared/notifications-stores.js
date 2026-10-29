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
//   'remboursement' : (29/10) Google voidedPurchaseNotification — signalé comme
//                   un remboursement, jamais comme un paiement perdu ; rien appliqué ;
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
  6: { nom: "SUBSCRIPTION_IN_GRACE_PERIOD", effet: "off" }, // (29/10) impayé = gratuit, tous canaux
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

// ═══════════════════════════════════════════════════════════════════════════
// (29/10, boncoin59300) UN REMBOURSEMENT N'EST PAS UN « PAIEMENT NON ENREGISTRÉ »
// ═══════════════════════════════════════════════════════════════════════════
// 29/10 10:04 : Google rembourse un Premium (commande GPA.3369-1510-4339-09469) et envoie, à la même seconde,
// SUBSCRIPTION_REVOKED (12), SUBSCRIPTION_EXPIRED (13) — appliqués, droit retiré — ET une
// voidedPurchaseNotification { productType 1, refundType 1 }. Celle-ci n'était pas dans la table : « inconnue »,
// donc alerte « 🚨 PAIEMENT NON ENREGISTRÉ — le client a payé, rien n'est arrivé sur son compte », compte
// INCONNU. Faux sur les deux points : c'est un REMBOURSEMENT, et le compte se retrouve par le jeton d'achat.
// Effet 'remboursement' : connu, signalé comme tel (signalerRemboursementStore, payment-notify.ts), RIEN
// appliqué ici — le retrait du droit d'un abonnement arrive par REVOKED / EXPIRED ; les Pépites d'un pack
// remboursé restent créditées (décision humaine, dite dans l'alerte).
// Google : productType 1 = abonnement, 2 = achat ponctuel ; refundType 1 = total, 2 = partiel (quantité).
/** voidedPurchaseNotification → { effet: 'remboursement', nom, type, partiel, connu: true }. */
export function decisionGoogleRemboursement(v) {
  const type = Number(v?.productType) === 2 ? "pack" : "abonnement";
  const partiel = Number(v?.refundType) === 2;
  return { effet: "remboursement", nom: `REMBOURSEMENT_${type === "pack" ? "ACHAT" : "ABONNEMENT"}_${partiel ? "PARTIEL" : "TOTAL"}`, type, partiel, connu: true };
}

/** Apple : REFUND = remboursement, REVOKE = retrait (partage familial). Le droit tombe déjà (table : off). */
export function natureRemboursementApple(type) {
  return type === "REFUND" ? "remboursement" : type === "REVOKE" ? "retrait" : null;
}

/**
 * La ligne du journal (stores_notifications_journal), sans données inutiles.
 * (25/10, Revenus) `decision` absente (appel illisible ou refusé AVANT toute décision) → connu = null : ni
 * « connue », ni « inconnue à décider » ; `complements` = les colonnes de la migration 20261025020000
 * (appel_id, message_id, publie_le, fin_periode, renouvellement_auto, jeton_empreinte, verification…).
 * @param {{ canal: string, type: unknown, sousType?: string|null, decision?: { effet: string|null, connu: boolean }|null, produit?: string|null, userId?: string|null, transaction?: string|null, transactionOriginale?: string|null, effetApplique?: string|null, detail?: unknown, complements?: Record<string, unknown>|null }} p
 */
export function ligneJournal({ canal, type, sousType = null, decision, produit = null, userId = null, transaction = null, transactionOriginale = null, effetApplique = null, detail = null, complements = null }) {
  return {
    canal, type: String(type ?? ""), sous_type: sousType == null ? null : String(sousType),
    effet: decision?.effet ?? null, connu: decision == null ? null : !!decision.connu,
    produit, user_id: uuidOuNull(userId),
    transaction_id: transaction ? String(transaction) : null,
    transaction_originale: transactionOriginale ? String(transactionOriginale) : null,
    effet_applique: effetApplique, detail,
    ...(complements && typeof complements === "object" ? complements : {}),
  };
}

/** Un identifiant de compte FillSell (uuid) ou null — jamais une valeur venue d'ailleurs. */
export function uuidOuNull(v) {
  return v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v)) ? String(v) : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// (25/10, point 4 « Revenus » de Nico) L'ÉCHÉANCE DES ABONNÉS, CHAQUE APPEL GOOGLE JOURNALISÉ
// ═══════════════════════════════════════════════════════════════════════════
// Relevé du 25/10 00:09 : 8 des 11 abonnés Apple actifs sans subscription_period_end (seule la résiliation
// l'écrivait) ; 0 ligne Google au journal depuis sa naissance (11/10 21:43) — et la ligne n'était écrite
// qu'APRÈS décodage : un appel sans `message.data` ou illisible ne laissait aucune trace.

/** Une date (ms epoch, nombre en texte, ISO) → ISO, ou null si illisible. */
export function isoOuNull(v) {
  if (v == null || v === "") return null;
  const t = typeof v === "number" ? v : /^\d{10,}$/.test(String(v)) ? Number(v) : Date.parse(String(v));
  return Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : null;
}

/**
 * La fin de période à écrire dans profiles.subscription_period_end — JAMAIS EN ARRIÈRE.
 * nouvelle : expiresDate Apple (ms) / expiryTime Google (ISO) ; actuelle : le texte en base (ISO des stores,
 * « jj/mm/aaaa » de cancel-subscription, ou null). Écrit si la nouvelle est lisible ET (l'actuelle est
 * illisible ou absente, OU la nouvelle est plus tardive, OU l'actuelle est déjà passée) ; sinon null (garder).
 * Une notification rejouée en retard (Apple réessaie jusqu'à 3 jours) n'efface donc jamais une échéance plus récente.
 */
export function finPeriodeAEcrire(nouvelle, actuelle, maintenant = Date.now()) {
  const n = isoOuNull(nouvelle);
  if (!n) return null;
  const a = actuelle == null ? NaN : Date.parse(String(actuelle));
  if (!Number.isFinite(a) || Date.parse(n) > a || a < maintenant) return n;
  return null;
}

/** L'enveloppe d'un push Pub/Sub : { message: { data, messageId, publishTime, attributes }, subscription }. */
export function lireEnveloppePubSub(body) {
  const m = body && typeof body === "object" && body.message && typeof body.message === "object" ? body.message : null;
  const court = (v, n) => (v == null ? null : String(v).slice(0, n));
  return {
    dataB64: typeof m?.data === "string" && m.data.length > 0 ? m.data : null,
    messageId: court(m?.messageId ?? m?.message_id, 100),
    publieLe: isoOuNull(m?.publishTime ?? m?.publish_time),
    abonnement: court(typeof body?.subscription === "string" ? body.subscription : null, 300),
    attributs: m?.attributes && typeof m.attributes === "object" ? m.attributes : null,
  };
}

/** Empreinte d'un purchaseToken (sha256 hex) : rapprochable en SQL, jamais le jeton lui-même au journal.
 *  SQL : encode(sha256(convert_to(google_purchase_token, 'UTF8')), 'hex'). */
export async function empreinteJeton(jeton) {
  if (typeof jeton !== "string" || !jeton) return null;
  const h = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(jeton));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** L'issue d'un appel, lue sur la réponse rendue au store (aucune décision n'en dépend). */
export function issueDeLaReponse(status, texte) {
  let corps = null;
  try { corps = JSON.parse(texte); } catch { corps = null; }
  const raison = (v) => String(v ?? "").slice(0, 200);
  let motif = "traite";
  if (status >= 500) motif = `erreur:${raison(corps?.error ?? texte)}`;
  else if (status >= 400) motif = `rejet:${raison(corps?.error ?? texte)}`;
  else if (corps && corps.skipped) motif = `ignore:${raison(corps.skipped)}`;
  return { http_status: status, motif, termine_le: new Date().toISOString() };
}
