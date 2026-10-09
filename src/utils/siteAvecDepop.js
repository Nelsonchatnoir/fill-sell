// ═══════════════════════════════════════════════════════════════════════════
// SITE EN LIGNE : DEPOP À LA PLACE D'OPLA, TOUT SEUL À MINUIT (09/10 soir, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// La landing et la page /extension sont rendues dans le navigateur : à
// l'instant de la sortie d'Opla (coin_config `opla_sortie_le`, même règle que
// _shared/opla-sortie.js — 0 = désactivée, absente = le 10/10/2026 00:00 Paris),
// chaque liste de plateformes du site nomme Depop, sans déploiement ni geste.
// Opla n'y figure plus depuis le 02/10 (afbe480) : Depop prend la place qu'elle
// tenait. Testé à horloge simulée : scripts/bascule-opla-depop-selftest.mjs.
import { useEffect, useState } from 'react';
import { debutSortieOpla } from '../../supabase/functions/_shared/opla-sortie.js';

// Les listes du site, telles qu'elles sont écrites (FR puis EN). L'ordre
// compte : la liste longue avant la courte qu'elle contient.
const REMPLACEMENTS = [
  ['Vinted, Leboncoin, eBay et Beebs', 'Vinted, Leboncoin, eBay, Beebs et Depop'],
  ['Vinted, Leboncoin, eBay ou Beebs', 'Vinted, Leboncoin, eBay, Beebs ou Depop'],
  ['Vinted, Leboncoin, eBay & Beebs', 'Vinted, Leboncoin, eBay, Beebs & Depop'],
  ['Vinted, Leboncoin, eBay and Beebs', 'Vinted, Leboncoin, eBay, Beebs and Depop'],
  ['Vinted, Leboncoin, eBay or Beebs', 'Vinted, Leboncoin, eBay, Beebs or Depop'],
  ['Vinted, Leboncoin, eBay, Beebs', 'Vinted, Leboncoin, eBay, Beebs, Depop'],
  ['Vinted, Leboncoin, Beebs et eBay', 'Vinted, Leboncoin, Beebs, eBay et Depop'],
  ['Vinted, Leboncoin, Beebs and eBay', 'Vinted, Leboncoin, Beebs, eBay and Depop'],
  ['Vinted, Leboncoin et Beebs', 'Vinted, Leboncoin, Beebs et Depop'],
  ['Vinted, Leboncoin and Beebs', 'Vinted, Leboncoin, Beebs and Depop'],
  ['Leboncoin ou Beebs', 'Leboncoin, Beebs ou Depop'],
  ['Leboncoin or Beebs', 'Leboncoin, Beebs or Depop'],
];

/** Le texte du site, avec Depop dans ses listes de plateformes. */
export function avecDepop(texte) {
  if (typeof texte !== 'string' || texte.includes('Depop')) return texte;
  for (const [avant, apres] of REMPLACEMENTS) {
    if (texte.includes(avant)) return texte.split(avant).join(apres);
  }
  return texte;
}

/** La bascule du site a-t-elle eu lieu à `maintenant` (ms) ? */
export function siteBascule(maintenant, interrupteur) {
  const debut = debutSortieOpla(interrupteur);
  return debut != null && maintenant >= debut;
}

/**
 * Le site bascule-t-il MAINTENANT ? `interrupteur` = la valeur lue dans
 * coin_config (null tant qu'elle n'est pas lue : la date par défaut). Aucune
 * relecture : un seul minuteur posé sur l'instant de la bascule.
 */
export function useSiteBascule(interrupteur) {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const debut = debutSortieOpla(interrupteur);
    if (debut == null) return undefined;
    const reste = debut - Date.now();
    if (reste <= 0) { setMaintenant(Date.now()); return undefined; }
    // setTimeout plafonne à ~24,8 jours : au-delà, la page sera rechargée bien avant.
    if (reste > 2 ** 31 - 1) return undefined;
    const t = setTimeout(() => setMaintenant(Date.now()), reste + 50);
    return () => clearTimeout(t);
  }, [interrupteur]);
  return siteBascule(maintenant, interrupteur);
}
