// ═══════════════════════════════════════════════════════════════════════════
// UN REMBOURSEMENT STRIPE, TRAITÉ COMME CHEZ APPLE (13/11/2026, 3e réponse de Nico, point b)
// ═══════════════════════════════════════════════════════════════════════════
// « Remboursement Stripe : traite-le comme chez Apple (droits coupés, alerte support). » Avant : aucun événement
// charge.refunded n'était traité (audit du 13/11, R3) — un abonné remboursé gardait son palier et son Cloud jusqu'à la fin
// de la période. Chez Apple, REFUND / REVOKE → le droit tombe (apple-iap-webhook, table : off) et « ↩️ Remboursement »
// part à support@, aucun mail client ; Google voidedPurchase → la même alerte.
// La règle Stripe, ici (pure, testée par scripts/remboursement-stripe-selftest.mjs) :
//   · remboursement TOTAL de la facture EN COURS d'un abonnement vivant (sa dernière facture, payée) → les droits que cet
//     abonnement porte tombent : palier (les autres canaux restent : drapeauxStripeAvecStores) ET Cloud (formule avec
//     Cloud ou Cloud seul) ; durablement — tant que la dernière facture de l'abonnement est remboursée en entier, il ne
//     porte plus rien (litAbonnementStripe, `fillsell_periode_remboursee`), quel que soit l'événement qui recalcule ;
//   · remboursement PARTIEL (geste commercial) → droits gardés, alerte seule ;
//   · facture d'une période PASSÉE → droits de la période en cours gardés (elle est payée), alerte seule ;
//   · pack de Pépites (paiement unique) → Pépites gardées, alerte seule (même règle qu'Apple / Google : décision humaine).
// ⛔ Rien n'est écrit chez Stripe (l'abonnement reste actif chez Stripe : l'alerte dit de l'annuler dans le tableau de bord
// si c'est voulu — sinon la période suivante est prélevée et rouvre les droits) ; aucun mail au client.
// ⛔ L'événement charge.refunded doit être coché sur le point de terminaison Stripe (réglage de Nico) : relu le 13/11, il ne
// l'est pas (checkout.session.completed, customer.subscription.deleted / updated, invoice.paid / payment_failed /
// payment_action_required).

const STATUTS_VIVANTS = Object.freeze(['active', 'trialing', 'past_due']);
const idDe = (v) => (typeof v === 'string' ? v : (v && typeof v === 'object' ? v.id ?? null : null));

/** Une charge remboursée EN ENTIER ? (refunded, ou montant remboursé ≥ montant) */
export function chargeRembourseeEnEntier(charge) {
  if (!charge || typeof charge !== 'object') return false;
  if (charge.refunded === true) return true;
  const montant = Number(charge.amount), rendu = Number(charge.amount_refunded);
  return Number.isFinite(montant) && montant > 0 && Number.isFinite(rendu) && rendu >= montant;
}

/** La facture d'une charge : `charge.invoice` (API 2023-10-16, celle du SDK de stripe-webhook) ; null si absente. */
export const factureDeCharge = (charge) => idDe(charge?.invoice);

/** L'abonnement d'une facture (les deux formes d'objets : 2023-10-16 et 2026-03-25.dahlia). */
export const abonnementDeLaFacture = (f) => idDe(f?.subscription ?? f?.parent?.subscription_details?.subscription ?? null);

/**
 * Que faire d'un remboursement ? (pur)
 * @param {{ charge: any, facture?: any, abonnement?: any }} p  facture / abonnement RELUS chez Stripe (null si aucun)
 * @returns {{ type: 'abonnement'|'pack'|'autre', total: boolean, couper: boolean, abonnementId: string|null, raison: string, droit: string }}
 */
export function decisionRemboursementStripe({ charge, facture = null, abonnement = null }) {
  const total = chargeRembourseeEnEntier(charge);
  const abonnementId = idDe(abonnement) ?? abonnementDeLaFacture(facture);
  if (!facture || !abonnementId) {
    const pack = charge?.metadata?.purchase_type === 'coins' || facture == null;
    return { type: pack ? 'pack' : 'autre', total, couper: false, abonnementId: null, raison: 'hors_abonnement',
      droit: "rien de coupé : paiement hors abonnement (pack de Pépites : les Pépites restent créditées — décision humaine)" };
  }
  const derniere = idDe(abonnement?.latest_invoice) === idDe(facture);
  const vivant = STATUTS_VIVANTS.includes(String(abonnement?.status ?? ''));
  if (!total) return { type: 'abonnement', total, couper: false, abonnementId, raison: 'partiel', droit: 'gardé (remboursement partiel : geste commercial)' };
  if (!vivant) return { type: 'abonnement', total, couper: false, abonnementId, raison: 'abonnement_termine', droit: "rien d'ouvert (abonnement déjà terminé chez Stripe)" };
  if (!derniere) return { type: 'abonnement', total, couper: false, abonnementId, raison: 'periode_passee', droit: 'gardé (facture d’une période passée : la période en cours est payée)' };
  return { type: 'abonnement', total, couper: true, abonnementId, raison: 'periode_en_cours',
    droit: "retiré : palier et Cloud de cet abonnement coupés (les autres canaux restent). L'abonnement reste ACTIF chez Stripe : l'annuler dans le tableau de bord si c'est voulu, sinon la période suivante sera prélevée et rouvrira les droits." };
}

/**
 * L'abonnement porte-t-il une période REMBOURSÉE ? (pur) — sa dernière facture (relue avec sa charge) a été payée puis
 * remboursée en entier. Un essai (0 € payé) ou une facture sans charge : non.
 * @param {any} abonnement  @param {any} facture  la dernière facture, avec `charge` développée (expand ['charge'])
 */
export function periodeRemboursee(abonnement, facture) {
  if (!abonnement || !facture) return false;
  if (!STATUTS_VIVANTS.includes(String(abonnement.status ?? ''))) return false;
  if (idDe(abonnement.latest_invoice) !== idDe(facture)) return false;
  if (!(Number(facture.amount_paid) > 0)) return false;
  return chargeRembourseeEnEntier(facture.charge);
}
