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
export const ETAPES = [
  { id: 'plateformes' },
  // eBay n'apparaît QUE là où l'utilisateur vient de cocher eBay : c'est tout
  // le correctif du 20/09 — l'OAuth était planqué dans les Réglages et
  // personne ne le trouvait.
  { id: 'ebay', visible: (c) => c.choix.plateformes.includes('ebay') },
  { id: 'extension' },
  // Deux faces d'une même marche : on ne suppose JAMAIS que la personne a
  // déjà des annonces en ligne. « Je n'ai encore rien en ligne » (aucune
  // plateforme cochée) SAUTE le relevé — il n'aurait rien à relever.
  { id: 'releve', visible: (c) => c.choix.plateformes.length > 0 },
  { id: 'debut', visible: (c) => c.choix.plateformes.length === 0 },
  { id: 'republication' },
  // Dernière question, et seulement si personne ne nous a donné de nom.
  { id: 'pseudo', visible: (c) => c.demanderPseudo },
  { id: 'fin', passable: false },
];

export function etapesVisibles(contexte) {
  return ETAPES.filter((e) => (typeof e.visible === 'function' ? e.visible(contexte) : true));
}
