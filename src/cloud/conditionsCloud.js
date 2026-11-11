// ═══════════════════════════════════════════════════════════════════════════
// LES CONDITIONS D'UTILISATION DE FILLSELL CLOUD (30/10, lot D) — ⛔ À VALIDER PAR NICO
// ═══════════════════════════════════════════════════════════════════════════
// Demande de Nico : ce que fait le service, ce que FillSell fait sur ses comptes de plateformes et comment les
// connexions sont chiffrées, la responsabilité de l'utilisateur vis-à-vis des règles de chaque plateforme (risque de
// restriction compris), aucune garantie de vente, l'essai de 7 jours avec carte, le prix, la résiliation, les données.
// Case obligatoire à l'activation ; date et version enregistrées (profiles.cloud_cgu_version / cloud_cgu_acceptee_le,
// rpc cloud_cgu_accepter_moi). ⛔ RIEN N'EST PUBLIÉ avant la validation du texte par Nico : la page
// /conditions-cloud et la case ne se montrent qu'aux comptes témoins (drapeau par compte, config/cloudOffer.js).
// Écrit pour dire EXACTEMENT ce que fait le code (relu le 30/10) : coffre AES-256-GCM (serveur-cloud/src/coffre.js),
// « Me connecter » (page de connexion seule, image en direct, saisie jamais journalisée — connexion.js,
// plateformes.js), mêmes plafonds et cadences que l'extension (get-pending-jobs, un exécutant par plateforme),
// arrêt sur restriction, purge au plus tard 3 jours après la fin, empreintes HMAC 12 mois, IP françaises IPRoyal
// en rotation (fournisseurIp.js). Changer le texte = changer la VERSION (une nouvelle acceptation est demandée).
// (11/11 : précisé plus bas — une reformulation garde valables les acceptations depuis la version minimale.)
// (04/11, décision de Nico du 03/11) Article 6 : le prix passe à 24,99 € TTC par mois (le prix facturé sur les trois
// canaux) → version 2026-11-04 (config/cloudOffer.js ET supabase/functions/_shared/cloud-conditions.js).
// (04/11, décision de Nico) « l'option FillSell Cloud » ou « le Cloud », jamais « option » seul (article 1) : même
// version 2026-11-04 — rien n'a été publié depuis qu'elle a été posée le même jour.
// (11/11, point C1 du méga lot de Nico ; textes validés par Nico le 11/11 vers 15:25) La case ne cite plus le risque
// (« J'ai lu et j'accepte les conditions d'utilisation de FillSell Cloud. ») ; l'article 4 devient « Le Cloud et les
// règles des plateformes » : reformulé pour rassurer, au « vous » comme le reste, SANS RIEN RETIRER SUR LE FOND (règles
// propres à chaque plateforme, risque y compris à cause du Cloud, accepté en l'activant, aucune garantie, aucune
// responsabilité des décisions d'une plateforme, aucune affiliation, l'utilisateur seul responsable) → version neuve.
// Règle d'acceptation (une seule source : supabase/functions/_shared/cloud-conditions.js) : une date AAAA-MM-JJ réelle
// ET ≥ la version MINIMALE (2026-11-04, le dernier changement de fond) — une reformulation garde donc valables les
// acceptations précédentes, ce que dit la ligne de version (article 9) ; un changement de FOND relève la minimale, en
// deux temps (procédure dans _shared/cloud-conditions.js). Verrou : scripts/cloud-executant-selftest.mjs § 3 bis et 3 ter.
// (11/11, D4, décision de Nico « Le préciser ») L'article 9 le dit aussi : « …, sauf une simple reformulation, qui ne
// demande pas de nouvelle acceptation. »

// La version, la minimale, l'historique et la règle viennent de config/cloudOffer.js, qui les ré-exporte de
// supabase/functions/_shared/cloud-conditions.js (aucune date en dur dans src/cloud/).
import { CGU_CLOUD_VERSION, CGU_CLOUD_VERSION_MINIMALE, CGU_CLOUD_HISTORIQUE, versionCguValable } from '../config/cloudOffer.js';
import { lirePrixBoutique, estCanalBoutique, prixOuChargement } from '../lib/prixBoutique.js';
export { CGU_CLOUD_VERSION, CGU_CLOUD_VERSION_MINIMALE, versionCguValable };

// AAAA-MM-JJ → JJ/MM/AAAA.
const dateVersion = (v) => String(v).split('-').reverse().join('/');
// Ce que dit la ligne de version, selon ce que la version CHANGE (`changement` dans CGU_CLOUD_HISTORIQUE) : une version
// absente de cette table n'affiche que sa date, jamais la phrase d'une autre. `min` = la version minimale (JJ/MM/AAAA).
const NOTES_DE_VERSION = Object.freeze({
  reformulation_articles_4_9: Object.freeze({
    fr: (min) => `elle reformule les articles 4 et 9 sans rien changer sur le fond : une acceptation de la version du ${min} reste valable.`,
    en: (min) => `it rewords articles 4 and 9 without changing their substance: an acceptance of the version of ${min} remains valid.`,
  }),
});
/** La ligne « Version du … » d'une version de l'historique (pure, testée) ; par défaut, la version en vigueur. */
export function ligneDeVersion(lang, entree = CGU_CLOUD_HISTORIQUE[0]) {
  const note = NOTES_DE_VERSION[entree?.changement];
  const date = dateVersion(entree?.version ?? CGU_CLOUD_VERSION), min = dateVersion(CGU_CLOUD_VERSION_MINIMALE);
  if (lang === 'en') return `Version of ${date} — ${note ? `${note.en(min)} ` : ''}English translation for information only; the French version prevails.`;
  return `Version du ${date}${note ? ` — ${note.fr(min)}` : ''}`;
}

const FR = {
  titre: "Conditions d'utilisation de FillSell Cloud",
  version: ligneDeVersion('fr'),
  articles: [
    { t: '1. Le service', ps: [
      "L'option FillSell Cloud (« le Cloud ») est un service de FillSell. Le Cloud exécute depuis les serveurs de FillSell, sans que votre ordinateur soit allumé, ce que l'extension Chrome FillSell fait sur un ordinateur : publier, republier et retirer vos annonces, relever vos annonces en ligne et détecter vos ventes, 24 heures sur 24, dans un navigateur réservé à votre compte.",
      "Il fonctionne pour chaque plateforme que vous connectez depuis l'écran « Me connecter » (Vinted, Leboncoin, Beebs, Depop). eBay passe par sa connexion officielle, comme sans le Cloud.",
      "Le Cloud n'a pas de volumes propres : il applique ceux de votre forfait FillSell, gratuit ou payant, avec les mêmes plafonds, les mêmes rythmes de republication et les mêmes protections que l'extension. Il ne va jamais plus vite qu'elle. Si l'extension tourne aussi sur votre ordinateur, chaque tâche n'est faite qu'une fois, par l'un ou par l'autre.",
    ] },
    { t: '2. Ce que FillSell fait sur vos comptes de plateformes', ps: [
      "Dans vos propres sessions, et seulement pour les tâches que vous lancez ou programmez dans FillSell, le navigateur du Cloud : crée vos annonces avec le contenu de vos fiches (titre, description, photos, prix, caractéristiques) ; republie une annonce en la supprimant puis en la recréant, au rythme de votre forfait, et ne la recrée jamais si la plateforme n'a pas confirmé la suppression ; retire une annonce quand vous le demandez ou quand l'article est vendu ailleurs, après la pause de sécurité prévue avant toute suppression ; lit vos annonces et l'état de vos ventes pour tenir votre stock à jour.",
      "Il n'envoie un message à un acheteur que lorsque vous l'avez écrit vous-même dans FillSell. Il ne modifie jamais vos coordonnées, votre mot de passe ni vos moyens de paiement sur une plateforme, et n'y achète rien.",
      "Si une plateforme demande une vérification ou signale une restriction, le Cloud s'arrête sur cette plateforme et vous prévient dans l'app. Il ne tente jamais de contourner une vérification.",
    ] },
    { t: '3. Vos connexions et leur chiffrement', ps: [
      "Vous connectez chaque plateforme vous-même, depuis l'écran « Me connecter » de l'app. Il n'ouvre que la page de connexion de la plateforme, au format téléphone, sans barre d'adresse ni navigation libre. L'image de la page vous parvient en direct ; ce que vous tapez est transmis à la plateforme sans être enregistré ni journalisé. FillSell ne connaît ni ne conserve jamais vos mots de passe.",
      "Une fois connecté, la plateforme dépose ses cookies de session. FillSell les chiffre (AES-256-GCM) avec une clé qui n'existe que sur les serveurs du Cloud ; la base de données de FillSell n'en garde qu'une version chiffrée. Ces connexions ne servent qu'aux tâches de l'article 2. L'arrêt du Cloud les efface ; vous pouvez aussi les fermer à tout moment depuis la plateforme (changement de mot de passe, déconnexion de tous les appareils).",
      "Les navigateurs du Cloud sont hébergés par Hetzner Online GmbH (Allemagne, Union européenne). Ils sortent sur Internet par des adresses IP françaises fournies par IPRoyal Services FZE LLC (Émirats arabes unis) ; l'adresse utilisée pour votre compte peut changer au fil du temps.",
    ] },
    { t: '4. Le Cloud et les règles des plateformes', ps: [
      "FillSell agit comme vous, à votre rythme, depuis une connexion française : le Cloud travaille dans vos propres sessions, seulement pour les tâches que vous lancez ou programmez, au rythme de votre forfait et jamais plus vite que l'extension, par une adresse IP française. Si une plateforme demande une vérification ou signale une restriction, il s'arrête sur cette plateforme et vous prévient dans l'app.",
      "Comme pour tout outil, chaque plateforme reste maître de ses règles, notamment sur l'automatisation et les connexions depuis des serveurs, et peut les changer à tout moment. Elle peut demander une vérification, limiter, suspendre ou fermer un compte, y compris parce qu'un service comme le Cloud est utilisé. Les protections de FillSell (plafonds, rythmes, pause avant suppression, arrêt sur restriction) réduisent ce risque sans pouvoir l'écarter : en activant le Cloud, vous l'acceptez. FillSell ne répond pas des décisions d'une plateforme et n'est affilié à aucune d'elles.",
      "Vous restez l'auteur et le seul responsable de vos annonces, de leur contenu, de leurs prix et des ventes que vous concluez, et vous vous engagez à respecter les conditions d'utilisation de chaque plateforme que vous connectez au Cloud.",
    ] },
    { t: '5. Aucune garantie de vente', ps: [
      "Le Cloud exécute des tâches. Il ne garantit ni la visibilité de vos annonces, ni un nombre de vues, ni une vente, ni un prix. Il dépend des plateformes, qui peuvent changer leurs pages ou refuser l'accès depuis les serveurs de FillSell : une tâche peut alors être retardée ou ne pas aboutir, et l'app vous le signale. FillSell met en œuvre des moyens raisonnables pour que le Cloud fonctionne en continu, sans garantie de résultat ni de disponibilité permanente.",
    ] },
    { t: '6. Prix et essai de 7 jours', ps: [
      "Le Cloud coûte 24,99 € TTC par mois, sur le web (carte bancaire, paiement géré par Stripe), dans l'App Store et dans Google Play. C'est un abonnement distinct des forfaits : il se prend seul, avec le forfait gratuit, ou en plus d'un forfait payant ; résilier un forfait n'arrête pas le Cloud.",
      "Les 7 premiers jours sont offerts. Un moyen de paiement est demandé pour commencer l'essai ; rien n'est prélevé pendant l'essai. La date de fin de l'essai et le montant prélevé ensuite sont affichés avant l'enregistrement du moyen de paiement. Sans résiliation avant la fin de l'essai, l'abonnement commence : 24,99 € sont prélevés, puis chaque mois à la même date. Au plus tard la veille de la fin de l'essai, un rappel vous est envoyé dans l'app et par e-mail.",
      "Un seul essai par personne : un essai déjà pris avec le même compte, le même appareil, la même carte ou le même compte de plateforme n'en ouvre pas un second ; le Cloud reste alors disponible sans essai. Dans l'App Store et Google Play, l'essai est proposé par la boutique, aux conditions qu'elle affiche.",
    ] },
    { t: '7. Résiliation', ps: [
      "Sur le web, vous résiliez depuis l'app (Réglages › Abonnement › FillSell Cloud). Pendant l'essai, l'arrêt est immédiat et rien n'est prélevé. Après l'essai, le Cloud reste actif jusqu'à la fin du mois payé, puis s'arrête ; rien n'est prélevé ensuite. Un abonnement pris dans l'App Store ou Google Play se résilie dans les réglages d'abonnement de la boutique. Le droit de rétractation prévu à l'article 6 des CGV s'applique.",
      "FillSell peut suspendre le Cloud d'un compte en cas d'usage contraire aux présentes conditions ou aux règles d'une plateforme ; il vous en informe.",
    ] },
    { t: '8. Vos données', ps: [
      "Pour faire fonctionner le Cloud, FillSell conserve : vos connexions chiffrées aux plateformes ; le profil du navigateur réservé à votre compte ; une session FillSell propre à ce navigateur (aucun mot de passe) ; le journal de vos connexions par « Me connecter » (date, plateforme, réussite), 90 jours ; l'historique des adresses IP utilisées pour votre compte, dont votre identifiant est effacé au bout de 12 mois ; et, pour la règle d'un essai par personne, des empreintes irréversibles (HMAC-SHA256) de l'appareil, de la carte (empreinte fournie par Stripe, jamais son numéro) et des comptes de plateforme, gardées 12 mois après l'essai.",
      "À l'arrêt du Cloud (fin de l'essai sans abonnement, résiliation, suppression du compte), FillSell efface le navigateur, son profil, vos connexions chiffrées et sa session FillSell, au plus tard 3 jours après la fin. Le détail figure dans la politique de confidentialité (article 4.8).",
    ] },
    { t: '9. Acceptation et modifications', ps: [
      "L'activation du Cloud exige d'accepter les présentes conditions. FillSell enregistre la date et la version acceptées. Une nouvelle version vous est présentée et doit être acceptée pour continuer à utiliser le Cloud, sauf une simple reformulation, qui ne demande pas de nouvelle acceptation. Les CGU et les CGV de FillSell s'appliquent pour tout ce que ces conditions ne prévoient pas.",
    ] },
  ],
  case: "J'ai lu et j'accepte les conditions d'utilisation de FillSell Cloud.",
  accepter: "J'accepte et je continue",
  annuler: 'Annuler',
  lire: 'Lire les conditions en entier',
  enregistrement: 'Enregistrement de ton acceptation…',
  echec: "Ton acceptation n'a pas pu être enregistrée. Réessaie dans un instant : rien n'a été demandé à ta carte.",
};

// (05/11 soir, lot « Ouverture du Cloud », phase 3 point 1 — « traduction anglaise : absolument tout ») LA VERSION
// ANGLAISE, POUR INFORMATION : traduction fidèle du texte français ci-dessus, qui seul fait foi (il le dit en tête). Même
// VERSION acceptée (CGU_CLOUD_VERSION) : la traduction ne change pas le texte en vigueur. À relire par Nico avec le
// français. Le Cloud n'est vendu qu'en France (config/cloudOffer.js) : cette version sert une interface réglée en anglais.
const EN = {
  titre: 'FillSell Cloud terms of use',
  version: ligneDeVersion('en'),
  articles: [
    { t: '1. The service', ps: [
      'The FillSell Cloud option ("the Cloud") is a FillSell service. From FillSell\'s servers, without your computer being on, the Cloud does what the FillSell Chrome extension does on a computer: publishing, reposting and withdrawing your listings, reading your online listings and detecting your sales, 24 hours a day, in a browser reserved for your account.',
      'It works for each marketplace you connect from the "Sign in" screen (Vinted, Leboncoin, Beebs, Depop). eBay goes through its official connection, as without the Cloud.',
      'The Cloud has no volumes of its own: it applies those of your FillSell plan, free or paid, with the same limits, the same reposting pace and the same protections as the extension. It never goes faster. If the extension also runs on your computer, each task is done only once, by one or the other.',
    ] },
    { t: '2. What FillSell does on your marketplace accounts', ps: [
      'In your own sessions, and only for the tasks you start or schedule in FillSell, the Cloud browser: creates your listings with the content of your item cards (title, description, photos, price, attributes); reposts a listing by deleting it and then recreating it, at your plan\'s pace, and never recreates it if the marketplace has not confirmed the deletion; withdraws a listing when you ask, or when the item is sold elsewhere, after the safety pause provided before any deletion; reads your listings and the status of your sales to keep your stock up to date.',
      'It only sends a message to a buyer when you have written it yourself in FillSell. It never changes your contact details, your password or your payment methods on a marketplace, and never buys anything there.',
      'If a marketplace asks for a verification or reports a restriction, the Cloud stops on that marketplace and tells you in the app. It never tries to get around a verification.',
    ] },
    { t: '3. Your connections and their encryption', ps: [
      'You connect each marketplace yourself, from the app\'s "Sign in" screen. It only opens the marketplace\'s sign-in page, in phone format, with no address bar and no free browsing. The image of the page reaches you live; what you type is sent to the marketplace without being recorded or logged. FillSell never knows or keeps your passwords.',
      'Once you are signed in, the marketplace sets its session cookies. FillSell encrypts them (AES-256-GCM) with a key that exists only on the Cloud servers; FillSell\'s database keeps only an encrypted version. These connections are used only for the tasks of article 2. Stopping the Cloud erases them; you can also close them at any time from the marketplace (password change, sign-out of all devices).',
      'The Cloud browsers are hosted by Hetzner Online GmbH (Germany, European Union). They go out to the Internet through French IP addresses supplied by IPRoyal Services FZE LLC (United Arab Emirates); the address used for your account may change over time.',
    ] },
    { t: '4. The Cloud and the marketplaces\' rules', ps: [
      'FillSell acts like you, at your pace, from a French connection: the Cloud works in your own sessions, only for the tasks you start or schedule, at your plan\'s pace and never faster than the extension, through a French IP address. If a marketplace asks for a verification or reports a restriction, the Cloud stops on that marketplace and tells you in the app.',
      'As with any tool, each marketplace remains in charge of its own rules, in particular on automation and on connections from servers, and may change them at any time. It may ask for a verification, limit, suspend or close an account, including because a service such as the Cloud is used. FillSell\'s protections (limits, pace, pause before deletion, stop on restriction) reduce this risk but cannot rule it out: by activating the Cloud, you accept it. FillSell is not liable for a marketplace\'s decisions and is not affiliated with any marketplace.',
      'You remain the author of, and solely responsible for, your listings, their content, their prices and the sales you make, and you undertake to comply with the terms of use of each marketplace you connect to the Cloud.',
    ] },
    { t: '5. No guarantee of sale', ps: [
      'The Cloud carries out tasks. It guarantees neither the visibility of your listings, nor a number of views, nor a sale, nor a price. It depends on the marketplaces, which may change their pages or refuse access from FillSell\'s servers: a task may then be delayed or fail, and the app tells you. FillSell uses reasonable means to keep the Cloud running continuously, with no guarantee of result or of permanent availability.',
    ] },
    { t: '6. Price and 7-day trial', ps: [
      'The Cloud costs €24.99 including VAT per month, on the web (bank card, payment handled by Stripe), in the App Store and in Google Play. It is a subscription separate from the plans: it can be taken alone, with the free plan, or on top of a paid plan; cancelling a plan does not stop the Cloud.',
      'The first 7 days are free. A payment method is required to start the trial; nothing is charged during the trial. The end date of the trial and the amount charged afterwards are shown before the payment method is saved. Without cancellation before the end of the trial, the subscription starts: €24.99 is charged, then every month on the same date. At the latest the day before the trial ends, a reminder is sent to you in the app and by email.',
      'One trial per person: a trial already taken with the same account, the same device, the same card or the same marketplace account does not open a second one; the Cloud then remains available without a trial. In the App Store and Google Play, the trial is offered by the store, on the terms it shows.',
    ] },
    { t: '7. Cancellation', ps: [
      'On the web, you cancel from the app (Settings › Subscription › FillSell Cloud). During the trial, the stop is immediate and nothing is charged. After the trial, the Cloud stays active until the end of the paid month, then stops; nothing is charged afterwards. A subscription taken in the App Store or Google Play is cancelled in the store\'s subscription settings. The right of withdrawal provided for in article 6 of the Terms of Sale applies.',
      'FillSell may suspend the Cloud of an account in case of use contrary to these terms or to a marketplace\'s rules; it informs you.',
    ] },
    { t: '8. Your data', ps: [
      'To run the Cloud, FillSell keeps: your encrypted marketplace connections; the profile of the browser reserved for your account; a FillSell session specific to that browser (no password); the log of your connections through "Sign in" (date, marketplace, success), for 90 days; the history of the IP addresses used for your account, whose identifier is erased after 12 months; and, for the one-trial-per-person rule, irreversible fingerprints (HMAC-SHA256) of the device, of the card (fingerprint supplied by Stripe, never its number) and of the marketplace accounts, kept 12 months after the trial.',
      'When the Cloud stops (end of the trial without a subscription, cancellation, account deletion), FillSell erases the browser, its profile, your encrypted connections and its FillSell session, at the latest 3 days after the end. Details are in the privacy policy (article 4.8).',
    ] },
    { t: '9. Acceptance and changes', ps: [
      'Activating the Cloud requires accepting these terms. FillSell records the date and the version accepted. A new version is shown to you and must be accepted to keep using the Cloud, except a simple rewording, which does not require a new acceptance. FillSell\'s Terms and Conditions and Terms of Sale apply to everything these terms do not cover.',
    ] },
  ],
  case: 'I have read and accept the FillSell Cloud terms of use.',
  accepter: 'I accept and continue',
  annuler: 'Cancel',
  lire: 'Read the full terms',
  enregistrement: 'Saving your acceptance…',
  echec: 'Your acceptance could not be saved. Try again in a moment: nothing was asked of your card.',
};

/** Les conditions : le français fait foi ; `lang` = 'en' rend la traduction pour information. */
// (08/11/2026, refus Google Play de la vc36) Dans l'app iPhone / Android, l'article 6 dit le prix de la BOUTIQUE (monnaie
// et format du téléphone, ceux de la feuille de paiement), jamais l'euro du web ; sur le web, le texte reste mot pour mot.
// Le contrat ne change pas : en France, le prix des boutiques EST 24,99 € TTC (même version CGU_CLOUD_VERSION).
const MOBILE = Object.freeze({
  fr: [
    ["24,99 € TTC par mois, sur le web (carte bancaire, paiement géré par Stripe), dans l'App Store et dans Google Play", (prix, b) => `${prix} par mois, au prix affiché par ${b} au moment de l'achat`],
    ['24,99 € sont prélevés', (prix) => `${prix} sont prélevés`],
  ],
  en: [
    ['€24.99 including VAT per month, on the web (bank card, payment handled by Stripe), in the App Store and in Google Play', (prix, b) => `${prix} per month, at the price shown by ${b} at the time of purchase`],
    ['€24.99 is charged', (prix) => `${prix} is charged`],
  ],
});
function auPrixDeLaBoutique(T, lang, e) {
  const prix = prixOuChargement('cloud', lang, e);
  const b = e.canal === 'apple' ? 'App Store' : 'Google Play';
  const remplacer = (x) => (typeof x === 'string'
    ? MOBILE[lang].reduce((acc, [de, vers]) => acc.split(de).join(vers(prix, b)), x)
    : Array.isArray(x) ? x.map(remplacer)
      : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, remplacer(v)])) : x);
  return remplacer(T);
}
export const conditionsCloud = (lang = 'fr') => {
  const l = lang === 'en' ? 'en' : 'fr';
  const e = lirePrixBoutique();
  return estCanalBoutique(e) ? auPrixDeLaBoutique(l === 'en' ? EN : FR, l, e) : (l === 'en' ? EN : FR);
};

/** La version acceptée est-elle valable (date réelle ≥ la version minimale : la règle de _shared, jamais recopiée) ? (pur) */
export const conditionsAcceptees = (profil) => versionCguValable(profil?.cloud_cgu_version);
