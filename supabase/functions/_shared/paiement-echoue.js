// ═══════════════════════════════════════════════════════════════════════════
// LE MAIL « PAIEMENT ÉCHOUÉ » — RÈGLES PURES (05/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// stripe-webhook établit les FAITS (faitsEchec, sur la facture et l'abonnement
// RELUS chez Stripe), email-tunnel rend le texte (texteEchec) dans le gabarit
// commun (mailPaiementEchoue, _shared/emails-fillsell.ts). Testé sans réseau
// par scripts/paiement-echoue-selftest.mjs.
//
// Décisions de Nico (05/10) :
//   · une fin d'essai ratée a SON texte : ni « renouvellement », ni
//     « abonnement qui reste actif » ;
//   · un 3D Secure non validé ne promet JAMAIS une nouvelle tentative
//     automatique : la banque attend la personne, et le bouton ouvre la page
//     Stripe de la facture (hosted_invoice_url), là où elle valide ;
//   · chaque geste promis existe pour de vrai. D'où, relu dans le code :
//       – SOUSCRIPTION : le bouton ramène à l'app, JAMAIS à la page de la
//         facture. Une première souscription n'ouvre l'abonnement que par
//         checkout.session.completed (stripe-webhook : is_premium et
//         stripe_customer_id posés là, et nulle part ailleurs) ; une facture
//         réglée hors de Checkout encaisserait sans rien ouvrir. L'app, elle,
//         rouvre la page de paiement (create-checkout-session).
//       – RENOUVELLEMENT et FIN D'ESSAI : la page Stripe de la facture, tant
//         qu'elle est ouverte (status 'open'). Une facture payée là passe par
//         invoice.paid (compte retrouvé par stripe_customer_id, déjà posé).
//       – « mets à jour ton moyen de paiement depuis l'app » n'est PAS écrit :
//         le seul chemin (Réglages › Abonnement › Mes factures, portail Stripe)
//         n'existe que sur le web, sous un autre nom.
//       – « Stripe retentera le paiement » seulement si la facture porte une
//         prochaine tentative (next_payment_attempt), jamais pour un 3D Secure
//         ni une carte expirée (la même carte échouerait encore).
//       – « ton abonnement reste actif » seulement au renouvellement, et si
//         Stripe dit l'abonnement active ou past_due (stripe-webhook : past_due
//         compte comme vivant, le palier est gardé).

export const CAUSES = Object.freeze(['3ds', 'carte_refusee', 'carte_expiree', 'autre']);
export const CONTEXTES = Object.freeze(['souscription', 'renouvellement', 'fin_essai']);
export const LIEN_APP = 'https://fillsell.app';          // = URL_APP (_shared/emails-fillsell.ts)

// Tolérance entre la fin d'essai de l'abonnement et le début de la période
// facturée : Stripe les pose à la même seconde ; une minute de marge.
const TOLERANCE_FIN_ESSAI_S = 60;

const entier = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * La facture est-elle la PREMIÈRE échéance payante après un essai ?
 * Repose UNIQUEMENT sur les données de Stripe (facture et abonnement relus par
 * l'API, jamais supposés) :
 *   · facture.billing_reason === 'subscription_cycle' (le cycle a tourné, ce
 *     n'est ni une création ni une mise à jour) ;
 *   · abonnement.trial_end non nul (l'abonnement a eu un essai) ;
 *   · une ligne de la facture dont period.start === abonnement.trial_end (à
 *     une minute près) : la période facturée commence À la fin de l'essai.
 * Les renouvellements suivants commencent un mois plus tard : faux.
 */
export function estFinEssai(facture, abonnement) {
  if (facture?.billing_reason !== 'subscription_cycle') return false;
  const finEssai = entier(abonnement?.trial_end);
  if (finEssai == null) return false;
  return (facture?.lines?.data ?? []).some((l) => {
    const debut = entier(l?.period?.start);
    return debut != null && Math.abs(debut - finEssai) <= TOLERANCE_FIN_ESSAI_S;
  });
}

/** souscription (billing_reason subscription_create) | fin_essai | renouvellement (tout le reste, comme avant). */
export function contexteEchec(facture, abonnement) {
  if (facture?.billing_reason === 'subscription_create') return 'souscription';
  if (estFinEssai(facture, abonnement)) return 'fin_essai';
  return 'renouvellement';
}

/** La page Stripe de la facture, si on peut encore la régler : https, chez stripe.com, facture ouverte. */
export function lienFacture(facture) {
  if (facture?.status !== 'open') return null;
  return lienStripeSur(facture?.hosted_invoice_url);
}

/** Un lien de facture Stripe, ou rien : https et hôte *.stripe.com, jamais autre chose. */
export function lienStripeSur(url) {
  if (typeof url !== 'string' || !url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'stripe.com' || u.hostname.endsWith('.stripe.com')) ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Les FAITS que stripe-webhook transmet à email-tunnel (payment-notify.ts).
 * facture, abonnement : objets Stripe relus par l'API ; estCloud : abonnement
 * de l'option Cloud (estAbonnementCloud, _shared/cloud-option.js).
 * @param {{ facture: any, abonnement?: any, estCloud?: boolean }} p
 * @returns {{ contexte: 'souscription' | 'renouvellement' | 'fin_essai', lien_facture: string | null,
 *             relance_le: string | null, abonnement_actif: boolean, offre: string | null }}
 */
export function faitsEchec({ facture, abonnement = null, estCloud = false }) {
  const contexte = contexteEchec(facture, abonnement);
  const prochaine = entier(facture?.next_payment_attempt);
  return {
    contexte,
    // Souscription : jamais la page de la facture (cf. en tête).
    lien_facture: contexte === 'souscription' ? null : lienFacture(facture),
    relance_le: prochaine != null && contexte !== 'souscription' ? new Date(prochaine * 1000).toISOString() : null,
    abonnement_actif: contexte === 'renouvellement' && ['active', 'past_due'].includes(abonnement?.status),
    offre: estCloud ? 'cloud' : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUAND LE MAIL PART : SUR UN ÉCHEC ACQUIS, JAMAIS PENDANT UN PAIEMENT EN COURS
// (09/10/2026, cas Marta)
// ═══════════════════════════════════════════════════════════════════════════
// 09/10, 11:06:46 (Paris) : Marta paie son Pro au Checkout, sa banque demande
// le 3D Secure. Stripe envoie AUSSITÔT invoice.payment_failed ET
// invoice.payment_action_required (billing_reason subscription_create,
// PaymentIntent requires_action) pendant qu'elle valide encore sur la page :
// le mail « paiement échoué » part à 11:06:47, le paiement passe à 11:07:20.
// Même chose le 08/10 pour romain.knc (mail à 10:20:53, payé à 10:23:47).
// Règle de Nico (09/10) :
//   · un paiement INITIAL (souscription au Checkout) en cours n'est jamais un
//     échec : 3D Secure, nouvel essai, autre carte, tout se passe sur la même
//     page, et Stripe garde la facture ouverte 23 h. Aucun mail sur ces
//     événements, quel que soit le motif ;
//   · on n'écrit que sur un échec ACQUIS : la tentative d'un renouvellement
//     (ou d'une fin d'essai) a échoué, OU la souscription est définitivement
//     abandonnée — Stripe le dit lui-même en passant l'abonnement à
//     incomplete_expired (23 h sans paiement, facture annulée), par
//     customer.subscription.updated (reçu en réel le 03/10 à 21:46 UTC) ;
//   · avant tout envoi, la facture RELUE chez Stripe : payée → rien ;
//   · un abandon ne s'écrit que si la personne n'a pas payé autrement entre-
//     temps : aucun autre abonnement vivant de la même offre chez Stripe, et
//     aucun palier (ou Cloud) déjà ouvert sur son compte.
// Un échec suivi d'un succès n'écrit donc jamais : le succès arrive avant
// l'abandon (23 h), et la facture relue est payée.

export const EVENEMENTS_ECHEC = Object.freeze(['invoice.payment_failed', 'invoice.payment_action_required']);

/**
 * Le mail « paiement échoué » part-il ? Données de Stripe RELUES (facture,
 * abonnement), jamais supposées.
 * @param {{ evenement: string, facture: any, abonnement?: any,
 *           memeOffreVivante?: boolean, compteDejaOuvert?: boolean }} p
 *   memeOffreVivante : un AUTRE abonnement de la même offre (palier ou Cloud)
 *   est active / trialing / past_due chez Stripe ; compteDejaOuvert : le compte
 *   a déjà le palier (ou Cloud) par ailleurs. Ne servent qu'à l'abandon.
 * @returns {{ envoyer: boolean, raison: string }}
 */
export function decisionMailEchec({ evenement, facture, abonnement = null, memeOffreVivante = false, compteDejaOuvert = false }) {
  const raison = facture?.billing_reason ?? null;
  if (EVENEMENTS_ECHEC.includes(evenement)) {
    // Montée de palier : la personne valide sur la page Stripe (24/09).
    if (raison === 'subscription_update') return { envoyer: false, raison: 'montee_de_palier' };
    if (facture?.status === 'paid') return { envoyer: false, raison: 'facture_payee' };
    // Le paiement initial est EN COURS sur la page de paiement : 3D Secure,
    // nouvel essai, autre carte. Son abandon s'écrit à incomplete_expired.
    if (raison === 'subscription_create') return { envoyer: false, raison: 'paiement_initial_en_cours' };
    if (facture?.status === 'void') return { envoyer: false, raison: 'facture_annulee' };
    return { envoyer: true, raison: 'echec_acquis' };
  }
  if (evenement === 'customer.subscription.updated' || evenement === 'customer.subscription.deleted') {
    if (abonnement?.status !== 'incomplete_expired') return { envoyer: false, raison: 'pas_un_abandon' };
    if (raison !== 'subscription_create') return { envoyer: false, raison: 'pas_une_souscription' };
    if (facture?.status === 'paid') return { envoyer: false, raison: 'facture_payee' };
    if (memeOffreVivante === true) return { envoyer: false, raison: 'paye_par_un_autre_abonnement' };
    if (compteDejaOuvert === true) return { envoyer: false, raison: 'compte_deja_abonne' };
    return { envoyer: true, raison: 'souscription_abandonnee' };
  }
  return { envoyer: false, raison: 'evenement_ignore' };
}

/**
 * La cause fine, lue sur le PaymentIntent RELU (règle du 07/08, inchangée) :
 * authentication_required ≠ carte refusée — l'un se règle en revalidant,
 * l'autre en changeant de carte. PaymentIntent illisible → la cause de
 * l'événement (action_required = 3ds), sinon 'autre'.
 * @param {{ pi?: any, evenement?: string | null }} [p]
 * @returns {{ cause: '3ds' | 'carte_refusee' | 'carte_expiree' | 'autre', code: string | null }}
 */
export function causeDuPaiement({ pi = null, evenement = null } = {}) {
  let cause = evenement === 'invoice.payment_action_required' ? '3ds' : 'autre';
  let code = null;
  if (pi) {
    const err = pi.last_payment_error ?? null;
    if (pi.status === 'requires_action' || err?.code === 'authentication_required') {
      cause = '3ds';
    } else if (err?.code === 'expired_card' || err?.decline_code === 'expired_card') {
      cause = 'carte_expiree';
    } else if (err?.code === 'card_declined') {
      cause = 'carte_refusee';
      code = err?.decline_code ?? null;
    } else if (err) {
      code = err.code ?? null;
    }
  }
  return { cause, code };
}

/** « jeudi 8 octobre » / « Thursday 8 October » — date de Paris. */
export function dateRelance(iso, lang = 'fr') {
  const parts = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long',
  }).formatToParts(new Date(iso));
  const v = (t) => parts.find((x) => x.type === t)?.value ?? '';
  return `${v('weekday')} ${v('day')} ${v('month')}`;
}

const TEXTES = {
  fr: {
    sujet: { echec: "Ton paiement n'a pas abouti", validation: 'Ton paiement attend ta validation' },
    sujetEssai: {
      cloud: { echec: "Fin de ton essai Cloud : le paiement n'a pas abouti", validation: 'Fin de ton essai Cloud : ta banque attend ta validation' },
      autre: { echec: "Fin de ton essai : le paiement n'a pas abouti", validation: 'Fin de ton essai : ta banque attend ta validation' },
    },
    preheader: "Rien n'a été débité.",
    salut: 'Salut,',
    intro: {
      souscription: "Ton abonnement n'a pas pu démarrer : le paiement s'est arrêté en route.",
      renouvellement: "Ton abonnement n'a pas pu être renouvelé.",
      fin_essai: { cloud: "Ton essai FillSell Cloud est terminé et le paiement n'a pas abouti.", autre: "Ton essai gratuit est terminé et le paiement n'a pas abouti." },
    },
    cause: {
      '3ds': "Ta banque demande une validation (3D Secure) avant de débiter, et elle n'a pas encore été faite. Rien n'a été débité.",
      carte_refusee: "Ta banque a refusé le paiement. Rien n'a été débité.",
      carte_expiree: "La carte enregistrée est expirée. Rien n'a été débité.",
      autre: "Stripe n'a pas pu encaisser le paiement. Rien n'a été débité.",
    },
    souscription3ds: "Pour réessayer, ouvre FillSell et choisis à nouveau ta formule : la page de paiement s'ouvre, et tu valides avec ta banque (souvent dans son application).",
    souscription: "Pour réessayer, ouvre FillSell et choisis à nouveau ta formule : tu peux payer avec la même carte ou une autre.",
    souscriptionExpiree: "Pour réessayer, ouvre FillSell et choisis à nouveau ta formule : tu pourras payer avec une autre carte.",
    pourContinuer: { cloud: "Pour continuer avec l'option Cloud, ", autre: 'Pour continuer ton abonnement, ' },
    valider: "valide le paiement sur la page sécurisée de Stripe : le bouton ci-dessous l'ouvre, et tu confirmes avec ta banque (souvent dans son application).",
    regler: 'règle la facture sur la page sécurisée de Stripe, avec ta carte ou une autre.',
    reglerExpiree: 'règle la facture sur la page sécurisée de Stripe, avec une autre carte.',
    valider1: "Valide le paiement sur la page sécurisée de Stripe : le bouton ci-dessous l'ouvre, et tu confirmes avec ta banque (souvent dans son application).",
    regler1: 'Tu peux régler cette facture sur la page sécurisée de Stripe, avec ta carte ou une autre.',
    reglerExpiree1: 'Règle cette facture sur la page sécurisée de Stripe, avec une autre carte.',
    relance: (d) => `Sinon, Stripe retentera le paiement le ${d}.`,
    actif: "Ton abonnement reste actif pour l'instant.",
    sansLien: 'Réponds à ce mail : on te renvoie le lien pour régler la facture.',
    bouton: { app: 'Ouvrir FillSell', valider: 'Valider le paiement', regler: 'Régler la facture' },
    fin: 'Si ça bloque encore, réponds à ce mail.',
    raison: "Tu reçois ce message parce qu'un paiement de ton compte FillSell n'a pas abouti.",
  },
  en: {
    sujet: { echec: "Your payment didn't go through", validation: 'Your payment needs your confirmation' },
    sujetEssai: {
      cloud: { echec: "Your Cloud trial has ended: the payment didn't go through", validation: 'Your Cloud trial has ended: your bank needs your confirmation' },
      autre: { echec: "Your trial has ended: the payment didn't go through", validation: 'Your trial has ended: your bank needs your confirmation' },
    },
    preheader: 'Nothing was charged.',
    salut: 'Hi,',
    intro: {
      souscription: "Your subscription couldn't start: the payment stopped along the way.",
      renouvellement: "Your subscription couldn't be renewed.",
      fin_essai: { cloud: "Your FillSell Cloud trial has ended and the payment didn't go through.", autre: "Your free trial has ended and the payment didn't go through." },
    },
    cause: {
      '3ds': "Your bank asks for a confirmation (3D Secure) before charging, and it hasn't been done yet. Nothing was charged.",
      carte_refusee: 'Your bank declined the payment. Nothing was charged.',
      carte_expiree: 'The card on file has expired. Nothing was charged.',
      autre: "Stripe couldn't collect the payment. Nothing was charged.",
    },
    souscription3ds: 'To try again, open FillSell and pick your plan again: the payment page opens, then approve the payment with your bank (often in its app).',
    souscription: 'To try again, open FillSell and pick your plan again: you can pay with the same card or another one.',
    souscriptionExpiree: 'To try again, open FillSell and pick your plan again: you can pay with another card.',
    pourContinuer: { cloud: 'To keep the Cloud option, ', autre: 'To keep your subscription, ' },
    valider: "confirm the payment on Stripe's secure page: the button below opens it, then approve it with your bank (often in its app).",
    regler: "pay the invoice on Stripe's secure page, with your card or another one.",
    reglerExpiree: "pay the invoice on Stripe's secure page, with another card.",
    valider1: "Confirm the payment on Stripe's secure page: the button below opens it, then approve it with your bank (often in its app).",
    regler1: "You can pay this invoice on Stripe's secure page, with your card or another one.",
    reglerExpiree1: "Pay this invoice on Stripe's secure page, with another card.",
    relance: (d) => `Otherwise, Stripe will try the payment again on ${d}.`,
    actif: 'Your subscription stays active for now.',
    sansLien: "Just reply to this email and we'll send you the link to pay the invoice.",
    bouton: { app: 'Open FillSell', valider: 'Confirm the payment', regler: 'Pay the invoice' },
    fin: 'If it still fails, just reply to this email.',
    raison: "You're getting this message because a payment on your FillSell account didn't go through.",
  },
};

/**
 * Le texte du mail, en données (sans HTML) : le gabarit le met en page.
 * { sujet, titre, preheader, salut, intro, encadre, suite[], bouton|null, fin|null, raisonEnvoi }
 * @param {{ lang?: string, cause?: string, contexte?: string, lienFacture?: string | null,
 *           relanceLe?: string | null, abonnementActif?: boolean, offre?: string | null }} [p]
 */
export function texteEchec({
  lang = 'fr', cause = 'autre', contexte = 'souscription',
  lienFacture: lien = null, relanceLe = null, abonnementActif = false, offre = null,
} = {}) {
  const T = TEXTES[lang === 'en' ? 'en' : 'fr'];
  const c = CAUSES.includes(cause) ? cause : 'autre';
  const ctx = CONTEXTES.includes(contexte) ? contexte : 'souscription';
  const essai = offre === 'cloud' ? 'cloud' : 'autre';
  const validation = c === '3ds';
  const url = ctx === 'souscription' ? null : lienStripeSur(lien);

  const sujet = ctx === 'fin_essai'
    ? T.sujetEssai[essai][validation ? 'validation' : 'echec']
    : T.sujet[validation ? 'validation' : 'echec'];
  const intro = ctx === 'fin_essai' ? T.intro.fin_essai[essai] : T.intro[ctx];

  const suite = [];
  let bouton = null;
  let fin = T.fin;
  if (ctx === 'souscription') {
    suite.push(validation ? T.souscription3ds : c === 'carte_expiree' ? T.souscriptionExpiree : T.souscription);
    bouton = { texte: T.bouton.app, url: LIEN_APP };
  } else if (!url) {
    // Pas de page Stripe réglable (facture déjà close, lien illisible) : aucun
    // bouton plutôt qu'un bouton qui ne mène à rien ; la réponse au mail, elle,
    // est relevée (reponseAuMail du gabarit).
    suite.push(T.sansLien);
    fin = null;
  } else {
    const geste = validation ? 'valider' : c === 'carte_expiree' ? 'reglerExpiree' : 'regler';
    suite.push(ctx === 'fin_essai' ? T.pourContinuer[essai] + T[geste] : T[`${geste}1`]);
    bouton = { texte: validation ? T.bouton.valider : T.bouton.regler, url };
  }
  if (ctx !== 'souscription' && relanceLe && (c === 'carte_refusee' || c === 'autre')) {
    suite.push(T.relance(dateRelance(relanceLe, lang === 'en' ? 'en' : 'fr')));
  }
  if (ctx === 'renouvellement' && abonnementActif === true) suite.push(T.actif);

  return {
    sujet, titre: sujet, preheader: T.preheader, salut: T.salut, intro,
    encadre: T.cause[c], suite, bouton, fin, raisonEnvoi: T.raison,
  };
}
