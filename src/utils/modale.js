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
// ⛔ CE QUI FAIT ÉCHOUER LE CORRECTIF « ÉVIDENT », ET QUE SEULE L'INSPECTION
// RÉVÈLE : dans cette app, LE BODY NE DÉFILE PAS. Mesuré en production —
// `document.documentElement.scrollHeight` (770) est égal à la hauteur de la
// fenêtre, tandis que `.wrap.page-pad` porte 2 462 px de contenu pour 667 px
// de haut. Tout le défilement de l'app vit donc dans ce conteneur.
// Conséquence : `overflow:hidden` sur le body, ou `position:fixed` dessus — le
// remède qu'on trouve partout et que j'avais écrit d'abord — n'a AUCUN effet
// ici. Le geste continue de partir dans le conteneur. Il faut figer
// L'ÉLÉMENT QUI DÉFILE VRAIMENT, et lui rendre sa position ensuite.
//
// La seconde cause est ailleurs : LA BARRE DE NAVIGATION PASSAIT DEVANT. Le
// voile est à z-index 1000 et `.bnav` à 50 ; l'inspection confirme qu'aucun
// ancêtre ne crée de contexte d'empilement, donc sur le papier la modale
// gagne. Mais `.bnav` porte un `backdrop-filter`, qui la place dans sa propre
// couche de compositing — que WebKit peut placer au-dessus, quel que soit le
// z-index. Plutôt que de courir après les couches, on retire la barre pendant
// qu'une modale est ouverte : elle ne sert à rien à ce moment-là.
//
// ⛔ POURQUOI UN COMPTEUR ET PAS UN BOOLÉEN : deux modales peuvent se
// superposer (une confirmation par-dessus un formulaire). Avec un booléen, la
// fermeture de la seconde rendrait le fond alors que la première est encore
// ouverte. Le compteur ne le rend qu'au dernier départ.
// ═══════════════════════════════════════════════════════════════════════════

let ouvertes = 0;
let figes = [];

// Les conteneurs qui portent réellement le défilement, au moment où la modale
// s'ouvre. On les cherche au lieu de coder un sélecteur en dur : la classe du
// conteneur principal peut changer, la propriété qui le rend scrollable, non.
function conteneursQuiDefilent() {
  const out = [];
  const racine = document.body;
  if (!racine) return out;
  for (const el of racine.querySelectorAll('*')) {
    // Un voile de modale défile légitimement — c'est même le but. On ne fige
    // que ce qui est SOUS la modale.
    if (getComputedStyle(el).position === 'fixed') continue;
    const s = getComputedStyle(el);
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll')
        && el.scrollHeight > el.clientHeight + 8) out.push(el);
  }
  return out;
}

function verrouiller() {
  ouvertes += 1;
  if (ouvertes > 1) return;
  document.documentElement.classList.add('fs-modale-ouverte');
  // Mémoriser la position AVANT de couper l'overflow : le navigateur remet
  // scrollTop à zéro dès qu'un conteneur ne peut plus défiler, et l'utilisateur
  // retrouverait le haut de son stock en fermant la modale.
  figes = conteneursQuiDefilent().map((el) => ({
    el, scrollTop: el.scrollTop, overflow: el.style.overflow,
  }));
  for (const f of figes) f.el.style.overflow = 'hidden';
}

function deverrouiller() {
  ouvertes = Math.max(0, ouvertes - 1);
  if (ouvertes > 0) return;
  document.documentElement.classList.remove('fs-modale-ouverte');
  const aRendre = figes;
  figes = [];
  for (const f of aRendre) {
    f.el.style.overflow = f.overflow;
    // ⚠️ FORCER LE RECALCUL AVANT DE RENDRE LA POSITION. Mesuré : sans cette
    // ligne, le conteneur revenait à 0 au lieu de 600. `overflow:hidden` lui
    // fait perdre son scrollTop tout de suite ; à la réouverture du flux, le
    // navigateur n'a pas encore refait la mise en page, donc l'assignation
    // tombe sur un élément qui « ne peut pas défiler » et elle est ignorée.
    // Lire offsetHeight force le reflow et rend l'assignation effective.
    void f.el.offsetHeight;
    f.el.scrollTop = f.scrollTop;
  }
  // Ceinture : si un re-rendu de React repasse derrière nous à la fermeture
  // (la liste se reconstruit quand la modale se démonte), on repose la
  // position à la frame suivante. Sans animation — un défilement doux ici
  // donnerait l'impression que la page bouge toute seule.
  if (aRendre.length && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      for (const f of aRendre) {
        if (f.el.isConnected && f.el.scrollTop !== f.scrollTop) f.el.scrollTop = f.scrollTop;
      }
    });
  }
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
