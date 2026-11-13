// ═══════════════════════════════════════════════════════════════════════════
// L'OPTION « FILLSELL CLOUD » (sans ordinateur) — LES MOTS (04/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// CONCEPTION, NON LIVRÉE (drapeau : src/config/cloudOffer.js). Même règle que
// entree/textes.js et reglages/textes.js : AUCUNE phrase dans un composant,
// tout se lit ici, fr + en, et un écran ne reçoit que `T`.
//
// DÉCISIONS FINALES DE NICO (04/10 soir) :
//   · option mensuelle, essai de 7 jours, CARTE DEMANDÉE, un seul essai ;
//     prix : CLOUD_PRIX_AFFICHE (utils/palier.js) — 24,99 € depuis le 03/11 ;
//   · elle se prend SEULE sur un compte Free (qui garde ses quotas Free) ou
//     EN PLUS de Premium, Pro ou Business ;
//   · (13/11/2026, décision de Nico — plus aucun arrêt immédiat d'un essai) arrêter pendant l'essai : il continue
//     jusqu'à sa fin, puis s'arrête seul, rien n'est facturé (avant : effet IMMÉDIAT) ; une fois payée, elle tourne
//     jusqu'à la fin de la période ;
//   · résilier la formule n'arrête PAS l'option (le compte repasse en Free +
//     FillSell Cloud) ;
//   · la veille de la fin d'essai, on prévient dans l'app ET par e-mail. (12/11, point 4b de Nico : la PROMESSE est retirée
//     des écrans tant que le rappel de la veille n'est pas prouvé sur un vrai client — le rappel lui-même part toujours.)
// (03/11, décision de Nico) LE NOM de l'option est « FillSell Cloud », partout ;
// « sans ordinateur » est sa PROMESSE (« Vends même ordinateur éteint », « eBay
// part déjà sans ordinateur »), jamais son nom. Contrôlé par
// scripts/cloud-prix-nom-selftest.mjs.
//
// ⛔ CE QUE LE CLOUD FAIT VRAIMENT — ET RIEN DE PLUS :
//   · FillSell publie les annonces depuis ses serveurs (sortie par une adresse
//     française dédiée) : elles partent, se republient et se retirent, et les
//     ventes sont vues, même ordinateur éteint, depuis le téléphone ;
//   · (01/11, décision de Nico ; 30/10 : « le Cloud n'est pas complet sans Beebs ») les QUATRE plateformes du Cloud,
//     Vinted, Leboncoin, Beebs et Depop — la liste de config/cloudOffer.js (CLOUD_PLATEFORMES_CONNEXION), contrôlée par
//     scripts/cloud-ecrans-selftest.mjs ; avant le 01/11, on ne nommait que Vinted et Leboncoin (05/10 : seuls éprouvés) ;
//   · eBay part DÉJÀ sans ordinateur, pour tout le monde (connexion officielle
//     par l'API) : on le dit, on ne le vend pas comme un avantage de l'option ;
//   · ⛔ une plateforme bloquée par sa protection anti-robot n'est JAMAIS
//     promise ici : elle n'est pas nommée du tout (contrôlé par
//     scripts/cloud-ecrans-selftest.mjs et la capture) ;
//   · Opla sort de FillSell le 10/10 : jamais citée.
// ⛔ VOCABULAIRE : « quotas », jamais l'ancien mot ; « plafond » banni des
//    cartes ; tutoiement ; aucune phrase technique (ni « serveur Cloud », ni
//    « proxy », ni « adresse IP ») — « depuis ses serveurs » suffit.
// ⛔ L'ESSAI, SANS PIÈGE : partout où l'essai est proposé, la carte demandée,
//    la date de bascule, le montant et la sortie sont écrits en clair.
// ⛔ AUCUNE DATE NI AUCUN QUOTA EN DUR : les dates viennent de l'essai réel du
//    compte (cloudDuProfil.essaiFin, periodeFin) ou, avant l'essai, de
//    maintenant + 7 jours ; le nombre d'annonces du plan Free vient de
//    coin_config (quota_annonces_free) ou de quotas_etat. Contrôlé par le selftest.
import { CLOUD_ESSAI_JOURS } from '../utils/palier';
import { JETON_PRIX_CLOUD, avecPrix } from '../lib/prixBoutique.js';

// Espaces INSÉCABLES dans le prix et « 7 jours » : à 390 px, le montant se
// retrouvait seul en fin de ligne et « €/mois » à la suivante (capture du 04/10).
const NBSP = String.fromCharCode(0xa0);
// (09/11, vu sur la capture C1 à 375 px) Le « gluon » (U+2060, invisible) : « €/mois » ne se coupe plus après la barre.
const GLUE = String.fromCharCode(0x2060);
// (08/11, refus Google Play de la vc36) Le prix n'est plus écrit ici : un JETON, remplacé à la lecture par le prix du
// CANAL (web : Stripe en euros ; iPhone/Android : prix formaté par la boutique, « … » tant qu'il charge) — lib/prixBoutique.js.
const PRIX = JETON_PRIX_CLOUD;   // web : '24,99 €' (insécable) ; mobile : le prix de la boutique
const PRIX_EN = JETON_PRIX_CLOUD; // web : '€24.99' (CLOUD_PRIX_AFFICHE_EN)
const JOURS = CLOUD_ESSAI_JOURS;          // 7
const J7 = `${JOURS}${NBSP}jours`;
const D7 = `${JOURS}${NBSP}days`;

// `nom` = 'Premium' | 'Pro' | 'Business', ou null pour un compte Free.
const taFormule = (nom) => (nom ? `ta formule ${nom}` : 'ton plan Free');
const yourPlan = (nom) => (nom ? `your ${nom} plan` : 'your Free plan');
// « 5 annonces » quand le quota est connu, sinon « les annonces du plan Free ».
const annoncesFree = (n) => (Number.isFinite(n) ? `${n}${NBSP}annonces` : 'les annonces');
const listingsFree = (n) => (Number.isFinite(n) ? `${n}${NBSP}listings` : 'the listings');

const FR = {
  nom: 'FillSell Cloud',
  // ⛔ LIBELLÉ IMPOSÉ (Nico, 03/11) : « FillSell Cloud · sans ordinateur · +24,99 €/mois ».
  // Ancien libellé imposé le 04/10, remplacé : « Sans ordinateur · +20 €/mois ». Pourquoi : le 03/11, Nico a fixé
  // le prix à 24,99 € sur les trois canaux (jamais un prix affiché différent du prix facturé) et le NOM de
  // l'option à « FillSell Cloud », « sans ordinateur » devenant sa promesse.
  libelleInterrupteur: `FillSell Cloud · sans ordinateur · +${PRIX}/${GLUE}mois`,
  essaiPastille: `${J7} d'essai gratuits`,
  // ⛔ CARTE DEMANDÉE (décision du 04/10 soir) — dit là où l'essai se propose.
  carteDemandee: (date) => `Carte demandée, rien n'est prélevé pour le Cloud avant le ${date}.`,

  // ── Ce que ça fait (une phrase, la même partout) ─────────────────────────
  // (08/11, point C1 de Nico) « plus besoin d'ordinateur » : jamais « même ordinateur éteint » (qui suppose un ordinateur).
  // « sans ordinateur », pas « toutes seules » : la republication AUTOMATIQUE est du Pro et du Business ; le Cloud,
  // lui, fait partir sans ordinateur ce que la formule fait (publication, republication, retrait, ventes).
  accroche: "Plus besoin d'ordinateur",
  ceQueCaFait: 'Tes annonces Vinted, Leboncoin, Beebs et Depop partent, se republient et se retirent sans ordinateur, 24 h/24, et tes ventes sont suivies. Tout se pilote depuis ton téléphone.',
  ebayDeja: 'eBay part déjà sans ordinateur, pour tout le monde.',

  // ── L'interrupteur de la feuille des formules ────────────────────────────
  // (08/11, point 0 de Nico) Jamais « s'ajoute à la formule que tu choisis » : une carte payante n'achète que sa formule.
  sAjoute: "Il s'ajoute à ta formule une fois qu'elle est prise.",
  sAjouteFree: "Il se prend seul, avec Free. Avec Premium, Pro ou Business, tu l'ajoutes une fois ta formule prise.",
  frise: (date) => [
    { quand: "Aujourd'hui", quoi: "Carte demandée, rien n'est prélevé pour le Cloud." },
    { quand: date, quoi: `Le Cloud passe à ${PRIX}/mois, sauf si tu l'arrêtes avant.` },
    { quand: "D'ici là", quoi: "Tu l'arrêtes en un geste dans Réglages › Abonnement." },
  ],
  sansEssai: `Ton essai gratuit a déjà servi : le Cloud est facturé ${PRIX}/mois dès aujourd'hui. Tu l'arrêtes quand tu veux dans Réglages › Abonnement.`,
  dejaActif: 'FillSell Cloud est déjà actif sur ton compte : il suit la formule que tu choisis.',
  suspenduModale: 'Ton FillSell Cloud est en pause : il repart avec la formule que tu choisis.',
  prixOption: `+ ${PRIX}`,
  prixOptionSousEssai: `/mois · Cloud offert ${J7}`,
  prixOptionSous: '/mois · avec FillSell Cloud',
  ctaSuffixe: ' + FillSell Cloud',
  titreModale: "Plus besoin d'ordinateur.",
  // (09/11, maquette B validée par Nico) La carte FillSell Cloud de la feuille des offres (CarteCloudOffres.jsx) : essai
  // en gros, accroche, relais, un vrai bouton, le prix ENSUITE (celui de la boutique sur mobile : jeton PRIX).
  offresTitreEssai: `Essai gratuit ${J7}`,
  offresRelais: 'Publiées, republiées et retirées depuis nos serveurs, 24 h/24.',
  offresCtaEssai: `Essayer ${J7}`,
  offresCtaFree: 'Prendre FillSell Cloud',
  offresCtaAjout: 'Ajouter FillSell Cloud',
  offresPrixEssai: `Puis ${PRIX}/${GLUE}mois · sans engagement`,
  offresPrix: `${PRIX}/${GLUE}mois · sans engagement`,
  offresRappel: "Tu l'arrêtes en un geste.",
  offresArret: "Tu l'arrêtes en un geste.",
  offresEnPlus: (nom) => `En plus de ${taFormule(nom)}`,
  ajoutTitre: (nom) => `Ajouter à ${taFormule(nom)}`,
  ajoutCtaEssai: `Essayer ${J7} gratuits`,
  ajoutCta: `Ajouter · +${PRIX}/mois`,

  // ── La voie « Free + FillSell Cloud » (carte Free de la feuille) ─────────
  freeCloudTitre: 'Free + FillSell Cloud',
  // (09/11, vu sur la capture C1) Quota pas encore lu : la phrase reste juste — jamais « tu restes à les annonces ».
  freeCloudQuota: (n) => (Number.isFinite(n) ? `Avec Free + FillSell Cloud, tu restes à ${annoncesFree(n)} par mois.` : 'Avec Free + FillSell Cloud, tu gardes les quotas du plan Free.'),
  freeCloudFrise: (date, n) => [
    { quand: "Aujourd'hui", quoi: '0 €, carte demandée.' },
    { quand: "Pendant l'essai", quoi: Number.isFinite(n) ? `Tes ${annoncesFree(n)} du plan Free.` : 'Les quotas du plan Free.' },
    { quand: date, quoi: `${PRIX}/mois, sauf si tu l'arrêtes.` },
  ],
  freeCloudSansEssai: `Le Cloud est facturé ${PRIX}/mois dès aujourd'hui ; tu l'arrêtes quand tu veux.`,
  freeCloudCtaEssai: 'Essayer Free + FillSell Cloud',
  freeCloudCta: `Prendre Free + FillSell Cloud · ${PRIX}/mois`,

  // ── La 2e voie : parcours d'entrée, mur « installe l'extension » ─────────
  voieKicker: "Je n'ai pas d'ordinateur",
  voieTitreEssai: `FillSell Cloud, ${J7} d'essai`,
  voieTitre: `FillSell Cloud · +${PRIX}/mois`,
  // ⛔ PHRASE IMPOSÉE (04/10 soir) : « FillSell publie tes annonces depuis ses serveurs ».
  voieTexte: "FillSell publie tes annonces depuis ses serveurs : tu te connectes une fois à Vinted, Leboncoin, Beebs et Depop depuis ton téléphone, et elles partent même sans ordinateur.",
  voieCtaEssai: 'Essayer FillSell Cloud',
  voieCta: 'Voir le Cloud',
  voieNote: (date) => `Carte demandée, rien n'est prélevé avant le ${date}. Puis ${PRIX}/mois, tu l'arrêtes quand tu veux.`,
  voieNoteSansEssai: `${PRIX}/mois, tu l'arrêtes quand tu veux.`,
  voieCompactEssai: `Pas d'ordinateur ? Essaie FillSell Cloud, ${J7} offerts`,
  voieCompact: `Pas d'ordinateur ? Option FillSell Cloud, ${PRIX}/mois`,
  // La page /extension, ouverte sur un téléphone (souvent sans session).
  pageTitre: "Pas d'ordinateur ?",
  pageTexte: "Avec l'option FillSell Cloud, FillSell publie tes annonces depuis ses serveurs : sur Vinted, Leboncoin, Beebs et Depop, tout se pilote depuis ton téléphone.",
  pageCta: "Voir le Cloud dans l'app",
  pageNote: `${J7} d'essai, carte demandée.`,
  // Le mur, près du bouton de l'extension : elle reste gratuite ET sans carte.
  extensionGratuite: 'Gratuite, sans carte.',

  // ── Réglages › Abonnement ────────────────────────────────────────────────
  groupe: 'FillSell Cloud',
  etatAucun: 'Pas activé',
  etatEssai: 'Essai gratuit',
  etatPaye: 'Actif',
  etatArretPrevu: (date) => `S'arrête le ${date}`,
  etatSuspendu: 'En pause',
  etatTermine: 'Essai terminé',
  etatArrete: 'Essai arrêté',
  etatLecture: 'Lecture…',
  aucunCtaEssai: `Essayer ${J7} gratuits`,
  aucunNoteEssai: (date) => `Carte demandée, rien n'est prélevé avant le ${date}. Puis ${PRIX}/mois, tu l'arrêtes quand tu veux.`,
  aucunCta: `Ajouter · +${PRIX}/mois`,
  aucunNote: "Ton essai gratuit a déjà servi : le Cloud est facturé dès son ajout.",
  voirFormules: 'Voir les formules',
  essaiReste: (j) => (j > 1 ? `Encore ${j} jours d'essai` : "Dernier jour d'essai"),
  essaiFin: (date, heure, nom) => (nom
    ? `Gratuit jusqu'au ${date} à ${heure}. Ensuite, ${PRIX}/mois s'ajoutent à ta formule ${nom}, sauf si tu l'arrêtes avant.`
    : `Gratuit jusqu'au ${date} à ${heure}. Ensuite, le Cloud passe à ${PRIX}/mois, sauf si tu l'arrêtes avant.`),
  essaiJauge: (j, total) => `Jour ${j} sur ${total}`,
  // (13/11/2026, décision de Nico — couper le renouvellement ne coupe plus rien) L'essai en cours dont le renouvellement est
  // coupé (boutique ou Stripe, CONFIRMÉ en base : cloudDuProfil.essaiSansSuite) : il continue jusqu'à sa fin, puis s'arrête
  // seul. Mot pour mot de Nico ; aucun mail.
  essaiSansSuite: (date) => (date ? `Ton essai Cloud continue jusqu'au ${date}. Rien ne sera prélevé.` : "Ton essai Cloud continue jusqu'à sa date de fin. Rien ne sera prélevé."),
  essaiNote: (nom) => `Si tu l'arrêtes, ${taFormule(nom)} ne change pas, et l'extension comme eBay restent possibles.`,
  // UNE mention, ici seulement, pendant l'essai d'un compte Free (jamais une fenêtre).
  mentionPremium: (n) => (Number.isFinite(n) ? `Tu es en Free + FillSell Cloud : ${annoncesFree(n)} par mois. Pour en publier plus, Premium s'ajoute au Cloud.` : "Tu es en Free + FillSell Cloud, avec les quotas du plan Free. Pour publier plus, Premium s'ajoute au Cloud."),
  voirPremium: 'Voir Premium',
  payeTexte: (nom) => (nom
    ? `En plus de ta formule ${nom} : tes annonces Vinted, Leboncoin, Beebs et Depop partent sans ordinateur, 24 h/24.`
    : 'Avec ton plan Free : tes annonces Vinted, Leboncoin, Beebs et Depop partent sans ordinateur, 24 h/24.'),
  arretPrevuTexte: (date) => `Le Cloud tourne jusqu'au ${date}, puis s'arrête : rien ne sera prélevé ensuite.`,
  garderOption: 'Garder le Cloud',
  // Plus rendu depuis CLOUD_EXIGE_UN_PALIER = false (gardé pour l'interrupteur de palier.js).
  suspenduTexte: 'Le Cloud est en pause : il repart dès que tu reprends une formule.',
  // (08/11, Nico) Fin d'essai NATURELLE : aucune boutique n'a confirmé quoi que ce soit (Apple ou Google peuvent avoir
  // prélevé sans que leur webhook soit encore arrivé) — jamais « rien n'a été facturé » ici. L'essai ARRÊTÉ, lui, l'est
  // sur la confirmation de la boutique (arreteTexte).
  termineTexte: (date) => `Essai terminé le ${date}. Le Cloud n'est plus actif.`,
  arreteTexte: (date) => `Essai arrêté le ${date}. Le Cloud n'est plus actif, et rien n'a été facturé pour lui.`,
  // (08/11, Nico) Jamais « comme avant » ni « repassent » : un client Cloud n'a peut-être aucun ordinateur.
  termineSuite: "Sans FillSell Cloud, tes publications passent par l'extension FillSell, sur ton ordinateur. eBay n'est pas concerné.",
  termineCta: `Ajouter le Cloud · ${PRIX}/mois`,
  meConnecter: 'Connecter mes plateformes',
  arreter: 'Arrêter le Cloud',
  arreterTitre: 'Arrêter FillSell Cloud ?',
  // (13/11/2026, décision de Nico — plus aucun arrêt immédiat d'un essai) Pendant l'essai, par carte : la même règle que les
  // boutiques — le renouvellement est coupé, le Cloud continue jusqu'à la fin de l'essai, puis s'arrête seul (avant : « Il
  // s'arrête tout de suite »). FillSell coupe lui-même, sans « 24 heures ». Payée : jusqu'à la fin de période.
  arreterEssai: (nom, date = null) => `${date ? `Ton Cloud continue jusqu'au ${date}, puis s'arrête seul, sans prélèvement.` : "Ton Cloud continue jusqu'à la fin de l'essai, puis s'arrête seul, sans prélèvement."} Après, sans FillSell Cloud, tes publications passent par l'extension FillSell, sur ton ordinateur. ${nom ? `Ta formule ${nom}` : 'Ton plan Free'} ne change pas.`,
  arreterPaye: (date) => (date
    ? `Il tourne jusqu'au ${date}, puis s'arrête : rien ne sera prélevé ensuite. Après cette date, sans FillSell Cloud, tes publications passent par l'extension FillSell, sur ton ordinateur.`
    : "Il tourne jusqu'à la fin de la période payée, puis s'arrête : rien ne sera prélevé ensuite. Sans FillSell Cloud, tes publications passent alors par l'extension FillSell, sur ton ordinateur."),
  arreterConfirmer: 'Arrêter',
  arreterAnnuler: 'Garder',
  // (07/11 soir, essai TestFlight de Nico) Un Cloud pris sur l'App Store ou Google Play : c'est la BOUTIQUE qui
  // l'arrête, jamais l'app. Avant le geste, on dit où, et que FillSell le verra dès qu'elle l'aura confirmé — jamais
  // « tout de suite », jamais « rien n'est facturé » tant qu'elle ne l'a pas confirmé. `voie` : cloud/achatCloud.js.
  // (13/11/2026, décision de Nico — couper le renouvellement ne coupe plus rien) La phrase dit aussi la VRAIE règle, au
  // conditionnel (rien n'est encore confirmé) : `finEssai` (date longue) pendant un essai — annulé à temps (Apple : au moins
  // 24 h avant la fin, CGU Cloud art. 7), le Cloud continue jusqu'à cette date puis s'arrête seul ; sans `finEssai` (payé),
  // il continue jusqu'à la fin de la période payée.
  arreterBoutique: (voie, finEssai = null) => `${voie === 'google'
    ? "Ton Cloud a été pris sur Google Play : c'est Google qui l'arrête, pas FillSell. Ouvre tes abonnements Google Play ci-dessous, choisis FillSell Cloud, puis résilie-le. FillSell le verra dès que Google aura confirmé l'arrêt."
    : voie === 'apple_ailleurs'
      ? "Ton Cloud a été pris sur l'App Store : c'est Apple qui l'arrête, pas FillSell. Sur ton iPhone ou ton iPad, ouvre Réglages › ton nom › Abonnements, choisis FillSell Cloud, puis annule-le. FillSell le verra dès qu'Apple aura confirmé l'arrêt."
      : "Ton Cloud a été pris sur l'App Store : c'est Apple qui l'arrête, pas FillSell. Ouvre tes abonnements Apple ci-dessous, choisis FillSell Cloud, puis annule-le. FillSell le verra dès qu'Apple aura confirmé l'arrêt."} ${finEssai
    ? `${voie === 'google' ? "Annulé avant la fin de l'essai" : "Annulé au moins 24 heures avant la fin de l'essai"}, ton Cloud continue jusqu'au ${finEssai}, puis s'arrête seul, sans prélèvement.`
    : "Annulé, il continue jusqu'à la fin de la période payée, puis s'arrête."}`,
  arreterBoutiqueCta: (voie) => (voie === 'google' ? 'Ouvrir mes abonnements Google Play' : 'Ouvrir mes abonnements Apple'),
  arreterBoutiqueFermer: 'Fermer',
  // Après l'ouverture des abonnements : rien n'a encore changé chez nous, on attend la boutique.
  arretBoutiqueAttente: (voie) => (voie === 'google'
    ? "Dès que Google aura confirmé l'arrêt, FillSell l'affichera dans Réglages › Abonnement. D'ici là, ton Cloud continue."
    : "Dès qu'Apple aura confirmé l'arrêt, FillSell l'affichera dans Réglages › Abonnement. D'ici là, ton Cloud continue."),
  // La confirmation « Se désabonner » de la formule, quand l'option est active.
  resiliationCloud: 'FillSell Cloud, lui, continue : ton compte repasse en Free + FillSell Cloud, avec les quotas du plan Free.',
  resiliationCloudLien: 'Arrêter aussi le Cloud',

  // ── La veille de la fin d'essai ──────────────────────────────────────────
  veilleKicker: 'FillSell Cloud · essai gratuit',
  veilleTitre: (quand, heure) => (quand === 'aujourdhui'
    ? `Aujourd'hui à ${heure}, le Cloud passe à ${PRIX}/mois`
    : `Demain, le Cloud passe à ${PRIX}/mois`),
  veilleTexte: (date, heure, nom) => (nom
    ? `Ton essai gratuit se termine le ${date} à ${heure}. Si tu gardes le Cloud, ${PRIX}/mois s'ajoutent à ta formule ${nom} à partir de là. Si tu l'arrêtes, rien n'est facturé pour lui.`
    : `Ton essai gratuit se termine le ${date} à ${heure}. Si tu gardes le Cloud, il passe à ${PRIX}/mois à partir de là. Si tu l'arrêtes, rien n'est facturé pour lui.`),
  veilleGarder: 'Garder le Cloud',
  veilleArreter: 'Arrêter le Cloud',
  veilleNote: (nom) => `Dans les deux cas, ${taFormule(nom)} ne change pas, et l'extension comme eBay restent possibles.`,
  veilleBascule: (date, heure) => `Le ${date} à ${heure} · +${PRIX}/mois`,
  // (08/11, Nico) Après « Arrêter » dans la feuille de la veille (cloud/regles.js, issueVeilleArret) : la boutique ouverte,
  // on attend SA confirmation ; « rien ne sera prélevé » seulement une fois l'arrêt confirmé (boutique ou Stripe).
  veilleBoutiqueOuverte: (voie) => (voie === 'google'
    ? "Tu as ouvert tes abonnements Google Play. Dès que Google nous confirme l'arrêt, c'est réglé."
    : "Tu as ouvert tes abonnements Apple. Dès qu'Apple nous confirme l'arrêt, c'est réglé."),
  veilleArreteeConfirmee: "C'est arrêté. Rien ne sera prélevé. Sans FillSell Cloud, tes publications passent par l'extension FillSell, sur ton ordinateur.",
  veilleArretee: "C'est arrêté. Sans FillSell Cloud, tes publications passent par l'extension FillSell, sur ton ordinateur.",
  veilleArretEchec: "L'arrêt n'a pas pu se faire. Réessaie dans un instant.",
  // (07/11 soir) Cloud pris sur l'App Store ou Google Play : la boutique arrête, FillSell suit — jamais « rien n'est facturé ».
  veilleTexteBoutique: (date, heure, voie) => (voie === 'google'
    ? `Ton essai gratuit se termine le ${date} à ${heure}. Ton Cloud a été pris sur Google Play : pour l'arrêter, c'est dans tes abonnements Google Play, et FillSell le verra dès que Google l'aura confirmé.`
    : `Ton essai gratuit se termine le ${date} à ${heure}. Ton Cloud a été pris sur l'App Store : pour l'arrêter, c'est dans tes abonnements Apple, et FillSell le verra dès qu'Apple l'aura confirmé.`),

  // ── Après la fin de l'essai (non converti) ───────────────────────────────
  finKicker: 'FillSell Cloud',
  finTitre: 'Ton essai est terminé',
  finTexte: "Le Cloud n'est plus actif.",
  finArreteTitre: "Ce qui s'arrête",
  finArrete: [
    "Tes annonces Vinted, Leboncoin, Beebs et Depop ne partent plus sans ordinateur : sans FillSell Cloud, publication, republication, retrait et ventes passent par l'extension FillSell, sur ton ordinateur.",
  ],
  finContinueTitre: 'Ce qui continue',
  finContinue: (nom) => [
    nom ? `Ta formule ${nom}, ton stock et tes annonces déjà en ligne.` : 'Ton plan Free, ton stock et tes annonces déjà en ligne.',
    "eBay, depuis ton téléphone, par la connexion officielle d'eBay.",
    "L'extension Chrome, gratuite : le même travail quand ton ordinateur est allumé.",
  ],
  finCtaAjouter: `Reprendre le Cloud · ${PRIX}/mois`,
  finCtaExtension: "Installer l'extension sur mon ordinateur",
  // (03/11, point 5) Pas de place : jamais de vente, la liste d'attente.
  // (07/11, décision de Nico) Les places restantes, lues dans la vente (jamais en dur) ; plus de place : « Tu es sur
  // liste d'attente », une vraie inscription, sans payer.
  placesRestantes: (n) => (n === 1 ? '1 place restante' : `${n} places restantes`),
  completTitre: 'Complet pour le moment',
  completTexte: "Toutes les places FillSell Cloud sont prises. Inscris-toi sur la liste d'attente, sans rien payer : une notification te prévient dès qu'une place se libère, et elle t'est gardée 24 h.",
  completCta: "M'inscrire sur la liste d'attente",
  completInscrit: (rang) => `Tu es sur liste d'attente${rang ? ` (n° ${rang})` : ''} : une notification te prévient dès qu'une place se libère, et elle t'est gardée 24 h.`,
  completEchec: "L'inscription n'a pas pu se faire. Réessaie dans un instant.",
  placeLibreTitre: 'Une place FillSell Cloud est libre',
  placeLibreTexte: "Elle t'est gardée 24 h : démarre FillSell Cloud quand tu veux d'ici là.",
  placeLibreCta: 'Démarrer FillSell Cloud',
  // (03/11, point 3) Le Cloud arrêté (résiliation, impayé) : les tâches repassent par l'extension.
  arretKicker: 'FillSell Cloud',
  arretTitre: 'FillSell Cloud est arrêté',
  arretTexte: "Sans FillSell Cloud, publication, republication, retrait et ventes passent par l'extension FillSell, sur ton ordinateur, quand il est allumé.",
  arretCtaReprendre: `Reprendre FillSell Cloud · ${PRIX}/mois`,
  arretCtaExtension: "Installer ou ouvrir l'extension sur mon ordinateur",
  fermer: 'Fermer',
};

const EN = {
  nom: 'FillSell Cloud',
  libelleInterrupteur: `FillSell Cloud · no computer · +${PRIX_EN}/${GLUE}mo`,
  essaiPastille: `${JOURS}-day free trial`,
  carteDemandee: (date) => `Card required, nothing is charged for the Cloud before ${date}.`,

  accroche: 'No computer needed',
  ceQueCaFait: 'Your Vinted, Leboncoin, Beebs and Depop listings go out, get reposted and removed without a computer, 24/7, and your sales are tracked. Everything is driven from your phone.',
  ebayDeja: 'eBay already works without a computer, for everyone.',

  sAjoute: 'It adds to your plan once your plan is active.',
  sAjouteFree: 'Take it on its own, with Free. With Premium, Pro or Business, you add it once your plan is active.',
  frise: (date) => [
    { quand: 'Today', quoi: 'Card required, nothing is charged for the Cloud.' },
    { quand: date, quoi: `The Cloud moves to ${PRIX_EN}/mo, unless you stop it before.` },
    { quand: 'Until then', quoi: 'Stop it in one tap in Settings › Subscription.' },
  ],
  sansEssai: `Your free trial has already been used: the Cloud is billed ${PRIX_EN}/mo from today. Stop it any time in Settings › Subscription.`,
  dejaActif: 'FillSell Cloud is already on for your account: it follows the plan you pick.',
  suspenduModale: 'Your FillSell Cloud is paused: it restarts with the plan you pick.',
  prixOption: `+ ${PRIX_EN}`,
  prixOptionSousEssai: `/mo · Cloud free for ${D7}`,
  prixOptionSous: '/mo · with FillSell Cloud',
  ctaSuffixe: ' + FillSell Cloud',
  titreModale: 'No computer needed.',
  offresTitreEssai: `${D7} free trial`,
  offresRelais: 'Posted, reposted and removed from our servers, 24/7.',
  offresCtaEssai: `Try ${D7} free`,
  offresCtaFree: 'Get FillSell Cloud',
  offresCtaAjout: 'Add FillSell Cloud',
  offresPrixEssai: `Then ${PRIX_EN}/${GLUE}mo · cancel anytime`,
  offresPrix: `${PRIX_EN}/${GLUE}mo · cancel anytime`,
  offresRappel: 'Stop it in one tap.',
  offresArret: 'Stop it in one tap.',
  offresEnPlus: (nom) => `On top of ${yourPlan(nom)}`,
  ajoutTitre: (nom) => `Add to ${yourPlan(nom)}`,
  ajoutCtaEssai: `Try ${D7} free`,
  ajoutCta: `Add · +${PRIX_EN}/mo`,

  freeCloudTitre: 'Free + FillSell Cloud',
  freeCloudQuota: (n) => (Number.isFinite(n) ? `With Free + FillSell Cloud, you stay at ${listingsFree(n)} a month.` : 'With Free + FillSell Cloud, you keep the Free plan quotas.'),
  freeCloudFrise: (date, n) => [
    { quand: 'Today', quoi: '€0, card required.' },
    { quand: 'During the trial', quoi: Number.isFinite(n) ? `Your ${listingsFree(n)} of the Free plan.` : 'The Free plan quotas.' },
    { quand: date, quoi: `${PRIX_EN}/mo, unless you stop it.` },
  ],
  freeCloudSansEssai: `The Cloud is billed ${PRIX_EN}/mo from today; stop it whenever you want.`,
  freeCloudCtaEssai: 'Try Free + FillSell Cloud',
  freeCloudCta: `Take Free + FillSell Cloud · ${PRIX_EN}/mo`,

  voieKicker: "I don't have a computer",
  voieTitreEssai: `FillSell Cloud, ${JOURS}-day trial`,
  voieTitre: `FillSell Cloud · +${PRIX_EN}/mo`,
  voieTexte: 'FillSell posts your listings from its servers: you sign in to Vinted, Leboncoin, Beebs and Depop once from your phone, and they go out even without a computer.',
  voieCtaEssai: 'Try FillSell Cloud',
  voieCta: 'See the Cloud',
  voieNote: (date) => `Card required, nothing is charged before ${date}. Then ${PRIX_EN}/mo, stop it whenever you want.`,
  voieNoteSansEssai: `${PRIX_EN}/mo, stop it whenever you want.`,
  voieCompactEssai: `No computer? Try FillSell Cloud, ${D7} free`,
  voieCompact: `No computer? FillSell Cloud add-on, ${PRIX_EN}/mo`,
  pageTitre: 'No computer?',
  pageTexte: 'With the FillSell Cloud add-on, FillSell posts your listings from its servers: on Vinted, Leboncoin, Beebs and Depop, everything is driven from your phone.',
  pageCta: 'See the Cloud in the app',
  pageNote: `${JOURS}-day trial, card required.`,
  extensionGratuite: 'Free, no card needed.',

  groupe: 'FillSell Cloud',
  etatAucun: 'Off',
  etatEssai: 'Free trial',
  etatPaye: 'On',
  etatArretPrevu: (date) => `Stops on ${date}`,
  etatSuspendu: 'Paused',
  etatTermine: 'Trial ended',
  etatArrete: 'Trial stopped',
  etatLecture: 'Loading…',
  aucunCtaEssai: `Try ${D7} free`,
  aucunNoteEssai: (date) => `Card required, nothing is charged before ${date}. Then ${PRIX_EN}/mo, stop it whenever you want.`,
  aucunCta: `Add · +${PRIX_EN}/mo`,
  aucunNote: 'Your free trial has already been used: the Cloud is billed as soon as it is added.',
  voirFormules: 'See the plans',
  essaiReste: (j) => (j > 1 ? `${j} trial days left` : 'Last trial day'),
  essaiFin: (date, heure, nom) => (nom
    ? `Free until ${date} at ${heure}. Then ${PRIX_EN}/mo is added to your ${nom} plan, unless you stop it before.`
    : `Free until ${date} at ${heure}. Then the Cloud moves to ${PRIX_EN}/mo, unless you stop it before.`),
  essaiJauge: (j, total) => `Day ${j} of ${total}`,
  essaiSansSuite: (date) => (date ? `Your Cloud trial continues until ${date}. Nothing will be charged.` : 'Your Cloud trial continues until its end date. Nothing will be charged.'),
  essaiNote: (nom) => `If you stop it, ${yourPlan(nom)} does not change, and the extension and eBay remain available.`,
  mentionPremium: (n) => (Number.isFinite(n) ? `You are on Free + FillSell Cloud: ${listingsFree(n)} a month. To post more, Premium adds to the Cloud.` : 'You are on Free + FillSell Cloud, with the Free plan quotas. To post more, Premium adds to the Cloud.'),
  voirPremium: 'See Premium',
  payeTexte: (nom) => (nom
    ? `On top of your ${nom} plan: your Vinted, Leboncoin, Beebs and Depop listings go out without a computer, 24/7.`
    : 'With your Free plan: your Vinted, Leboncoin, Beebs and Depop listings go out without a computer, 24/7.'),
  arretPrevuTexte: (date) => `The Cloud runs until ${date}, then stops: nothing will be charged after that.`,
  garderOption: 'Keep the Cloud',
  suspenduTexte: 'The Cloud is paused: it restarts as soon as you pick a plan again.',
  termineTexte: (date) => `Trial ended on ${date}. The Cloud is off.`,
  arreteTexte: (date) => `Trial stopped on ${date}. The Cloud is off, and nothing was billed for it.`,
  termineSuite: 'Without FillSell Cloud, your listings go through the FillSell extension, on your computer. eBay is not affected.',
  termineCta: `Add the Cloud · ${PRIX_EN}/mo`,
  meConnecter: 'Connect my platforms',
  arreter: 'Stop the Cloud',
  arreterTitre: 'Stop FillSell Cloud?',
  arreterEssai: (nom, date = null) => `${date ? `Your Cloud keeps running until ${date}, then stops on its own, without being charged.` : 'Your Cloud keeps running until the end of the trial, then stops on its own, without being charged.'} After that, without FillSell Cloud, your listings go through the FillSell extension, on your computer. ${nom ? `Your ${nom} plan` : 'Your Free plan'} does not change.`,
  arreterPaye: (date) => (date
    ? `It runs until ${date}, then stops: nothing will be charged after that. After that, without FillSell Cloud, your listings go through the FillSell extension, on your computer.`
    : 'It runs until the end of the paid period, then stops: nothing will be charged after that. After that, without FillSell Cloud, your listings go through the FillSell extension, on your computer.'),
  arreterConfirmer: 'Stop',
  arreterAnnuler: 'Keep',
  arreterBoutique: (voie, finEssai = null) => `${voie === 'google'
    ? 'Your Cloud was bought on Google Play: Google stops it, not FillSell. Open your Google Play subscriptions below, pick FillSell Cloud, then cancel it. FillSell will show it as soon as Google confirms it.'
    : voie === 'apple_ailleurs'
      ? 'Your Cloud was bought on the App Store: Apple stops it, not FillSell. On your iPhone or iPad, open Settings › your name › Subscriptions, pick FillSell Cloud, then cancel it. FillSell will show it as soon as Apple confirms it.'
      : 'Your Cloud was bought on the App Store: Apple stops it, not FillSell. Open your Apple subscriptions below, pick FillSell Cloud, then cancel it. FillSell will show it as soon as Apple confirms it.'} ${finEssai
    ? `${voie === 'google' ? 'Cancelled before the end of the trial' : 'Cancelled at least 24 hours before the end of the trial'}, your Cloud keeps running until ${finEssai}, then stops on its own, without being charged.`
    : 'Once cancelled, it keeps running until the end of the paid period, then stops.'}`,
  arreterBoutiqueCta: (voie) => (voie === 'google' ? 'Open my Google Play subscriptions' : 'Open my Apple subscriptions'),
  arreterBoutiqueFermer: 'Close',
  arretBoutiqueAttente: (voie) => (voie === 'google'
    ? 'As soon as Google confirms it, FillSell will show it in Settings › Subscription. Until then, your Cloud keeps running.'
    : 'As soon as Apple confirms it, FillSell will show it in Settings › Subscription. Until then, your Cloud keeps running.'),
  resiliationCloud: 'FillSell Cloud keeps running: your account goes back to Free + FillSell Cloud, with the Free plan quotas.',
  resiliationCloudLien: 'Stop the Cloud too',

  veilleKicker: 'FillSell Cloud · free trial',
  veilleTitre: (quand, heure) => (quand === 'aujourdhui'
    ? `Today at ${heure}, the Cloud moves to ${PRIX_EN}/mo`
    : `Tomorrow, the Cloud moves to ${PRIX_EN}/mo`),
  veilleTexte: (date, heure, nom) => (nom
    ? `Your free trial ends on ${date} at ${heure}. If you keep the Cloud, ${PRIX_EN}/mo is added to your ${nom} plan from then on. If you stop it, nothing is billed for it.`
    : `Your free trial ends on ${date} at ${heure}. If you keep the Cloud, it moves to ${PRIX_EN}/mo from then on. If you stop it, nothing is billed for it.`),
  veilleGarder: 'Keep the Cloud',
  veilleArreter: 'Stop the Cloud',
  veilleNote: (nom) => `Either way, ${yourPlan(nom)} does not change, and the extension and eBay remain available.`,
  veilleBascule: (date, heure) => `${date} at ${heure} · +${PRIX_EN}/mo`,
  veilleBoutiqueOuverte: (voie) => (voie === 'google'
    ? 'You opened your Google Play subscriptions. As soon as Google confirms the cancellation to us, it is done.'
    : 'You opened your Apple subscriptions. As soon as Apple confirms the cancellation to us, it is done.'),
  veilleArreteeConfirmee: 'It is stopped. Nothing will be charged. Without FillSell Cloud, your listings go through the FillSell extension, on your computer.',
  veilleArretee: 'It is stopped. Without FillSell Cloud, your listings go through the FillSell extension, on your computer.',
  veilleArretEchec: 'The Cloud could not be stopped. Try again in a moment.',
  veilleTexteBoutique: (date, heure, voie) => (voie === 'google'
    ? `Your free trial ends on ${date} at ${heure}. Your Cloud was bought on Google Play: to stop it, go to your Google Play subscriptions, and FillSell will show it as soon as Google confirms it.`
    : `Your free trial ends on ${date} at ${heure}. Your Cloud was bought on the App Store: to stop it, go to your Apple subscriptions, and FillSell will show it as soon as Apple confirms it.`),

  finKicker: 'FillSell Cloud',
  finTitre: 'Your trial has ended',
  finTexte: 'The Cloud is off.',
  finArreteTitre: 'What stops',
  finArrete: [
    'Your Vinted, Leboncoin, Beebs and Depop listings no longer go out without a computer: without FillSell Cloud, posting, reposting, removal and sales go through the FillSell extension, on your computer.',
  ],
  finContinueTitre: 'What continues',
  finContinue: (nom) => [
    nom ? `Your ${nom} plan, your stock and your listings already online.` : 'Your Free plan, your stock and your listings already online.',
    "eBay, from your phone, through eBay's official sign-in.",
    'The Chrome extension, free: the same work while your computer is on.',
  ],
  finCtaAjouter: `Restart the Cloud · ${PRIX_EN}/mo`,
  finCtaExtension: 'Install the extension on my computer',
  placesRestantes: (n) => (n === 1 ? '1 spot left' : `${n} spots left`),
  completTitre: 'Full for now',
  completTexte: "All FillSell Cloud spots are taken. Join the waiting list, at no cost: a notification tells you as soon as a spot is free, and it's kept for you for 24 hours.",
  completCta: 'Join the waiting list',
  completInscrit: (rang) => `You're on the waiting list${rang ? ` (number ${rang})` : ''}: a notification tells you as soon as a spot is free, and it's kept for you for 24 hours.`,
  completEchec: "Signing up didn't work. Try again in a moment.",
  placeLibreTitre: 'A FillSell Cloud spot is free',
  placeLibreTexte: "It's kept for you for 24 hours: start FillSell Cloud whenever you like until then.",
  placeLibreCta: 'Start FillSell Cloud',
  arretKicker: 'FillSell Cloud',
  arretTitre: 'FillSell Cloud is off',
  arretTexte: 'Without FillSell Cloud, posting, reposting, removal and sales go through the FillSell extension, on your computer, while it is on.',
  arretCtaReprendre: `Restart FillSell Cloud · ${PRIX_EN}/mo`,
  arretCtaExtension: 'Install or open the extension on my computer',
  fermer: 'Close',
};

export function textesCloud(lang) {
  return avecPrix(lang === 'en' ? EN : FR, lang === 'en' ? 'en' : 'fr');
}
