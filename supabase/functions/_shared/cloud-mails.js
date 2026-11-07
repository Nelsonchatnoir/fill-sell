// ═══════════════════════════════════════════════════════════════════════════
// LES MAILS FILLSELL CLOUD — ÉVÉNEMENTS ET TEXTES — règles pures (08/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Ordre de Nico (07/11 soir, « dernières finitions ») : six mails, propres, au bon prix, un par événement.
//   1. essai_debut      — début d'essai : date de fin, prix qui sera prélevé ensuite, comment arrêter selon le canal ;
//   2. veille           — rappel de la veille (_shared/cloud-rappel-veille.js, passage horaire d'email-tunnel) ;
//   3. paiement         — prélèvement fait (fin d'essai, renouvellement, ou début payant) ;
//   4. arret_essai      — arrêt pendant l'essai : tout est coupé, AUCUN prélèvement — seulement quand la boutique a
//                         confirmé la coupure (Stripe : annulation faite et factures à 0 ; Apple : autoRenewStatus 0
//                         sur la période d'essai ; Google : renouvellement coupé pendant la phase d'essai) ;
//   5. arret_programme  — arrêt après l'essai : programmé, avec la date de fin ;
//   6. impaye           — impayé : Stripe par paiement-echoue.js (inchangé), Apple et Google ici (DID_FAIL_TO_RENEW ;
//                         SUBSCRIPTION_ON_HOLD / IN_GRACE_PERIOD).
// RÈGLES :
//   · le prix vient de la SOURCE du canal (cloud-prix.js : prochaine échéance ; montant payé : facture Stripe,
//     transaction Apple, prix récurrent Google hors remise) — sans montant si la source se tait, JAMAIS un prix écrit ici ;
//   · le texte dit où on gère et où on arrête selon le canal (Apple, Google Play, ou FillSell pour une carte) ;
//   · « FillSell Cloud » partout ; tutoiement, au « on », signé « Nico / FillSell » par le gabarit ; court, sans jargon,
//     sans émoji ; rien ne présente FillSell comme tourné vers une seule plateforme ;
//   · UN mail par événement : la clé (user, événement, clé) est réservée dans public.cloud_mails AVANT l'envoi
//     (migration 20261108090000) — une notification rejouée, ou deux canaux qui disent la même chose, ne font
//     qu'un mail ; registre absent ou illisible = aucun mail (échec fermé), jamais un paiement bloqué.
// Testé sans réseau : scripts/cloud-resiliation-mails-selftest.mjs.

import { essaiEnCoursDuProfil } from './cloud-option.js';
import { formatPrix, prixValide } from './cloud-prix.js';
import { dateFin, LIEN_APP, LIEN_ABONNEMENTS_APPLE, LIEN_ABONNEMENTS_GOOGLE, canalDuRappel } from './cloud-rappel-veille.js';

export const EVENEMENTS_MAIL = Object.freeze(['essai_debut', 'paiement', 'arret_essai', 'arret_programme', 'impaye']);
/** Le type écrit dans email_logs (catégorie 'support' : information de facturation). */
export const typeMail = (evenement) => `cloud_${evenement}`;
export const CATEGORIE_MAILS_CLOUD = 'support';

const instant = (v) => {
  if (v == null || v === '') return null;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const isoOuNull = (v) => { const t = instant(v); return t == null ? null : new Date(t).toISOString(); };

// ═══════════════════════════════════════════════════════════════════════════
// 1. LES ÉVÉNEMENTS — ce qu'une écriture de boutique (Apple, Google) veut dire
// ═══════════════════════════════════════════════════════════════════════════
/**
 * nature : ce que la notification dit, posé par l'appelant —
 *   'debut' (Apple SUBSCRIBED, Google PURCHASED), 'paiement' (Apple DID_RENEW, Google RENEWED / RECOVERED),
 *   'annulation' (renouvellement coupé), 'reprise', 'impaye' (Apple DID_FAIL_TO_RENEW, Google ON_HOLD / IN_GRACE_PERIOD),
 *   'fin' (expiré, remboursé, révoqué : pas de mail).
 * avant : le profil lu AVANT l'écriture ; update : ce qui a été ÉCRIT (null = rien) ; lecture : lectureCloudApple /
 * lectureCloudGoogle ; ref : originalTransactionId / purchaseToken.
 * @param {{ canal: string, nature: string, avant?: any, update?: any, lecture?: any, ref?: any, maintenant?: number }} p
 * @returns {Array<{ evenement: string, cle: string, canal: string, faits: Record<string, any> }>}
 */
export function evenementsBoutique({ canal, nature, avant = {}, update = null, lecture = {}, ref = null, maintenant = Date.now() }) {
  if (!update || !ref) return [];
  const r = String(ref);
  const out = [];
  if ((nature === 'debut' || nature === 'paiement') && lecture?.essai === true && update.cloud_essai_debut) {
    out.push({ evenement: 'essai_debut', cle: r, faits: { finIso: isoOuNull(update.cloud_essai_fin) } });
  }
  if ((nature === 'debut' || nature === 'paiement') && lecture?.essai !== true && update.is_cloud === true) {
    // Le premier paiement APRÈS l'essai : l'essai (non arrêté) finit juste avant la période qui vient d'être payée (au
    // plus 32 jours entre la fin d'essai et la nouvelle échéance). Un paiement qui rattrape un impayé des mois plus
    // tard est un renouvellement ; une référence jamais vue chez nous, un début payant.
    const finEssai = instant(avant?.cloud_essai_fin);
    const nouvelleFin = instant(lecture?.fin);
    const apresEssai = avant?.is_cloud !== true && avant?.cloud_essai_debut != null && avant?.cloud_essai_arrete !== true
      && finEssai != null && nouvelleFin != null && nouvelleFin > finEssai && nouvelleFin - finEssai <= 32 * 86_400_000;
    const contexte = avant?.is_cloud === true ? 'renouvellement' : apresEssai ? 'fin_essai'
      : avant?.cloud_ref != null && String(avant.cloud_ref) === r ? 'renouvellement' : 'debut';
    out.push({
      evenement: 'paiement',
      cle: `${r}:${lecture?.transaction ?? isoOuNull(lecture?.fin) ?? 'periode'}`,
      faits: { contexte, montant: prixValide(lecture?.montantPaye) ?? null, prochaineIso: isoOuNull(lecture?.fin) },
    });
  }
  // L'arrêt programmé : écrit par une coupure (payée), ou gardé par un paiement reçu après la coupure.
  if ((nature === 'annulation' || nature === 'paiement' || nature === 'debut') && update.cloud_arret_fin_periode === true
      && (avant?.is_cloud === true || update.is_cloud === true)) {
    const fin = isoOuNull(update.cloud_periode_fin ?? lecture?.fin ?? avant?.cloud_periode_fin);
    out.push({ evenement: 'arret_programme', cle: `${r}:${fin ?? 'fin'}`, faits: { finIso: fin, demandeIso: new Date(instant(maintenant) ?? Date.now()).toISOString() } });
  }
  // L'arrêt PENDANT l'essai : seulement quand la boutique a confirmé que le renouvellement est coupé.
  if (nature === 'annulation' && update.cloud_essai_arrete === true && lecture?.renouvellementAuto === false) {
    out.push({ evenement: 'arret_essai', cle: r, faits: { arreteIso: isoOuNull(update.cloud_essai_fin) ?? new Date(instant(maintenant) ?? Date.now()).toISOString(), aucunPrelevement: true } });
  }
  if (nature === 'impaye' && (avant?.is_cloud === true || (avant?.cloud_essai_debut != null && avant?.cloud_essai_arrete !== true))) {
    const periode = isoOuNull(avant?.cloud_periode_fin ?? avant?.cloud_essai_fin ?? lecture?.fin);
    out.push({ evenement: 'impaye', cle: `${r}:${periode ?? 'periode'}`, faits: { contexte: avant?.is_cloud === true ? 'renouvellement' : 'fin_essai' } });
  }
  return out.map((e) => ({ ...e, canal }));
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. STRIPE — ce que disent les objets relus chez Stripe
// ═══════════════════════════════════════════════════════════════════════════
const STRIPE_ZERO = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
const STRIPE_TROIS = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND']);
/** Un montant Stripe (plus petite unité) → { montant, devise } ou null. */
export function montantStripe(unites, devise) {
  const d = String(devise ?? '').toUpperCase();
  if (typeof unites !== 'number' || !Number.isInteger(unites) || unites <= 0 || !/^[A-Z]{3}$/.test(d)) return null;
  const div = STRIPE_ZERO.has(d) ? 1 : STRIPE_TROIS.has(d) ? 1000 : 100;
  return prixValide({ montant: unites / div, devise: d });
}
const secIso = (s) => (typeof s === 'number' && s > 0 ? new Date(s * 1000).toISOString() : null);

/** Début d'essai Stripe : l'abonnement Cloud relu est en essai (le verrou « carte » ne l'a pas annulé). */
export function evenementDebutStripe(sub) {
  if (!sub?.id || sub.status !== 'trialing') return [];
  return [{ evenement: 'essai_debut', cle: String(sub.id), canal: 'stripe', faits: { finIso: secIso(sub.trial_end) } }];
}

/**
 * Prélèvement fait : une facture PAYÉE (amount_paid > 0) d'un abonnement Cloud. contexte : 'fin_essai' (la facture
 * qui suit l'essai), 'debut' (souscription payée sans essai), sinon 'renouvellement'.
 * @param {any} facture @param {any} [sub]
 */
export function evenementPaiementStripe(facture, sub = null) {
  if (!facture?.id || !(Number(facture.amount_paid) > 0)) return [];
  const montant = montantStripe(Number(facture.amount_paid), facture.currency);
  const ligne = (facture.lines?.data ?? [])[0] ?? null;
  const finLigne = ligne?.period?.end ?? null;
  const essaiFini = typeof sub?.trial_end === 'number' && Math.abs((ligne?.period?.start ?? 0) - sub.trial_end) < 3600;
  const contexte = facture.billing_reason === 'subscription_create' ? 'debut' : essaiFini ? 'fin_essai' : 'renouvellement';
  return [{ evenement: 'paiement', cle: String(facture.id), canal: 'stripe',
    faits: { contexte, montant, prochaineIso: secIso(finLigne ?? finPeriodeStripe(sub)) } }];
}

/**
 * Un arrêt Stripe CONFIRMÉ par Stripe (l'abonnement relu APRÈS le geste, et ses factures) :
 *   · annulé avant la fin de son essai, toutes ses factures à 0 → arret_essai (aucun prélèvement : Stripe le montre) ;
 *   · encore actif avec cancel_at_period_end → arret_programme (date de fin = current_period_end).
 * @param {any} sub @param {any[]} [factures]
 */
export function evenementArretStripe(sub, factures = []) {
  if (!sub?.id) return [];
  const fini = sub.status === 'canceled';
  if (fini && typeof sub.trial_end === 'number' && typeof sub.ended_at === 'number' && sub.ended_at < sub.trial_end) {
    const paye = (factures ?? []).reduce((s, f) => s + (Number(f?.amount_paid) || 0), 0);
    if (paye !== 0) return [];
    return [{ evenement: 'arret_essai', cle: String(sub.id), canal: 'stripe', faits: { arreteIso: secIso(sub.ended_at), aucunPrelevement: true } }];
  }
  const programme = sub.cancel_at_period_end === true || (typeof sub.cancel_at === 'number' && sub.cancel_at > 0);
  if (!fini && sub.status === 'active' && programme) {
    const fin = secIso(typeof sub.cancel_at === 'number' && sub.cancel_at > 0 ? sub.cancel_at : finPeriodeStripe(sub));
    return [{ evenement: 'arret_programme', cle: `${sub.id}:${fin ?? 'fin'}`, canal: 'stripe', faits: { finIso: fin } }];
  }
  return [];
}

/**
 * La fin de la période en cours d'un abonnement Stripe, quel que soit le format d'API : à la racine (2023-10-16, le
 * SDK des fonctions) ou sur ses éléments (formats récents — celui des ÉVÉNEMENTS reçus par l'endpoint, 2026-03-25).
 * Sans elle, le webhook et cancel-subscription n'écriraient pas la même clé pour le même arrêt (deux mails).
 */
export function finPeriodeStripe(sub) {
  if (typeof sub?.current_period_end === 'number') return sub.current_period_end;
  const fins = (sub?.items?.data ?? []).map((it) => it?.current_period_end).filter((x) => typeof x === 'number');
  return fins.length ? Math.min(...fins) : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LES TEXTES — par événement, par canal, par langue
// ═══════════════════════════════════════════════════════════════════════════
function jourParis(iso, lang) {
  const t = instant(iso);
  if (t == null) return null;
  const parts = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long',
  }).formatToParts(new Date(t));
  const v = (x) => parts.find((p) => p.type === x)?.value ?? '';
  return `${v('weekday')} ${v('day')} ${v('month')}`;
}
const quandAvecHeure = (iso, lang) => (instant(iso) == null ? null : dateFin(iso, lang));
const LIENS = { stripe: LIEN_APP, apple: LIEN_ABONNEMENTS_APPLE, google: LIEN_ABONNEMENTS_GOOGLE, inconnu: LIEN_APP };

const FR = {
  salut: 'Salut,',
  boutique: { apple: 'Apple', google: 'Google Play', stripe: 'Stripe', inconnu: 'ta boutique' },
  ouArreter: {
    stripe: 'dans FillSell, Réglages → Abonnement',
    apple: "dans tes abonnements Apple (sur l'iPhone : Réglages → ton nom → Abonnements)",
    google: 'dans tes abonnements Google Play (Play Store → ton profil → Paiements et abonnements → Abonnements)',
    inconnu: "là où tu l'as pris : dans FillSell (Réglages → Abonnement), ou dans tes abonnements Apple ou Google Play",
  },
  bouton: { stripe: 'Ouvrir FillSell', apple: 'Gérer mon abonnement Apple', google: 'Gérer mon abonnement Google Play', inconnu: 'Ouvrir FillSell' },
  raison: "Tu reçois ce message parce que tu as un abonnement FillSell Cloud. C'est une information sur ta facturation : elle t'est envoyée même si tu t'es désinscrit des actualités de FillSell.",
  extension: "Tes annonces repassent par l'extension FillSell, sur ton ordinateur, comme avant.",
  formule: "Ta formule FillSell ne change pas.",
  accuse: "Ce message est l'accusé de réception de ta demande. Garde-le.",
  essai_debut: {
    sujet: 'Ton essai FillSell Cloud a commencé',
    titre: 'Ton essai FillSell Cloud a commencé',
    preheader: (q) => (q ? `Il est gratuit jusqu'au ${q}.` : "Il est gratuit jusqu'à la fin de l'essai."),
    intro: "Ton essai gratuit de FillSell Cloud a commencé : on publie et on republie pour toi, même quand ton ordinateur est éteint.",
    connecter: 'Pour démarrer, connecte tes plateformes dans FillSell : Réglages → Abonnement → FillSell Cloud → Connecter mes plateformes.',
    fin: (q) => (q ? `L'essai est gratuit jusqu'au ${q} (heure de Paris).` : "L'essai est gratuit jusqu'à sa date de fin, affichée dans FillSell (Réglages → Abonnement)."),
    suite: {
      stripe: (p) => (p ? `Ensuite, si tu ne fais rien, FillSell Cloud continue à ${p} par mois, prélevés sur la carte que tu as enregistrée.` : 'Ensuite, si tu ne fais rien, FillSell Cloud continue au prix mensuel affiché lors de ta souscription, prélevé sur la carte que tu as enregistrée.'),
      apple: (p) => (p ? `Ensuite, si tu ne fais rien, FillSell Cloud continue à ${p} par mois. C'est Apple qui prélève, sur ton compte Apple.` : "Ensuite, si tu ne fais rien, FillSell Cloud continue au prix mensuel affiché dans tes abonnements Apple. C'est Apple qui prélève, sur ton compte Apple."),
      google: (p) => (p ? `Ensuite, si tu ne fais rien, FillSell Cloud continue à ${p} par mois. C'est Google Play qui prélève, sur ton compte Google.` : "Ensuite, si tu ne fais rien, FillSell Cloud continue au prix mensuel affiché dans tes abonnements Google Play. C'est Google Play qui prélève, sur ton compte Google."),
      inconnu: () => 'Ensuite, si tu ne fais rien, FillSell Cloud continue au prix mensuel affiché lors de ton inscription.',
    },
    arret: {
      stripe: "Tu ne veux pas continuer ? Arrête-le avant la fin de l'essai dans FillSell, Réglages → Abonnement : on annule l'abonnement tout de suite, avant la première échéance.",
      apple: "Tu ne veux pas continuer ? Arrête-le avant la fin de l'essai dans tes abonnements Apple (sur l'iPhone : Réglages → ton nom → Abonnements). C'est Apple qui gère cet abonnement : c'est chez Apple qu'il s'arrête, et Apple nous le confirme.",
      google: "Tu ne veux pas continuer ? Arrête-le avant la fin de l'essai dans tes abonnements Google Play (Play Store → ton profil → Paiements et abonnements → Abonnements). C'est Google qui gère cet abonnement : c'est chez Google Play qu'il s'arrête, et Google nous le confirme.",
      inconnu: "Tu ne veux pas continuer ? Arrête-le avant la fin de l'essai là où tu l'as pris : dans FillSell (Réglages → Abonnement), ou dans tes abonnements Apple ou Google Play.",
    },
  },
  paiement: {
    sujet: { fin_essai: 'Ton essai est fini : FillSell Cloud continue', renouvellement: 'FillSell Cloud est renouvelé', debut: 'FillSell Cloud a commencé' },
    titre: { fin_essai: 'FillSell Cloud continue', renouvellement: 'FillSell Cloud est renouvelé', debut: 'FillSell Cloud a commencé' },
    intro: { fin_essai: 'Ton essai gratuit est terminé, et FillSell Cloud continue.', renouvellement: 'Ton abonnement FillSell Cloud vient d’être renouvelé.', debut: 'Ton abonnement FillSell Cloud a commencé.' },
    montant: {
      stripe: (p) => (p ? `On a bien reçu ${p}, prélevés sur ta carte.` : 'Le paiement est passé, sur ta carte.'),
      apple: (p) => (p ? `Apple a prélevé ${p} sur ton compte Apple.` : 'Apple a prélevé ton abonnement sur ton compte Apple (le détail est dans tes achats Apple).'),
      google: (p) => (p ? `Google Play a prélevé ${p} sur ton compte Google.` : 'Google Play a prélevé ton abonnement sur ton compte Google (le détail est dans tes abonnements Google Play).'),
      inconnu: () => 'Le paiement de ton abonnement est passé.',
    },
    prochaine: (j) => `Prochaine échéance : ${j}.`,
    arret: (ou) => `Tu peux l'arrêter quand tu veux ${ou} : il tourne alors jusqu'à la fin de la période déjà payée, et rien n'est prélevé ensuite.`,
    preheader: (p) => (p ? `Paiement reçu : ${p}.` : 'Ton paiement est passé.'),
  },
  arret_essai: {
    sujet: 'FillSell Cloud est arrêté, sans aucun prélèvement',
    titre: 'FillSell Cloud est arrêté',
    preheader: 'Aucun prélèvement : ton essai a été arrêté avant sa fin.',
    intro: {
      stripe: (q) => (q ? `C'est fait : on a arrêté ton essai de FillSell Cloud le ${q} (heure de Paris).` : "C'est fait : on a arrêté ton essai de FillSell Cloud."),
      apple: (q) => (q ? `Apple nous a confirmé l'arrêt de ton essai FillSell Cloud, le ${q} (heure de Paris).` : "Apple nous a confirmé l'arrêt de ton essai FillSell Cloud."),
      google: (q) => (q ? `Google Play nous a confirmé l'arrêt de ton essai FillSell Cloud, le ${q} (heure de Paris).` : "Google Play nous a confirmé l'arrêt de ton essai FillSell Cloud."),
      inconnu: () => "L'arrêt de ton essai FillSell Cloud est confirmé.",
    },
    aucun: {
      stripe: "Aucun prélèvement : l'abonnement est annulé chez Stripe avant la fin de l'essai, ta carte ne sera pas débitée.",
      apple: "Aucun prélèvement : le renouvellement est coupé avant la fin de l'essai, Apple ne prélèvera rien.",
      google: "Aucun prélèvement : le renouvellement est coupé avant la fin de l'essai, Google Play ne prélèvera rien.",
      inconnu: "Aucun prélèvement : l'essai est arrêté avant sa fin.",
    },
    coupe: "FillSell Cloud s'est arrêté tout de suite.",
    revenir: "Tu changes d'avis ? Tu peux reprendre FillSell Cloud depuis l'app quand tu veux. L'essai gratuit, lui, ne se prend qu'une fois.",
  },
  arret_programme: {
    sujet: (j) => (j ? `FillSell Cloud s'arrêtera le ${j}` : 'FillSell Cloud s’arrêtera à la fin de la période payée'),
    titre: "L'arrêt de FillSell Cloud est enregistré",
    preheader: (j) => (j ? `Il continue jusqu'au ${j}, puis s'arrête.` : "Il continue jusqu'à la fin de la période payée, puis s'arrête."),
    intro: {
      stripe: "C'est noté : tu as arrêté FillSell Cloud.",
      apple: 'Apple nous a confirmé que tu as coupé le renouvellement de FillSell Cloud.',
      google: 'Google Play nous a confirmé que tu as coupé le renouvellement de FillSell Cloud.',
      inconnu: "L'arrêt de FillSell Cloud est enregistré.",
    },
    fin: (j) => (j ? `Il continue jusqu'au ${j}, la fin de la période déjà payée, puis il s'arrête. Rien ne sera prélevé ensuite.` : "Il continue jusqu'à la fin de la période déjà payée, puis il s'arrête. Rien ne sera prélevé ensuite."),
    apres: "Après cette date, tes annonces repassent par l'extension FillSell, sur ton ordinateur.",
    garder: {
      stripe: (j) => `Tu changes d'avis ? Dans FillSell, Réglages → Abonnement → Garder le Cloud${j ? `, avant le ${j}` : ''} : rien ne sera coupé.`,
      apple: (j) => `Tu changes d'avis ? Remets le renouvellement dans tes abonnements Apple${j ? ` avant le ${j}` : ''} : rien ne sera coupé.`,
      google: (j) => `Tu changes d'avis ? Remets le renouvellement dans tes abonnements Google Play${j ? ` avant le ${j}` : ''} : rien ne sera coupé.`,
      inconnu: (j) => `Tu changes d'avis ? Remets-le là où tu l'as pris${j ? `, avant le ${j}` : ''} : rien ne sera coupé.`,
    },
  },
  impaye: {
    sujet: "Ton paiement FillSell Cloud n'est pas passé",
    titre: "Ton paiement n'est pas passé",
    preheader: 'FillSell Cloud est en pause en attendant le paiement.',
    intro: {
      fin_essai: { apple: "Ton essai est terminé, mais Apple n'a pas réussi à prélever le premier mois de FillSell Cloud.", google: "Ton essai est terminé, mais Google Play n'a pas réussi à prélever le premier mois de FillSell Cloud." },
      renouvellement: { apple: "Apple n'a pas réussi à prélever le renouvellement de FillSell Cloud.", google: "Google Play n'a pas réussi à prélever le renouvellement de FillSell Cloud." },
    },
    pause: "En attendant, FillSell Cloud est en pause : tes annonces repassent par l'extension FillSell, sur ton ordinateur.",
    relancer: {
      apple: 'Pour le relancer, mets à jour ton moyen de paiement chez Apple (sur l’iPhone : Réglages → ton nom → Paiement et livraison). Dès que le paiement passe, FillSell Cloud repart tout seul.',
      google: 'Pour le relancer, mets à jour ton moyen de paiement chez Google Play (Play Store → ton profil → Paiements et abonnements → Modes de paiement). Dès que le paiement passe, FillSell Cloud repart tout seul.',
    },
  },
};

const EN = {
  salut: 'Hi,',
  boutique: { apple: 'Apple', google: 'Google Play', stripe: 'Stripe', inconnu: 'your store' },
  ouArreter: {
    stripe: 'in FillSell, Settings → Subscription',
    apple: 'in your Apple subscriptions (on iPhone: Settings → your name → Subscriptions)',
    google: 'in your Google Play subscriptions (Play Store → your profile → Payments & subscriptions → Subscriptions)',
    inconnu: 'where you took it: in FillSell (Settings → Subscription), or in your Apple or Google Play subscriptions',
  },
  bouton: { stripe: 'Open FillSell', apple: 'Manage my Apple subscription', google: 'Manage my Google Play subscription', inconnu: 'Open FillSell' },
  raison: 'You are getting this email because you have a FillSell Cloud subscription. It is billing information, so it is sent even if you unsubscribed from FillSell news.',
  extension: 'Your listings go back through the FillSell extension on your computer, as before.',
  formule: 'Your FillSell plan does not change.',
  accuse: 'This email is the acknowledgement of your request. Keep it.',
  essai_debut: {
    sujet: 'Your FillSell Cloud trial has started',
    titre: 'Your FillSell Cloud trial has started',
    preheader: (q) => (q ? `It is free until ${q}.` : 'It is free until the end of the trial.'),
    intro: 'Your free FillSell Cloud trial has started: we list and relist for you, even when your computer is off.',
    connecter: 'To get going, connect your platforms in FillSell: Settings → Subscription → FillSell Cloud → Connect my platforms.',
    fin: (q) => (q ? `The trial is free until ${q} (Paris time).` : 'The trial is free until its end date, shown in FillSell (Settings → Subscription).'),
    suite: {
      stripe: (p) => (p ? `After that, if you do nothing, FillSell Cloud continues at ${p} a month, charged to the card you saved.` : 'After that, if you do nothing, FillSell Cloud continues at the monthly price shown when you subscribed, charged to the card you saved.'),
      apple: (p) => (p ? `After that, if you do nothing, FillSell Cloud continues at ${p} a month. Apple charges it, to your Apple Account.` : 'After that, if you do nothing, FillSell Cloud continues at the monthly price shown in your Apple subscriptions. Apple charges it, to your Apple Account.'),
      google: (p) => (p ? `After that, if you do nothing, FillSell Cloud continues at ${p} a month. Google Play charges it, to your Google Account.` : 'After that, if you do nothing, FillSell Cloud continues at the monthly price shown in your Google Play subscriptions. Google Play charges it, to your Google Account.'),
      inconnu: () => 'After that, if you do nothing, FillSell Cloud continues at the monthly price shown when you signed up.',
    },
    arret: {
      stripe: "Don't want to continue? Stop it before the trial ends in FillSell, Settings → Subscription: we cancel the subscription straight away, before the first payment is due.",
      apple: "Don't want to continue? Stop it before the trial ends in your Apple subscriptions (on iPhone: Settings → your name → Subscriptions). Apple manages this subscription: you stop it with Apple, and Apple confirms it to us.",
      google: "Don't want to continue? Stop it before the trial ends in your Google Play subscriptions (Play Store → your profile → Payments & subscriptions → Subscriptions). Google manages this subscription: you stop it with Google Play, and Google confirms it to us.",
      inconnu: "Don't want to continue? Stop it before the trial ends where you took it: in FillSell (Settings → Subscription), or in your Apple or Google Play subscriptions.",
    },
  },
  paiement: {
    sujet: { fin_essai: 'Your trial is over: FillSell Cloud continues', renouvellement: 'FillSell Cloud has renewed', debut: 'FillSell Cloud has started' },
    titre: { fin_essai: 'FillSell Cloud continues', renouvellement: 'FillSell Cloud has renewed', debut: 'FillSell Cloud has started' },
    intro: { fin_essai: 'Your free trial is over, and FillSell Cloud continues.', renouvellement: 'Your FillSell Cloud subscription has just renewed.', debut: 'Your FillSell Cloud subscription has started.' },
    montant: {
      stripe: (p) => (p ? `We received ${p}, charged to your card.` : 'The payment went through, on your card.'),
      apple: (p) => (p ? `Apple charged ${p} to your Apple Account.` : 'Apple charged your subscription to your Apple Account (details are in your Apple purchases).'),
      google: (p) => (p ? `Google Play charged ${p} to your Google Account.` : 'Google Play charged your subscription to your Google Account (details are in your Google Play subscriptions).'),
      inconnu: () => 'Your subscription payment went through.',
    },
    prochaine: (j) => `Next payment: ${j}.`,
    arret: (ou) => `You can stop it whenever you like ${ou}: it then runs until the end of the period already paid for, and nothing is charged after that.`,
    preheader: (p) => (p ? `Payment received: ${p}.` : 'Your payment went through.'),
  },
  arret_essai: {
    sujet: 'FillSell Cloud is stopped, with no charge',
    titre: 'FillSell Cloud is stopped',
    preheader: 'No charge: your trial was stopped before it ended.',
    intro: {
      stripe: (q) => (q ? `Done: we stopped your FillSell Cloud trial on ${q} (Paris time).` : 'Done: we stopped your FillSell Cloud trial.'),
      apple: (q) => (q ? `Apple confirmed to us that your FillSell Cloud trial was stopped, on ${q} (Paris time).` : 'Apple confirmed to us that your FillSell Cloud trial was stopped.'),
      google: (q) => (q ? `Google Play confirmed to us that your FillSell Cloud trial was stopped, on ${q} (Paris time).` : 'Google Play confirmed to us that your FillSell Cloud trial was stopped.'),
      inconnu: () => 'Stopping your FillSell Cloud trial is confirmed.',
    },
    aucun: {
      stripe: 'No charge: the subscription is cancelled at Stripe before the trial ended, your card will not be charged.',
      apple: 'No charge: renewal is turned off before the trial ended, Apple will not charge anything.',
      google: 'No charge: renewal is turned off before the trial ended, Google Play will not charge anything.',
      inconnu: 'No charge: the trial was stopped before it ended.',
    },
    coupe: 'FillSell Cloud stopped straight away.',
    revenir: 'Changed your mind? You can take FillSell Cloud again from the app whenever you like. The free trial can only be taken once.',
  },
  arret_programme: {
    sujet: (j) => (j ? `FillSell Cloud will stop on ${j}` : 'FillSell Cloud will stop at the end of the paid period'),
    titre: 'Stopping FillSell Cloud is recorded',
    preheader: (j) => (j ? `It keeps running until ${j}, then stops.` : 'It keeps running until the end of the paid period, then stops.'),
    intro: {
      stripe: 'Noted: you stopped FillSell Cloud.',
      apple: 'Apple confirmed to us that you turned off the renewal of FillSell Cloud.',
      google: 'Google Play confirmed to us that you turned off the renewal of FillSell Cloud.',
      inconnu: 'Stopping FillSell Cloud is recorded.',
    },
    fin: (j) => (j ? `It keeps running until ${j}, the end of the period already paid for, then it stops. Nothing is charged after that.` : 'It keeps running until the end of the period already paid for, then it stops. Nothing is charged after that.'),
    apres: 'After that date, your listings go back through the FillSell extension on your computer.',
    garder: {
      stripe: (j) => `Changed your mind? In FillSell, Settings → Subscription → Keep the Cloud${j ? `, before ${j}` : ''}: nothing will be cut off.`,
      apple: (j) => `Changed your mind? Turn renewal back on in your Apple subscriptions${j ? ` before ${j}` : ''}: nothing will be cut off.`,
      google: (j) => `Changed your mind? Turn renewal back on in your Google Play subscriptions${j ? ` before ${j}` : ''}: nothing will be cut off.`,
      inconnu: (j) => `Changed your mind? Turn it back on where you took it${j ? `, before ${j}` : ''}: nothing will be cut off.`,
    },
  },
  impaye: {
    sujet: "Your FillSell Cloud payment didn't go through",
    titre: "Your payment didn't go through",
    preheader: 'FillSell Cloud is paused until the payment goes through.',
    intro: {
      fin_essai: { apple: "Your trial is over, but Apple couldn't charge the first month of FillSell Cloud.", google: "Your trial is over, but Google Play couldn't charge the first month of FillSell Cloud." },
      renouvellement: { apple: "Apple couldn't charge the renewal of FillSell Cloud.", google: "Google Play couldn't charge the renewal of FillSell Cloud." },
    },
    pause: 'Meanwhile, FillSell Cloud is paused: your listings go back through the FillSell extension on your computer.',
    relancer: {
      apple: 'To restart it, update your payment method with Apple (on iPhone: Settings → your name → Payment & Shipping). As soon as the payment goes through, FillSell Cloud starts again on its own.',
      google: 'To restart it, update your payment method with Google Play (Play Store → your profile → Payments & subscriptions → Payment methods). As soon as the payment goes through, FillSell Cloud starts again on its own.',
    },
  },
};

/**
 * Le contenu d'un mail Cloud, prêt pour la mise en page (mailCloud, _shared/emails-fillsell.ts).
 *   evenement : EVENEMENTS_MAIL ; canal : stripe | apple | google ; faits : ceux de l'événement ;
 *   prix : le prix de la PROCHAINE échéance lu à la source (essai_debut) — null → aucune somme.
 * Rend { sujet, preheader, titre, paragraphes, bouton, raisonEnvoi, type, categorie, prixAffiche } ou null
 * (événement inconnu, ou impayé sur un canal qui a déjà son mail : Stripe).
 * @param {{ evenement: string, lang?: string, canal?: string | null, faits?: any, prix?: any }} p
 * @returns {any}
 */
export function texteMailCloud({ evenement, lang = 'fr', canal = null, faits = {}, prix = null }) {
  const en = lang === 'en';
  const L = en ? 'en' : 'fr';
  const T = en ? EN : FR;
  const c = canalDuRappel(canal);
  const bouton = { texte: T.bouton[c], url: LIENS[c] };
  const base = { raisonEnvoi: T.raison, type: typeMail(evenement), categorie: CATEGORIE_MAILS_CLOUD, canal: c, lienDesinscription: null };
  if (evenement === 'essai_debut') {
    const q = quandAvecHeure(faits.finIso, L);
    const p = formatPrix(prix, L);
    const E = T.essai_debut;
    return { ...base, sujet: E.sujet, titre: E.titre, preheader: E.preheader(q), prixAffiche: p, bouton,
      paragraphes: [T.salut, E.intro, E.fin(q), E.suite[c](p), E.arret[c], E.connecter] };
  }
  if (evenement === 'paiement') {
    const ctx = ['fin_essai', 'renouvellement', 'debut'].includes(faits.contexte) ? faits.contexte : 'renouvellement';
    const p = formatPrix(faits.montant, L);
    const j = jourParis(faits.prochaineIso, L);
    const E = T.paiement;
    return { ...base, sujet: E.sujet[ctx], titre: E.titre[ctx], preheader: E.preheader(p), prixAffiche: p, bouton,
      paragraphes: [T.salut, E.intro[ctx], E.montant[c](p), ...(j ? [E.prochaine(j)] : []), E.arret(T.ouArreter[c])] };
  }
  if (evenement === 'arret_essai') {
    if (faits.aucunPrelevement !== true) return null;   // jamais « aucun prélèvement » sans la confirmation de la boutique
    const q = quandAvecHeure(faits.arreteIso, L);
    const E = T.arret_essai;
    return { ...base, sujet: E.sujet, titre: E.titre, preheader: E.preheader, prixAffiche: null, bouton: { texte: T.bouton.stripe, url: LIEN_APP },
      paragraphes: [T.salut, E.intro[c](q), E.aucun[c], `${E.coupe} ${T.extension}`, T.formule, E.revenir, ...(c === 'stripe' ? [T.accuse] : [])] };
  }
  if (evenement === 'arret_programme') {
    const j = jourParis(faits.finIso, L);
    const E = T.arret_programme;
    return { ...base, sujet: E.sujet(j), titre: E.titre, preheader: E.preheader(j), prixAffiche: null, bouton,
      paragraphes: [T.salut, E.intro[c], E.fin(j), E.apres, E.garder[c](j), ...(c === 'stripe' ? [T.accuse] : [])] };
  }
  if (evenement === 'impaye') {
    if (c !== 'apple' && c !== 'google') return null;   // Stripe : son mail existe déjà (paiement-echoue.js)
    const ctx = faits.contexte === 'fin_essai' ? 'fin_essai' : 'renouvellement';
    const E = T.impaye;
    return { ...base, sujet: E.sujet, titre: E.titre, preheader: E.preheader, prixAffiche: null, bouton,
      paragraphes: [T.salut, E.intro[ctx][c], E.pause, E.relancer[c]] };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. L'ENVOI — un mail par événement (dépendances injectées : registre, rendu, envoi)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * deps :
 *   reserver({ userId, evenement, cle, canal }) → 'pris' | 'deja' | 'erreur'  (INSERT dans public.cloud_mails)
 *   liberer({ userId, evenement, cle })                                       (l'envoi a échoué : renvoyable)
 *   noter({ userId, evenement, cle, detail })                                 (trace de l'envoi, jamais bloquante)
 *   lirePrix(evenement) → Promise<prix | null>                                (essai_debut : prochaine échéance)
 *   rendre(texte) → { sujet, html }                                           (mailCloud)
 *   envoyer({ to, subject, html, userId, type }) → { envoye, motif? }         (envoyerEmail, catégorie support)
 * Ne lève JAMAIS : un mail ne bloque ni ne fait rejouer un paiement.
 * @param {{ evenements?: any[], userId: string, email?: string | null, lang?: string, canal?: string | null, deps: any }} p
 * @returns {Promise<Array<{ evenement: string, cle: string, resultat: string }>>}
 */
export async function envoyerMailsCloud({ evenements = [], userId, email, lang = 'fr', canal = null, deps }) {
  const bilan = [];
  for (const e of evenements ?? []) {
    const ligne = { evenement: e?.evenement, cle: e?.cle, resultat: 'rien' };
    bilan.push(ligne);
    try {
      if (!EVENEMENTS_MAIL.includes(e?.evenement) || !e?.cle || !userId) { ligne.resultat = 'evenement_invalide'; continue; }
      if (typeof email !== 'string' || !email.includes('@')) { ligne.resultat = 'sans_adresse'; continue; }
      const cn = e.canal ?? canal;
      // Le texte d'abord (sans prix) : un événement qui n'a pas de mail ne réserve rien.
      if (!texteMailCloud({ evenement: e.evenement, lang, canal: cn, faits: e.faits ?? {}, prix: null })) { ligne.resultat = 'sans_mail'; continue; }
      const r = await deps.reserver({ userId, evenement: e.evenement, cle: e.cle, canal: cn });
      if (r !== 'pris') { ligne.resultat = r === 'deja' ? 'deja_envoye' : 'registre_illisible'; continue; }
      let prix = null;
      if (e.evenement === 'essai_debut' && typeof deps.lirePrix === 'function') {
        try { prix = prixValide(await deps.lirePrix(e.evenement)); } catch { prix = null; }
      }
      const t = texteMailCloud({ evenement: e.evenement, lang, canal: cn, faits: e.faits ?? {}, prix });
      const m = deps.rendre({ ...t, lang });
      const env = await deps.envoyer({ to: email, subject: m.sujet, html: m.html, userId, type: t.type });
      if (env?.envoye) {
        ligne.resultat = 'envoye';
        await Promise.resolve(deps.noter?.({ userId, evenement: e.evenement, cle: e.cle, detail: { envoye: true, prix: t.prixAffiche ?? null } })).catch(() => {});
      } else {
        ligne.resultat = `envoi_${env?.motif ?? 'echec'}`;
        await Promise.resolve(deps.liberer?.({ userId, evenement: e.evenement, cle: e.cle })).catch(() => {});
      }
    } catch (err) {
      ligne.resultat = `erreur:${String(err?.message ?? err).slice(0, 120)}`;
    }
  }
  return bilan;
}

/** Le profil (avant) est-il en essai Cloud en cours ? (réexport pour les appelants Stripe) */
export const enEssai = (profil, maintenant = Date.now()) => essaiEnCoursDuProfil(profil, maintenant);
