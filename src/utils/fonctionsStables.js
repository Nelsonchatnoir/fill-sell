// ═══════════════════════════════════════════════════════════════════════════
// DES GESTES À IDENTITÉ STABLE POUR UN ÉCRAN MÉMORISÉ (31/10, fiche lente sur téléphone)
// ═══════════════════════════════════════════════════════════════════════════
// App.jsx recrée ses fonctions (addItem, delItem, markSold…) à CHAQUE rendu. Passées telles quelles au Stock
// (memo), elles le faisaient redessiner en entier à chaque rendu d'App : ouvrir la fiche d'un article, y taper une
// lettre. Mesuré sur le banc (2 900 articles, CPU d'un téléphone ×4) : l'essentiel du délai d'ouverture de la fiche.
//
// LA RÈGLE : chaque fonction reçoit un relais d'identité FIXE qui appelle toujours la DERNIÈRE version validée
// (posée dans un effet de mise en page, avant que le navigateur rende la main : aucun geste ne peut arriver entre
// les deux). Rien ne change dans ce que fait le geste ; seul le rendu inutile disparaît.
// ⛔ Seulement pour des GESTES (appelés sur un toucher, un effet, un envoi) — jamais pour une fonction appelée PENDANT
//    le rendu de l'écran qui la reçoit pour dessiner quelque chose (un rendu sauté la laisserait périmée) : celles-là
//    passent par un contexte (ex. src/stock/renduVivant.js).
// ⛔ Toutes les valeurs passées sont des FONCTIONS (un relais existe toujours : un test « la prop existe-t-elle ? »
//    répondrait oui) ; une clé ajoutée ou retirée recrée l'ensemble des relais.
import { useLayoutEffect, useMemo, useRef } from 'react';

export function useFonctionsStables(fonctions) {
  const derniere = useRef(fonctions);
  useLayoutEffect(() => { derniere.current = fonctions; });
  const cles = Object.keys(fonctions).sort().join('\u0001');
  return useMemo(() => {
    const out = {};
    for (const k of cles.split('\u0001').filter(Boolean)) {
      out[k] = (...a) => {
        const g = derniere.current[k];
        return typeof g === 'function' ? g(...a) : undefined;
      };
    }
    return out;
  }, [cles]);
}
