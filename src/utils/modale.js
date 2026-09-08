import { useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// UNE MODALE OUVERTE : LE GESTE NE VA PLUS AU FOND, ET RIEN N'EST FIGÉ
// ═══════════════════════════════════════════════════════════════════════════
// Histoire courte, parce qu'elle explique la forme du code.
//
// 1. Constat Nico (08/09, Safari iOS, « Retirer des plateformes ») : le
//    défilement faisait bouger l'APP DERRIÈRE, le bouton « Fermer » sortait de
//    l'écran, plus aucune sortie.
// 2. Premier remède, celui qu'on trouve partout : `position:fixed` sur le
//    body. INOPÉRANT ICI, et l'inspection l'a montré avant livraison — le
//    document n'est pas scrollable (770 px de contenu pour 770 px de fenêtre),
//    c'est `.wrap.page-pad` qui porte tout le défilement (2 462 px pour 667).
// 3. Deuxième remède : `overflow:hidden` sur les conteneurs qui défilent
//    vraiment. Il a levé le blocage — mais il DÉTRUIT le scrollTop, et malgré
//    un reflow forcé, deux frames et un délai, la liste revenait en haut à
//    chaque fermeture. Perdre sa place dans 350 articles à chaque popup, ce
//    n'est pas acceptable, et ce serait pire en enchaînant les popups depuis
//    les filtres. Vérifié ensuite sur iPhone : le fond défilait ENCORE.
// 4. Donc : on n'empêche plus le fond de défiler, ON EMPÊCHE LE GESTE DE
//    L'ATTEINDRE. Rien n'est figé, donc rien n'est perdu — aucune position à
//    mémoriser, aucune à restaurer, aucun problème de timing avec React.
//
// COMMENT. Un seul écouteur `touchmove` non passif sur le document, actif
// uniquement pendant qu'une modale est ouverte :
//   · geste hors de toute couche `position:fixed` (donc sur l'app derrière)
//     → preventDefault. Le fond ne bouge pas ;
//   · geste dans une modale → laissé passer, SAUF en butée : au bord haut ou
//     bas de la zone défilante, on coupe aussi. C'est là que WebKit fait
//     repartir le geste vers le parent (le « scroll chaining »), et c'est
//     précisément ce que `overscroll-behavior:contain` ne bloque pas sur les
//     iOS antérieurs à 16.
// Le pincer-zoomer (deux doigts) est laissé tranquille.
//
// ⛔ POURQUOI UN COMPTEUR ET PAS UN BOOLÉEN : deux modales peuvent se
// superposer (une confirmation par-dessus un formulaire). Avec un booléen, la
// fermeture de la seconde rendrait le fond alors que la première est ouverte.
// ═══════════════════════════════════════════════════════════════════════════

let ouvertes = 0;
let yDepart = 0;

/** La couche flottante (modale) qui contient ce nœud, s'il y en a une. */
function coucheFlottante(noeud) {
  let el = noeud instanceof Element ? noeud : noeud?.parentElement ?? null;
  while (el && el !== document.body) {
    if (getComputedStyle(el).position === 'fixed') return el;
    el = el.parentElement;
  }
  return null;
}

/** La zone qui défile réellement sous le doigt, à l'intérieur de la couche. */
function zoneDefilante(noeud, couche) {
  let el = noeud instanceof Element ? noeud : noeud?.parentElement ?? null;
  while (el) {
    const s = getComputedStyle(el);
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll')
        && el.scrollHeight > el.clientHeight + 1) return el;
    if (el === couche) return null;
    el = el.parentElement;
  }
  return null;
}

function surTouchStart(e) {
  if (e.touches.length === 1) yDepart = e.touches[0].clientY;
}

function surTouchMove(e) {
  // Deux doigts = pincer-zoomer : ça ne défile rien, on ne s'en mêle pas.
  if (e.touches.length > 1) return;
  const couche = coucheFlottante(e.target);
  if (!couche) { e.preventDefault(); return; }        // le geste visait le fond
  const zone = zoneDefilante(e.target, couche);
  if (!zone) { e.preventDefault(); return; }          // rien à faire défiler ici
  const dy = e.touches[0].clientY - yDepart;
  const enHaut = zone.scrollTop <= 0;
  const enBas = zone.scrollTop + zone.clientHeight >= zone.scrollHeight - 1;
  // En butée, laisser passer reviendrait à offrir le geste au parent : c'est
  // exactement le chaînage qu'on veut couper.
  if ((enHaut && dy > 0) || (enBas && dy < 0)) e.preventDefault();
}

function verrouiller() {
  ouvertes += 1;
  if (ouvertes > 1) return;
  document.documentElement.classList.add('fs-modale-ouverte');
  // `passive:false` est indispensable : sans lui, preventDefault est ignoré.
  document.addEventListener('touchstart', surTouchStart, { passive: true });
  document.addEventListener('touchmove', surTouchMove, { passive: false });
}

function deverrouiller() {
  ouvertes = Math.max(0, ouvertes - 1);
  if (ouvertes > 0) return;
  document.documentElement.classList.remove('fs-modale-ouverte');
  document.removeEventListener('touchstart', surTouchStart);
  document.removeEventListener('touchmove', surTouchMove);
}

/**
 * Empêche le fond de défiler tant que la modale est montée, et masque la barre
 * de navigation. À appeler dans TOUTE modale plein écran — c'est le seul
 * endroit où cette règle vit.
 * @param {boolean} actif  false pour un composant monté mais fermé.
 */
export function useFondFige(actif = true) {
  useEffect(() => {
    if (!actif) return undefined;
    verrouiller();
    return deverrouiller;
  }, [actif]);
}
