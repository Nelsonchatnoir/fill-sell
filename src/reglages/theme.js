// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES — jetons visuels et feuille de style de la page (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ AUCUN THÈME NEUF. Tout part de `UI` (src/components/ui.jsx), la source de
// vérité visuelle de l'app. Les cinq valeurs ajoutées ici sont des tons de
// STRUCTURE que la maquette demande et que `UI` ne portait pas encore :
//   · ligneDouce  — séparateur INTÉRIEUR d'une carte (plus clair que la
//                   bordure de carte, sinon la carte se lit comme un tableau) ;
//   · chevron     — le gris des chevrons, volontairement plus pâle que mute ;
//   · deep / or   — le vert profond et l'or de la pastille Pro
//                   (PlanBadge.jsx : #1C4038→#0D1F1A, #E7B84C). Même matière,
//                   pas une seconde palette dorée ;
//   · menthe*     — le fond des bandes d'information (teal à 6 %).
// Tout le reste (encre, papier, bordure, teal, ambre, négatif) vient de UI.
import { UI } from '../components/ui';

export const R = {
  ...UI,
  page: UI.canvas,          // fond de la page plein écran
  ligneDouce: '#EFEDE5',
  chevron: '#B3BAB4',
  deep: '#1C4038',
  deepBas: '#0D1F1A',
  or: '#E7B84C',
  menthe: '#EFF4F2',
  mentheBord: '#D6E2DE',
  dangerBord: '#EBD5D3',
  dangerDoux: '#F4E6E4',
};

// Hauteur minimale d'une ligne cliquable. 56 px de ligne, 44 px de zone
// tactile garantie par le padding — jamais moins (garde-fou accessibilité).
export const HAUTEUR_LIGNE = 56;

// ── Feuille de style, posée UNE FOIS par l'écran ───────────────────────────
// Ce qui ne s'écrit pas en style inline vit ici : `:last-child` (le séparateur
// que la dernière ligne d'une carte ne doit pas porter), `:active`, `:hover`,
// `:focus-visible` (la page doit se parcourir au clavier), et l'animation
// d'entrée. Rien d'autre — pas de couleur en dur, elles sont interpolées
// depuis R au moment de l'injection.
export const CSS_REGLAGES = `
@keyframes rgEntree { from { opacity: 0 } to { opacity: 1 } }
@keyframes rgGlisse { from { opacity: 0; transform: translateX(18px) } to { opacity: 1; transform: translateX(0) } }
.rg-ecran { animation: rgEntree .16s ease }
.rg-pile { animation: rgGlisse .18s cubic-bezier(.22,.61,.36,1) }
.rg-ligne {
  display: flex; align-items: center; gap: 12px;
  min-height: ${HAUTEUR_LIGNE}px; padding: 12px 16px;
  border-bottom: 1px solid ${R.ligneDouce};
  background: transparent; border-left: none; border-right: none; border-top: none;
  width: 100%; box-sizing: border-box; text-align: left;
  font-family: inherit; color: ${R.ink}; text-decoration: none;
  transition: background .14s ease;
}
.rg-ligne:last-child { border-bottom: none }
.rg-ligne[data-cliquable="1"] { cursor: pointer }
.rg-ligne[data-cliquable="1"]:hover { background: ${R.paper} }
.rg-ligne[data-cliquable="1"]:active { background: ${R.chip} }
.rg-ligne:focus-visible, .rg-focus:focus-visible {
  outline: 2px solid ${R.teal}; outline-offset: -2px; border-radius: 12px;
}
.rg-retour:active { transform: scale(.94) }
`;
