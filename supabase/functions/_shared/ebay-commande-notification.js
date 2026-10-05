// ═══════════════════════════════════════════════════════════════════════════
// eBay ORDER_CONFIRMATION — ce qu'une commande notifiée fait sur un job (05/10)
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (point 14) : la vente eBay vue en moins d'une minute, par
// la notification ORDER_CONFIRMATION (Notification API, scope
// commerce.notification.subscription déjà consenti par les 66 comptes reliés),
// au lieu de la veille Browse (une visite toutes les 6 h par annonce).
// Message (doc eBay, OrderConfirmationData) :
//   { metadata: { topic: "ORDER_CONFIRMATION", schemaVersion },
//     notification: { notificationId, eventDate, publishDate,
//       data: { user: { userId, username },
//               order: { orderId, orderLineItems: [{ orderLineItemId, listingId, quantity }] } } } }
// Ce que la notification fait — et rien d'autre :
//   · elle POUSSE l'annonce en tête de la veille des ventes eBay
//     (ebay-api-worker, toutes les 2 min) : veille_ebay_le effacé, commande
//     notée sur le job ; c'est la relecture Browse de la veille, inchangée, qui
//     conclut et ENREGISTRE la vente (comme depuis le 01/10) ;
//   · elle ne pose « vendue » (sale_signal 'sold', qui arme les retraits des
//     copies d'une fiche à une unité) QUE si la signature d'eBay est VALIDE et
//     que la commande épuise le stock EXACT connu de l'annonce
//     (quantite_ebay.exacte, disponible ≤ quantité commandée). Une annonce à
//     plusieurs exemplaires, un stock inconnu ou une signature indéterminée :
//     la veille seule tranche ;
//   · rien n'est jamais retiré, ni enregistré, ici.
// Pur (Deno + Node) : scripts/ebay-commande-notification-selftest.mjs.

export const TOPIC_COMMANDE = "ORDER_CONFIRMATION";

const texte = (v) => String(v ?? "").trim();

/** Le message, réduit à ce qui sert ; null si ce n'est pas une commande lisible. */
export function lireCommandeConfirmee(notif) {
  if (texte(notif?.metadata?.topic) !== TOPIC_COMMANDE) return null;
  const n = notif?.notification ?? {};
  const data = n.data ?? {};
  const order = data.order ?? {};
  const orderId = texte(order.orderId);
  const lignes = (Array.isArray(order.orderLineItems) ? order.orderLineItems : [])
    .map((l) => ({
      orderLineItemId: texte(l?.orderLineItemId) || null,
      listingId: texte(l?.listingId ?? l?.itemId ?? l?.legacyItemId),
      quantite: Number.isFinite(Number(l?.quantity)) && Number(l.quantity) > 0 ? Math.floor(Number(l.quantity)) : 1,
    }))
    .filter((l) => /^\d{9,15}$/.test(l.listingId));
  if (!orderId || !lignes.length) return null;
  return {
    notificationId: texte(n.notificationId).slice(0, 80) || null,
    eventDate: texte(n.eventDate) || null,
    userId: texte(data.user?.userId) || null,
    username: texte(data.user?.username) || null,
    orderId,
    lignes,
  };
}

/**
 * Le nouveau platform_fields d'un job publié pour une ligne de commande.
 * @param {any} pfAvant
 * @param {{ orderLineItemId: string|null, listingId: string, quantite: number }} ligne
 * @param {{ orderId?: string, notificationId?: string|null, signatureValide?: boolean, maintenant?: string }} [opts]
 * @returns {{ pf: Record<string, any>, vendue: boolean, raison: string, nouvelle: boolean }}
 */
export function patchCommandeSurJob(pfAvant, ligne, { orderId, notificationId = null, signatureValide = false, maintenant = new Date().toISOString() } = {}) {
  const pf = { ...(pfAvant && typeof pfAvant === "object" ? pfAvant : {}) };
  const deja = Array.isArray(pf.commandes_ebay) ? pf.commandes_ebay : [];
  const nouvelle = !deja.some((c) => c?.order_id === orderId && c?.ligne === ligne.orderLineItemId);
  pf.commandes_ebay = nouvelle
    ? [...deja, { order_id: orderId, ligne: ligne.orderLineItemId, quantite: ligne.quantite, notification: notificationId, le: maintenant }].slice(-10)
    : deja;
  // En tête de la veille : une annonce jamais visitée passe avant les autres.
  delete pf.veille_ebay_le;
  const q = pf.quantite_ebay && typeof pf.quantite_ebay === "object" ? pf.quantite_ebay : null;
  const dispo = Number(q?.disponible);
  let vendue = false, raison;
  if (!signatureValide) raison = "signature_non_valide";
  else if (q?.exacte !== true || !Number.isFinite(dispo)) raison = "stock_inconnu";
  else if (dispo > ligne.quantite) raison = "stock_restant";
  else { vendue = true; raison = "stock_epuise"; }
  if (vendue && pf.sale_signal !== "sold") {
    pf.sale_signal = "sold";
    pf.unavailable_since = pf.unavailable_since ?? maintenant;
    pf.sale_evidence = {
      platform: "ebay", listing_id: ligne.listingId, state: "sold", exact: true,
      source: "order_confirmation", order_id: orderId, quantite: ligne.quantite, lu_le: maintenant,
    };
  }
  return { pf, vendue, raison, nouvelle };
}
