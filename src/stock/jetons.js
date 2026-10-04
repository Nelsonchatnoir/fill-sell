// ═══════════════════════════════════════════════════════════════════════════
// STOCK — LES JETONS DE LA REFONTE (03/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ AUCUNE PALETTE NEUVE. Chaque valeur de la planche (NOTES.md § 1) est
//    DÉJÀ un jeton de l'app : UI (components/ui.jsx), A (annonces/theme.js)
//    ou le fond de page --bg (App.redesign.css). On les nomme ici une fois,
//    sous le nom que leur donne la planche, et on ne recopie aucun code
//    couleur ailleurs dans src/stock/.
// ⛔ L'IDENTITÉ EST FIGÉE : Space Grotesk, ces couleurs, ces rayons, le badge
//    Pro de PlanBadge.jsx et la barre d'onglets d'App.jsx — inchangés.
import { UI } from '../components/ui';
import { A } from '../annonces/theme';

export const S = {
  page: '#FAFBFB',            // = --bg (App.redesign.css)
  card: UI.card,
  border: UI.border,          // #E7E3D8
  borderSoft: A.borderSoft,   // #EFECE3 — séparateurs
  paper: UI.paper,            // #F6F5F1 — pastilles de plateforme au repos
  sheet: UI.canvas,           // #EDEAE0 — fond des feuilles, rail Cartes/Liste
  disabled: UI.chip,          // #F2F0E9 — bouton désactivé, rail de progression
  ink: UI.ink,                // #10201B
  ink2: A.texteSecondaire,    // #5C6560 — 4,9:1 sur le fond des feuilles
  chevron: UI.mute,           // #8A8578
  placeholder: UI.mute2,      // #6B7A75
  teal: UI.teal,              // #2F9E90
  tealDeep: UI.tealDeep,      // #1B6E62
  menthe: A.menthe,           // #EFF4F2
  mentheBord: A.mentheBord,   // #D6E2DE
  ambreFond: A.ambreFond,     // #FFF6E3
  ambreBord: A.ambreBord,     // #EED9A6
  ambreEncre: A.ambreEncre,   // #8A6100
  ambrePoint: A.pipWarn,      // #E0A53C
  horsPoint: A.pipMute,       // #B5B0A3
  // Rouge : celui des pastilles d'échec existantes de la carte (StockTab) —
  // réservé aux échecs RÉELS, jamais à un geste attendu (règle du 03/09).
  rouge: '#B91C1C',
  rougeFond: '#FEF2F2',
  rougeBord: '#FECACA',
  switchOff: '#D8D2C4',
  poignee: '#D8D2C4',
  voile: 'rgba(16,32,27,0.45)',
  orBord: 'rgba(214,178,96,0.55)',   // le liseré doré du badge Pro (PlanBadge)
  selection: UI.ink,          // pastille active, choix du panneau
};

export const DEGRADE = `linear-gradient(120deg,${UI.teal},${UI.tealDeep})`;
export const DEGRADE_TUILE = `linear-gradient(140deg,${UI.teal},${UI.tealDeep})`;

export const OMBRE = {
  carte: '0 1px 3px rgba(16,32,27,0.04)',
  synchro: '0 1px 4px rgba(16,32,27,0.05)',
  primaire: '0 10px 20px -12px rgba(47,158,144,0.9)',
  tuile: '0 12px 24px -14px rgba(27,110,98,0.75)',
  feuille: '0 -8px 40px rgba(16,32,27,0.22)',
  pastille: '0 1px 5px rgba(16,32,27,0.22)',
  segment: '0 2px 6px -2px rgba(16,32,27,0.18)',
  bouton: '0 1px 4px rgba(16,32,27,0.18)',
};

// Pastilles d'état : point + encre, par ton (regles.pastilleCourte).
export const TONS = {
  ok: { point: UI.teal, encre: UI.ink },
  regler: { point: A.pipWarn, encre: A.ambreEncre },
  echec: { point: '#B91C1C', encre: '#B91C1C' },
  neutre: { point: '#8A938F', encre: '#5A6B66' },
  hors: { point: A.pipMute, encre: A.texteSecondaire },
};

// Couches : celles de FiltresStock (600/620), sous la modale de conversion
// (9990) — une feuille qui ouvre l'offre ne doit jamais l'enterrer.
export const Z = { feuille: 600, ecran: 605, dessus: 620 };
