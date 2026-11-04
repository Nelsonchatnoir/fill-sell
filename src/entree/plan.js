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
const voieCloudChoisie = (c) => c.cloud?.parcours === true && c.voie === 'cloud';

export const ETAPES = [
  { id: 'plateformes' },
  // eBay n'apparaît QUE là où l'utilisateur vient de cocher eBay : c'est tout
  // le correctif du 20/09 — l'OAuth était planqué dans les Réglages et
  // personne ne le trouvait.
  { id: 'ebay', visible: (c) => c.choix.plateformes.includes('ebay') },
  // (04/11) « Comment tu veux publier ? » — Cloud ou extension, rien de pré-coché.
  { id: 'voie', visible: (c) => c.cloud?.parcours === true },
  // (04/11) « Rien à payer avant le … » — l'essai, par le chemin d'achat existant.
  { id: 'cloud', visible: voieCloudChoisie },
  // (04/11) « Connecte tes comptes, une fois » — seulement une fois l'option active (le serveur le dit).
  { id: 'cloud_connexion', visible: (c) => voieCloudChoisie(c) && c.cloud.actif === true },
  { id: 'extension', visible: (c) => !voieCloudChoisie(c) },
  // Deux faces d'une même marche : on ne suppose JAMAIS que la personne a
  // déjà des annonces en ligne. « Je n'ai encore rien en ligne » (aucune
  // plateforme cochée) SAUTE le relevé — il n'aurait rien à relever.
  { id: 'releve', visible: (c) => c.choix.plateformes.length > 0 },
  { id: 'debut', visible: (c) => c.choix.plateformes.length === 0 },
  { id: 'republication' },
  // (04/11) « Ton plan Free » — avec la grille, pour un compte Free ; jamais de bouton d'achat.
  { id: 'free', visible: (c) => c.plan?.free === true },
  // Dernière question, et seulement si personne ne nous a donné de nom.
  { id: 'pseudo', visible: (c) => c.demanderPseudo },
  { id: 'fin', passable: false },
];

export function etapesVisibles(contexte) {
  return ETAPES.filter((e) => (typeof e.visible === 'function' ? e.visible(contexte) : true));
}
