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

// La version en vigueur (AAAA-MM-JJ) vit dans config/cloudOffer.js (aucune date en dur dans src/cloud/) — même
// valeur que supabase/functions/_shared/cloud-conditions.js.
import { CGU_CLOUD_VERSION } from '../config/cloudOffer.js';
export { CGU_CLOUD_VERSION };

const FR = {
  titre: "Conditions d'utilisation de FillSell Cloud",
  version: `Version du ${CGU_CLOUD_VERSION.split('-').reverse().join('/')}`,
  articles: [
    { t: '1. Le service', ps: [
      "FillSell Cloud est une option de FillSell. Il exécute depuis les serveurs de FillSell, sans que votre ordinateur soit allumé, ce que l'extension Chrome FillSell fait sur un ordinateur : publier, republier et retirer vos annonces, relever vos annonces en ligne et détecter vos ventes, 24 heures sur 24, dans un navigateur réservé à votre compte.",
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
    { t: '4. Votre responsabilité vis-à-vis des plateformes', ps: [
      "Vous restez l'auteur et le seul responsable de vos annonces, de leur contenu, de leurs prix et des ventes que vous concluez. Vous vous engagez à respecter les conditions d'utilisation de chaque plateforme que vous connectez au Cloud.",
      "Chaque plateforme fixe ses propres règles, notamment sur l'automatisation et les connexions depuis des serveurs, et peut les changer à tout moment. Une plateforme peut demander une vérification, limiter, suspendre ou fermer un compte, y compris parce qu'un service comme le Cloud est utilisé. En activant le Cloud, vous acceptez ce risque. FillSell applique les protections de l'extension pour le réduire (plafonds, rythmes, pause avant suppression, arrêt sur restriction), mais ne peut pas l'écarter et ne répond pas des décisions d'une plateforme. FillSell n'est affilié à aucune plateforme.",
    ] },
    { t: '5. Aucune garantie de vente', ps: [
      "Le Cloud exécute des tâches. Il ne garantit ni la visibilité de vos annonces, ni un nombre de vues, ni une vente, ni un prix. Il dépend des plateformes, qui peuvent changer leurs pages ou refuser l'accès depuis les serveurs de FillSell : une tâche peut alors être retardée ou ne pas aboutir, et l'app vous le signale. FillSell met en œuvre des moyens raisonnables pour que le Cloud fonctionne en continu, sans garantie de résultat ni de disponibilité permanente.",
    ] },
    { t: '6. Prix et essai de 7 jours', ps: [
      "Le Cloud coûte 20 € TTC par mois, sur le web (carte bancaire, paiement géré par Stripe), dans l'App Store et dans Google Play. C'est un abonnement distinct des forfaits : il se prend seul, avec le forfait gratuit, ou en plus d'un forfait payant ; résilier un forfait n'arrête pas le Cloud.",
      "Les 7 premiers jours sont offerts. Un moyen de paiement est demandé pour commencer l'essai ; rien n'est prélevé pendant l'essai. La date de fin de l'essai et le montant prélevé ensuite sont affichés avant l'enregistrement du moyen de paiement. Sans résiliation avant la fin de l'essai, l'abonnement commence : 20 € sont prélevés, puis chaque mois à la même date. Au plus tard la veille de la fin de l'essai, un rappel vous est envoyé dans l'app et par e-mail.",
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
      "L'activation du Cloud exige d'accepter les présentes conditions. FillSell enregistre la date et la version acceptées. Une nouvelle version vous est présentée et doit être acceptée pour continuer à utiliser le Cloud. Les CGU et les CGV de FillSell s'appliquent pour tout ce que ces conditions ne prévoient pas.",
    ] },
  ],
  case: "J'ai lu et j'accepte les conditions d'utilisation de FillSell Cloud, y compris le risque de restriction de mes comptes par les plateformes.",
  accepter: "J'accepte et je continue",
  annuler: 'Annuler',
  lire: 'Lire les conditions en entier',
  enregistrement: 'Enregistrement de ton acceptation…',
  echec: "Ton acceptation n'a pas pu être enregistrée. Réessaie dans un instant : rien n'a été demandé à ta carte.",
};

/** Les conditions (le texte juridique n'existe qu'en français pour l'instant : la version anglaise suivra sa validation). */
export const conditionsCloud = () => FR;

/** La version acceptée vaut-elle la version en vigueur ? (pur) */
export const conditionsAcceptees = (profil) => String(profil?.cloud_cgu_version ?? '') === CGU_CLOUD_VERSION;
