// ═══════════════════════════════════════════════════════════════════════════
// FILLSELL CLOUD — LE MAIL DE LA VEILLE DE FIN D'ESSAI — RÈGLES PURES
// (conception du 04/10/2026 soir — branché dans email-tunnel DERRIÈRE une
// garde : rien ne part tant que les colonnes Cloud n'existent pas)
// ═══════════════════════════════════════════════════════════════════════════
// Décisions de Nico : un essai gratuit de 7 jours, carte demandée, qui devient
// payant sans geste. Le mail la nomme « FillSell Cloud », jamais autrement
// (décision du 03/11 : le nom ; « sans ordinateur » est la promesse).
// (07/11 soir, essai bac à sable Apple de Nico) LE TEXTE DÉPEND DU CANAL et LE
// PRIX VIENT DE LA SOURCE :
//   · le montant est celui que le canal prélèvera à l'échéance, lu au moment du
//     mail (_shared/cloud-prix.js : abonnement Stripe, renouvellement signé
//     d'Apple, subscriptionsv2 de Google) ; source muette → une phrase SANS
//     montant, jamais un montant écrit en dur ;
//   · qui prélève : la carte enregistrée chez FillSell (Stripe) SEULEMENT pour
//     Stripe ; Apple ou Google Play prélèvent sur le moyen de paiement de leur
//     compte ;
//   · comment arrêter : Stripe → Réglages → Abonnement (vrai arrêt : l'abonnement
//     est annulé chez Stripe avant la première échéance) ; Apple / Google → leur
//     page d'abonnements (lien direct), car eux seuls arrêtent et confirment.
//     ⛔ Jamais « rien n'est facturé » : FillSell ne peut pas le promettre pour
//     une boutique.
// La personne est prévenue AVANT, par e-mail,
// par la porte unique existante (envoyerEmail, _shared/desinscription.ts).
//   · type `cloud_essai_veille` : UN par essai, donc un par personne à vie →
//     dans l'index email_logs_one_shot_unique (PROPOSITION SQL), envoi en
//     mode 'reservation' : jamais deux ;
//   · catégorie 'support' : c'est une INFORMATION DE FACTURATION, elle part
//     même chez quelqu'un qui s'est désinscrit des actualités (pas de lien de
//     désinscription, un lien pour arrêter l'essai à la place) ;
//   · elle COMPTE dans le plafond de 2 mails par 24 h (Nico) : elle cherche une
//     place libre dans son créneau, et sa ligne email_logs bloque ensuite le
//     marketing du jour (le plafond d'envoi-ponctuel compte TOUTES les lignes) ;
//     au dernier créneau elle part quand même — elle doit partir.
//
// Le cadre (vérifié le 04/10/2026) :
//   · CJUE, 5 oct. 2023, C-565/22 (Sofatutor) : le consommateur doit être
//     informé « de manière claire, compréhensible et explicite », À LA
//     CONCLUSION du contrat, que la prestation deviendra payante après la
//     période gratuite — sinon un second droit de rétractation s'ouvre au
//     passage au payant. C'est l'écran de souscription qui le porte ; ce mail
//     le rappelle.
//   · Code de la consommation, art. L215-1 (Chatel) : prévenir 1 à 3 mois
//     avant le terme d'un contrat à DURÉE DÉTERMINÉE reconduit tacitement — ne
//     s'applique pas tel quel à un essai de 7 jours. Aucun texte français
//     n'impose un rappel à J-1 : c'est une obligation de loyauté et de bonne
//     pratique, pas un délai légal.
//   · Réseaux de cartes : Visa (avril 2020) et Mastercard (septembre 2022)
//     imposent un rappel avant le premier prélèvement d'un essai ; Mastercard,
//     pour un essai de PLUS de 7 jours, entre 3 et 7 jours avant la fin. Notre
//     essai fait 7 jours tout juste : le préréglage `mastercard` est prêt si
//     l'essai s'allonge ou si la banque le demande.
// Testé : scripts/cloud-rappel-veille-selftest.mjs (npm run selftest:cloud-rappel-veille)
// et, mail × canal, scripts/cloud-mails-canaux-selftest.mjs (npm run selftest:cloud-mails-canaux).

import { PRODUIT_CLOUD_GOOGLE } from './cloud-option.js';
import { PACKAGE_GOOGLE, formatPrix } from './cloud-prix.js';

const HEURE_MS = 3_600_000;
const instant = (v) => {
  if (v == null || v === '') return null;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const nonVide = (v) => typeof v === 'string' && v.trim() !== '';

export const TYPE_RAPPEL = 'cloud_essai_veille';
export const CATEGORIE_RAPPEL = 'support';
export const DEDUP_RAPPEL = 'reservation';
// (07/11 soir) Plus de prix écrit ici : le montant du mail vient de la source du canal (cloud-prix.js).
export const LIEN_APP = 'https://fillsell.app';
// Les pages d'abonnements des boutiques (ordre de Nico du 07/11) : Apple, et Google Play sur le produit Cloud.
export const LIEN_ABONNEMENTS_APPLE = 'https://apps.apple.com/account/subscriptions';
export const LIEN_ABONNEMENTS_GOOGLE = `https://play.google.com/store/account/subscriptions?sku=${PRODUIT_CLOUD_GOOGLE}&package=${PACKAGE_GOOGLE}`;
export const CANAUX_RAPPEL = Object.freeze(['stripe', 'apple', 'google']);
/** Le canal du texte : stripe | apple | google, sinon « inconnu » (texte qui ne suppose aucun canal). */
export const canalDuRappel = (canal) => (CANAUX_RAPPEL.includes(String(canal)) ? String(canal) : 'inconnu');

// Le créneau : il s'ouvre `ouvertureAvantFinH` heures avant la fin ; jusqu'à
// `forcageAvantFinH` il respecte le plafond (place libre), ensuite il part
// quoi qu'il arrive. Toujours de jour (8 h – 22 h, Paris), comme le reste du
// tunnel : entre le forçage (24 h avant) et la fin, il y a toujours au moins
// 14 heures de jour.
export const PRESETS = Object.freeze({
  veille: Object.freeze({ ouvertureAvantFinH: 48, forcageAvantFinH: 24 }),     // J-2 → J-1 (Nico)
  mastercard: Object.freeze({ ouvertureAvantFinH: 96, forcageAvantFinH: 72 }), // 3 à 7 j avant la fin
});
export const PARAMETRES_RAPPEL = Object.freeze({
  ...PRESETS.veille,
  // (06/10, Nico) Aucun mail automatique n'est retenu par un plafond de mails :
  // le rappel part dès l'ouverture de son créneau, de jour.
  plafond24h: Number.POSITIVE_INFINITY,
  heureDebut: 8,   // = RELANCE_H_DEBUT d'email-tunnel
  heureFin: 22,    // = RELANCE_H_FIN
});

/** Les essais à regarder à ce passage : fin dans ]maintenant, maintenant + ouverture]. */
export function fenetreRequete(maintenant = Date.now(), p = PARAMETRES_RAPPEL) {
  const now = instant(maintenant);
  return {
    finApres: new Date(now).toISOString(),
    finAvant: new Date(now + p.ouvertureAvantFinH * HEURE_MS).toISOString(),
  };
}

/**
 * Qui reçoit le rappel, et quand.
 *   profil     : { email, is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete }
 *   dejaEnvoye : une ligne email_logs `cloud_essai_veille` existe déjà pour ce compte
 *   mails24h   : lignes email_logs de la personne sur 24 h glissantes (tous types, comme envoi-ponctuel)
 *   heureParis : heure (0-23) à Paris ; illisible → on attend (échec fermé, comme le tunnel)
 * → { action: 'envoyer' | 'attendre' | 'rien', raison, force: boolean }
 */
export function decisionRappel({ profil, dejaEnvoye = false, mails24h = 0, heureParis, maintenant = Date.now(), p = PARAMETRES_RAPPEL }) {
  const rien = (raison) => ({ action: 'rien', raison, force: false });
  const attendre = (raison) => ({ action: 'attendre', raison, force: false });
  if (!profil || !nonVide(profil.email)) return rien('sans_adresse');
  const debut = instant(profil.cloud_essai_debut);
  const fin = instant(profil.cloud_essai_fin);
  if (debut == null || fin == null) return rien('pas_d_essai');
  if (profil.cloud_essai_arrete === true) return rien('essai_arrete');        // arrêté : rien ne sera facturé
  if (profil.is_cloud === true) return rien('deja_payant');                   // déjà payée : pas de surprise à annoncer
  if (dejaEnvoye) return rien('deja_envoye');
  const now = instant(maintenant);
  if (now >= fin) return rien('essai_fini');
  if (now < fin - p.ouvertureAvantFinH * HEURE_MS) return attendre('pas_encore');
  const h = Number(heureParis);
  if (!Number.isFinite(h) || h < p.heureDebut || h >= p.heureFin) return attendre('nuit');
  if (now >= fin - p.forcageAvantFinH * HEURE_MS) return { action: 'envoyer', raison: 'dernier_creneau', force: true };
  if ((Number(mails24h) || 0) < p.plafond24h) return { action: 'envoyer', raison: 'place_libre', force: false };
  return attendre('plafond_plein');
}

function partiesDate(iso, lang) {
  const parts = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const v = (t) => parts.find((x) => x.type === t)?.value ?? '';
  return { jour: v('weekday'), num: v('day'), mois: v('month'), h: v('hour'), m: v('minute') };
}

/** « mardi 13 octobre à 18h00 » / « Tuesday 13 October at 18:00 » — heure de Paris, sans dépendre de la version d'ICU. */
export function dateFin(iso, lang = 'fr') {
  const d = partiesDate(iso, lang);
  return lang === 'en' ? `${d.jour} ${d.num} ${d.mois} at ${d.h}:${d.m}` : `${d.jour} ${d.num} ${d.mois} à ${d.h}h${d.m}`;
}


// ── Les textes, par langue et par canal (07/11 soir) ──────────────────────────
// Chaque phrase nomme « FillSell Cloud » ; aucune ne promet « rien n'est facturé » ; le montant n'apparaît que
// s'il a été LU à la source (prix ≠ null), sinon la phrase renvoie à l'endroit où le canal affiche son prix.
const TEXTES = {
  fr: {
    sujet: (quand) => `Ton essai FillSell Cloud se termine le ${quand}`,
    titre: 'Ton essai gratuit se termine bientôt',
    fin: (quand) => `Ton essai gratuit de FillSell Cloud se termine le ${quand} (heure de Paris).`,
    suite: {
      stripe: (prix, carte) => (prix
        ? `Si tu ne fais rien, FillSell Cloud continue à partir de cette date, à ${prix} par mois, prélevés sur la carte que tu as enregistrée${carte ? ` (finissant par ${carte})` : ''}.`
        : `Si tu ne fais rien, FillSell Cloud continue à partir de cette date, au prix mensuel indiqué lors de ta souscription, prélevé sur la carte que tu as enregistrée${carte ? ` (finissant par ${carte})` : ''}.`),
      apple: (prix) => (prix
        ? `Si tu ne fais rien, FillSell Cloud continue à partir de cette date, à ${prix} par mois. C'est Apple qui prélève, sur le moyen de paiement de ton compte Apple.`
        : 'Si tu ne fais rien, FillSell Cloud continue à partir de cette date, au prix mensuel indiqué dans tes abonnements Apple. C\'est Apple qui prélève, sur le moyen de paiement de ton compte Apple.'),
      google: (prix) => (prix
        ? `Si tu ne fais rien, FillSell Cloud continue à partir de cette date, à ${prix} par mois. C'est Google Play qui prélève, sur le moyen de paiement de ton compte Google.`
        : 'Si tu ne fais rien, FillSell Cloud continue à partir de cette date, au prix mensuel indiqué dans tes abonnements Google Play. C\'est Google Play qui prélève, sur le moyen de paiement de ton compte Google.'),
      inconnu: () => 'Si tu ne fais rien, FillSell Cloud continue à partir de cette date, au prix mensuel indiqué lors de ton inscription.',
    },
    arret: {
      stripe: 'Si tu ne veux pas continuer, arrête l\'essai avant cette date dans FillSell, Réglages → Abonnement : l\'abonnement est alors annulé tout de suite chez Stripe, avant la première échéance.',
      apple: 'Si tu ne veux pas continuer, résilie avant cette date dans tes abonnements Apple (le bouton ci-dessous les ouvre ; sur l\'iPhone : Réglages → ton nom → Abonnements). C\'est Apple qui gère cet abonnement : la résiliation se fait chez Apple, et c\'est Apple qui la confirme.',
      google: 'Si tu ne veux pas continuer, résilie avant cette date dans tes abonnements Google Play (le bouton ci-dessous les ouvre ; dans l\'application Play Store : ton profil → Paiements et abonnements → Abonnements). C\'est Google qui gère cet abonnement : la résiliation se fait chez Google Play, et c\'est Google qui la confirme.',
      inconnu: 'Si tu ne veux pas continuer, arrête-le avant cette date là où tu l\'as pris : dans FillSell (Réglages → Abonnement) pour un paiement par carte sur le site, ou dans tes abonnements Apple ou Google Play pour un achat dans l\'application.',
    },
    forfait: 'Ta formule FillSell ne change pas : ce message ne parle que de FillSell Cloud.',
    preheader: (prix) => (prix ? `Si tu ne fais rien, FillSell Cloud continue à ${prix} par mois.` : 'Si tu ne fais rien, FillSell Cloud devient payant à la fin de l\'essai.'),
    bouton: { stripe: 'Ouvrir FillSell', apple: 'Gérer mon abonnement Apple', google: 'Gérer mon abonnement Google Play', inconnu: 'Ouvrir FillSell' },
    raison: 'Tu reçois cet e-mail parce que tu as commencé un essai de FillSell Cloud. C\'est une information sur ta facturation : elle t\'est envoyée même si tu t\'es désinscrit des actualités de FillSell.',
  },
  en: {
    sujet: (quand) => `Your FillSell Cloud trial ends on ${quand}`,
    titre: 'Your free trial ends soon',
    fin: (quand) => `Your free trial of FillSell Cloud ends on ${quand} (Paris time).`,
    suite: {
      stripe: (prix, carte) => (prix
        ? `If you do nothing, FillSell Cloud continues from that date at ${prix} a month, charged to the card you saved${carte ? ` (ending in ${carte})` : ''}.`
        : `If you do nothing, FillSell Cloud continues from that date at the monthly price shown when you subscribed, charged to the card you saved${carte ? ` (ending in ${carte})` : ''}.`),
      apple: (prix) => (prix
        ? `If you do nothing, FillSell Cloud continues from that date at ${prix} a month. Apple charges it, to the payment method of your Apple Account.`
        : 'If you do nothing, FillSell Cloud continues from that date at the monthly price shown in your Apple subscriptions. Apple charges it, to the payment method of your Apple Account.'),
      google: (prix) => (prix
        ? `If you do nothing, FillSell Cloud continues from that date at ${prix} a month. Google Play charges it, to the payment method of your Google Account.`
        : 'If you do nothing, FillSell Cloud continues from that date at the monthly price shown in your Google Play subscriptions. Google Play charges it, to the payment method of your Google Account.'),
      inconnu: () => 'If you do nothing, FillSell Cloud continues from that date at the monthly price shown when you signed up.',
    },
    arret: {
      stripe: 'If you don\'t want to continue, stop the trial before then in FillSell, Settings → Subscription: the subscription is then cancelled at Stripe straight away, before the first payment is due.',
      apple: 'If you don\'t want to continue, cancel before then in your Apple subscriptions (the button below opens them; on iPhone: Settings → your name → Subscriptions). Apple manages this subscription: you cancel it with Apple, and Apple confirms it.',
      google: 'If you don\'t want to continue, cancel before then in your Google Play subscriptions (the button below opens them; in the Play Store app: your profile → Payments & subscriptions → Subscriptions). Google manages this subscription: you cancel it with Google Play, and Google confirms it.',
      inconnu: 'If you don\'t want to continue, stop it before then where you took it: in FillSell (Settings → Subscription) for a card payment on the website, or in your Apple or Google Play subscriptions for a purchase in the app.',
    },
    forfait: 'Your FillSell plan is not affected: this message is only about FillSell Cloud.',
    preheader: (prix) => (prix ? `If you do nothing, FillSell Cloud continues at ${prix} a month.` : 'If you do nothing, FillSell Cloud becomes paid when the trial ends.'),
    bouton: { stripe: 'Open FillSell', apple: 'Manage my Apple subscription', google: 'Manage my Google Play subscription', inconnu: 'Open FillSell' },
    raison: 'You are getting this email because you started a FillSell Cloud trial. It is billing information, so it is sent even if you unsubscribed from FillSell news.',
  },
};
const LIENS_BOUTON = { stripe: LIEN_APP, apple: LIEN_ABONNEMENTS_APPLE, google: LIEN_ABONNEMENTS_GOOGLE, inconnu: LIEN_APP };

/**
 * Le contenu du mail, en français ou en anglais (profiles.lang), prêt pour
 * renderEmail (mis en page par mailRappelVeilleCloud, _shared/emails-fillsell.ts).
 * Aucun lien de désinscription : c'est une information de facturation
 * (catégorie 'support').
 *   canal    : profiles.cloud_canal (stripe | apple | google) — le texte du
 *              prélèvement et de l'arrêt en dépend ;
 *   prix     : { montant, devise } LU À LA SOURCE (cloud-prix.js), ou null →
 *              aucune somme écrite ;
 *   carteFin : les 4 derniers chiffres de la carte s'ils sont connus du flux de
 *              paiement (Stripe seulement) — jamais stockés par le pool.
 * @param {{ lang?: string, finIso: string, canal?: string | null,
 *           prix?: { montant: number, devise: string } | null, carteFin?: string | null }} p
 */
export function texteRappel({ lang = 'fr', finIso, canal = null, prix = null, carteFin = null }) {
  const en = lang === 'en';
  const T = TEXTES[en ? 'en' : 'fr'];
  const c = canalDuRappel(canal);
  const quand = dateFin(finIso, en ? 'en' : 'fr');
  const montant = formatPrix(prix, en ? 'en' : 'fr');
  const carte = c === 'stripe' && /^\d{4}$/.test(String(carteFin ?? '')) ? String(carteFin) : null;
  return {
    sujet: T.sujet(quand),
    preheader: T.preheader(montant),
    titre: T.titre,
    // (08/11) Aligné sur les autres mails Cloud (_shared/cloud-mails.js) : « Salut, » en tête, signé Nico / FillSell.
    paragraphes: [en ? 'Hi,' : 'Salut,', T.fin(quand), T.suite[c](montant, carte), T.arret[c], T.forfait],
    bouton: { texte: T.bouton[c], url: LIENS_BOUTON[c] },
    raisonEnvoi: T.raison,
    lienDesinscription: null,
    categorie: CATEGORIE_RAPPEL,
    type: TYPE_RAPPEL,
    canal: c,
    prixAffiche: montant,
  };
}
