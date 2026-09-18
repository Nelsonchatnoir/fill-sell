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
  chevron: '#8A8578',       // = UI.mute : 3,67:1 sur blanc, seuil des GRAPHIQUES
  deep: '#1C4038',
  deepBas: '#0D1F1A',
  or: '#E7B84C',
  menthe: '#EFF4F2',
  mentheBord: '#D6E2DE',
  dangerBord: '#EBD5D3',
  dangerDoux: '#F4E6E4',

  // ── CONTRASTE : TOUT TEXTE PASSE 4,5:1, SUR LES DEUX FONDS ────────────────
  // La page a DEUX fonds : le papier de la page (#EDEAE0) sous les intitulés
  // de groupe, les notes et le pied, et le blanc des cartes sous les lignes.
  // Les gris de UI ne tiennent pas sur le premier — mesuré :
  //     UI.mute  #8A8578 → 3,06:1 sur #EDEAE0   ✗   (intitulés, pied de page)
  //     UI.mute2 #6B7A75 → 3,76:1 sur #EDEAE0   ✗
  //     #5C6560          → 4,94:1 sur #EDEAE0, 5,93:1 sur blanc   ✓
  // #5C6560 vit DÉJÀ dans l'app (PlanDetailsModal, ListingPreviewScreen) : on
  // ne crée pas un gris de plus, on prend celui qui passe.
  texteSecondaire: '#5C6560',
  // Idem pour le rouge : UI.negative plafonne à 4,36:1 sur blanc et 3,62:1 sur
  // le papier de la page — sous le seuil dans les deux cas. Assombri pour le
  // TEXTE seulement : 5,73:1 sur blanc, 4,76:1 sur la page, 5,25:1 sur paper.
  // Les BORDURES et les APLATS gardent UI.negative — un trait n'a pas à
  // passer le seuil du texte, et la teinte de la marque ne bouge pas.
  negatifTexte: '#9B5148',
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
/* ⛔ LE CORPS DÉFILE, IL NE COMPRIME PAS (défaut du 18/09, capture Nico).
   Le corps est une colonne flex ET la zone de défilement. Or dans une colonne
   flex, les enfants ont flex-shrink:1 par défaut : dès que le contenu dépasse
   la hauteur de l'écran, le navigateur les ÉCRASE au lieu de laisser défiler.
   Résultat vu en prod : la carte d'identité rabotée en hauteur, l'avatar qui
   déborde de son cadre et l'e-mail coupé EN DEUX dans l'épaisseur des lettres.
   Une carte doit s'adapter à son contenu, jamais l'inverse. */
.rg-corps > * { flex-shrink: 0 }
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
