// ═══════════════════════════════════════════════════════════════════════════
// ACQUITTER UN ABONNEMENT GOOGLE PLAY PASSÉ « ACHETÉ » HORS DE LA FEUILLE (16/11/2026, soir — ordre de Nico : la validation
// bancaire pendant l'achat)
// ═══════════════════════════════════════════════════════════════════════════
// Un abonnement Google payé avec une validation bancaire (achat EN ATTENTE pendant la feuille, puis ACHETÉ plus tard) n'est
// acquitté par PERSONNE : le module d'achat n'acquitte que dans la feuille (son client de facturation est fermé ensuite),
// et google-play-webhook / validate-google-purchase n'acquittaient que les packs de Pépites. Google REMBOURSE au bout de
// 3 jours un achat non acquitté — le client perd son abonnement sans comprendre. Règle : à chaque lecture serveur d'un
// abonnement (subscriptionsv2) ACTIF ou en période de grâce encore « ACKNOWLEDGEMENT_STATE_PENDING », le serveur
// l'acquitte (purchases.subscriptions.acknowledge, idempotent : déjà acquitté = rien demandé). Pur sauf l'appel.
// Verrou : scripts/achat-attente-banque-selftest.mjs (§ serveur) et scripts/google-acquitter-abonnement-selftest.mjs.

const ETATS_A_ACQUITTER = Object.freeze(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD']);

/** La réponse subscriptionsv2 est-elle un abonnement payé encore à acquitter ? (pur) */
export function abonnementAAcquitter(purchase) {
  return Boolean(purchase) && purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING'
    && ETATS_A_ACQUITTER.includes(purchase.subscriptionState);
}

/** Le produit à acquitter : la ligne du produit notifié, sinon la première. (pur) */
export function produitAAcquitter(purchase, productId = null) {
  const lignes = Array.isArray(purchase?.lineItems) ? purchase.lineItems : [];
  const ligne = (productId && lignes.find((l) => l?.productId === productId)) || lignes[0];
  return typeof ligne?.productId === 'string' && ligne.productId ? ligne.productId : null;
}

/**
 * Acquitte l'abonnement si besoin. Rend { fait: true } | { fait: false, raison }. Jamais d'exception : un échec est rejoué
 * à la lecture suivante (notification de Google, validation par l'app).
 */
export async function acquitterAbonnementGoogle({ purchase, packageName, purchaseToken, accessToken, productId = null, fetchImpl = fetch }) {
  if (!abonnementAAcquitter(purchase)) return { fait: false, raison: 'rien_a_acquitter' };
  const produit = produitAAcquitter(purchase, productId);
  if (!produit || !packageName || !purchaseToken || !accessToken) return { fait: false, raison: 'parametres_absents' };
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${encodeURIComponent(produit)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  try {
    const r = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: '{}' });
    return r?.ok ? { fait: true, produit } : { fait: false, raison: `http_${r?.status ?? 'inconnu'}`, produit };
  } catch (e) {
    return { fait: false, raison: `erreur_${String(e?.message ?? e).slice(0, 60)}`, produit };
  }
}
