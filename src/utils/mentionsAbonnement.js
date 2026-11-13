// (05/11 soir, lot « Ouverture du Cloud », phase 2, décision l de Nico) LES MENTIONS D'UN ABONNEMENT À RENOUVELLEMENT
// AUTOMATIQUE, SUR L'ÉCRAN D'ACHAT (Apple 3.1.2 ; Google Play, mêmes attentes) : que c'est un abonnement qui se renouvelle,
// où il est prélevé, comment l'arrêter, et des liens qui marchent vers les conditions d'utilisation (EULA d'Apple sur
// iOS : c'est le contrat choisi dans App Store Connect), les conditions générales et la politique de confidentialité.
// Les prix des formules sont sur leurs cartes ; le Cloud a sa ligne (essai, prix) seulement quand son offre est montrée.
// Calcul PUR (testé : scripts/mentions-abonnement-selftest.mjs).
// (08/11, refus Google Play de la vc36) Le prix du Cloud du CANAL : web = Stripe en euros, mobile = prix de la boutique.
import { prixOuChargement, essaiBoutiqueOffert } from '../lib/prixBoutique.js';

export const EULA_APPLE = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const LEGAL = 'https://fillsell.app/legal';

/**
 * @param {{ canal?: 'ios'|'android'|'web', lang?: 'fr'|'en', cloud?: boolean, essaiCloud?: boolean, essaiAnnonce?: boolean }} o
 * (13/11, audit des paiements de Nico) essaiAnnonce : une carte de l'écran annonce un essai gratuit — « prélevé à la
 * confirmation » serait faux pour elle : la phrase dit alors « … ou à la fin de l'essai gratuit annoncé … ». Absent : la
 * phrase d'avant, mot pour mot.
 * @returns {{ texte: string, liens: Array<{ cle: string, libelle: string, url: string }> }}
 */
export function mentionsAbonnement({ canal = 'web', lang = 'fr', cloud = false, essaiCloud = true, essaiAnnonce = false } = {}) {
  const en = lang === 'en';
  const suffixe = en ? '?lang=en' : '';
  const ou = canal === 'ios'
    ? (en ? 'charged to your Apple Account' : 'prélevé sur ton compte Apple')
    : canal === 'android'
      ? (en ? 'charged to your Google Play account' : 'prélevé sur ton compte Google Play')
      : (en ? 'charged to your card' : 'prélevé sur ta carte');
  const arreter = canal === 'ios'
    ? (en ? 'Settings › your name › Subscriptions' : 'Réglages › ton nom › Abonnements')
    : canal === 'android'
      ? (en ? 'Play Store › Payments & subscriptions' : 'Play Store › Paiements et abonnements')
      : (en ? 'Settings › Subscription in FillSell' : 'Réglages › Abonnement dans FillSell');
  const quand = essaiAnnonce
    ? (en ? 'when you confirm, or at the end of the free trial when one is shown,' : "à la confirmation, ou à la fin de l'essai gratuit quand il est annoncé,")
    : (en ? 'when you confirm,' : 'à la confirmation,');
  let texte = en
    ? `Auto-renewing subscriptions: the price shown is ${ou} ${quand} then at each period, unless you cancel at least 24 hours before it ends (${arreter}).`
    : `Abonnements à renouvellement automatique : le prix affiché est ${ou} ${quand} puis à chaque période, sauf résiliation au moins 24 h avant son terme (${arreter}).`;
  if (cloud) {
    const prixCloudEn = prixOuChargement('cloud', 'en');
    const prixCloudFr = prixOuChargement('cloud', 'fr');
    // Mobile : l'essai n'est écrit que si la boutique le propose à ce compte.
    essaiCloud = essaiCloud && (canal === 'web' || essaiBoutiqueOffert('cloud'));
    texte += en
      ? (essaiCloud ? ` FillSell Cloud: 7-day free trial for a first subscription, then ${prixCloudEn} a month.` : ` FillSell Cloud: ${prixCloudEn} a month.`)
      : (essaiCloud ? ` FillSell Cloud : 7 jours d'essai gratuit pour un premier abonnement, puis ${prixCloudFr} par mois.` : ` FillSell Cloud : ${prixCloudFr} par mois.`);
  }
  const liens = [];
  if (canal === 'ios') liens.push({ cle: 'eula', libelle: en ? 'Terms of Use (EULA)' : "Conditions d'utilisation (EULA)", url: EULA_APPLE });
  liens.push({ cle: 'cgu', libelle: en ? 'Terms and Conditions' : 'Conditions générales', url: `${LEGAL}${suffixe}#cgu` });
  liens.push({ cle: 'confidentialite', libelle: en ? 'Privacy Policy' : 'Politique de confidentialité', url: `${LEGAL}${suffixe}#confidentialite` });
  return { texte, liens };
}

/**
 * (11/11/2026, formules avec Cloud — texte validé par Nico, § 8.1 du plan) LA MENTION D'UNE CARTE « AVEC CLOUD », sous
 * son bouton (Apple 3.1.2 : le prix, la période, l'essai, où c'est prélevé et comment l'arrêter, au plus près de l'achat).
 *   essai    : la carte annonce l'essai de 7 jours (jamais pour Business + Cloud : il est payé dès la souscription) ;
 *   business : Business + Cloud — « payé dès la souscription » ;
 *   prix     : le prix du CANAL (web : Stripe ; mobile : la boutique), jamais écrit en dur. Pur.
 */
export function mentionFormuleCloud({ canal = 'web', lang = 'fr', prix, essai = false, business = false } = {}) {
  const en = lang === 'en';
  const ou = canal === 'ios'
    ? (en ? 'charged to your Apple Account' : 'prélevés sur ton compte Apple')
    : canal === 'android'
      ? (en ? 'charged to your Google Play account' : 'prélevés sur ton compte Google Play')
      : (en ? 'charged to your card' : 'prélevés sur ta carte');
  const quand = business
    ? (en ? 'a month, paid from the day you subscribe' : 'par mois, payé dès la souscription')
    : essai
      ? (en ? 'a month after a 7-day free trial for a first trial' : "par mois après 7 jours d'essai gratuits pour un premier essai") // estimation-ok: la durée de l'essai (un fait de l'offre, texte validé), pas un délai promis
      : (en ? 'a month' : 'par mois');
  return en
    ? `Auto-renewing subscription: ${prix} ${quand}, ${ou}, unless cancelled at least 24 hours before the end of the period.`
    : `Abonnement à renouvellement automatique : ${prix} ${quand}, ${ou}, sauf résiliation au moins 24 h avant la fin de la période.`;
}
