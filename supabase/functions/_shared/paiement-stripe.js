// ═══════════════════════════════════════════════════════════════════════════
// PAIEMENT STRIPE — LES DÉCISIONS PURES (01/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Sans réseau ni SDK : create-checkout-session les appelle avec ce que Stripe
// a rendu, le selftest (scripts/paiement-stripe-selftest.mjs) avec des cas
// calqués sur les refus réels du 30/09 et du 01/10.
//
// Constats (livemode, lus le 01/10) — 9cdr9rm4rn (Pro) et nicolas.menar :
//   1. Apple Pay refusé par la banque : authentication_required (code réseau
//      1A). Un portefeuille ne peut pas passer par le 3D Secure : la seule
//      sortie est la carte tapée, que la banque fait valider.
//   2. La personne revient dans l'app et reclique : un NOUVEAU Checkout
//      (customer_email) crée un NOUVEAU client Stripe pour la même adresse,
//      et un nouvel abonnement « incomplete ».
//   3. La même carte, refusée deux minutes plus tôt, réapparaît sur un autre
//      client : Radar la note « highest » et la bloque (règle PAR DÉFAUT,
//      aucune règle personnalisée nommée dans le refus).
//   4. nicolas.menar a fini par taper sa carte sur la MÊME session : 3D Secure
//      en challenge, authentifié, payé.

/**
 * Le client Stripe à réutiliser parmi ceux qui portent l'adresse du compte.
 * Celui que FillSell a créé pour CE compte d'abord (metadata), sinon le plus
 * récent. null = aucun : il faut en créer un (une seule fois, clé
 * d'idempotence par compte).
 */
export function choisirClientExistant(clients, userId) {
  const vivants = (clients ?? []).filter((c) => c && c.id && !c.deleted);
  if (!vivants.length) return null;
  const lie = vivants.find((c) => c.metadata?.fillsell_user_id === userId);
  if (lie) return lie.id;
  return [...vivants].sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0].id;
}

const PLUS_TARD_S = 5 * 60; // une session qui expire dans moins de 5 min ne se rouvre pas

/**
 * Une session Checkout ENCORE OUVERTE pour la même demande (palier, carte avec
 * 3D Secure ou non, code promo) : on la rouvre au lieu d'en créer une autre —
 * même client, même abonnement en attente, aucun doublon. Les autres sessions
 * d'abonnement ouvertes de ce client sont à remplacer.
 */
export function trierSessionsOuvertes(sessions, demande, maintenantS = Math.floor(Date.now() / 1000)) {
  const ouvertes = (sessions ?? []).filter((s) => s && s.status === "open" && s.mode === "subscription");
  const memeDemande = (s) =>
    s.metadata?.plan_type === demande.planType
    && (s.metadata?.fillsell_carte_3ds === "1") === Boolean(demande.carte3ds)
    && String(s.metadata?.code_promo ?? "") === String(demande.codePromo ?? "")
    && Boolean(s.url)
    && (s.expires_at ?? 0) > maintenantS + PLUS_TARD_S;
  const aReprendre = ouvertes.find(memeDemande) ?? null;
  return { aReprendre, aRemplacer: ouvertes.filter((s) => s !== aReprendre) };
}

/**
 * Un abonnement en attente qu'on peut annuler sans risque en remplaçant sa
 * session : « incomplete » SEULEMENT, et aucun paiement en cours ou abouti.
 * Tout autre statut (actif, en retard, essai…) n'est JAMAIS touché.
 */
export function abonnementRemplacable(sub) {
  if (!sub || sub.status !== "incomplete") return false;
  const pi = sub.latest_invoice?.payment_intent;
  const etat = typeof pi === "object" && pi ? pi.status : null;
  return etat !== "processing" && etat !== "succeeded" && etat !== "requires_capture";
}

/**
 * Pourquoi le paiement n'est pas passé, en une catégorie que l'app sait dire
 * sans jargon : 'authentification' (la banque demande une validation),
 * 'radar' (bloqué par la sécurité des paiements), 'klarna' (Klarna refuse le
 * paiement en plusieurs fois), 'banque' (refus de la banque),
 * 'aucune_tentative' (rien n'a été tenté), 'autre'.
 * La DERNIÈRE tentative fait foi : last_payment_error ; le paiement (charge)
 * ne sert que s'il est celui de cette tentative — un blocage Radar arrive
 * comme un refus générique, seul `outcome.type = blocked` le distingue.
 */
export function causeEchec(intent, charge = null) {
  if (!intent) return "aucune_tentative";
  if (intent.status === "requires_action") return "authentification";
  const err = intent.last_payment_error ?? null;
  const ch = charge && (err ? err.charge === charge.id : true) ? charge : null;
  if (!err && !ch) return "aucune_tentative";
  if (ch?.outcome?.type === "blocked") return "radar";
  const type = err?.payment_method?.type ?? err?.payment_method_type ?? null;
  const code = err?.code ?? null;
  const refus = err?.decline_code ?? null;
  if (code === "authentication_required" || refus === "authentication_required"
      || ch?.outcome?.reason === "authentication_required") return "authentification";
  if (type === "klarna" || refus === "klarna_payment_declined") return "klarna";
  if (code === "card_declined" || code === "expired_card" || code === "incorrect_cvc"
      || code === "insufficient_funds" || code === "processing_error"
      || ch?.outcome?.type === "issuer_declined") return "banque";
  return "autre";
}

// ── LE PALIER PAYÉ PAR UNE FACTURE (15/10/2026, DeadRoz) ────────────────────
// Un seul prélèvement de 59,99 € (passage en Business, 14/10 01:20) et pourtant
// DEUX crédits et deux « Paiement reçu » : invoice.paid, traité AVANT
// checkout.session.completed, a retrouvé le compte par son ANCIEN identifiant
// Stripe (client qui revient) et lu le palier sur les drapeaux du profil,
// encore à « non » → « premium » ; puis checkout a posé Business → une autre
// clé, un second crédit, un second mail. Le palier d'un paiement se lit sur CE
// QUE STRIPE FACTURE, jamais sur les drapeaux : les lignes positives de la
// facture (prix connus), sinon le prix de l'abonnement, sinon son
// metadata.plan_type (posé par create-checkout-session). Le même palier des
// deux côtés → upgrade_monthly_grant ne crédite qu'UNE fois (même palier :
// no_upgrade_needed), donc un seul mail. Le prix Cloud n'est jamais un palier.
// `prix` : { standard, pro, business } (identifiants de prix Stripe).
// Rend 'business' | 'pro' | 'premium', ou null (illisible : l'appelant garde
// son repli ET le journalise).
export function palierDeFacture(invoice, abonnement = null, prix = {}) {
  const RANG = { premium: 1, pro: 2, business: 3 };
  const duPrix = (id) => {
    if (!id) return null;
    if (prix.business && id === prix.business) return "business";
    if (prix.pro && id === prix.pro) return "pro";
    if (prix.standard && id === prix.standard) return "premium";
    return null;
  };
  const leplusHaut = (liste) => liste.filter(Boolean).sort((a, b) => RANG[b] - RANG[a])[0] ?? null;
  const lignes = invoice?.lines?.data ?? [];
  // Deux formes d'objets (API 2023-10-16 et 2026-03-25.dahlia) : line.price
  // ou line.pricing.price_details.price.
  const lu = leplusHaut(lignes
    .filter((l) => (l?.amount ?? 0) > 0)
    .map((l) => duPrix(l?.price?.id ?? l?.pricing?.price_details?.price ?? null)));
  if (lu) return lu;
  const parPrix = leplusHaut((abonnement?.items?.data ?? []).map((it) => duPrix(it?.price?.id ?? null)));
  if (parPrix) return parPrix;
  const pt = String(abonnement?.metadata?.plan_type ?? "");
  if (pt === "business" || pt === "pro") return pt;
  if (pt === "standard" || pt === "founder" || pt === "premium") return "premium";
  return null;
}
