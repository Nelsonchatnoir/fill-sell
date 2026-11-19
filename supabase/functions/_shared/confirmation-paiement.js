// ═══════════════════════════════════════════════════════════════════════════
// UN PAIEMENT RÉEL = UNE CONFIRMATION, SUR LES TROIS CANAUX (19/11/2026, ordre de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Nico, 19/11 : « une montée Google au même palier (Pro → Pro + Cloud) n'envoie plus le mail « Paiement reçu » ni
// l'événement Meta. Un client qui paie reçoit toujours sa confirmation, avec le montant réellement payé, exactement
// comme sur iPhone. Même règle des deux côtés. L'événement Meta part aussi avec le montant réel. Jamais deux mails pour
// un même paiement, jamais de mail pour un essai à 0 €. »
//
// La cause : l'alerte « Paiement reçu » (et Meta, qui part de la même alerte) ne partait que si le crédit du mois avait
// créé une ligne (`granted`). Une montée AU PRORATA dans la période (Google CHARGE_PRORATED_PRICE, la facture de prorata
// de Stripe) garde l'échéance : même palier → `no_upgrade_needed`, aucun crédit (juste : le mois est déjà crédité) —
// et donc aucune confirmation, alors que le client a payé. Apple, lui, rouvre une période pleine à chaque montée : crédit,
// donc confirmation.
//
// LA RÈGLE (une seule, les trois canaux) :
//   · un essai à 0 € : jamais de confirmation de paiement (le début d'essai a son propre mail, StartTrial chez Meta) ;
//   · un paiement qui ouvre le crédit du mois (granted) : confirmé, comme avant ;
//   · un changement de formule payé au prorata, sans crédit (même palier, même échéance) : confirmé AUSSI, au montant payé ;
//   · tout le reste (rejeu d'un webhook, cycle déjà crédité, montant inconnu sur un changement) : rien.
//   · UNE confirmation par paiement : la clé est le numéro du paiement chez le canal (commande Google, transaction Apple,
//     facture Stripe), réservée AVANT l'envoi dans le registre public.cloud_mails (insertion unique) — le webhook et la
//     validation de l'app qui voient le même paiement n'envoient qu'une fois, un rejeu de la boutique aussi.
// Le mail au client (formule avec Cloud) dit le montant payé : Google le lit dans la commande (./google-commande.js),
// Apple dans la transaction, Stripe sur la facture ; une montée au prorata est un « changement » (« Ta formule passe à
// … : ce paiement est la différence au prorata jusqu'à ta prochaine échéance »).
// Verrou : selftest:confirmation-paiement (Apple, Google, Stripe).

/** La clé de réservation d'une confirmation : un paiement = une clé. */
export const cleConfirmation = (canal, paiement) => `confirmation:${String(canal)}:${String(paiement)}`;

const montantPositif = (m) => {
  if (m == null) return false;
  if (typeof m === 'number') return m > 0;
  if (typeof m === 'string') return Number.parseFloat(m.replace(',', '.')) > 0;
  return Number(m?.montant) > 0;
};

/**
 * La décision : confirmer ce paiement ou non, et par quelle voie.
 * @param {{ essai?: boolean, granted?: boolean | null, raison?: string | null, changement?: boolean, montant?: any }} p
 *   essai : la période payée est un essai gratuit ; granted / raison : le retour de upgrade_monthly_grant ; changement :
 *   une montée payée au prorata dans la période (Google : commande partielle d'un jeton qui en remplace un autre ;
 *   Stripe : facture billing_reason = subscription_update) ; montant : le montant réellement payé.
 * @returns {{ confirmer: boolean, voie: 'credit' | 'prorata' | null, raison: string }}
 */
export function decisionConfirmation({ essai = false, granted = null, raison = null, changement = false, montant = null } = {}) {
  if (essai === true) return { confirmer: false, voie: null, raison: 'essai_0_euro' };
  if (granted === true) return { confirmer: true, voie: 'credit', raison: 'credit_du_mois' };
  if (changement === true && raison === 'no_upgrade_needed') {
    return montantPositif(montant)
      ? { confirmer: true, voie: 'prorata', raison: 'changement_au_prorata' }
      : { confirmer: false, voie: null, raison: 'changement_montant_inconnu' };
  }
  return { confirmer: false, voie: null, raison: raison ? `sans_credit_${raison}` : 'sans_credit' };
}

/**
 * Google : ce paiement est-il une montée AU PRORATA ? Un jeton qui en REMPLACE un autre (linkedPurchaseToken) et dont la
 * commande est PARTIELLE — moins que le prix plein de la nouvelle formule (le prorata prélève la différence jusqu'à
 * l'échéance, jamais le prix plein). Sans montant lisible : la période payée plus courte qu'un mois (la date
 * d'échéance est gardée). Un remplacement au prix plein (pendant un essai, CHARGE_FULL_PRICE) n'en est pas un.
 * @param {{ remplace: boolean, montant?: { montant: number } | null, prixPlein?: { montant: number } | null, debut?: string | null, fin?: string | null }} p
 */
export function changementAuProrataGoogle({ remplace, montant = null, prixPlein = null, debut = null, fin = null }) {
  if (remplace !== true) return false;
  const paye = Number(montant?.montant);
  const plein = Number(prixPlein?.montant);
  if (paye > 0 && plein > 0) return paye < plein - 0.005;
  const d = Date.parse(String(debut ?? '')); const f = Date.parse(String(fin ?? ''));
  return Number.isFinite(d) && Number.isFinite(f) && f > d && f - d < 27 * 86_400_000;
}

/** Le montant pour l'alerte « Paiement reçu » et Meta : « 21.43 EUR » (le format des alertes Apple et Stripe). */
export const texteMontantAlerte = (m) => (m && Number(m.montant) > 0 && /^[A-Z]{3}$/.test(String(m.devise ?? ''))
  ? `${Number(m.montant).toFixed(2)} ${String(m.devise)}` : null);

/**
 * L'envoi d'une confirmation décidée : la clé du paiement réservée (une fois), puis l'alerte (qui porte Meta).
 * deps : reserver({ cle }) → 'pris' | 'deja' | 'erreur' ; notifier(alerte) → Promise ; journal(texte).
 * Registre illisible : la voie « crédit » envoie quand même (comme avant : le crédit du mois est déjà unique), la voie
 * « prorata » se tait (pas de doublon possible) et le dit.
 * @returns {Promise<'envoyee' | 'deja_confirmee' | 'non_confirmee' | 'registre_illisible'>}
 */
export async function confirmerPaiement({ decision, canal, paiement, alerte, deps }) {
  if (!decision?.confirmer) return 'non_confirmee';
  const r = paiement ? await deps.reserver({ cle: cleConfirmation(canal, paiement) }) : 'erreur';
  if (r === 'deja') { deps.journal?.(`confirmation ${canal} ${paiement} déjà envoyée — rien de plus`); return 'deja_confirmee'; }
  if (r !== 'pris' && decision.voie !== 'credit') {
    deps.journal?.(`confirmation ${canal} ${paiement ?? '(sans numéro)'} NON envoyée : registre illisible (voie ${decision.voie})`);
    return 'registre_illisible';
  }
  await deps.notifier(alerte);
  return 'envoyee';
}
