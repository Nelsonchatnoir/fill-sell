// ═══════════════════════════════════════════════════════════════════════════
// L'OPTION « SANS ORDINATEUR » (FillSell Cloud) — LES MOTS (04/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// CONCEPTION, NON LIVRÉE (drapeau : src/config/cloudOffer.js). Même règle que
// entree/textes.js et reglages/textes.js : AUCUNE phrase dans un composant,
// tout se lit ici, fr + en, et un écran ne reçoit que `T`.
//
// ⛔ CE QUE LE CLOUD FAIT VRAIMENT — ET RIEN DE PLUS (décision du 04/10) :
//   · notre extension tourne pour la personne dans un navigateur sur nos
//     serveurs (sortie par une adresse française dédiée) : ses annonces
//     partent, se republient et se retirent, et ses ventes sont vues, même
//     ordinateur éteint, depuis son téléphone ;
//   · ÉPROUVÉ sur Vinted et Leboncoin — on ne nomme QUE ces deux-là ;
//   · eBay part DÉJÀ sans ordinateur, pour tout le monde (connexion officielle
//     par l'API) : on le dit, on ne le vend pas comme un avantage de l'option ;
//   · ⛔ une plateforme bloquée par sa protection anti-robot n'est JAMAIS
//     promise ici : elle n'est pas nommée du tout (contrôlé par
//     scripts/cloud-ecrans-selftest.mjs et la capture) ;
//   · Opla sort de FillSell le 10/10 : jamais citée.
// ⛔ VOCABULAIRE : « quotas », jamais l'ancien mot ; « plafond » banni des
//    cartes ; tutoiement ; aucune phrase technique (ni « serveur Cloud », ni
//    « proxy », ni « adresse IP ») — « sur nos serveurs » suffit.
// ⛔ L'ESSAI, SANS PIÈGE : partout où l'essai est proposé, la date de bascule
//    est écrite en clair, le montant aussi, et la sortie (« Arrêter l'option »)
//    est nommée avec l'endroit où elle se trouve. Ce qui est payé AUJOURD'HUI
//    (la formule) n'est jamais confondu avec ce qui est offert (l'option).
import { CLOUD_PRIX_AFFICHE, CLOUD_ESSAI_JOURS } from '../utils/palier';

// Espaces INSÉCABLES dans « 20 € » et « 7 jours » : à 390 px, « 20 » se
// retrouvait seul en fin de ligne et « €/mois » à la suivante (capture du 04/10).
const NBSP = ' ';
const PRIX = CLOUD_PRIX_AFFICHE.replace(/ /g, NBSP); // '20 €' — le prix AFFICHÉ, cf. utils/palier.js
const JOURS = CLOUD_ESSAI_JOURS;          // 7
const J7 = `${JOURS}${NBSP}jours`;
const D7 = `${JOURS}${NBSP}days`;

// « ta formule Premium » / « ta formule » quand le palier est inconnu ou gratuit.
const taFormule = (nom) => (nom ? `ta formule ${nom}` : 'ta formule');
const yourPlan = (nom) => (nom ? `your ${nom} plan` : 'your plan');

const FR = {
  nom: 'Sans ordinateur',
  // ⛔ LIBELLÉ IMPOSÉ (Nico, 04/10) : « Sans ordinateur · +20 €/mois ».
  libelleInterrupteur: `Sans ordinateur · +${PRIX}/mois`,
  essaiPastille: `${J7} d'essai gratuits`,

  // ── Ce que ça fait (une phrase, la même partout) ─────────────────────────
  ceQueCaFait: 'Tes annonces Vinted et Leboncoin partent, se republient et se retirent même ordinateur éteint, et tes ventes sont vues : tout se pilote depuis ton téléphone.',
  ebayDeja: 'eBay part déjà sans ordinateur, pour tout le monde.',

  // ── L'interrupteur de la feuille des formules ────────────────────────────
  sAjoute: "S'ajoute à la formule que tu choisis ci-dessous.",
  frise: (date) => [
    { quand: "Aujourd'hui", quoi: "Tu paies ta formule. L'option : 0 €." },
    { quand: date, quoi: `L'option passe à ${PRIX}/mois, en plus de ta formule.` },
    { quand: "D'ici là", quoi: "Tu l'arrêtes en un geste dans Réglages › Abonnement. On te prévient la veille." },
  ],
  sansEssai: `Ton essai gratuit a déjà servi : l'option est facturée ${PRIX}/mois dès aujourd'hui, avec ta formule. Tu l'arrêtes quand tu veux dans Réglages › Abonnement.`,
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

  // ── La 2e voie : parcours d'entrée, mur « installe l'extension » ─────────
  voieKicker: "Je n'ai pas d'ordinateur",
  voieTitreEssai: `Sans ordinateur, ${J7} d'essai`,
  voieTitre: `Sans ordinateur · +${PRIX}/mois`,
  voieTexte: "FillSell fait tourner l'extension pour toi, sur ses serveurs. Tu te connectes une fois à Vinted et Leboncoin depuis ton téléphone, et tes annonces partent même sans ordinateur.",
  voieCtaEssai: 'Essayer sans ordinateur',
  voieCta: "Voir l'option",
  voieNote: `En option d'une formule payante. Après l'essai : ${PRIX}/mois, tu l'arrêtes quand tu veux.`,
  voieNoteSansEssai: "En option d'une formule payante. Tu l'arrêtes quand tu veux.",
  voieCompactEssai: `Pas d'ordinateur ? Essaie Sans ordinateur, ${J7} offerts`,
  voieCompact: `Pas d'ordinateur ? Option Sans ordinateur, ${PRIX}/mois`,
  // La page /extension, ouverte sur un téléphone (souvent sans session).
  pageTitre: "Pas d'ordinateur ?",
  pageTexte: "Avec l'option Sans ordinateur, FillSell fait tourner l'extension pour toi sur ses serveurs : tes annonces Vinted et Leboncoin partent depuis ton téléphone.",
  pageCta: "Voir l'option dans l'app",
  pageNote: `${J7} d'essai, en plus d'une formule payante.`,

  // ── Réglages › Abonnement ────────────────────────────────────────────────
  groupe: 'Sans ordinateur',
  etatAucun: 'Pas activée',
  etatEssai: 'Essai gratuit',
  etatPaye: 'Active',
  etatSuspendu: 'En pause',
  etatTermine: 'Essai terminé',
  etatLecture: 'Lecture…',
  aucunCtaEssai: `Essayer ${J7} gratuits`,
  aucunNoteEssai: `Puis ${PRIX}/mois en plus de ta formule. Tu l'arrêtes quand tu veux.`,
  aucunCta: `Ajouter · +${PRIX}/mois`,
  aucunNote: "Ton essai gratuit a déjà servi : l'option est facturée dès son ajout.",
  gratuitTexte: "L'option s'ajoute à une formule payante : Premium, Pro ou Business.",
  voirFormules: 'Voir les formules',
  essaiReste: (j) => (j > 1 ? `Encore ${j} jours d'essai` : "Dernier jour d'essai"),
  essaiFin: (date, heure, nom) => `Gratuit jusqu'au ${date} à ${heure}. Ensuite, ${PRIX}/mois s'ajoutent à ${taFormule(nom)}, sauf si tu l'arrêtes avant.`,
  essaiJauge: (j, total) => `Jour ${j} sur ${total}`,
  essaiNote: (nom) => `Si tu l'arrêtes, ${taFormule(nom)} ne change pas, et l'extension comme eBay restent possibles.`,
  payeTexte: (nom) => `En plus de ${taFormule(nom)} : tes annonces Vinted et Leboncoin partent même ordinateur éteint.`,
  suspenduTexte: "Ta formule payante est arrêtée : l'option ne tourne plus. Elle repart dès que tu reprends une formule.",
  termineTexte: (date) => `Essai terminé le ${date}. L'option n'est plus active, et rien n'a été facturé pour elle.`,
  termineSuite: "L'extension sur ton ordinateur et eBay continuent comme avant.",
  termineCta: `Ajouter l'option · ${PRIX}/mois`,
  meConnecter: 'Connecter Vinted et Leboncoin',
  arreter: "Arrêter l'option",
  arreterTitre: "Arrêter l'option Sans ordinateur ?",
  arreterEssai: "Rien ne sera facturé pour l'option. Tes annonces Vinted et Leboncoin repasseront par l'extension, sur ton ordinateur. Ta formule ne change pas.",
  arreterPaye: "Tes annonces Vinted et Leboncoin repasseront par l'extension, sur ton ordinateur. Ta formule ne change pas.",
  arreterConfirmer: 'Arrêter',
  arreterAnnuler: 'Garder',

  // ── La veille de la fin d'essai ──────────────────────────────────────────
  veilleKicker: 'Sans ordinateur · essai gratuit',
  veilleTitre: (quand, heure) => (quand === 'aujourdhui'
    ? `Aujourd'hui à ${heure}, l'option passe à ${PRIX}/mois`
    : `Demain, l'option passe à ${PRIX}/mois`),
  veilleTexte: (date, heure, nom) => `Ton essai gratuit se termine le ${date} à ${heure}. Si tu gardes l'option, ${PRIX}/mois s'ajoutent à ${taFormule(nom)} à partir de là. Si tu l'arrêtes, rien n'est facturé pour elle.`,
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
    nom ? `Ta formule ${nom}, ton stock et tes annonces déjà en ligne.` : 'Ton stock et tes annonces déjà en ligne.',
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

  ceQueCaFait: 'Your Vinted and Leboncoin listings go out, get reposted and removed even with your computer off, and your sales are seen: everything is driven from your phone.',
  ebayDeja: 'eBay already works without a computer, for everyone.',

  sAjoute: 'Adds to the plan you pick below.',
  frise: (date) => [
    { quand: 'Today', quoi: 'You pay for your plan. The add-on: €0.' },
    { quand: date, quoi: `The add-on moves to ${PRIX}/mo, on top of your plan.` },
    { quand: 'Until then', quoi: "Stop it in one tap in Settings › Subscription. We'll remind you the day before." },
  ],
  sansEssai: `Your free trial has already been used: the add-on is billed ${PRIX}/mo from today, with your plan. Stop it any time in Settings › Subscription.`,
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

  voieKicker: "I don't have a computer",
  voieTitreEssai: `No computer, ${JOURS}-day trial`,
  voieTitre: `No computer · +${PRIX}/mo`,
  voieTexte: 'FillSell runs the extension for you, on its servers. You sign in to Vinted and Leboncoin once from your phone, and your listings go out even without a computer.',
  voieCtaEssai: 'Try without a computer',
  voieCta: 'See the add-on',
  voieNote: `Add-on to a paid plan. After the trial: ${PRIX}/mo, stop it whenever you want.`,
  voieNoteSansEssai: 'Add-on to a paid plan. Stop it whenever you want.',
  voieCompactEssai: `No computer? Try No computer, ${D7} free`,
  voieCompact: `No computer? No computer add-on, ${PRIX}/mo`,
  pageTitre: 'No computer?',
  pageTexte: 'With the No computer add-on, FillSell runs the extension for you on its servers: your Vinted and Leboncoin listings go out from your phone.',
  pageCta: 'See the add-on in the app',
  pageNote: `${JOURS}-day trial, on top of a paid plan.`,

  groupe: 'No computer',
  etatAucun: 'Off',
  etatEssai: 'Free trial',
  etatPaye: 'On',
  etatSuspendu: 'Paused',
  etatTermine: 'Trial ended',
  etatLecture: 'Loading…',
  aucunCtaEssai: `Try ${D7} free`,
  aucunNoteEssai: `Then ${PRIX}/mo on top of your plan. Stop it whenever you want.`,
  aucunCta: `Add · +${PRIX}/mo`,
  aucunNote: 'Your free trial has already been used: the add-on is billed as soon as it is added.',
  gratuitTexte: 'The add-on goes on top of a paid plan: Premium, Pro or Business.',
  voirFormules: 'See the plans',
  essaiReste: (j) => (j > 1 ? `${j} trial days left` : 'Last trial day'),
  essaiFin: (date, heure, nom) => `Free until ${date} at ${heure}. Then ${PRIX}/mo is added to ${yourPlan(nom)}, unless you stop it before.`,
  essaiJauge: (j, total) => `Day ${j} of ${total}`,
  essaiNote: (nom) => `If you stop it, ${yourPlan(nom)} does not change, and the extension and eBay remain available.`,
  payeTexte: (nom) => `On top of ${yourPlan(nom)}: your Vinted and Leboncoin listings go out even with your computer off.`,
  suspenduTexte: 'Your paid plan has stopped: the add-on no longer runs. It restarts as soon as you pick a plan again.',
  termineTexte: (date) => `Trial ended on ${date}. The add-on is off, and nothing was billed for it.`,
  termineSuite: 'The extension on your computer and eBay keep working as before.',
  termineCta: `Add the add-on · ${PRIX}/mo`,
  meConnecter: 'Connect Vinted and Leboncoin',
  arreter: 'Stop the add-on',
  arreterTitre: 'Stop the No computer add-on?',
  arreterEssai: 'Nothing will be billed for the add-on. Your Vinted and Leboncoin listings will go back through the extension, on your computer. Your plan does not change.',
  arreterPaye: 'Your Vinted and Leboncoin listings will go back through the extension, on your computer. Your plan does not change.',
  arreterConfirmer: 'Stop',
  arreterAnnuler: 'Keep',

  veilleKicker: 'No computer · free trial',
  veilleTitre: (quand, heure) => (quand === 'aujourdhui'
    ? `Today at ${heure}, the add-on moves to ${PRIX}/mo`
    : `Tomorrow, the add-on moves to ${PRIX}/mo`),
  veilleTexte: (date, heure, nom) => `Your free trial ends on ${date} at ${heure}. If you keep the add-on, ${PRIX}/mo is added to ${yourPlan(nom)} from then on. If you stop it, nothing is billed for it.`,
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
    nom ? `Your ${nom} plan, your stock and your listings already online.` : 'Your stock and your listings already online.',
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
