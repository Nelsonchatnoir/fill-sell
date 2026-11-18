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

// (18/11/2026, lot T1) Les animations de la refonte, partagées par l'accueil ET la carte Cloud du Stock (même dessin).
export const CSS_ANIM_ACCUEIL = `
/* (18/11/2026, lot T1 de Nico — maquettes validées) La refonte : illustrations qui vivent (téléphone → Cloud →
   plateformes, l'ordinateur qui écrit, le lien qui part par mail), la lueur qui passe sur le bouton principal,
   le changement d'écran qui glisse. Toujours transform/opacity, jamais sur un texte. */
@keyframes acFlotte { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-4px) } }
@keyframes acEcrit { 0% { transform:scaleX(.08) } 35%,100% { transform:scaleX(1) } }
@keyframes acBrille { 0% { transform:translateX(-120%) } 38%,100% { transform:translateX(330%) } }
@keyframes acGlisse { from { opacity:0; transform:translateX(26px) } to { opacity:1; transform:none } }
@keyframes acRetour { from { opacity:0; transform:translateX(-22px) } to { opacity:1; transform:none } }
@keyframes acMonte { from { transform:translateY(100%) } to { transform:none } }
@keyframes acFondu { from { opacity:0 } to { opacity:1 } }
.ac-flotte { animation: acFlotte 4.5s ease-in-out infinite; transform-box: fill-box; transform-origin: center }
.ac-flotte-l { animation: acFlotte 6s ease-in-out infinite; transform-box: fill-box }
.ac-ecrit { transform-box: fill-box; transform-origin: left center; animation: acEcrit 3.2s cubic-bezier(.22,.61,.36,1) infinite }
.ac-brille { position: relative; overflow: hidden }
.ac-brille::after { content:""; position:absolute; top:0; bottom:0; left:0; width:42%; pointer-events:none; background:linear-gradient(100deg,transparent,rgba(255,255,255,.28),transparent); transform:translateX(-120%); animation: acBrille 3.6s ease-in-out infinite 1.2s }
.ac-glisse { animation: acGlisse .42s cubic-bezier(.22,.61,.36,1) backwards }
.ac-retour { animation: acRetour .42s cubic-bezier(.22,.61,.36,1) backwards }
.ac-feuille { animation: acMonte .45s cubic-bezier(.22,.61,.36,1) both }
.ac-voile { animation: acFondu .3s ease both }
@media (prefers-reduced-motion: reduce) {
  .ac-flotte, .ac-flotte-l, .ac-ecrit, .ac-brille::after, .ac-glisse, .ac-retour, .ac-feuille, .ac-voile { animation: none !important }
}
`;

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
/* (16/10, Nico) Les éléments de chaque écran APPARAISSENT avec un léger rebond
   (« pop »), l'un après l'autre. Rien d'autre ne change : mêmes étapes, mêmes
   textes, même parcours, connexion à la même place. Entrée UNE fois par écran
   (la scène est remontée à chaque étape), transform/opacity seulement ; un
   élément qui porte déjà sa propre entrée (.en-monte) la garde. */
@keyframes enPop { 0% { opacity:0; transform:translateY(8px) scale(.94) } 60% { opacity:1; transform:translateY(0) scale(1.025) } 100% { opacity:1; transform:translateY(0) scale(1) } }
.en-scene > div:first-child > :not(.en-monte), .en-scene > :last-child:not(:first-child) { animation: enPop .5s cubic-bezier(.34,1.56,.64,1) backwards }
.en-scene > div:first-child > :nth-child(2) { animation-delay: .06s }
.en-scene > div:first-child > :nth-child(3) { animation-delay: .12s }
.en-scene > div:first-child > :nth-child(4) { animation-delay: .18s }
.en-scene > div:first-child > :nth-child(5) { animation-delay: .24s }
.en-scene > div:first-child > :nth-child(6) { animation-delay: .3s }
.en-scene > div:first-child > :nth-child(n+7) { animation-delay: .36s }
.en-scene > :last-child:not(:first-child) { animation-delay: .32s }
.en-monte { animation: enMonte .42s cubic-bezier(.22,.61,.36,1) backwards }
.en-cta { transition: transform .12s ease, box-shadow .16s ease }
.en-cta:active { transform: scale(.98) }
.en-tuile { transition: border-color .16s ease, background .16s ease, transform .12s ease }
.en-tuile:active { transform: scale(.985) }
.en-focus:focus-visible { outline: 2px solid ${E.teal}; outline-offset: 2px; border-radius: 14px }
/* ⛔ Le respect du réglage système passe avant l'effet : une personne qui a
   demandé moins d'animation n'en reçoit aucune, et le parcours reste lisible
   (les états d'arrivée sont les états par défaut). */
${CSS_ANIM_ACCUEIL}
@media (prefers-reduced-motion: reduce) {
  .en-scene, .en-scene > *, .en-scene > div:first-child > *, .en-monte, .en-anime, .en-anime * { animation: none !important }
}
`;
