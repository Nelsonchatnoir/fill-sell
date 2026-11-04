// Les mots de l'écran « Me connecter » et de l'achat de l'option FillSell
// Cloud (05/10 ; son nom depuis la décision de Nico du 03/11, « sans
// ordinateur » étant sa promesse). Mêmes règles que textes.js : tutoiement, aucune phrase
// technique, aucune date ni aucun quota en dur, l'essai sans piège, aucune
// plateforme promise qui n'est pas prouvée (la liste vient de config/cloudOffer.js).
import { CLOUD_PRIX_AFFICHE } from '../utils/palier';

const NBSP = ' ';
// (01/11) Les noms des plateformes du bandeau : une liste, quoi qu'on passe (un autotest appelle chaque phrase avec une date).
const listeNoms = (n) => (Array.isArray(n) ? n : []).map(String).filter(Boolean);
const PRIX = CLOUD_PRIX_AFFICHE.replace(/ /g, NBSP);

const FR = {
  titre: 'Me connecter',
  intro: "Connecte tes plateformes une fois : FillSell publie ensuite tes annonces depuis ses serveurs, même ordinateur éteint. Seule la page de connexion s'ouvre.",
  connecte: 'Connecté',
  aConnecter: 'À connecter',
  // (30/10, lot D) Une connexion faite qui a lâché (session fermée par la plateforme).
  aReconnecter: 'À reconnecter',
  executantTitre: 'Ton exécutant FillSell Cloud',
  executantLecture: 'Lecture de l’état…',
  meConnecter: 'Me connecter',
  reconnecter: 'Me reconnecter',
  // (02/11) Une plateforme connectée : un lien discret, jamais un bouton qui fait croire à un problème.
  changerCompte: 'Changer de compte',
  // (02/11) Le bandeau de cookies d'une page de connexion, et une plateforme connectée dans son navigateur réservé.
  refuserCookies: 'Refuser les cookies',
  isoleTexte: 'Connectée dans son navigateur réservé. Ses tâches attendent la mise en service : rien ne part encore.',
  // (01/11) Le bandeau qui demande la reconnexion quand une connexion Cloud tombe (BandeauCloudReconnexion.jsx).
  bandeauTitre: (noms) => { const l = listeNoms(noms); return l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l.at(-1)} se sont déconnectés de FillSell Cloud` : `${l[0] ?? 'Une plateforme'} s'est déconnectée de FillSell Cloud`; },
  // (01/11, 23:10) Une plateforme peut aussi attendre une VÉRIFICATION (glissière anti-robot dans le travail du Cloud) :
  // le même geste la résout (« Me reconnecter » ouvre sa page ; la session est gardée).
  bandeauTexte: (noms) => { const l = listeNoms(noms); return `Ouvre « Me reconnecter » : reconnecte-toi ou résous la vérification demandée. Tes tâches ${l.join(', ')} attendent : rien n'est publié ni retiré sur ${l.length > 1 ? 'ces plateformes' : 'cette plateforme'} en attendant.`; },
  // (01/11, 23:10, demande de Nico) L'exécutant Cloud arrêté : la personne le sait, avec l'heure.
  executantArreteTitre: (depuis) => (depuis ? `FillSell Cloud est arrêté (${depuis})` : 'FillSell Cloud est arrêté'),
  executantArreteTexte: (cause) => `${cause === 'muet' ? 'Ton exécutant ne donne plus signe de vie.' : cause === 'arret_essai' ? "Ton exécutant s'est arrêté sur une vérification anti-robot." : 'Ton exécutant ne tourne plus.'} Tes tâches du Cloud attendent : rien n'est publié ni retiré tant qu'il ne repart pas.`,
  plusTard: 'Plus tard',
  // (02/11, demande de Nico) « Résoudre la vérification » : une vérification soluble à la main (glissière) dans le
  // navigateur du Cloud — jamais « ouvre … dans ton navigateur » (c'est celui du Cloud, pas celui du téléphone). Et
  // l'accès restreint SANS vérification : aucun bouton, on attend. Jamais un nom de plateforme écrit ici (paramètre).
  resoudre: 'Résoudre la vérification',
  verifEtat: { a_resoudre: 'Vérification à résoudre', restreint: 'Accès restreint : on attend', revenue: 'Arrêtée : on regarde', verification_en_cours: 'Vérification en cours' },
  verifLigne: { a_resoudre: 'Elle demande une vérification au navigateur FillSell Cloud : tu la fais glisser, elle reprend toute seule.',
    restreint: "Accès refusé sans vérification à faire : rien à faire de ton côté, FillSell refait un seul essai dans 24 h.",
    revenue: "La vérification est revenue juste après : FillSell l'a arrêtée sans insister, l'équipe regarde.",
    verification_en_cours: "FillSell vérifie que l'accès est rendu, puis reprend tout seul : rien à faire de ton côté." },
  bandeauVerifTitre: (noms, etat) => { const l = listeNoms(noms).join(', ') || 'Une plateforme'; return etat === 'restreint' ? `${l} restreint l'accès de FillSell Cloud` : etat === 'revenue' ? `${l} est arrêtée sur FillSell Cloud` : `${l} demande une vérification`; },
  bandeauVerifTexte: (noms, etat) => { const l = listeNoms(noms).join(', ') || 'cette plateforme'; return etat === 'restreint'
    ? `${l} refuse l'accès sans vérification à faire : rien à faire de ton côté. FillSell attend et refait un seul essai dans 24 h ; tes autres plateformes continuent.`
    : etat === 'revenue'
      ? `La vérification est revenue juste après sa résolution : FillSell arrête ${l} sans insister, et l'équipe regarde. Rien à faire de ton côté ; tes autres plateformes continuent.`
      : `Ton navigateur FillSell Cloud a reçu une vérification anti-robot. Appuie sur « Résoudre la vérification » et fais-la glisser : ${l} reprend tout seul. Seul ${l} est en pause, le reste continue.`; },
  ebayTitre: 'eBay',
  ebayTexte: "Par la connexion officielle d'eBay : tu ne donnes aucun mot de passe à FillSell.",
  ebayRelier: 'Relier eBay',
  ebayRelie: "Relié par l'API eBay",
  ebayTexteRelie: 'FillSell publie sur eBay par sa connexion officielle : rien à connecter ici.',
  // (01/11) La connexion avec la page coupée trop de fois (réseau) : la page se rouvre à la main.
  coupee: "La connexion avec ta page s'est coupée. Rouvre « Me connecter » pour reprendre.",
  ecrire: '⌨︎ Écrire',
  fini: "J'ai fini",
  fermer: 'Fermer',
  lecture: 'Lecture de tes connexions…',
  lectureEchec: "Tes connexions ne se lisent pas pour l'instant. Réessaie dans un instant.",
  // L'achat
  preparation: 'On prépare ta place…',
  poolVide: "Toutes les places FillSell Cloud sont prises pour l'instant. On en ajoute : réessaie plus tard, rien n'a été demandé à ta carte.",
  // (03/11, point 5) Pas de place (serveur ou IP) : jamais de vente ; la liste d'attente, prévenu(e) par notification.
  complet: "Toutes les places FillSell Cloud sont prises pour l'instant. Rien n'a été demandé à ta carte.",
  etrePrevenuQuestion: "Toutes les places FillSell Cloud sont prises pour l'instant. Être prévenu(e) par une notification dès qu'une place se libère ?",
  inscritAttente: (rang) => `C'est noté : tu seras prévenu(e) par une notification dès qu'une place se libère${rang ? ` (tu es n° ${rang} sur la liste)` : ''}. Elle te sera gardée 24 h.`,
  inscriptionEchec: "L'inscription n'a pas pu se faire. Réessaie dans un instant.",
  dejaClient: "L'option FillSell Cloud est déjà active sur ton compte.",
  sansEssai: (raison) => `${raison === 'essai_deja_pris'
    ? "Tu as déjà profité de l'essai gratuit."
    : "L'essai gratuit a déjà servi sur cet appareil ou ce compte de plateforme."} Le Cloud démarre donc tout de suite, à ${PRIX}/mois, et tu l'arrêtes quand tu veux. Continuer ?`,
  sansEssaiStore: "Si ta boutique d'applications affiche une semaine offerte, le Cloud ne tournera qu'à partir du premier paiement.",
  achatEchec: "Le paiement du Cloud n'a pas pu s'ouvrir. Rien n'a été prélevé : réessaie dans un instant.",
  achatAttente: 'Paiement reçu : ton Cloud démarre dans un instant.',
  achatOk: 'Cloud actif : connecte maintenant tes plateformes.',
  arretEchec: "L'arrêt n'a pas pu se faire. Réessaie dans un instant.",
  arretBoutique: "Ton Cloud a été pris dans la boutique de ton téléphone : il s'arrête dans ses réglages d'abonnements, qui s'ouvrent.",
  refusCarte: "Cette carte a déjà servi à un essai gratuit : l'essai s'est arrêté, rien n'a été prélevé. Tu peux prendre le Cloud sans essai.",
  refusComptePlateforme: "Ce compte de plateforme a déjà servi à un essai gratuit : l'essai s'est arrêté. Tu peux prendre le Cloud sans essai.",
};

const EN = {
  titre: 'Sign in',
  intro: "Connect your platforms once: FillSell then posts your listings from its servers, even with your computer off. Only the sign-in page opens.",
  connecte: 'Connected',
  aConnecter: 'Not connected',
  aReconnecter: 'Sign in again needed',
  executantTitre: 'Your FillSell Cloud runner',
  executantLecture: 'Reading its status…',
  meConnecter: 'Sign in',
  reconnecter: 'Sign in again',
  changerCompte: 'Switch account',
  refuserCookies: 'Decline cookies',
  isoleTexte: 'Connected in its dedicated browser. Its tasks wait for it to go live: nothing is sent yet.',
  bandeauTitre: (noms) => { const l = listeNoms(noms); return l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l.at(-1)} were disconnected from FillSell Cloud` : `${l[0] ?? 'A platform'} was disconnected from FillSell Cloud`; },
  bandeauTexte: (noms) => { const l = listeNoms(noms); return `Open "Sign in again": sign in or solve the check you're asked for. Your ${l.join(', ')} tasks are waiting: nothing is posted or removed on ${l.length > 1 ? 'these platforms' : 'this platform'} until then.`; },
  executantArreteTitre: (depuis) => (depuis ? `FillSell Cloud has stopped (${depuis})` : 'FillSell Cloud has stopped'),
  executantArreteTexte: (cause) => `${cause === 'muet' ? 'Your runner has gone silent.' : cause === 'arret_essai' ? 'Your runner stopped on an anti-bot check.' : 'Your runner is no longer running.'} Your Cloud tasks are waiting: nothing is posted or removed until it starts again.`,
  plusTard: 'Later',
  resoudre: 'Solve the check',
  verifEtat: { a_resoudre: 'Check to solve', restreint: 'Access restricted: waiting', revenue: 'Stopped: we are looking into it', verification_en_cours: 'Check in progress' },
  verifLigne: { a_resoudre: 'It asks the FillSell Cloud browser for a check: you slide it, it resumes on its own.',
    restreint: 'Access refused with no check to solve: nothing to do on your side, FillSell tries once more in 24 h.',
    revenue: 'The check came back right away: FillSell stopped it without insisting, the team is looking into it.',
    verification_en_cours: 'FillSell checks that access is back, then resumes on its own: nothing to do on your side.' },
  bandeauVerifTitre: (noms, etat) => { const l = listeNoms(noms).join(', ') || 'A platform'; return etat === 'restreint' ? `${l} restricts FillSell Cloud's access` : etat === 'revenue' ? `${l} is stopped on FillSell Cloud` : `${l} asks for a check`; },
  bandeauVerifTexte: (noms, etat) => { const l = listeNoms(noms).join(', ') || 'this platform'; return etat === 'restreint'
    ? `${l} refuses access with no check to solve: nothing to do on your side. FillSell waits and tries once more in 24 h; your other platforms keep going.`
    : etat === 'revenue'
      ? `The check came back right after it was solved: FillSell stops ${l} without insisting, and the team is looking into it. Nothing to do on your side; your other platforms keep going.`
      : `Your FillSell Cloud browser got an anti-bot check. Tap "Solve the check" and slide it: ${l} resumes on its own. Only ${l} is paused, the rest keeps going.`; },
  ebayTitre: 'eBay',
  ebayTexte: "Through eBay's official sign-in: you never give FillSell a password.",
  ebayRelier: 'Link eBay',
  ebayRelie: 'Linked through the eBay API',
  ebayTexteRelie: 'FillSell lists on eBay through its official connection: nothing to connect here.',
  coupee: 'The connection to your page dropped. Open "Sign in" again to pick up where you left off.',
  ecrire: '⌨︎ Type',
  fini: "I'm done",
  fermer: 'Close',
  lecture: 'Reading your connections…',
  lectureEchec: "Your connections can't be read right now. Try again in a moment.",
  preparation: 'Getting your spot ready…',
  poolVide: 'All FillSell Cloud spots are taken for now. We are adding more: try again later, nothing was asked of your card.',
  complet: 'All FillSell Cloud spots are taken for now. Nothing was asked of your card.',
  etrePrevenuQuestion: 'All FillSell Cloud spots are taken for now. Get a notification as soon as a spot is free?',
  inscritAttente: (rang) => `Done: you'll get a notification as soon as a spot is free${rang ? ` (you're number ${rang} on the list)` : ''}. It will be kept for you for 24 hours.`,
  inscriptionEchec: "Signing up didn't work. Try again in a moment.",
  dejaClient: 'The FillSell Cloud add-on is already active on your account.',
  sansEssai: (raison) => `${raison === 'essai_deja_pris'
    ? 'You already used the free trial.'
    : 'The free trial was already used on this device or platform account.'} The Cloud therefore starts right away, at ${PRIX}/mo, and you can stop it whenever you want. Continue?`,
  sansEssaiStore: 'If your app store shows a free week, the Cloud only runs from the first payment.',
  achatEchec: "The Cloud payment couldn't open. Nothing was charged: try again in a moment.",
  achatAttente: 'Payment received: your Cloud starts in a moment.',
  achatOk: 'Cloud active: now connect your platforms.',
  arretEchec: "The Cloud couldn't be stopped. Try again in a moment.",
  arretBoutique: 'Your Cloud was bought in your phone\'s app store: it stops in its subscription settings, which are opening.',
  refusCarte: 'This card was already used for a free trial: the trial stopped, nothing was charged. You can take the Cloud without a trial.',
  refusComptePlateforme: 'This platform account was already used for a free trial: the trial stopped. You can take the Cloud without a trial.',
};

export function textesConnexion(lang) {
  return lang === 'en' ? EN : FR;
}
