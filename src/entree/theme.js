// ═══════════════════════════════════════════════════════════════════════════
// PARCOURS D'ENTRÉE — jetons visuels et feuille de style (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ AUCUN THÈME NEUF. Tout part de `UI` (components/ui.jsx). Les valeurs
// ajoutées sont EXACTEMENT celles de reglages/theme.js — mêmes noms, mêmes
// codes : deux pages de la même app n'ont pas deux gris secondaires.
//   · texteSecondaire #5C6560 — 4,94:1 sur le canvas #EDEAE0, 5,93:1 sur blanc
//   · negatifTexte    #9B5148 — 5,73:1 sur blanc, 4,76:1 sur le canvas
// ⛔ ANIMATIONS : transform et opacity UNIQUEMENT. Aucune propriété qui
//    déclenche un reflow (width, height, top, margin) — le parcours tourne sur
//    des téléphones d'entrée de gamme.
import { UI } from '../components/ui';

export const E = {
  ...UI,
  page: UI.canvas,
  ligneDouce: '#EFEDE5',
  menthe: '#EFF4F2',
  mentheBord: '#D6E2DE',
  mentheVive: '#F0FDFB',
  texteSecondaire: '#5C6560',
  negatifTexte: '#9B5148',
  piste: '#DCD6C6',
};

export const DEGRADE = `linear-gradient(120deg,${E.teal},${E.tealDeep})`;
export const OMBRE_CTA = '0 12px 26px -12px rgba(47,158,144,0.75)';

// Hauteur tactile minimale — jamais moins, sur rien de cliquable.
export const TACTILE = 44;

export const CSS_ENTREE = `
@keyframes enScene { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
@keyframes enMonte { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
@keyframes enPouls { 0%,100% { transform:scale(1); opacity:1 } 50% { transform:scale(1.55); opacity:.35 } }
@keyframes enFlux { 0% { transform:translateX(0); opacity:0 } 12% { opacity:1 } 88% { opacity:1 } 100% { transform:translateX(96px); opacity:0 } }
@keyframes enAllume { 0%,70%,100% { opacity:.34; transform:translateY(0) } 12%,52% { opacity:1; transform:translateY(-3px) } }
@keyframes enTourne { to { transform:rotate(360deg) } }
/* ⛔ Une ligne QUI PORTE DE L'INFORMATION ne cycle jamais en opacité : elle
   entre une fois et reste à 1. Un texte qui pulse repasse en permanence sous
   le seuil de contraste 4,5:1. Le cycle est réservé au décoratif (enAllume,
   sur des logos, jamais sur du texte). */
@keyframes enRemonte { from { transform:translateY(26px); opacity:0 } to { transform:translateY(0); opacity:1 } }
@keyframes enRespire { 0%,100% { transform:scale(1) } 50% { transform:scale(1.04) } }
/* Le tuto « du téléphone à l'ordinateur » : la fiche qui voyage, les lignes
   qui s'écrivent, la validation. Transform/opacity uniquement, et RIEN de
   tout ça sur un texte — seuls des éléments décoratifs bougent. */
@keyframes enFluxCarte { 0% { transform:translateX(0) scale(.85); opacity:0 } 14% { opacity:1; transform:translateX(12px) scale(1) } 82% { opacity:1 } 100% { transform:translateX(92px) scale(.85); opacity:0 } }
@keyframes enEcrit { 0% { transform:scaleX(0) } 35%,100% { transform:scaleX(1) } }
/* enValide : entrée UNE passe, se fige à opacité 1. Jamais en boucle — un
   élément qui porte l'information ne repasse pas par l'invisible. */
@keyframes enValide { from { transform:scale(.4); opacity:0 } to { transform:scale(1); opacity:1 } }
@keyframes enObturateur { 0%,100% { transform:scale(1) } 45% { transform:scale(.72) } }
/* Halo de la coche : il RESTE dans l'écran du portable. Plafonné à 1,15 et
   posé à inset:0 — à inset:-4px avec le pouls à 1,55 il mordait sur les deux
   traits de l'écran et dépassait du cadre. */
@keyframes enHalo { 0%,100% { transform:scale(1); opacity:.5 } 50% { transform:scale(1.15); opacity:0 } }
/* Relevé : le balayage sur la vignette (une photo qui se charge) et la ligne
   de scan qui descend sur la carte. Republication : l'annonce qui remonte au
   premier rang. Récap : l'onde autour de la coche. Tout en transform/opacity,
   et jamais sur un texte. */
@keyframes enBalaye { 0% { transform:translateX(-140%) } 55%,100% { transform:translateX(260%) } }
@keyframes enScanne { 0% { transform:translateY(0); opacity:0 } 8% { opacity:.9 } 88% { opacity:.9 } 100% { transform:translateY(212px); opacity:0 } }
@keyframes enRangMonte { 0% { transform:translateY(66px); opacity:0 } 12% { opacity:1 } 58% { transform:translateY(0) } 90% { transform:translateY(0); opacity:1 } 100% { transform:translateY(0); opacity:0 } }
@keyframes enOnde { from { transform:scale(1); opacity:.4 } to { transform:scale(1.6); opacity:0 } }
.en-scene { animation: enScene .38s cubic-bezier(.22,.61,.36,1) }
.en-monte { animation: enMonte .42s cubic-bezier(.22,.61,.36,1) backwards }
.en-cta { transition: transform .12s ease, box-shadow .16s ease }
.en-cta:active { transform: scale(.98) }
.en-tuile { transition: border-color .16s ease, background .16s ease, transform .12s ease }
.en-tuile:active { transform: scale(.985) }
.en-focus:focus-visible { outline: 2px solid ${E.teal}; outline-offset: 2px; border-radius: 14px }
/* ⛔ Le respect du réglage système passe avant l'effet : une personne qui a
   demandé moins d'animation n'en reçoit aucune, et le parcours reste lisible
   (les états d'arrivée sont les états par défaut). */
@media (prefers-reduced-motion: reduce) {
  .en-scene, .en-monte, .en-anime, .en-anime * { animation: none !important }
}
`;
