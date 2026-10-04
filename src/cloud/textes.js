// ═══════════════════════════════════════════════════════════════════════════
// L'OPTION « SANS ORDINATEUR » (FillSell Cloud) — LES MOTS (04/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// CONCEPTION, NON LIVRÉE (drapeau : src/config/cloudOffer.js). Même règle que
// entree/textes.js et reglages/textes.js : AUCUNE phrase dans un composant,
// tout se lit ici, fr + en, et un écran ne reçoit que `T`.
//
// DÉCISIONS FINALES DE NICO (04/10 soir) :
//   · option à 20 €/mois, essai de 7 jours, CARTE DEMANDÉE, un seul essai ;
//   · elle se prend SEULE sur un compte Free (qui garde ses quotas Free) ou
//     EN PLUS de Premium, Pro ou Business ;
//   · arrêter pendant l'essai : effet IMMÉDIAT, rien n'est facturé ; une fois
//     payée, elle tourne jusqu'à la fin de la période ;
//   · résilier la formule n'arrête PAS l'option (le compte repasse en Free +
//     Sans ordinateur) ;
//   · la veille de la fin d'essai, on prévient dans l'app ET par e-mail.
//
// ⛔ CE QUE LE CLOUD FAIT VRAIMENT — ET RIEN DE PLUS :
//   · FillSell publie les annonces depuis ses serveurs (sortie par une adresse
//     française dédiée) : elles partent, se republient et se retirent, et les
//     ventes sont vues, même ordinateur éteint, depuis le téléphone ;
//   · ÉPROUVÉ sur Vinted et Leboncoin — on ne nomme QUE ces deux-là ;
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
import { CLOUD_PRIX_AFFICHE, CLOUD_ESSAI_JOURS } from '../utils/palier';

// Espaces INSÉCABLES dans « 20 € » et « 7 jours » : à 390 px, « 20 » se
// retrouvait seul en fin de ligne et « €/mois » à la suivante (capture du 04/10).
const NBSP = String.fromCharCode(0xa0);
const PRIX = CLOUD_PRIX_AFFICHE.replace(/ /g, NBSP); // '20 €' — le prix AFFICHÉ, cf. utils/palier.js
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
  nom: 'Sans ordinateur',
  // ⛔ LIBELLÉ IMPOSÉ (Nico, 04/10) : « Sans ordinateur · +20 €/mois ».
  libelleInterrupteur: `Sans ordinateur · +${PRIX}/mois`,
  essaiPastille: `${J7} d'essai gratuits`,
  // ⛔ CARTE DEMANDÉE (décision du 04/10 soir) — dit là où l'essai se propose.
  carteDemandee: (date) => `Carte demandée, rien n'est prélevé pour l'option avant le ${date}.`,

  // ── Ce que ça fait (une phrase, la même partout) ─────────────────────────
  ceQueCaFait: 'Tes annonces Vinted et Leboncoin partent, se republient et se retirent même ordinateur éteint, et tes ventes sont vues : tout se pilote depuis ton téléphone.',
  ebayDeja: 'eBay part déjà sans ordinateur, pour tout le monde.',

  // ── L'interrupteur de la feuille des formules ────────────────────────────
  sAjoute: "S'ajoute à la formule que tu choisis ci-dessous.",
  sAjouteFree: "S'ajoute à la formule que tu choisis ci-dessous, Free compris.",
  frise: (date) => [
    { quand: "Aujourd'hui", quoi: "Carte demandée, rien n'est prélevé pour l'option." },
    { quand: date, quoi: `L'option passe à ${PRIX}/mois, sauf si tu l'arrêtes avant.` },
    { quand: "D'ici là", quoi: "Tu l'arrêtes en un geste dans Réglages › Abonnement. On te prévient la veille, dans l'app et par e-mail." },
  ],
  sansEssai: `Ton essai gratuit a déjà servi : l'option est facturée ${PRIX}/mois dès aujourd'hui. Tu l'arrêtes quand tu veux dans Réglages › Abonnement.`,
  dejaActif: 'Sans ordinateur est déjà actif sur ton compte : il suit la formule que tu choisis.',
  suspenduModale: 'Ton option Sans ordinateur est en pause : elle repart avec la formule que tu choisis.',
  prixOption: `+ ${PRIX}`,
  prixOptionSousEssai: `/mois · option offerte ${J7}`,
  prixOptionSous: '/mois · avec Sans ordinateur',
  ctaSuffixe: ' + Sans ordinateur',
  titreModale: 'Vends même ordinateur éteint.',
  ajoutTitre: (nom) => `Ajouter à ${taFormule(nom)}`,
  ajoutCtaEssai: `Essayer ${J7} gratuits`,
  ajoutCta: `Ajouter · +${PRIX}/mois`,

  // ── La voie « Free + Sans ordinateur » (carte Free de la feuille) ────────
  freeCloudTitre: 'Free + Sans ordinateur',
  freeCloudQuota: (n) => `Avec Free + Sans ordinateur, tu restes à ${annoncesFree(n)} par mois.`,
  freeCloudFrise: (date, n) => [
    { quand: "Aujourd'hui", quoi: '0 €, carte demandée.' },
    { quand: "Pendant l'essai", quoi: `Tes ${annoncesFree(n)} du plan Free.` },
    { quand: date, quoi: `${PRIX}/mois, sauf si tu l'arrêtes.` },
  ],
  freeCloudSansEssai: `L'option est facturée ${PRIX}/mois dès aujourd'hui ; tu l'arrêtes quand tu veux.`,
  freeCloudCtaEssai: 'Essayer Free + Sans ordinateur',
  freeCloudCta: `Prendre Free + Sans ordinateur · ${PRIX}/mois`,

  // ── La 2e voie : parcours d'entrée, mur « installe l'extension » ─────────
  voieKicker: "Je n'ai pas d'ordinateur",
  voieTitreEssai: `Sans ordinateur, ${J7} d'essai`,
  voieTitre: `Sans ordinateur · +${PRIX}/mois`,
  // ⛔ PHRASE IMPOSÉE (04/10 soir) : « FillSell publie tes annonces depuis ses serveurs ».
  voieTexte: "FillSell publie tes annonces depuis ses serveurs : tu te connectes une fois à Vinted et Leboncoin depuis ton téléphone, et elles partent même sans ordinateur.",
  voieCtaEssai: 'Essayer sans ordinateur',
  voieCta: "Voir l'option",
  voieNote: (date) => `Carte demandée, rien n'est prélevé avant le ${date}. Puis ${PRIX}/mois, tu l'arrêtes quand tu veux.`,
  voieNoteSansEssai: `${PRIX}/mois, tu l'arrêtes quand tu veux.`,
  voieCompactEssai: `Pas d'ordinateur ? Essaie Sans ordinateur, ${J7} offerts`,
  voieCompact: `Pas d'ordinateur ? Option Sans ordinateur, ${PRIX}/mois`,
  // La page /extension, ouverte sur un téléphone (souvent sans session).
  pageTitre: "Pas d'ordinateur ?",
  pageTexte: "Avec l'option Sans ordinateur, FillSell publie tes annonces depuis ses serveurs : sur Vinted et Leboncoin, tout se pilote depuis ton téléphone.",
  pageCta: "Voir l'option dans l'app",
  pageNote: `${J7} d'essai, carte demandée.`,
  // Le mur, près du bouton de l'extension : elle reste gratuite ET sans carte.
  extensionGratuite: 'Gratuite, sans carte.',

  // ── Réglages › Abonnement ────────────────────────────────────────────────
  groupe: 'Sans ordinateur',
  etatAucun: 'Pas activée',
  etatEssai: 'Essai gratuit',
  etatPaye: 'Active',
  etatArretPrevu: (date) => `S'arrête le ${date}`,
  etatSuspendu: 'En pause',
  etatTermine: 'Essai terminé',
  etatArrete: 'Essai arrêté',
  etatLecture: 'Lecture…',
  aucunCtaEssai: `Essayer ${J7} gratuits`,
  aucunNoteEssai: (date) => `Carte demandée, rien n'est prélevé avant le ${date}. Puis ${PRIX}/mois, tu l'arrêtes quand tu veux.`,
  aucunCta: `Ajouter · +${PRIX}/mois`,
  aucunNote: "Ton essai gratuit a déjà servi : l'option est facturée dès son ajout.",
  voirFormules: 'Voir les formules',
  essaiReste: (j) => (j > 1 ? `Encore ${j} jours d'essai` : "Dernier jour d'essai"),
  essaiFin: (date, heure, nom) => (nom
    ? `Gratuit jusqu'au ${date} à ${heure}. Ensuite, ${PRIX}/mois s'ajoutent à ta formule ${nom}, sauf si tu l'arrêtes avant.`
    : `Gratuit jusqu'au ${date} à ${heure}. Ensuite, l'option passe à ${PRIX}/mois, sauf si tu l'arrêtes avant.`),
  essaiJauge: (j, total) => `Jour ${j} sur ${total}`,
  essaiNote: (nom) => `Si tu l'arrêtes, ${taFormule(nom)} ne change pas, et l'extension comme eBay restent possibles.`,
  // UNE mention, ici seulement, pendant l'essai d'un compte Free (jamais une fenêtre).
  mentionPremium: (n) => `Tu es en Free + Sans ordinateur : ${annoncesFree(n)} par mois. Pour en publier plus, Premium s'ajoute à l'option.`,
  voirPremium: 'Voir Premium',
  payeTexte: (nom) => (nom
    ? `En plus de ta formule ${nom} : tes annonces Vinted et Leboncoin partent même ordinateur éteint.`
    : 'Avec ton plan Free : tes annonces Vinted et Leboncoin partent même ordinateur éteint.'),
  arretPrevuTexte: (date) => `L'option tourne jusqu'au ${date}, puis s'arrête : rien ne sera prélevé ensuite.`,
  garderOption: "Garder l'option",
  // Plus rendu depuis CLOUD_EXIGE_UN_PALIER = false (gardé pour l'interrupteur de palier.js).
  suspenduTexte: "L'option est en pause : elle repart dès que tu reprends une formule.",
  termineTexte: (date) => `Essai terminé le ${date}. L'option n'est plus active, et rien n'a été facturé pour elle.`,
  arreteTexte: (date) => `Essai arrêté le ${date}. L'option n'est plus active, et rien n'a été facturé pour elle.`,
  termineSuite: "L'extension sur ton ordinateur et eBay continuent comme avant.",
  termineCta: `Ajouter l'option · ${PRIX}/mois`,
  meConnecter: 'Connecter Vinted et Leboncoin',
  arreter: "Arrêter l'option",
  arreterTitre: "Arrêter l'option Sans ordinateur ?",
  // Pendant l'essai : effet IMMÉDIAT, rien facturé. Payée : jusqu'à la fin de période.
  arreterEssai: (nom) => `Elle s'arrête tout de suite, et rien n'est facturé pour elle. Tes annonces Vinted et Leboncoin repassent par l'extension, sur ton ordinateur. ${nom ? `Ta formule ${nom}` : 'Ton plan Free'} ne change pas.`,
  arreterPaye: (date) => (date
    ? `Elle tourne jusqu'au ${date}, puis s'arrête : rien ne sera prélevé ensuite. Après cette date, tes annonces Vinted et Leboncoin repassent par l'extension, sur ton ordinateur.`
    : "Elle tourne jusqu'à la fin de la période payée, puis s'arrête : rien ne sera prélevé ensuite. Tes annonces Vinted et Leboncoin repasseront alors par l'extension, sur ton ordinateur."),
  arreterConfirmer: 'Arrêter',
  arreterAnnuler: 'Garder',
  // La confirmation « Se désabonner » de la formule, quand l'option est active.
  resiliationCloud: "L'option Sans ordinateur, elle, continue : ton compte repasse en Free + Sans ordinateur, avec les quotas du plan Free.",
  resiliationCloudLien: "Arrêter aussi l'option",

  // ── La veille de la fin d'essai ──────────────────────────────────────────
  veilleKicker: 'Sans ordinateur · essai gratuit',
  veilleTitre: (quand, heure) => (quand === 'aujourdhui'
    ? `Aujourd'hui à ${heure}, l'option passe à ${PRIX}/mois`
    : `Demain, l'option passe à ${PRIX}/mois`),
  veilleTexte: (date, heure, nom) => (nom
    ? `Ton essai gratuit se termine le ${date} à ${heure}. Si tu gardes l'option, ${PRIX}/mois s'ajoutent à ta formule ${nom} à partir de là. Si tu l'arrêtes, rien n'est facturé pour elle.`
    : `Ton essai gratuit se termine le ${date} à ${heure}. Si tu gardes l'option, elle passe à ${PRIX}/mois à partir de là. Si tu l'arrêtes, rien n'est facturé pour elle.`),
  veilleGarder: "Garder l'option",
  veilleArreter: "Arrêter l'option",
  veilleNote: (nom) => `Dans les deux cas, ${taFormule(nom)} ne change pas, et l'extension comme eBay restent possibles.`,
  veilleBascule: (date, heure) => `Le ${date} à ${heure} · +${PRIX}/mois`,
  veilleArretee: "C'est arrêté. Rien ne sera facturé pour l'option, et tes annonces Vinted et Leboncoin repassent par l'extension.",
  veilleArretEchec: "L'arrêt n'a pas pu se faire. Réessaie dans un instant.",

  // ── Après la fin de l'essai (non converti) ───────────────────────────────
  finKicker: 'Sans ordinateur',
  finTitre: 'Ton essai est terminé',
  finTexte: "L'option n'est plus active. Rien n'a été facturé pour elle.",
  finArreteTitre: "Ce qui s'arrête",
  finArrete: [
    "Tes annonces Vinted et Leboncoin ne partent plus ordinateur éteint : publication, republication, retrait et ventes repassent par l'extension, sur ton ordinateur.",
  ],
  finContinueTitre: 'Ce qui continue',
  finContinue: (nom) => [
    nom ? `Ta formule ${nom}, ton stock et tes annonces déjà en ligne.` : 'Ton plan Free, ton stock et tes annonces déjà en ligne.',
    "eBay, depuis ton téléphone, par la connexion officielle d'eBay.",
    "L'extension Chrome, gratuite : le même travail quand ton ordinateur est allumé.",
  ],
  finCtaAjouter: `Reprendre l'option · ${PRIX}/mois`,
  finCtaExtension: "Installer l'extension sur mon ordinateur",
  fermer: 'Fermer',
};

const EN = {
  nom: 'No computer',
  libelleInterrupteur: `No computer · +${PRIX}/mo`,
  essaiPastille: `${JOURS}-day free trial`,
  carteDemandee: (date) => `Card required, nothing is charged for the add-on before ${date}.`,

  ceQueCaFait: 'Your Vinted and Leboncoin listings go out, get reposted and removed even with your computer off, and your sales are seen: everything is driven from your phone.',
  ebayDeja: 'eBay already works without a computer, for everyone.',

  sAjoute: 'Adds to the plan you pick below.',
  sAjouteFree: 'Adds to the plan you pick below, Free included.',
  frise: (date) => [
    { quand: 'Today', quoi: 'Card required, nothing is charged for the add-on.' },
    { quand: date, quoi: `The add-on moves to ${PRIX}/mo, unless you stop it before.` },
    { quand: 'Until then', quoi: "Stop it in one tap in Settings › Subscription. We'll remind you the day before, in the app and by email." },
  ],
  sansEssai: `Your free trial has already been used: the add-on is billed ${PRIX}/mo from today. Stop it any time in Settings › Subscription.`,
  dejaActif: 'No computer is already on for your account: it follows the plan you pick.',
  suspenduModale: 'Your No computer add-on is paused: it restarts with the plan you pick.',
  prixOption: `+ ${PRIX}`,
  prixOptionSousEssai: `/mo · add-on free for ${D7}`,
  prixOptionSous: '/mo · with No computer',
  ctaSuffixe: ' + No computer',
  titreModale: 'Sell even with your computer off.',
  ajoutTitre: (nom) => `Add to ${yourPlan(nom)}`,
  ajoutCtaEssai: `Try ${D7} free`,
  ajoutCta: `Add · +${PRIX}/mo`,

  freeCloudTitre: 'Free + No computer',
  freeCloudQuota: (n) => `With Free + No computer, you stay at ${listingsFree(n)} a month.`,
  freeCloudFrise: (date, n) => [
    { quand: 'Today', quoi: '€0, card required.' },
    { quand: 'During the trial', quoi: `Your ${listingsFree(n)} of the Free plan.` },
    { quand: date, quoi: `${PRIX}/mo, unless you stop it.` },
  ],
  freeCloudSansEssai: `The add-on is billed ${PRIX}/mo from today; stop it whenever you want.`,
  freeCloudCtaEssai: 'Try Free + No computer',
  freeCloudCta: `Take Free + No computer · ${PRIX}/mo`,

  voieKicker: "I don't have a computer",
  voieTitreEssai: `No computer, ${JOURS}-day trial`,
  voieTitre: `No computer · +${PRIX}/mo`,
  voieTexte: 'FillSell posts your listings from its servers: you sign in to Vinted and Leboncoin once from your phone, and they go out even without a computer.',
  voieCtaEssai: 'Try without a computer',
  voieCta: 'See the add-on',
  voieNote: (date) => `Card required, nothing is charged before ${date}. Then ${PRIX}/mo, stop it whenever you want.`,
  voieNoteSansEssai: `${PRIX}/mo, stop it whenever you want.`,
  voieCompactEssai: `No computer? Try No computer, ${D7} free`,
  voieCompact: `No computer? No computer add-on, ${PRIX}/mo`,
  pageTitre: 'No computer?',
  pageTexte: 'With the No computer add-on, FillSell posts your listings from its servers: on Vinted and Leboncoin, everything is driven from your phone.',
  pageCta: 'See the add-on in the app',
  pageNote: `${JOURS}-day trial, card required.`,
  extensionGratuite: 'Free, no card needed.',

  groupe: 'No computer',
  etatAucun: 'Off',
  etatEssai: 'Free trial',
  etatPaye: 'On',
  etatArretPrevu: (date) => `Stops on ${date}`,
  etatSuspendu: 'Paused',
  etatTermine: 'Trial ended',
  etatArrete: 'Trial stopped',
  etatLecture: 'Loading…',
  aucunCtaEssai: `Try ${D7} free`,
  aucunNoteEssai: (date) => `Card required, nothing is charged before ${date}. Then ${PRIX}/mo, stop it whenever you want.`,
  aucunCta: `Add · +${PRIX}/mo`,
  aucunNote: 'Your free trial has already been used: the add-on is billed as soon as it is added.',
  voirFormules: 'See the plans',
  essaiReste: (j) => (j > 1 ? `${j} trial days left` : 'Last trial day'),
  essaiFin: (date, heure, nom) => (nom
    ? `Free until ${date} at ${heure}. Then ${PRIX}/mo is added to your ${nom} plan, unless you stop it before.`
    : `Free until ${date} at ${heure}. Then the add-on moves to ${PRIX}/mo, unless you stop it before.`),
  essaiJauge: (j, total) => `Day ${j} of ${total}`,
  essaiNote: (nom) => `If you stop it, ${yourPlan(nom)} does not change, and the extension and eBay remain available.`,
  mentionPremium: (n) => `You are on Free + No computer: ${listingsFree(n)} a month. To post more, Premium adds to the add-on.`,
  voirPremium: 'See Premium',
  payeTexte: (nom) => (nom
    ? `On top of your ${nom} plan: your Vinted and Leboncoin listings go out even with your computer off.`
    : 'With your Free plan: your Vinted and Leboncoin listings go out even with your computer off.'),
  arretPrevuTexte: (date) => `The add-on runs until ${date}, then stops: nothing will be charged after that.`,
  garderOption: 'Keep the add-on',
  suspenduTexte: 'The add-on is paused: it restarts as soon as you pick a plan again.',
  termineTexte: (date) => `Trial ended on ${date}. The add-on is off, and nothing was billed for it.`,
  arreteTexte: (date) => `Trial stopped on ${date}. The add-on is off, and nothing was billed for it.`,
  termineSuite: 'The extension on your computer and eBay keep working as before.',
  termineCta: `Add the add-on · ${PRIX}/mo`,
  meConnecter: 'Connect Vinted and Leboncoin',
  arreter: 'Stop the add-on',
  arreterTitre: 'Stop the No computer add-on?',
  arreterEssai: (nom) => `It stops right away, and nothing is billed for it. Your Vinted and Leboncoin listings go back through the extension, on your computer. ${nom ? `Your ${nom} plan` : 'Your Free plan'} does not change.`,
  arreterPaye: (date) => (date
    ? `It runs until ${date}, then stops: nothing will be charged after that. After that date, your Vinted and Leboncoin listings go back through the extension, on your computer.`
    : 'It runs until the end of the paid period, then stops: nothing will be charged after that. Your Vinted and Leboncoin listings will then go back through the extension, on your computer.'),
  arreterConfirmer: 'Stop',
  arreterAnnuler: 'Keep',
  resiliationCloud: 'The No computer add-on keeps running: your account goes back to Free + No computer, with the Free plan quotas.',
  resiliationCloudLien: 'Stop the add-on too',

  veilleKicker: 'No computer · free trial',
  veilleTitre: (quand, heure) => (quand === 'aujourdhui'
    ? `Today at ${heure}, the add-on moves to ${PRIX}/mo`
    : `Tomorrow, the add-on moves to ${PRIX}/mo`),
  veilleTexte: (date, heure, nom) => (nom
    ? `Your free trial ends on ${date} at ${heure}. If you keep the add-on, ${PRIX}/mo is added to your ${nom} plan from then on. If you stop it, nothing is billed for it.`
    : `Your free trial ends on ${date} at ${heure}. If you keep the add-on, it moves to ${PRIX}/mo from then on. If you stop it, nothing is billed for it.`),
  veilleGarder: 'Keep the add-on',
  veilleArreter: 'Stop the add-on',
  veilleNote: (nom) => `Either way, ${yourPlan(nom)} does not change, and the extension and eBay remain available.`,
  veilleBascule: (date, heure) => `${date} at ${heure} · +${PRIX}/mo`,
  veilleArretee: 'It is stopped. Nothing will be billed for the add-on, and your Vinted and Leboncoin listings go back through the extension.',
  veilleArretEchec: 'The add-on could not be stopped. Try again in a moment.',

  finKicker: 'No computer',
  finTitre: 'Your trial has ended',
  finTexte: 'The add-on is off. Nothing was billed for it.',
  finArreteTitre: 'What stops',
  finArrete: [
    'Your Vinted and Leboncoin listings no longer go out with your computer off: posting, reposting, removal and sales go back through the extension, on your computer.',
  ],
  finContinueTitre: 'What continues',
  finContinue: (nom) => [
    nom ? `Your ${nom} plan, your stock and your listings already online.` : 'Your Free plan, your stock and your listings already online.',
    "eBay, from your phone, through eBay's official sign-in.",
    'The Chrome extension, free: the same work while your computer is on.',
  ],
  finCtaAjouter: `Restart the add-on · ${PRIX}/mo`,
  finCtaExtension: 'Install the extension on my computer',
  fermer: 'Close',
};

export function textesCloud(lang) {
  return lang === 'en' ? EN : FR;
}
