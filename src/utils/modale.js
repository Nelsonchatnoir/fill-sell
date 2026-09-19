import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

// ═══════════════════════════════════════════════════════════════════════════
// ⛔ LA RÈGLE DES COUCHES — À LIRE AVANT D'EN ÉCRIRE UNE NOUVELLE (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════
// Ce fichier est importé par TOUTE couche flottante de l'app (c'est lui qui
// porte useFondFige). La règle vit donc ici, une seule fois, pour être lue par
// qui en écrit une nouvelle.
//
//   TOUTE COUCHE FLOTTANTE — modale, feuille, toast, bandeau — SE MONTE SUR
//   `document.body` PAR createPortal. Sans exception.
//
// POURQUOI, et ce n'est pas une préférence de style : l'application entière
// vit sous `.app-root`, qui rogne et défile (overflow). WebKit y peint les
// `position:fixed` DANS LA COUCHE DE CE CONTENEUR. Une couche rendue là ne
// peut donc PAS passer au-dessus d'une page elle-même portalisée sur body —
// quel que soit son z-index.
//
// CE QUE ÇA A COÛTÉ, pour que personne ne recommence : la page Réglages est un
// portail (z-index 400). « Comparer les formules » (z-index 9990), « Signaler
// un bug » (10000), le Toast de confirmation (500) et la modale de bienvenue
// après achat (10100) étaient rendus dans `.app-root` : les quatre restaient
// INVISIBLES par-dessus les Réglages. On cliquait, l'app ouvrait bien la
// couche, personne ne la voyait — et elle apparaissait en quittant la page.
// Le pire : le Toast portait « ❌ Erreur lors de la sauvegarde ». On
// enregistrait sans savoir si ça avait marché. Diagnostiqué et corrigé le
// 18/09 (portails), après avoir d'abord cherché du côté du z-index et du
// cache : les deux étaient innocents.
//
// COROLLAIRES :
//   · le z-index d'une couche ne se compare qu'aux autres couches
//     PORTALISÉES — entre une couche portalisée et une couche qui ne l'est
//     pas, le z-index ne dit rien ;
//   · un motif souvent cité, `-webkit-overflow-scrolling: touch`, N'EST PAS la
//     cause : la propriété a été retirée de WebKit avec iOS 13 (2019) et n'a
//     plus d'effet. Elle traîne encore dans App.css — inerte, non retirée
//     faute de pouvoir la tester sur Safari.
//
// LE TEST, UNE MINUTE : ouvrir la couche neuve DEPUIS LA PAGE RÉGLAGES. Si on
// ne la voit pas, elle n'est pas portalisée.
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// LES DEUX AUTRES SORTIES D'UNE COUCHE — Échap et le retour Android
// ═══════════════════════════════════════════════════════════════════════════
// Elles vivaient en copie locale dans FiltresStock.jsx. Une couche neuve les
// recopiait ou les oubliait : c'est exactement ce que ce fichier existe pour
// empêcher (cf. la règle des couches en tête). Elles vivent donc ICI, avec
// useFondFige, et toute feuille les importe.
//
// `actif` : cette couche est-elle AU PREMIER PLAN ? Une liste ouverte PAR une
// feuille passe false à la feuille — sans quoi Échap et le retour Android
// fermeraient les DEUX d'un coup (les écouteurs vivent sur `document` et sur
// le plugin : un stopPropagation ne retient pas un voisin abonné au même
// nœud).
//
// La fonction de fermeture passe par une ref : sans elle, une `onFermer`
// recréée à chaque rendu ferait se réabonner l'écouteur en boucle.

/** Échap ferme la couche. Une couche sans sortie au clavier n'est pas finie. */
export function useEchap(onFermer) {
  const ref = useRef(onFermer);
  // Dans un effet, jamais pendant le rendu (react-hooks/refs).
  useEffect(() => { ref.current = onFermer; }, [onFermer]);
  useEffect(() => {
    const surTouche = (e) => { if (e.key === 'Escape') { e.stopPropagation(); ref.current?.(); } };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, []);
}

/**
 * Le retour Android ferme la couche, il ne quitte PAS l'app.
 * Enregistrer un écouteur `backButton` DÉSACTIVE le comportement par défaut de
 * Capacitor (history.back puis sortie de l'app) tant qu'il vit : on ne
 * l'enregistre donc que pendant que la couche est ouverte. Sur le web
 * l'écouteur n'existe pas — Échap et le tap sur le fond restent les sorties.
 */
export function useRetourAndroid(onFermer) {
  const ref = useRef(onFermer);
  useEffect(() => { ref.current = onFermer; }, [onFermer]);
  useEffect(() => {
    if (!Capacitor?.isNativePlatform?.()) return undefined;
    let vivant = true;
    let abo = null;
    (async () => {
      try {
        const h = await CapacitorApp.addListener('backButton', () => { ref.current?.(); });
        if (vivant) abo = h; else h.remove();
      } catch { /* pas de plugin : les autres sorties restent */ }
    })();
    return () => { vivant = false; try { abo?.remove(); } catch { /* déjà parti */ } };
  }, []);
}
