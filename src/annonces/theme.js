// ═══════════════════════════════════════════════════════════════════════════
// MES ANNONCES EN LIGNE — jetons visuels et feuille de style (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ AUCUNE PALETTE NEUVE. Tout part de `UI` (components/ui.jsx), et les
// valeurs ajoutées sont EXACTEMENT celles que portait déjà l'objet `P` de
// components/RelevesPlateformes.jsx — mêmes codes, au caractère près. Deux
// blocs du même écran n'ont pas deux ambres.
// ⛔ ANIMATIONS : transform et opacity UNIQUEMENT. Rien qui déclenche un
//    reflow (width, height, top, margin) — la constellation tourne sur des
//    téléphones d'entrée de gamme.
import { UI } from '../components/ui';

export const A = {
  ...UI,
  // Filet INTÉRIEUR, plus clair que la bordure de carte : sans lui la carte
  // se lit comme un tableau.
  borderSoft: '#EFECE3',
  texteSecondaire: '#5C6560',
  menthe: '#EFF4F2',
  mentheBord: '#D6E2DE',
  ambreFond: '#FFF6E3',
  ambreBord: '#EED9A6',
  ambreEncre: '#8A6100',
  // Les trois tons de pastille. `pipMute` n'est PAS `UI.mute` : une pastille
  // est un objet graphique (seuil 3:1), un texte gris ne l'est pas.
  pipOk: '#2F9E90',
  pipWarn: '#E0A53C',
  pipBad: '#D4544F',
  pipMute: '#B5B0A3',
  rougeTexte: '#9B5148',
};

export const DEGRADE = `linear-gradient(120deg,${A.teal},${A.tealDeep})`;

export const CSS_ANNONCES = `
@keyframes rvUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
@keyframes rvPop { 0% { transform:scale(.82); opacity:0 } 60% { transform:scale(1.06) } 100% { transform:scale(1); opacity:1 } }
/* ── L'ORBITE DE LA CONSTELLATION — UNE SEULE KEYFRAME POUR LES CINQ ────────
   Elle orbite ET redresse la tuile dans la MÊME liste de transformations : le
   dernier terme annule le premier, en permanence, sans dépendre de personne.
   L'écart entre satellites ne vient PAS d'un angle écrit dans la tuile, mais
   d'un animation-delay NÉGATIF (-k/n de la durée) : à t=0 le satellite k est
   déjà au k/n de son tour, donc à k x (360/n) degrés. Une seule keyframe, un
   seul angle de départ, zéro arithmétique par tuile.

   DEUX BUGS PAYÉS POUR EN ARRIVER LÀ, le 20/09 :
     1. anneau qui tourne + tuile qui contre-tourne = DEUX horloges. Elles ne
        s'annulaient qu'au démarrage : tous les logos penchaient un peu.
     2. une keyframe PAR satellite = une horloge par satellite. Vinted entrant
        dans la constellation après les quatre autres (son état est remonté
        par VintedDressingSync, en différé), son orbite démarrait en retard et
        elle restait décalée sur l'anneau.
   Le rayon est écrit en dur ici : c'est RAYON dans ConstellationReleve.jsx,
   les deux doivent bouger ensemble.
   ⚠️ Ce bloc vit dans un template literal : aucun accent grave ici, il
   fermerait la chaîne. */
@keyframes rvTourne {
  from { transform: rotate(0deg) translateY(-58px) rotate(0deg) }
  to   { transform: rotate(360deg) translateY(-58px) rotate(-360deg) }
}
@keyframes rvPouls { 0%,100% { transform:scale(1); opacity:.45 } 50% { transform:scale(1.18); opacity:0 } }
@keyframes rvRespire { 0%,100% { transform:scale(1) } 50% { transform:scale(1.05) } }
/* ⛔ CE BALAYAGE NE DIT PAS « ÇA AVANCE ». Il ne se rend QUE si une plateforme
   est réellement en 'running' (cf. CarteAnnoncesEnLigne) : c'est le seul
   moment où du travail a lieu pour de bon. L'avancement de la barre, lui, est
   un scaleX branché sur le NOMBRE de plateformes terminées — jamais une
   animation. */
@keyframes rvBalaye { 0% { transform:translateX(-160%) } 60%,100% { transform:translateX(320%) } }
.rv-up { animation: rvUp .38s cubic-bezier(.22,.61,.36,1) backwards }
.rv-cta { transition: transform .12s ease }
.rv-cta:active { transform: scale(.98) }
.rv-focus:focus-visible { outline: 2px solid ${A.teal}; outline-offset: 2px; border-radius: 12px }
/* Le réglage système passe avant l'effet. L'état d'arrivée est l'état par
   défaut : sans animation, l'écran reste exact et lisible. */
@media (prefers-reduced-motion: reduce) {
  .rv-up, .rv-anime, .rv-anime * { animation: none !important }
}
`;
