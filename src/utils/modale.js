import { useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// UNE MODALE OUVERTE FIGE LE FOND — ET NE SE FAIT JAMAIS RECOUVRIR
// ═══════════════════════════════════════════════════════════════════════════
// Constat Nico (08/09, Safari iOS, popup « Retirer des plateformes ») : en
// faisant défiler la popup, c'est l'APP DERRIÈRE qui bougeait. Le bouton
// « Fermer » passait hors de l'écran et il n'y avait plus aucune sortie —
// exactement la panne du 07/09, sur une modale que le lot d'alors n'avait pas
// couverte.
//
// DEUX CAUSES DISTINCTES, ET LE PATRON PARTAGÉ N'EN RÉGLAIT QU'UNE :
//
//  1. LE CHAÎNAGE DU DÉFILEMENT. Le voile a bien `overscroll-behavior:contain`,
//     mais WebKit ne l'honore de façon fiable que depuis iOS 16 — et jamais
//     quand le voile lui-même n'a rien à faire défiler. Le geste part alors
//     dans le body. Le seul verrou qui tienne sur iOS est de FIGER le body en
//     `position:fixed`, en mémorisant la position pour la rendre à la
//     fermeture. `overflow:hidden` seul ne suffit pas sur ce navigateur, c'est
//     un fait connu de WebKit.
//
//  2. LA BARRE DE NAVIGATION PASSAIT DEVANT. Le voile est à z-index 1000 et
//     `.bnav` à 50 : sur le papier, la modale gagne, et l'inspection le
//     confirme — aucun ancêtre ne crée de contexte d'empilement. Mais `.bnav`
//     porte un `backdrop-filter`, qui la place dans sa propre couche de
//     compositing ; sur WebKit, cette couche peut se retrouver AU-DESSUS,
//     indépendamment du z-index. Plutôt que de courir après les couches, on
//     retire la barre pendant qu'une modale est ouverte : elle ne sert à rien
//     à ce moment-là, et l'utilisateur la retrouve en fermant.
//
// ⛔ POURQUOI UN COMPTEUR ET PAS UN BOOLÉEN : deux modales peuvent se
// superposer (une confirmation par-dessus un formulaire). Avec un booléen, la
// fermeture de la seconde déverrouillerait le fond alors que la première est
// encore ouverte. Le compteur ne rend le fond qu'au dernier départ.
// ═══════════════════════════════════════════════════════════════════════════

let ouvertes = 0;
let positionRendue = 0;

function verrouiller() {
  ouvertes += 1;
  if (ouvertes > 1) return;
  positionRendue = window.scrollY || window.pageYOffset || 0;
  document.documentElement.classList.add('fs-modale-ouverte');
  // Le décalage compense le `position:fixed` posé par la classe : sans lui, la
  // page sauterait en haut à l'ouverture, et l'utilisateur perdrait sa place.
  document.body.style.top = `-${positionRendue}px`;
}

function deverrouiller() {
  ouvertes = Math.max(0, ouvertes - 1);
  if (ouvertes > 0) return;
  document.documentElement.classList.remove('fs-modale-ouverte');
  document.body.style.top = '';
  // Restaurée SANS animation : un défilement doux ici donnerait l'impression
  // que la page bouge toute seule après la fermeture.
  window.scrollTo(0, positionRendue);
}

/**
 * Fige le fond tant que la modale est montée, et masque la barre de
 * navigation. À appeler dans TOUTE modale plein écran — c'est le seul endroit
 * où cette règle vit.
 * @param {boolean} actif  false pour un composant monté mais fermé.
 */
export function useFondFige(actif = true) {
  useEffect(() => {
    if (!actif) return undefined;
    verrouiller();
    return deverrouiller;
  }, [actif]);
}
