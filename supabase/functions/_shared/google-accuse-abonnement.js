// ═══════════════════════════════════════════════════════════════════════════
// L'ACCUSÉ DE RÉCEPTION D'UN ABONNEMENT GOOGLE PLAY, PAR LE SERVEUR (31/10, lot I point 7)
// ═══════════════════════════════════════════════════════════════════════════
// LE CAS : BONCOIN, abonnement Premium Google du 26/10 09:53:37 — REVOKED, EXPIRED et remboursé en entier le 29/10 à
// 10:04:13, soit 72 h 10 min après : la signature du remboursement automatique de Google pour un achat jamais
// confirmé (acknowledge). Malena (28/09) : mail « abonnement_rembourse » 72 h 21 min après son achat.
// LA CAUSE : seul le module Android confirmait un abonnement (@capgo/native-purchases, acknowledgePurchase
// asynchrone) — et il ferme sa connexion au Billing aussitôt après (closeBillingClient), ce qui peut perdre la
// confirmation. validate-google-purchase ne confirmait que les packs ; google-play-webhook aussi.
// LA RÈGLE : un abonnement que Google dit « ACKNOWLEDGEMENT_STATE_PENDING » est confirmé par le serveur, dès qu'il
// le lit actif (validation de l'app, puis chaque notification « on » du webhook, en filet). Best-effort : un échec
// est journalisé, jamais bloquant ; un abonnement déjà confirmé n'est jamais réécrit.
// Endpoint : purchases.subscriptions.acknowledge (v3) — POST …/purchases/subscriptions/{id}/tokens/{jeton}:acknowledge.
// ES module pur (Deno + Node, fetch injectable) : scripts/lot-i-3110-selftest.mjs.

export const ACK_EN_ATTENTE = "ACKNOWLEDGEMENT_STATE_PENDING";

/** L'abonnement attend-il sa confirmation ? (subscriptionsv2 : acknowledgementState, chaîne) */
export function abonnementAConfirmer(purchase) {
  return String(purchase?.acknowledgementState ?? "") === ACK_EN_ATTENTE;
}

/** L'adresse de confirmation d'un abonnement (produit = l'identifiant de l'abonnement, pas le basePlan). */
export function urlAccuseAbonnement(packageName, productId, purchaseToken) {
  return `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(String(packageName))}` +
    `/purchases/subscriptions/${encodeURIComponent(String(productId))}/tokens/${encodeURIComponent(String(purchaseToken))}:acknowledge`;
}

/**
 * Confirme l'abonnement s'il attend sa confirmation. Ne lève jamais.
 * @returns {Promise<{ fait: boolean, motif: string, http?: number }>}
 */
export async function accuserAbonnementGoogle({ packageName, productId, purchaseToken, purchase, accessToken, fetchImpl = fetch, journal = console }) {
  if (!abonnementAConfirmer(purchase)) return { fait: false, motif: "deja_confirme_ou_inconnu" };
  if (!packageName || !productId || !purchaseToken || !accessToken) return { fait: false, motif: "parametres_manquants" };
  try {
    const r = await fetchImpl(urlAccuseAbonnement(packageName, productId, purchaseToken), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: "{}",
    });
    if (r.ok) {
      journal.log?.(`[accuse-abonnement-google] ${productId} confirmé par le serveur (HTTP ${r.status})`);
      return { fait: true, motif: "confirme", http: r.status };
    }
    const texte = await r.text().catch(() => "");
    journal.error?.(`[accuse-abonnement-google] ${productId} : confirmation refusée HTTP ${r.status} ${String(texte).slice(0, 300)}`);
    return { fait: false, motif: "refus_google", http: r.status };
  } catch (e) {
    journal.error?.(`[accuse-abonnement-google] ${productId} : ${String(e?.message ?? e)}`);
    return { fait: false, motif: "reseau" };
  }
}
