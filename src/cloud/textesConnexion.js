// Les mots de l'écran « Me connecter » et de l'achat de l'option Sans
// ordinateur (05/10). Mêmes règles que textes.js : tutoiement, aucune phrase
// technique, aucune date ni aucun quota en dur, l'essai sans piège, aucune
// plateforme promise qui n'est pas prouvée (la liste vient de config/cloudOffer.js).
import { CLOUD_PRIX_AFFICHE } from '../utils/palier';

const NBSP = ' ';
const PRIX = CLOUD_PRIX_AFFICHE.replace(/ /g, NBSP);

const FR = {
  titre: 'Me connecter',
  intro: "Connecte tes plateformes une fois : FillSell publie ensuite tes annonces depuis ses serveurs, même ordinateur éteint. Seule la page de connexion s'ouvre.",
  connecte: 'Connecté',
  aConnecter: 'À connecter',
  meConnecter: 'Me connecter',
  reconnecter: 'Me reconnecter',
  ebayTitre: 'eBay',
  ebayTexte: "Par la connexion officielle d'eBay : tu ne donnes aucun mot de passe à FillSell.",
  ebayRelier: 'Relier eBay',
  ebayRelie: 'Relié',
  ecrire: '⌨︎ Écrire',
  fini: "J'ai fini",
  fermer: 'Fermer',
  lecture: 'Lecture de tes connexions…',
  lectureEchec: "Tes connexions ne se lisent pas pour l'instant. Réessaie dans un instant.",
  // L'achat
  preparation: 'On prépare ta place…',
  poolVide: "Toutes les places Sans ordinateur sont prises pour l'instant. On en ajoute : réessaie dans quelques heures, rien n'a été demandé à ta carte.",
  dejaClient: "L'option Sans ordinateur est déjà active sur ton compte.",
  sansEssai: (raison) => `${raison === 'essai_deja_pris'
    ? "Tu as déjà profité de l'essai gratuit."
    : "L'essai gratuit a déjà servi sur cet appareil ou ce compte de plateforme."} L'option démarre donc tout de suite, à ${PRIX}/mois, et tu l'arrêtes quand tu veux. Continuer ?`,
  sansEssaiStore: "Si ta boutique d'applications affiche une semaine offerte, l'option ne tournera qu'à partir du premier paiement.",
  achatEchec: "Le paiement de l'option n'a pas pu s'ouvrir. Rien n'a été prélevé : réessaie dans un instant.",
  achatAttente: "Paiement reçu : ton option démarre dans un instant.",
  achatOk: 'Option active : connecte maintenant tes plateformes.',
  arretEchec: "L'arrêt n'a pas pu se faire. Réessaie dans un instant.",
  arretBoutique: "Ton option a été prise dans la boutique de ton téléphone : elle s'arrête dans ses réglages d'abonnements, qui s'ouvrent.",
  refusCarte: "Cette carte a déjà servi à un essai gratuit : l'essai s'est arrêté, rien n'a été prélevé. Tu peux prendre l'option sans essai.",
  refusComptePlateforme: "Ce compte de plateforme a déjà servi à un essai gratuit : l'essai s'est arrêté. Tu peux prendre l'option sans essai.",
};

const EN = {
  titre: 'Sign in',
  intro: "Connect your platforms once: FillSell then posts your listings from its servers, even with your computer off. Only the sign-in page opens.",
  connecte: 'Connected',
  aConnecter: 'Not connected',
  meConnecter: 'Sign in',
  reconnecter: 'Sign in again',
  ebayTitre: 'eBay',
  ebayTexte: "Through eBay's official sign-in: you never give FillSell a password.",
  ebayRelier: 'Link eBay',
  ebayRelie: 'Linked',
  ecrire: '⌨︎ Type',
  fini: "I'm done",
  fermer: 'Close',
  lecture: 'Reading your connections…',
  lectureEchec: "Your connections can't be read right now. Try again in a moment.",
  preparation: 'Getting your spot ready…',
  poolVide: 'All No computer spots are taken for now. We are adding more: try again in a few hours, nothing was asked of your card.',
  dejaClient: 'The No computer add-on is already active on your account.',
  sansEssai: (raison) => `${raison === 'essai_deja_pris'
    ? 'You already used the free trial.'
    : 'The free trial was already used on this device or platform account.'} The add-on therefore starts right away, at ${PRIX}/mo, and you can stop it whenever you want. Continue?`,
  sansEssaiStore: 'If your app store shows a free week, the add-on only runs from the first payment.',
  achatEchec: "The add-on payment couldn't open. Nothing was charged: try again in a moment.",
  achatAttente: 'Payment received: your add-on starts in a moment.',
  achatOk: 'Add-on active: now connect your platforms.',
  arretEchec: "The add-on couldn't be stopped. Try again in a moment.",
  arretBoutique: 'Your add-on was bought in your phone\'s app store: it stops in its subscription settings, which are opening.',
  refusCarte: 'This card was already used for a free trial: the trial stopped, nothing was charged. You can take the add-on without a trial.',
  refusComptePlateforme: 'This platform account was already used for a free trial: the trial stopped. You can take the add-on without a trial.',
};

export function textesConnexion(lang) {
  return lang === 'en' ? EN : FR;
}
