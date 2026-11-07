// ═══════════════════════════════════════════════════════════════════════════
// PARCOURS D'ENTRÉE — LES MOTS (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// Même règle que reglages/textes.js : AUCUNE phrase dans un composant. Tout
// se lit ici, fr + en, et un écran ne reçoit que `T`.
//
// ⛔ VOCABULAIRE NON NÉGOCIABLE — ce que l'app ne dit jamais :
//   · « on publie pour toi », « on s'occupe de tout » : c'est l'EXTENSION qui
//     exécute, sur l'ORDINATEUR. Le téléphone pilote, il n'exécute pas.
//   · aucune fonction qui n'existe pas dans le code. Chaque phrase de vente
//     ci-dessous correspond à un appel réel (relevé, OAuth eBay,
//     republication planifiée).
//   · « tu », jamais « vous ».
//
// (04/11/2026, lot 3) Les mots de la grille à 3 jauges et de la voie FillSell Cloud (maquettes validées par Nico
// le 03/11) sont AJOUTÉS en fin d'objet : aucune clé d'avant ne change. ⛔ Ni prix, ni durée d'essai, ni quota
// écrits ici : le prix vient de CLOUD_PRIX_AFFICHE, la durée de CLOUD_ESSAI_JOURS (utils/palier.js), les volumes
// de coin_config (passés en paramètre), les noms des plateformes du Cloud de config/cloudOffer.js.
import { CLOUD_PRIX_AFFICHE, CLOUD_PRIX_AFFICHE_EN, CLOUD_ESSAI_JOURS } from '../utils/palier';

// Insécables : « 7 jours », le prix « …/mois » ne se coupent pas en fin de ligne (même règle que cloud/textes.js).
const NBSP = String.fromCharCode(0xa0);
const PRIX = CLOUD_PRIX_AFFICHE.replace(/ /g, NBSP);
// (07/11, décision de Nico) Les textes anglais disent le même prix à l'anglaise (CLOUD_PRIX_AFFICHE_EN).
const PRIX_EN = CLOUD_PRIX_AFFICHE_EN;
const J7 = `${CLOUD_ESSAI_JOURS}${NBSP}jours`;
const D7 = `${CLOUD_ESSAI_JOURS}${NBSP}days`;

const FR = {
  passer: 'Passer',
  continuer: 'Continuer',
  plusTard: 'Plus tard',

  // ── 1. Plateformes ───────────────────────────────────────────────────────
  pfKicker: 'Pour commencer',
  pfTitre: 'Où tu vends ?',
  pfTexte: "Coche ce que tu utilises déjà. Ça règle ce que FillSell te propose ensuite — tu pourras en ajouter à tout moment.",
  pfRienEnLigne: "Je n'ai encore rien en ligne",

  // ── 2. eBay ──────────────────────────────────────────────────────────────
  ebayKicker: 'Tu as coché eBay',
  ebayTitre: 'Relie ton compte eBay',
  ebayTexte: "Une autorisation eBay, une seule fois. Sans elle, l'extension dépose quand même tes annonces — mais FillSell ne voit pas tes ventes eBay arriver.",
  ebayGains: [
    "Tes ventes eBay détectées par l'API, sans attendre le prochain passage de l'extension",
    'Tes politiques de livraison et de retour posées une fois pour toutes',
    'Tes annonces eBay relevées et rattachées à tes articles',
  ],
  ebayNote: "eBay t'ouvre sa page de consentement. FillSell ne voit jamais ton mot de passe.",
  ebayCta: 'Connecter mon compte eBay',
  ebayEnCours: 'Ouverture de eBay…',
  ebayRelie: 'Compte eBay relié',
  ebayPlusTard: 'Plus tard, dans Réglages › Mes plateformes',

  // ── 3. Extension ─────────────────────────────────────────────────────────
  extKicker: "L'étape qui compte",
  extTitre: 'Ton ordinateur fait le travail',
  extTexte: "Tu pilotes depuis ce téléphone. Une extension Chrome, installée une fois sur ton ordinateur, dépose et relève tes annonces avec tes comptes déjà connectés — jamais tes mots de passe.",
  extTuPilotes: 'Tu pilotes',
  extElleExecute: "L'extension exécute",
  extCtaMail: "M'envoyer le lien pour mon ordinateur",
  extCtaMailEnCours: 'Envoi du lien…',
  extCtaInstaller: "Installer l'extension",
  extContinuerTel: 'Continuer sur mon téléphone',
  extLienEnvoyeA: 'Lien envoyé à',
  extLienSuite: "Ouvre-le sur ton ordinateur, quand tu veux. Une installation, une seule fois, rien à recliquer ici.",
  extDetection: 'Détection automatique — rien à recliquer ici',
  extVue: 'Extension détectée sur ton ordinateur',
  extAutrement: 'Récupérer le lien autrement',
  extPitchEyebrow: 'Pour déposer et relever tes annonces',
  extPitchCorps: "Elle lit et dépose tes annonces avec les comptes déjà connectés dans ton navigateur — jamais tes mots de passe — quand tu le décides depuis l'app. Gratuite, installée une seule fois.",

  // ── 4. Relevé ────────────────────────────────────────────────────────────
  relKicker: 'Ce qui est déjà en ligne',
  relTitre: 'Tu ne ressaisis rien',
  // (05/10, règle de Nico) La synchronisation ne part QUE sur ce bouton :
  // plus rien ne laisse croire qu'elle démarre toute seule.
  relTexte: "Appuie sur « Synchroniser mes annonces » : l'extension lit tes annonces déjà publiées (titres, prix, photos) et crée une fiche par article dans ton stock, même article vu sur deux plateformes.",
  relCarte: "Ce qu'on relève",
  relLectureSeule: 'Lecture seule',
  relContrat: "On lit tes annonces. Rien n'est publié, modifié ni supprimé.",
  relCta: 'Synchroniser mes annonces',
  relEnCours: 'Synchronisation demandée…',
  relLance: 'Synchronisation lancée — elle avance sur ton ordinateur',
  // ⛔ LA LIGNE SOUS LE BOUTON, MOT POUR MOT. Elle dit la seule chose que la
  //    personne a besoin de savoir : elle n'a plus rien à faire ici.
  relSousBouton: "Ton ordinateur doit être allumé, avec Chrome et l'extension FillSell",
  relEnFile: "Demande gardée — elle part dès que l'extension tourne",
  relEnFileNote: "C'est noté. Ta synchronisation part dès que l'extension tourne sur ton ordinateur — tu n'as pas à revenir cliquer.",

  // ── 4 bis. Je débute ─────────────────────────────────────────────────────
  debKicker: "Rien en ligne pour l'instant",
  debTitre: 'On part de ta première annonce',
  debTexte: "Photographie un article : FillSell remplit la fiche, tu choisis les plateformes, l'extension la dépose depuis ton ordinateur.",
  debEtapes: [
    "Tu photographies l'article depuis l'app, FillSell remplit le titre, la catégorie et le prix conseillé",
    "Tu coches les plateformes où l'envoyer",
    "Ton ordinateur, ouvert avec l'extension, la dépose une plateforme après l'autre",
  ],
  debCta: 'Créer ma première annonce',

  // ── Le tuto « du téléphone à l'ordinateur » ──────────────────────────────
  // ⛔ Trois temps, trois phrases de trois mots. C'est un schéma légendé, pas
  //    un paragraphe : ce qui ne tient pas sur deux lignes n'y a pas sa place.
  tutoTitre: "Du téléphone à l'ordinateur",
  tutoPhoto: ['Tu prends', 'la photo'],
  tutoFiche: ['La fiche', "s'écrit"],
  tutoDepot: ['Ton PC ouvert', 'la dépose'],
  tutoNote: "Ce que tu prépares depuis ton téléphone attend dans ton compte : ton ordinateur le reprend dès que l'extension tourne.",

  // ── 5. Republication ─────────────────────────────────────────────────────
  repKicker: 'Ensuite, ça tourne',
  repTitre: 'Tes annonces remontent toutes seules',
  repTexte: "Une annonce qui date descend dans les listes. Tu choisis le créneau et les jours ; l'extension repasse sur ton ordinateur et la remet en haut.",
  repCycle: ['Elle redescend', 'FillSell la reprend', 'Elle repart en haut'],
  repReglages: ['Les jours', 'Le créneau', 'Les articles'],
  repNote: "Tout ça se règle dans Réglages › Automatismes, quand tu veux. Rien n'est activé maintenant.",
  repCta: 'Compris',

  // ── 6. Pseudo ────────────────────────────────────────────────────────────
  psKicker: 'Dernière marche',
  psTitre: "Comment on t'appelle ?",
  psTexte: 'Juste pour le bonjour du tableau de bord. Tu peux laisser vide.',
  psPlaceholder: 'Prénom ou pseudo',

  // ── 7. Fin ───────────────────────────────────────────────────────────────
  finTitre: 'À toi de jouer',
  finTitreNom: (nom) => `À toi de jouer, ${nom}`,
  finTexte: 'Tout ce que tu as sauté reste accessible dans les Réglages.',
  finPlateformes: 'Plateformes',
  finAucune: "Aucune pour l'instant",
  finExtension: 'Extension Chrome',
  finExtInstallee: 'Installée',
  finExtLienEnvoye: 'Lien envoyé',
  finExtAInstaller: 'À installer',
  finEbay: 'Compte eBay',
  finEbayRelie: 'Relié',
  finRepub: 'Republication auto',
  finRepubOu: 'Réglages › Automatismes',
  finPlateformesVide: 'Tu en choisiras une plus tard',
  finExtOu: 'Sur ton ordinateur, dans Chrome',
  finExtEnvoye: 'Lien envoyé sur ta boîte mail',
  finEbayOu: 'Réglages › Mes plateformes',
  finEbayApi: "Ventes détectées par l'API",
  finPret: 'Prêt', finVide: 'Vide', finEnvoye: 'Envoyé', finAFaire: 'À faire',
  finRelie: 'Relié', finPlusTard: 'Plus tard', finARegler: 'À régler',
  finSuiteLien: "Prochaine étape : ouvre le lien sur ton ordinateur et installe l'extension. Tes annonces arrivent ensuite toutes seules.",
  finSuiteTel: "Prochaine étape : installe l'extension sur ton ordinateur — l'app te le rappellera dans le Stock.",
  finSuiteOrdi: "Prochaine étape : garde Chrome ouvert avec l'extension, c'est lui qui dépose tes annonces.",
  finCta: 'Entrer dans FillSell',

  // ══ (04/11, lot 3) GRILLE À 3 JAUGES ET FILLSELL CLOUD ══════════════════
  // ── 2 bis. Comment tu veux publier ? (maquette o-voie, v3) ───────────────
  voieKicker: "L'étape qui compte",
  voieTitre: 'Comment tu veux publier ?',
  voieTexteAvant: 'Tes annonces doivent être déposées sur chaque plateforme, avec ton compte.',
  voieTexteApres: "Choisis qui s'en charge : tu pourras changer plus tard.",
  voiePastille: `${J7} offerts`,
  voieCloudK: 'FillSell Cloud',
  voieCloudT: 'Tout depuis ton téléphone',
  voieCloudP: (noms) => `Sans ordinateur. FillSell publie, remonte et retire tes annonces ${noms} depuis ses serveurs, même quand tout est éteint.`,
  voieCloudPlus: ['Rien à installer', 'Ventes vues en direct', 'Sans engagement'],
  voieCloudCta: `Essayer ${J7} offerts`,
  voieCloudNote: `Puis ${PRIX}/mois. Tu l'arrêtes en un geste, on te prévient la veille.`,
  voieExtK: 'Extension Chrome',
  voieExtT: 'Sur ton ordinateur, gratuit',
  voieExtP: 'Installée une fois dans Chrome, elle dépose tes annonces avec tes comptes déjà connectés. Ton ordinateur doit être allumé pour publier.',
  voieExtCta: 'Utiliser mon ordinateur',
  voieExtNote: 'Gratuite, sans carte, pour toujours.',
  voiePied: "Tu pourras passer de l'un à l'autre dans Réglages, quand tu veux.",
  // Le point « i » et sa petite fenêtre.
  infoTitre: 'Il te faut déjà un compte sur chaque plateforme',
  infoP1: 'FillSell se connecte à tes comptes Vinted, Leboncoin, Beebs, Depop ou eBay déjà créés. Il ne crée pas de compte à ta place.',
  infoP2: "Pas encore de compte sur l'une d'elles ? Crée-le d'abord sur la plateforme, puis reviens : rien n'est perdu, tu la connecteras plus tard.",
  infoP3: "Avec le Cloud, tu te connectes sur la page de connexion de la plateforme. Avec l'extension, FillSell utilise les comptes déjà ouverts dans Chrome.",
  infoCompris: 'Compris',

  // ── 2 ter. Cloud : l'essai (maquette o-cloud-essai) ──────────────────────
  cloudKicker: `FillSell Cloud · ${J7} offerts`,
  cloudTitre: (date) => `Rien à payer avant le ${String(date).replace(/ /g, NBSP)}`,
  cloudTexte: `Pendant ${J7}, tes annonces partent de nos serveurs, pilotées depuis ton téléphone. Tu ne paies que si tu continues.`,
  cloudFrise: (veille, bascule) => [
    { quand: "Aujourd'hui", quoi: `Carte demandée, 0${NBSP}€ prélevé.` },
    { quand: veille, quoi: "On te prévient, dans l'app et par e-mail." },
    { quand: bascule, quoi: `${PRIX}/mois, sauf si tu arrêtes avant. Sans engagement.` },
  ],
  cloudFait: 'Ce que fait le Cloud',
  cloudFaitListe: (noms, quotasFree) => [
    `${noms} : publiés, remontés et retirés après une vente, ordinateur éteint`,
    'Tes ventes vues en direct, sur ton téléphone',
    'eBay part déjà de nos serveurs, pour tout le monde',
    quotasFree ? `Tes quotas restent ceux de ton plan : en Free, ${quotasFree} par mois` : 'Tes quotas restent ceux de ton plan',
  ],
  cloudCta: `Commencer mes ${J7} offerts`,
  // La ligne sous le bouton, selon le canal de l'achat (achatCloud : boutique sur téléphone, Stripe sur le web).
  cloudCanal: {
    ios: "L'essai passe par l'App Store : tu l'arrêtes aussi dans tes abonnements Apple.",
    android: "L'essai passe par Google Play : tu l'arrêtes aussi dans tes abonnements Google Play.",
    web: "L'essai passe par une page de paiement sécurisée : tu l'arrêtes en un geste dans Réglages › Abonnement.",
  },
  cloudOrdinateur: 'Je préfère utiliser mon ordinateur',
  // Toutes les places prises : la liste d'attente existante (cloud/textes.js), jamais une vente.
  cloudCompletKicker: 'FillSell Cloud',

  // ── 2 quater. Cloud : les connexions (maquette o-cloud-connexion, v3) ────
  cxKicker: (date) => (date ? `Cloud activé · essai jusqu'au ${date}` : 'Cloud activé'),
  cxTitre: 'Connecte tes comptes, une fois',
  cxTexte: "La page de connexion de chaque plateforme s'ouvre ici. Ensuite, FillSell publie depuis ses serveurs, même ordinateur éteint.",
  cxEbaySous: "Par la connexion officielle d'eBay",
  cxBande: "Seule la page de connexion s'ouvre : connecte-toi avec ton compte déjà créé sur la plateforme, FillSell n'en crée pas. Connecte une plateforme maintenant, les autres quand tu veux, dans Réglages › Mes plateformes.",
  cxCompte: (n, total) => `${n} plateforme${n > 1 ? 's' : ''} connectée${n > 1 ? 's' : ''} sur ${total}`,
  cxReessayer: 'Réessayer',

  // ── 3 bis. L'extension, choisie (maquette o-extension) ───────────────────
  extKickerVoie: 'Extension Chrome · gratuite',
  extFinalement: "Finalement, je n'ai pas d'ordinateur",

  // ── 4. Relevé, avec le Cloud (maquette o-releve) ─────────────────────────
  relTexteCloud: `Appuie sur «${NBSP}Synchroniser mes annonces${NBSP}» : FillSell lit, depuis ses serveurs, tes annonces déjà publiées (titres, prix, photos) et crée une fiche par article dans ton stock, même article vu sur deux plateformes.`,
  relSousBoutonCloud: 'Rien à laisser allumé : la lecture se fait depuis nos serveurs.',
  relLanceCloud: 'Synchronisation lancée — elle avance depuis nos serveurs',
  relEnFileCloud: 'Demande gardée — elle part dès que FillSell Cloud est prêt',
  relEnFileNoteCloud: "C'est noté. Ta synchronisation part depuis nos serveurs dès que FillSell Cloud est prêt — tu n'as pas à revenir cliquer.",
  // Avec la grille : l'import ne coûte rien.
  relImportGratuit: "Et l'import ne compte dans aucune jauge, même avec 500 annonces.",

  // ── 4 bis. Je débute, avec le Cloud ──────────────────────────────────────
  debTexteCloud: 'Photographie un article : FillSell remplit la fiche, tu choisis les plateformes, FillSell la publie depuis ses serveurs.',
  debEtapeCloud: "FillSell la publie depuis ses serveurs, une plateforme après l'autre, même ordinateur éteint",

  // ── 5. Remonter tes annonces, avec la grille (maquette o-remontees) ──────
  remTitre: 'Remonte tes annonces en un geste',
  remTexte: `Une annonce qui date descend dans les listes. «${NBSP}Remonter mes annonces${NBSP}», dans ton Stock, la remet en haut sur chaque plateforme.`,
  remCycle: ['Elle redescend', `Tu appuies sur «${NBSP}Remonter${NBSP}»`, 'Elle repart en haut'],
  remEnFree: 'En Free',
  remDesLe: (nom) => `Dès le ${nom}`,
  remFreeVolume: (compte) => `${compte} par mois`,
  remProVolume: (compte) => (compte ? `${compte} par mois, et toutes seules au créneau que tu choisis` : 'illimitées, et toutes seules au créneau que tu choisis'),
  remNote: "Rien n'est activé maintenant. Une remontée, c'est une annonce remise en haut sur une plateforme.",

  // ── 5 bis. Ton plan Free (maquette o-free) ───────────────────────────────
  freeKicker: 'Ton plan Free',
  freeKickerCloud: 'Ton plan Free + Cloud',
  freeTitre: 'Ce que tu as chaque mois, sans payer',
  freeTexte: 'De quoi lancer ton stock et voir tes premières ventes. Tes compteurs repartent à zéro chaque mois, à la date de ton inscription.',
  freeSous: {
    annonces: "rédigées par l'IA ou scannées avec Lens",
    publications: 'une mise en ligne sur une plateforme',
    remontees: 'une annonce remise en haut sur une plateforme',
  },
  freeSansLimite: 'Sans limite, même en Free',
  freeSansLimiteListe: ['Import de tout ton stock, depuis toutes tes plateformes', 'Retrait automatique partout après une vente', 'Synchronisation de tes annonces'],
  freeExemple: (cout) => `Exemple : un article publié sur Vinted et Leboncoin compte ${cout}.`,
  freeCloud: 'Le Cloud ne change pas ces chiffres : il publie sans ordinateur.',
  freeCta: "C'est parti",
  freeFormules: 'Besoin de plus un jour ? Les formules sont dans Réglages › Abonnement.',

  // ── 7 bis. Le récap, avec la grille et le Cloud (maquette o-fin) ─────────
  finPlan: 'Ton plan',
  finPlanValeur: (nom, liste) => `${nom} : ${liste}`,
  finCloud: 'FillSell Cloud',
  finCloudEssai: (date) => `Essai gratuit jusqu'au ${date}`,
  finCloudActif: 'Actif',
  finCloudOu: 'Réglages › Abonnement',
  finConnexions: 'Connexions',
  finConnexionsValeur: (n, total, reste) => (reste ? `${n} sur ${total} : ${reste} à connecter` : `${n} sur ${total}`),
  finSuiteCloud: 'Prochaine étape : connecte tes autres plateformes, puis publie ta première annonce.',
  finSuiteCloudPret: 'Prochaine étape : publie ta première annonce.',
};

const EN = {
  passer: 'Skip',
  continuer: 'Continue',
  plusTard: 'Later',

  pfKicker: 'To start',
  pfTitre: 'Where do you sell?',
  pfTexte: 'Tick what you already use. It shapes what FillSell offers next — you can add more any time.',
  pfRienEnLigne: 'Nothing online yet',

  ebayKicker: 'You ticked eBay',
  ebayTitre: 'Link your eBay account',
  ebayTexte: "One eBay authorisation, once. Without it the extension still posts your listings — but FillSell won't see your eBay sales come in.",
  ebayGains: [
    'Your eBay sales detected through the API, without waiting for the extension',
    'Your shipping and return policies set once and for all',
    'Your eBay listings scanned and matched to your items',
  ],
  ebayNote: 'eBay opens its own consent page. FillSell never sees your password.',
  ebayCta: 'Connect my eBay account',
  ebayEnCours: 'Opening eBay…',
  ebayRelie: 'eBay account linked',
  ebayPlusTard: 'Later, in Settings › My platforms',

  extKicker: 'The step that matters',
  extTitre: 'Your computer does the work',
  extTexte: 'You drive from this phone. A Chrome extension, installed once on your computer, posts and scans your listings with the accounts already signed in — never your passwords.',
  extTuPilotes: 'You drive',
  extElleExecute: 'The extension runs it',
  extCtaMail: 'Email me the link for my computer',
  extCtaMailEnCours: 'Sending the link…',
  extCtaInstaller: 'Install the extension',
  extContinuerTel: 'Continue on my phone',
  extLienEnvoyeA: 'Link sent to',
  extLienSuite: 'Open it on your computer, whenever you want. One install, once, nothing to click again here.',
  extDetection: 'Automatic detection — nothing to click again here',
  extVue: 'Extension detected on your computer',
  extAutrement: 'Get the link another way',
  extPitchEyebrow: 'To post and scan your listings',
  extPitchCorps: 'It reads and posts your listings with the accounts already signed in to your browser — never your passwords — when you decide from the app. Free, installed once.',

  relKicker: 'What is already online',
  relTitre: 'You retype nothing',
  relTexte: 'As soon as the extension runs, it scans your published listings: titles, prices, photos. One card per item in your stock, even when the same item is on two platforms.',
  relCarte: 'What we scan',
  relLectureSeule: 'Read only',
  relContrat: 'We read your listings. Nothing is published, edited or deleted.',
  relCta: 'Scan my listings',
  relEnCours: 'Scan requested…',
  relLance: 'Scan started — it runs on your computer',
  relSousBouton: 'Your computer must be on, with Chrome and the FillSell extension',
  relEnFile: 'Request kept — it starts as soon as the extension runs',
  relEnFileNote: "Noted. The scan starts as soon as the extension runs on your computer — you don't have to come back and click.",

  debKicker: 'Nothing online yet',
  debTitre: 'We start with your first listing',
  debTexte: 'Photograph an item: FillSell fills the card, you pick the platforms, the extension posts it from your computer.',
  debEtapes: [
    'You photograph the item in the app, FillSell fills in title, category and suggested price',
    'You tick the platforms to send it to',
    'Your computer, open with the extension, posts it one platform after another',
  ],
  debCta: 'Create my first listing',

  tutoTitre: 'From phone to computer',
  tutoPhoto: ['You take', 'the photo'],
  tutoFiche: ['The card', 'writes itself'],
  tutoDepot: ['Your open PC', 'posts it'],
  tutoNote: 'What you prepare on your phone waits in your account: your computer picks it up as soon as the extension runs.',

  repKicker: 'Then it keeps running',
  repTitre: 'Your listings rise again on their own',
  repTexte: 'An ageing listing sinks down the lists. You pick the time slot and the days; the extension goes back over it on your computer and puts it back on top.',
  repCycle: ['It sinks', 'FillSell picks it up', 'It goes back on top'],
  repReglages: ['The days', 'The time slot', 'The items'],
  repNote: 'Time slot, days and items are set in Settings › Automations. Nothing is turned on now.',
  repCta: 'Got it',

  psKicker: 'Last step',
  psTitre: 'What should we call you?',
  psTexte: 'Just to say hello on the dashboard. You can leave it empty.',
  psPlaceholder: 'First name or nickname',

  finTitre: 'Over to you',
  finTitreNom: (nom) => `Over to you, ${nom}`,
  finTexte: 'Anything you skipped stays available in Settings.',
  finPlateformes: 'Platforms',
  finAucune: 'None for now',
  finExtension: 'Chrome extension',
  finExtInstallee: 'Installed',
  finExtLienEnvoye: 'Link sent',
  finExtAInstaller: 'To install',
  finEbay: 'eBay account',
  finEbayRelie: 'Linked',
  finRepub: 'Auto relisting',
  finRepubOu: 'Settings › Automations',
  finPlateformesVide: "You'll pick one later",
  finExtOu: 'On your computer, in Chrome',
  finExtEnvoye: 'Link sent to your inbox',
  finEbayOu: 'Settings › My platforms',
  finEbayApi: 'Sales detected through the API',
  finPret: 'Ready', finVide: 'Empty', finEnvoye: 'Sent', finAFaire: 'To do',
  finRelie: 'Linked', finPlusTard: 'Later', finARegler: 'To set',
  finSuiteLien: 'Next step: open the link on your computer and install the extension. Your listings then arrive on their own.',
  finSuiteTel: 'Next step: install the extension on your computer — the app will remind you in Stock.',
  finSuiteOrdi: 'Next step: keep Chrome open with the extension, it is what posts your listings.',
  finCta: 'Enter FillSell',

  // ══ (04/11, lot 3) 3-GAUGE GRID AND FILLSELL CLOUD ══════════════════════
  voieKicker: 'The step that matters',
  voieTitre: 'How do you want to post?',
  voieTexteAvant: 'Your listings have to be posted on each platform, with your account.',
  voieTexteApres: 'Pick who does it: you can change later.',
  voiePastille: `${D7} free`,
  voieCloudK: 'FillSell Cloud',
  voieCloudT: 'Everything from your phone',
  voieCloudP: (noms) => `No computer needed. FillSell posts, bumps and removes your ${noms} listings from its servers, even when everything is off.`,
  voieCloudPlus: ['Nothing to install', 'Sales seen live', 'No commitment'],
  voieCloudCta: `Try ${D7} free`,
  voieCloudNote: `Then ${PRIX_EN}/mo. Stop it in one tap, we remind you the day before.`,
  voieExtK: 'Chrome extension',
  voieExtT: 'On your computer, free',
  voieExtP: 'Installed once in Chrome, it posts your listings with the accounts already signed in. Your computer must be on to post.',
  voieExtCta: 'Use my computer',
  voieExtNote: 'Free, no card, forever.',
  voiePied: 'You can switch from one to the other in Settings, whenever you want.',
  infoTitre: 'You need an account on each platform first',
  infoP1: 'FillSell connects to your Vinted, Leboncoin, Beebs, Depop or eBay accounts you already created. It does not create an account for you.',
  infoP2: "No account on one of them yet? Create it on the platform first, then come back: nothing is lost, you'll connect it later.",
  infoP3: 'With the Cloud, you sign in on the platform\'s sign-in page. With the extension, FillSell uses the accounts already open in Chrome.',
  infoCompris: 'Got it',

  cloudKicker: `FillSell Cloud · ${D7} free`,
  cloudTitre: (date) => `Nothing to pay before ${String(date).replace(/ /g, NBSP)}`,
  cloudTexte: `For ${D7}, your listings go out from our servers, driven from your phone. You only pay if you keep going.`,
  cloudFrise: (veille, bascule) => [
    { quand: 'Today', quoi: 'Card required, €0 charged.' },
    { quand: veille, quoi: 'We remind you, in the app and by email.' },
    { quand: bascule, quoi: `${PRIX_EN}/mo, unless you stop before. No commitment.` },
  ],
  cloudFait: 'What the Cloud does',
  cloudFaitListe: (noms, quotasFree) => [
    `${noms}: posted, bumped and removed after a sale, computer off`,
    'Your sales seen live, on your phone',
    'eBay already goes out from our servers, for everyone',
    quotasFree ? `Your quotas stay those of your plan: on Free, ${quotasFree} a month` : 'Your quotas stay those of your plan',
  ],
  cloudCta: `Start my ${D7} free`,
  cloudCanal: {
    ios: 'The trial goes through the App Store: you can also stop it in your Apple subscriptions.',
    android: 'The trial goes through Google Play: you can also stop it in your Google Play subscriptions.',
    web: 'The trial goes through a secure payment page: stop it in one tap in Settings › Subscription.',
  },
  cloudOrdinateur: "I'd rather use my computer",
  cloudCompletKicker: 'FillSell Cloud',

  cxKicker: (date) => (date ? `Cloud on · trial until ${date}` : 'Cloud on'),
  cxTitre: 'Connect your accounts, once',
  cxTexte: "Each platform's sign-in page opens here. Then FillSell posts from its servers, even with your computer off.",
  cxEbaySous: "Through eBay's official sign-in",
  cxBande: 'Only the sign-in page opens: sign in with the account you already created on the platform, FillSell does not create one. Connect one platform now, the others whenever you want, in Settings › My platforms.',
  cxCompte: (n, total) => `${n} platform${n === 1 ? '' : 's'} connected out of ${total}`,
  cxReessayer: 'Try again',

  extKickerVoie: 'Chrome extension · free',
  extFinalement: "Actually, I don't have a computer",

  relTexteCloud: 'Tap "Scan my listings": FillSell reads, from its servers, your published listings (titles, prices, photos) and creates one card per item in your stock, even when the same item is on two platforms.',
  relSousBoutonCloud: 'Nothing to leave on: the scan runs from our servers.',
  relLanceCloud: 'Scan started — it runs from our servers',
  relEnFileCloud: 'Request kept — it starts as soon as FillSell Cloud is ready',
  relEnFileNoteCloud: "Noted. The scan starts from our servers as soon as FillSell Cloud is ready — you don't have to come back and click.",
  relImportGratuit: 'And the import counts in no gauge, even with 500 listings.',

  debTexteCloud: 'Photograph an item: FillSell fills the card, you pick the platforms, FillSell posts it from its servers.',
  debEtapeCloud: 'FillSell posts it from its servers, one platform after another, even with your computer off',

  remTitre: 'Bump your listings in one tap',
  remTexte: 'An ageing listing sinks down the lists. "Bump my listings", in your Stock, puts it back on top on each platform.',
  remCycle: ['It sinks', 'You tap "Bump"', 'It goes back on top'],
  remEnFree: 'On Free',
  remDesLe: (nom) => `From ${nom}`,
  remFreeVolume: (compte) => `${compte} a month`,
  remProVolume: (compte) => (compte ? `${compte} a month, and on their own at the time slot you choose` : 'unlimited, and on their own at the time slot you choose'),
  remNote: 'Nothing is turned on now. A bump is one listing put back on top on one platform.',

  freeKicker: 'Your Free plan',
  freeKickerCloud: 'Your Free plan + Cloud',
  freeTitre: 'What you get each month, without paying',
  freeTexte: 'Enough to start your stock and see your first sales. Your counters reset every month, on your sign-up date.',
  freeSous: {
    annonces: 'written by the AI or scanned with Lens',
    publications: 'one listing put online on one platform',
    remontees: 'one listing put back on top on one platform',
  },
  freeSansLimite: 'No limit, even on Free',
  freeSansLimiteListe: ['Import of your whole stock, from all your platforms', 'Automatic removal everywhere after a sale', 'Sync of your listings'],
  freeExemple: (cout) => `Example: an item posted on Vinted and Leboncoin counts as ${cout}.`,
  freeCloud: "The Cloud doesn't change these numbers: it posts without a computer.",
  freeCta: "Let's go",
  freeFormules: 'Need more one day? The plans are in Settings › Subscription.',

  finPlan: 'Your plan',
  finPlanValeur: (nom, liste) => `${nom}: ${liste}`,
  finCloud: 'FillSell Cloud',
  finCloudEssai: (date) => `Free trial until ${date}`,
  finCloudActif: 'On',
  finCloudOu: 'Settings › Subscription',
  finConnexions: 'Connections',
  finConnexionsValeur: (n, total, reste) => (reste ? `${n} of ${total}: ${reste} to connect` : `${n} of ${total}`),
  finSuiteCloud: 'Next step: connect your other platforms, then post your first listing.',
  finSuiteCloudPret: 'Next step: post your first listing.',
};

export function textesEntree(lang) {
  return lang === 'en' ? EN : FR;
}
