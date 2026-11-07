// (05/11 soir, lot « Ouverture du Cloud », phase 2, décision l de Nico) LES MENTIONS D'UN ABONNEMENT À RENOUVELLEMENT
// AUTOMATIQUE, SUR L'ÉCRAN D'ACHAT (Apple 3.1.2 ; Google Play, mêmes attentes) : que c'est un abonnement qui se renouvelle,
// où il est prélevé, comment l'arrêter, et des liens qui marchent vers les conditions d'utilisation (EULA d'Apple sur
// iOS : c'est le contrat choisi dans App Store Connect), les conditions générales et la politique de confidentialité.
// Les prix des formules sont sur leurs cartes ; le Cloud a sa ligne (essai, prix) seulement quand son offre est montrée.
// Calcul PUR (testé : scripts/mentions-abonnement-selftest.mjs).
import { CLOUD_PRIX_AFFICHE, CLOUD_PRIX_AFFICHE_EN } from './palier.js';

export const EULA_APPLE = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const LEGAL = 'https://fillsell.app/legal';

/**
 * @param {{ canal?: 'ios'|'android'|'web', lang?: 'fr'|'en', cloud?: boolean, essaiCloud?: boolean }} o
 * @returns {{ texte: string, liens: Array<{ cle: string, libelle: string, url: string }> }}
 */
export function mentionsAbonnement({ canal = 'web', lang = 'fr', cloud = false, essaiCloud = true } = {}) {
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
  let texte = en
    ? `Auto-renewing subscriptions: the price shown is ${ou} when you confirm, then at each period, unless you cancel at least 24 hours before it ends (${arreter}).`
    : `Abonnements à renouvellement automatique : le prix affiché est ${ou} à la confirmation, puis à chaque période, sauf résiliation au moins 24 h avant son terme (${arreter}).`;
  if (cloud) {
    texte += en
      ? (essaiCloud ? ` FillSell Cloud: 7-day free trial for a first subscription, then ${CLOUD_PRIX_AFFICHE_EN} a month.` : ` FillSell Cloud: ${CLOUD_PRIX_AFFICHE_EN} a month.`)
      : (essaiCloud ? ` FillSell Cloud : 7 jours d'essai gratuit pour un premier abonnement, puis ${CLOUD_PRIX_AFFICHE} par mois.` : ` FillSell Cloud : ${CLOUD_PRIX_AFFICHE} par mois.`);
  }
  const liens = [];
  if (canal === 'ios') liens.push({ cle: 'eula', libelle: en ? 'Terms of Use (EULA)' : "Conditions d'utilisation (EULA)", url: EULA_APPLE });
  liens.push({ cle: 'cgu', libelle: en ? 'Terms and Conditions' : 'Conditions générales', url: `${LEGAL}${suffixe}#cgu` });
  liens.push({ cle: 'confidentialite', libelle: en ? 'Privacy Policy' : 'Politique de confidentialité', url: `${LEGAL}${suffixe}#confidentialite` });
  return { texte, liens };
}
