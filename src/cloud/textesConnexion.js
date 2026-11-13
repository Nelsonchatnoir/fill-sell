// Les mots de l'écran « Me connecter » et de l'achat de l'option FillSell
// Cloud (05/10 ; son nom depuis la décision de Nico du 03/11, « sans
// ordinateur » étant sa promesse). Mêmes règles que textes.js : tutoiement, aucune phrase
// technique, aucune date ni aucun quota en dur, l'essai sans piège, aucune
// plateforme promise qui n'est pas prouvée (la liste vient de config/cloudOffer.js).
import { JETON_PRIX_CLOUD, avecPrix } from '../lib/prixBoutique.js';

const NBSP = ' ';
// (01/11) Les noms des plateformes du bandeau : une liste, quoi qu'on passe (un autotest appelle chaque phrase avec une date).
const listeNoms = (n) => (Array.isArray(n) ? n : []).map(String).filter(Boolean);
// (08/11, refus Google Play de la vc36) Le prix n'est plus écrit ici : un JETON, remplacé à la lecture par le prix du
// CANAL (web : Stripe en euros ; iPhone/Android : prix formaté par la boutique, « … » tant qu'il charge) — lib/prixBoutique.js.
const PRIX = JETON_PRIX_CLOUD;
const PRIX_EN = JETON_PRIX_CLOUD;

const FR = {
  titre: 'Me connecter',
  intro: "Connecte tes plateformes une fois : FillSell Cloud publie ensuite tes annonces depuis ses serveurs, sans ordinateur. Seule la page de connexion s'ouvre.",
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
  // (05/11 soir, point 5) Juste après le paiement : le poste se prépare (jamais « arrêté »).
  executantDemarreTitre: 'Ton FillSell Cloud démarre',
  executantDemarreTexte: (long) => (long
    ? "La préparation prend plus de temps que prévu : l'équipe FillSell est prévenue. Tes tâches attendent, rien n'est perdu."
    : 'Ta machine, ton adresse IP et ton navigateur se préparent (en général moins de 2 minutes). Ensuite, connecte tes plateformes ici.'),
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
  // (09/11 soir) Une autre page de connexion du compte s'est ouverte (autre appareil, autre onglet) : celle-ci s'arrête.
  remplacee: "Une autre page de connexion FillSell Cloud s'est ouverte (sur cet appareil ou un autre) : celle-ci s'arrête, une seule à la fois. Pour continuer ici, ferme puis rouvre la plateforme.",
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
    : raison === 'boutique_sans_essai'
      ? "Ta boutique d'applications ne propose pas d'essai gratuit à ce compte."
      : "L'essai gratuit a déjà servi sur cet appareil ou ce compte de plateforme."} Le Cloud démarre donc tout de suite : ${PRIX} prélevés aujourd'hui, puis chaque mois, et tu l'arrêtes quand tu veux. Continuer ?`,
  sansEssaiStore: "Si ta boutique d'applications affiche une semaine offerte, le Cloud ne tournera qu'à partir du premier paiement.",
  // (13/11, point b de Nico) La semaine de la boutique est LUE avant la feuille : chaque cas a sa phrase vraie.
  // ⚠ textes NEUFS, à valider par Nico.
  // (13/11) Réglages, bloc du Cloud seul : la boutique n'offre pas sa semaine, ou on ne sait pas (iPhone).
  noteSansSemaine: `Pas d'essai : ${PRIX} prélevés aujourd'hui, puis chaque mois. Tu l'arrêtes quand tu veux.`,
  noteSemaineIncertaine: `Apple te dit avant que tu valides si ta semaine gratuite t'est offerte ; sinon ${PRIX} prélevés aujourd'hui, puis chaque mois.`,
  semaineSansDroits: (b) => `Tu as déjà profité de l'essai gratuit FillSell. ${b} va t'afficher « 1 semaine gratuite » : cette semaine-là, le Cloud ne tourne pas ; il démarre au premier paiement de ${PRIX}, 7 jours plus tard. Continuer ?`,
  essaiIncertain: `Apple te dit dans sa fenêtre, avant que tu valides, si ta semaine gratuite t'est offerte. Sinon, le Cloud démarre tout de suite : ${PRIX} prélevés aujourd'hui, puis chaque mois, et tu l'arrêtes quand tu veux. Continuer ?`,
  semaineIncertaine: `Tu as déjà profité de l'essai gratuit FillSell : ${PRIX} prélevés aujourd'hui — ou, si Apple t'affiche « 1 semaine gratuite », le Cloud ne tourne pas cette semaine-là et démarre au premier paiement, 7 jours plus tard. Continuer ?`,
  achatEchec: "Le paiement du Cloud n'a pas pu s'ouvrir. Rien n'a été prélevé : réessaie dans un instant.",
  prixBoutiqueAbsent: "Le prix de ta boutique d'applications n'est pas encore affiché : rien n'a été prélevé, réessaie dans un instant.",
  achatAttente: 'Paiement reçu : ton Cloud démarre dans un instant.',
  // (13/11, audit des paiements) « Paiement reçu » était dit aussi d'un ESSAI (0 prélevé) et d'un achat en attente
  // d'approbation (iPhone, « Demander l'achat ») : rien n'était payé.
  essaiAttente: "C'est parti : ton essai gratuit démarre dans un instant.",
  achatApprobation: "Achat en attente d'approbation : FillSell Cloud démarre dès qu'il est validé. Rien n'est prélevé avant.",
  achatOk: 'Cloud actif : connecte maintenant tes plateformes.',
  // (07/11, Nico) « Restaurer les achats » retrouve aussi l'option Cloud (prise seule ou avec une formule).
  restaureOk: 'FillSell Cloud restauré : il est actif.',
  restaureAttente: 'Ton abonnement FillSell Cloud est retrouvé : il se réactive dans un instant.',
  restaureEchec: "Ton abonnement FillSell Cloud est retrouvé, mais sa vérification n'a pas abouti. Réessaie dans un instant.",
  arretEchec: "L'arrêt n'a pas pu se faire. Réessaie dans un instant.",
  // (07/11 soir, essai TestFlight de Nico) Une app n'annule jamais un abonnement Apple ou Google : on dit OÙ l'arrêter,
  // et que FillSell le verra dès que la boutique l'aura confirmé — jamais « c'est arrêté » ni « rien n'est facturé ».
  arretBoutique: (voie) => (voie === 'google'
    ? "Arrête FillSell Cloud dans tes abonnements Google Play. FillSell le verra dès que Google aura confirmé l'arrêt."
    : voie === 'apple_ailleurs'
      ? "Ton Cloud a été pris sur l'App Store : il s'arrête depuis ton iPhone ou ton iPad (Réglages › ton nom › Abonnements). FillSell le verra dès qu'Apple aura confirmé l'arrêt."
      : "Arrête FillSell Cloud dans tes abonnements Apple. FillSell le verra dès qu'Apple aura confirmé l'arrêt."),
  // (08/11, ordre de Nico) Jamais muet : le chemin EXACT, et l'écran propose « Réessayer » (BlocCloudReglages).
  arretBoutiqueEchec: (voie) => (voie === 'google'
    ? "Tes abonnements Google Play n'ont pas pu s'ouvrir. Ouvre le Play Store › ton profil › Paiements et abonnements › Abonnements › FillSell Cloud, ou réessaie."
    : "Tes abonnements Apple n'ont pas pu s'ouvrir. Ouvre Réglages › ton nom › Abonnements › FillSell Cloud sur ton iPhone ou ton iPad, ou réessaie."),
  reessayer: 'Réessayer',
  // (08/11) Après un arrêt Stripe, ce que Stripe a confirmé (cancel-subscription relit l'abonnement et ses factures).
  arretEssaiConfirme: "FillSell Cloud est arrêté. L'essai est annulé chez Stripe : aucun prélèvement.",
  arretEssaiFait: "FillSell Cloud est arrêté.",
  arretProgrammeConfirme: (date) => `C'est noté : FillSell Cloud continue jusqu'au ${date}, puis s'arrête. Rien ne sera prélevé ensuite.`,
  repriseBoutique: (voie) => (voie === 'google'
    ? "Le Cloud se garde dans tes abonnements Google Play. FillSell le verra dès que Google l'aura confirmé."
    : "Le Cloud se garde dans tes abonnements Apple (Réglages › ton nom › Abonnements). FillSell le verra dès qu'Apple l'aura confirmé."),
  // Le serveur a répondu sans dire qu'il arrêtait le Cloud (fonction d'avant l'option) : on ne dit jamais « c'est fait ».
  arretNonConfirme: "L'arrêt du Cloud n'a pas été confirmé. Ne réessaie pas : écris au support depuis Réglages, on vérifie ton abonnement avec toi.",
  arretRien: "Aucun abonnement FillSell Cloud en cours n'a été trouvé : il n'y avait rien à arrêter.",
  refusCarte: "Cette carte a déjà servi à un essai gratuit : l'essai s'est arrêté, rien n'a été prélevé. Tu peux prendre le Cloud sans essai.",
  refusComptePlateforme: "Ce compte de plateforme a déjà servi à un essai gratuit : l'essai s'est arrêté. Tu peux prendre le Cloud sans essai.",
  // (13/11, audit des paiements de Nico) Pris dans une BOUTIQUE : le verrou arrête l'essai FillSell, PAS l'abonnement de la
  // boutique (regles.js arretEssaiConfirme) — elle prélèvera à la fin de sa semaine, et le Cloud démarrera alors (décision 8).
  // Avant : « Tu peux prendre le Cloud sans essai », sans un mot du prélèvement à venir. ⚠ texte NEUF, à valider par Nico.
  refusComptePlateformeBoutique: (b, ou) => `Ce compte de plateforme a déjà servi à un essai gratuit : l'essai FillSell s'est arrêté, mais ton abonnement ${b} continue. Sans geste de ta part, ${b} prélèvera le prix du Cloud à la fin de sa semaine gratuite, et le Cloud démarrera alors. Pour ne rien payer, arrête-le ${ou}.`,
};

const EN = {
  titre: 'Sign in',
  intro: "Connect your platforms once: FillSell Cloud then posts your listings from its servers, no computer needed. Only the sign-in page opens.",
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
  executantDemarreTitre: 'Your FillSell Cloud is starting',
  executantDemarreTexte: (long) => (long
    ? 'Setup is taking longer than usual: the FillSell team has been alerted. Your tasks are waiting, nothing is lost.'
    : 'Your machine, IP address and browser are being set up (usually under 2 minutes). Then connect your platforms here.'),
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
  remplacee: 'Another FillSell Cloud sign-in page opened (on this device or another): this one stops, only one at a time. To continue here, close and open the platform again.',
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
    : raison === 'boutique_sans_essai'
      ? "Your app store doesn't offer a free trial to this account."
      : 'The free trial was already used on this device or platform account.'} The Cloud therefore starts right away: ${PRIX_EN} charged today, then every month, and you can stop it whenever you want. Continue?`,
  sansEssaiStore: 'If your app store shows a free week, the Cloud only runs from the first payment.',
  noteSansSemaine: `No trial: ${PRIX_EN} charged today, then every month. Stop it whenever you want.`,
  noteSemaineIncertaine: `Apple tells you before you confirm whether your free week is offered; otherwise ${PRIX_EN} charged today, then every month.`,
  semaineSansDroits: (b) => `You already used the FillSell free trial. ${b} will show "1 week free": during that week, the Cloud does not run; it starts at the first payment of ${PRIX_EN}, 7 days later. Continue?`,
  essaiIncertain: `Apple tells you in its sheet, before you confirm, whether your free week is offered. Otherwise, the Cloud starts right away: ${PRIX_EN} charged today, then every month, and you can stop it whenever you want. Continue?`,
  semaineIncertaine: `You already used the FillSell free trial: ${PRIX_EN} charged today — or, if Apple shows "1 week free", the Cloud does not run that week and starts at the first payment, 7 days later. Continue?`,
  achatEchec: "The Cloud payment couldn't open. Nothing was charged: try again in a moment.",
  prixBoutiqueAbsent: "Your app store's price isn't shown yet: nothing was charged, try again in a moment.",
  achatAttente: 'Payment received: your Cloud starts in a moment.',
  essaiAttente: 'Done: your free trial starts in a moment.',
  achatApprobation: 'Purchase waiting for approval: FillSell Cloud starts as soon as it is approved. Nothing is charged before.',
  achatOk: 'Cloud active: now connect your platforms.',
  restaureOk: 'FillSell Cloud restored: it is active.',
  restaureAttente: 'Your FillSell Cloud subscription was found: it reactivates in a moment.',
  restaureEchec: "Your FillSell Cloud subscription was found, but it couldn't be verified. Try again in a moment.",
  arretEchec: "The Cloud couldn't be stopped. Try again in a moment.",
  arretBoutique: (voie) => (voie === 'google'
    ? 'Stop FillSell Cloud in your Google Play subscriptions. FillSell will show it as soon as Google confirms it.'
    : voie === 'apple_ailleurs'
      ? 'Your Cloud was bought on the App Store: it stops from your iPhone or iPad (Settings › your name › Subscriptions). FillSell will show it as soon as Apple confirms it.'
      : 'Stop FillSell Cloud in your Apple subscriptions. FillSell will show it as soon as Apple confirms it.'),
  arretBoutiqueEchec: (voie) => (voie === 'google'
    ? "Your Google Play subscriptions couldn't open. Open the Play Store › your profile › Payments & subscriptions › Subscriptions › FillSell Cloud, or try again."
    : "Your Apple subscriptions couldn't open. Open Settings › your name › Subscriptions › FillSell Cloud on your iPhone or iPad, or try again."),
  reessayer: 'Try again',
  arretEssaiConfirme: 'FillSell Cloud is stopped. The trial is cancelled at Stripe: no charge.',
  arretEssaiFait: "FillSell Cloud is stopped.",
  arretProgrammeConfirme: (date) => `Noted: FillSell Cloud keeps running until ${date}, then stops. Nothing is charged after that.`,
  repriseBoutique: (voie) => (voie === 'google'
    ? 'The Cloud is kept from your Google Play subscriptions. FillSell will show it as soon as Google confirms it.'
    : 'The Cloud is kept from your Apple subscriptions (Settings › your name › Subscriptions). FillSell will show it as soon as Apple confirms it.'),
  arretNonConfirme: "Stopping the Cloud wasn't confirmed. Don't try again: write to support from Settings, we'll check your subscription with you.",
  arretRien: 'No running FillSell Cloud subscription was found: there was nothing to stop.',
  refusCarte: 'This card was already used for a free trial: the trial stopped, nothing was charged. You can take the Cloud without a trial.',
  refusComptePlateforme: 'This platform account was already used for a free trial: the trial stopped. You can take the Cloud without a trial.',
  refusComptePlateformeBoutique: (b, ou) => `This platform account was already used for a free trial: the FillSell trial stopped, but your ${b} subscription continues. If you do nothing, ${b} will charge the Cloud price at the end of its free week, and the Cloud will start then. To pay nothing, stop it ${ou}.`,
};

export function textesConnexion(lang) {
  return avecPrix(lang === 'en' ? EN : FR, lang === 'en' ? 'en' : 'fr');
}
