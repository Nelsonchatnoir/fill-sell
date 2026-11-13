// ═══════════════════════════════════════════════════════════════════════════
// PARCOURS D'ENTRÉE — LE PLAN (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// L'ordre des écrans est une DONNÉE, pas du JSX. La coque (ParcoursEntree) ne
// connaît que cette liste ; elle n'énumère jamais les étapes elle-même.
//
// ┌─ OÙ SE DÉCLARE UNE NOUVELLE ÉTAPE ───────────────────────────────────────┐
// │ 1. Ici, un objet de plus, à sa place dans le tableau.                    │
// │ 2. Son composant dans ECRANS (ParcoursEntree.jsx), une ligne de plus.    │
// │ 3. Ses mots dans textes.js (fr + en).                                    │
// │ Rien d'autre. Pas une ligne dans App.jsx.                                │
// └──────────────────────────────────────────────────────────────────────────┘
//
// FORME D'UNE ÉTAPE :
//   id       string          stable — clé de rendu, clé de reprise, valeur de
//                            trace analytics
//   visible  (c) => bool     défaut : toujours visible. `c` = le contexte monté
//                            une fois par la coque (useContexteEntree)
//   passable bool            défaut true — « Passer » en haut à droite
//
// ⛔ AUCUNE ÉTAPE NE BLOQUE L'ENTRÉE DANS L'APP. La seule non passable est la
//    dernière, qui EST la sortie.
// ⛔ AUCUNE LOGIQUE MÉTIER ICI : une étape LIT le contexte, elle ne calcule
//    rien, n'appelle rien.
//
// (04/11/2026, lot 3 — maquette o-parcours validée par Nico le 03/11) Quatre étapes de plus, chacune derrière SON
// interrupteur, lu dans le contexte — à 0 et Cloud fermé, la liste est celle d'avant, dans le même ordre :
//   · 'voie', 'cloud', 'cloud_connexion' : `c.cloud.parcours` (téléphone + Cloud ouvert à ce compte + essai
//     proposable, cf. regles.parcoursCloud) ; sur ordinateur, jamais ;
//   · 'free' : `c.plan` (grille à 3 jauges lue dans coin_config) ET un compte Free.
// Avec la voie Cloud choisie, l'étape extension s'efface : le choix est fait (« Je préfère utiliser mon
// ordinateur » et « Finalement, je n'ai pas d'ordinateur » passent d'une voie à l'autre).
// (11/11/2026, formules avec Cloud — textes validés par Nico, § 8.2 du plan) Quand les formules se montrent à ce compte
// (c.formules.parcours : téléphone + canal ouvert ou témoin + achat fourni par l'hôte), « As-tu un ordinateur ? »
// remplace « Comment tu veux publier ? » ; « non » mène à la présentation du Cloud, puis à « Choisis ta formule », puis
// (Premium + Cloud ou Pro + Cloud à l'essai) à « Rien à payer avant le … ». Fermé : `formules` est faux et la liste est
// celle d'avant, dans le même ordre (verrou scripts/formules-cloud-ferme-selftest.mjs).
const formules = (c) => c.formules?.parcours === true;
const voieCloudChoisie = (c) => !formules(c) && c.cloud?.parcours === true && c.voie === 'cloud';
const voieFormuleChoisie = (c) => formules(c) && c.voie === 'cloud';
// L'essai d'une formule choisie (Premium + Cloud ou Pro + Cloud) : l'écran « Rien à payer avant le … ».
const essaiFormuleChoisi = (c) => voieFormuleChoisie(c) && c.formules.choisieAvecEssai === true
  && (c.formules.choisie === 'premium_cloud' || c.formules.choisie === 'pro_cloud');

// (13/11/2026, bloc B2 de Nico — verrou scripts/entree-ordre-selftest.mjs) LA VOIE DE PUBLICATION D'ABORD.
// Mesuré sur les 119 inscrits du 08 au 13/11 : sans voie de publication (extension vue ou FillSell Cloud), AUCUN n'a
// publié (0 sur 79) ; 23 ont ouvert le consentement eBay au milieu du parcours et 12 n'y sont jamais revenus (la page
// eBay remplace l'app sur le web, le parcours se marque fini à la sortie) : ils n'ont vu ni le choix « Cloud ou
// ordinateur », ni le relevé, ni le récap. Donc :
//   · l'étape « ebay » SORT du parcours : eBay se relie APRÈS, depuis le récap (« Relier eBay » : le parcours est
//     marqué fini, PUIS la page eBay s'ouvre — entree/ebayApres.js), la carte « Tes plateformes à connecter » du
//     Tableau et Réglages › Mes plateformes. Le choix de la voie est la 2e étape pour tout le monde ;
//   · l'étape « free » (« Ton plan Free ») est FUSIONNÉE dans le récap (EtapeFin), avec toute son information.
// Un appareil arrêté sur une étape retirée reprend à l'étape qui la suivait (indexDeReprise, plus bas).
export const ETAPES = [
  { id: 'plateformes' },
  // (11/11/2026) « As-tu un ordinateur ? » — formules avec Cloud ouvertes seulement.
  { id: 'ordinateur', visible: formules },
  // (04/11) « Comment tu veux publier ? » — Cloud ou extension, rien de pré-coché.
  { id: 'voie', visible: (c) => !formules(c) && c.cloud?.parcours === true },
  // (11/11/2026) 4b : « FillSell tourne pour toi, même sans ordinateur », puis « Choisis ta formule ».
  { id: 'cloud_presentation', visible: voieFormuleChoisie },
  { id: 'cloud_offres', visible: voieFormuleChoisie },
  // (04/11) « Rien à payer avant le … » — l'essai, par le chemin d'achat existant (11/11 : ou celui d'une formule).
  { id: 'cloud', visible: (c) => voieCloudChoisie(c) || essaiFormuleChoisi(c) },
  // (04/11) « Connecte tes comptes, une fois » — seulement une fois l'option active (le serveur le dit).
  { id: 'cloud_connexion', visible: (c) => (voieCloudChoisie(c) && c.cloud.actif === true) || (voieFormuleChoisie(c) && c.formules.actif === true && c.cloud?.ouvert === true) },
  { id: 'extension', visible: (c) => !voieCloudChoisie(c) && !voieFormuleChoisie(c) },
  // Deux faces d'une même marche : on ne suppose JAMAIS que la personne a
  // déjà des annonces en ligne. « Je n'ai encore rien en ligne » (aucune
  // plateforme cochée) SAUTE le relevé — il n'aurait rien à relever.
  { id: 'releve', visible: (c) => c.choix.plateformes.length > 0 },
  { id: 'debut', visible: (c) => c.choix.plateformes.length === 0 },
  { id: 'republication' },
  // (13/11/2026) « Ton plan Free » n'est plus une étape : le récap (EtapeFin) le dit en entier, pour un compte Free
  // avec la grille ; jamais de bouton d'achat.
  // (11/11/2026) « Ta formule Pro + Cloud » — la formule prise sur cette voie, avec la grille (à la place de « Ton plan Free »).
  { id: 'formule', visible: (c) => voieFormuleChoisie(c) && c.formules.actif === true && c.plan != null && c.plan.free !== true && c.formules.choisie != null },
  // Dernière question, et seulement si personne ne nous a donné de nom.
  { id: 'pseudo', visible: (c) => c.demanderPseudo },
  { id: 'fin', passable: false },
];

export function etapesVisibles(contexte) {
  return ETAPES.filter((e) => (typeof e.visible === 'function' ? e.visible(contexte) : true));
}

// (13/11/2026) Les étapes retirées du parcours, et celle APRÈS laquelle elles se trouvaient : un appareil dont la
// position gardée (fs_entree_etape) est l'une d'elles reprend à l'étape qui suit, jamais au tout début.
export const ETAPES_RETIREES = Object.freeze({ ebay: 'plateformes', free: 'republication' });

/** L'index où reprendre `etapeId` dans `liste` : sa place, sinon (étape retirée) la suivante, sinon le début. */
export function indexDeReprise(liste, etapeId) {
  const l = Array.isArray(liste) ? liste : [];
  const i = l.findIndex((e) => e.id === etapeId);
  if (i >= 0) return i;
  const avant = ETAPES_RETIREES[etapeId];
  const j = avant ? l.findIndex((e) => e.id === avant) : -1;
  return j >= 0 ? Math.min(l.length - 1, j + 1) : 0;
}
