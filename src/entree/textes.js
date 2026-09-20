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
  extLienSuite: "Ouvre-le sur ton ordinateur, même dans trois jours. Une minute d'installation, rien à recliquer ici.",
  extDetection: 'Détection automatique — rien à recliquer ici',
  extVue: 'Extension détectée sur ton ordinateur',
  extAutrement: 'Récupérer le lien autrement',
  extPitchEyebrow: 'Pour déposer et relever tes annonces',
  extPitchCorps: "Elle lit et dépose tes annonces avec les comptes déjà connectés dans ton navigateur — jamais tes mots de passe — quand tu le décides depuis l'app. Gratuite, installée une seule fois.",

  // ── 4. Relevé ────────────────────────────────────────────────────────────
  relKicker: 'Ce qui est déjà en ligne',
  relTitre: 'Tu ne ressaisis rien',
  relTexte: "Dès que l'extension tourne, elle relève tes annonces déjà publiées : titres, prix, photos. Une fiche par article dans ton stock, même article vu sur deux plateformes.",
  relCarte: "Ce qu'on relève",
  relLectureSeule: 'Lecture seule',
  relContrat: "On lit tes annonces. Rien n'est publié, modifié ni supprimé.",
  relCta: 'Relever mes annonces',
  relEnCours: 'Relevé demandé…',
  relLance: 'Relevé lancé — il avance sur ton ordinateur',
  // ⛔ LA LIGNE SOUS LE BOUTON, MOT POUR MOT. Elle dit la seule chose que la
  //    personne a besoin de savoir : elle n'a plus rien à faire ici.
  relSousBouton: "Le relevé part dès que l'extension tourne sur ton ordinateur",
  relEnFile: 'Relevé en file — il partira tout seul',
  relEnFileNote: "C'est noté. Le relevé part dès que l'extension tourne sur ton ordinateur — tu n'as pas à revenir cliquer.",

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
  extLienSuite: 'Open it on your computer, even in three days. One minute to install, nothing to click again here.',
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
  relSousBouton: 'The scan starts as soon as the extension runs on your computer',
  relEnFile: 'Scan queued — it will start on its own',
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
};

export function textesEntree(lang) {
  return lang === 'en' ? EN : FR;
}
