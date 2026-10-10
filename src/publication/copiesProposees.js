// ═══════════════════════════════════════════════════════════════════════════
// LES COPIES D'UNE PLATEFORME QUI N'EST PLUS PROPOSÉE NE S'AFFICHENT PAS
// (10/10/2026, Nico : « On ne peut plus publier sur Opla »)
// ═══════════════════════════════════════════════════════════════════════════
// Depuis la sortie d'Opla (10/10 00:00), Opla n'est plus proposée : ni cochée,
// ni dans « Où publier ? ». Mais une fiche rédigée AVANT gardait sa copie Opla
// (fiches_annonce), et l'écran « Confirmer » — comme la rangée de cases et les
// phrases de verrou de l'étape 2 — listait TOUTE plateforme qui a une copie :
// Opla réapparaissait, « Non cochée — appuie pour l'ajouter ».
// Une seule porte, dans le moteur : les copies des plateformes « à venir »
// (Opla, Depop) ne passent que si le compte les VOIT (plateformesVisibles,
// calculé par App.jsx à l'horloge de la bascule). Les quatre plateformes
// ouvertes à tous passent toujours. La copie reste dans l'état brut : rien
// n'est effacé, elle redevient visible si la plateforme est rouverte.
// Module pur (aucune lecture), chargé tel quel par son selftest.
import { PLATEFORMES_STOCK_A_VENIR } from "../utils/stockFiltres.js";

/**
 * @param listings  { platforms: { [plateforme]: copie }, ... } ou null
 * @param plateformesVisibles  plateformes « à venir » que le compte voit
 * @returns le même objet si rien n'est à retirer (aucun rendu de plus), sinon une copie filtrée
 */
export function copiesProposees(listings, plateformesVisibles = [], aVenir = PLATEFORMES_STOCK_A_VENIR) {
  const pf = listings?.platforms;
  if (!pf || typeof pf !== "object") return listings;
  const visibles = Array.isArray(plateformesVisibles) ? plateformesVisibles : [];
  const garder = (p) => !aVenir.includes(p) || visibles.includes(p);
  const cles = Object.keys(pf);
  if (cles.every(garder)) return listings;
  return { ...listings, platforms: Object.fromEntries(cles.filter(garder).map((p) => [p, pf[p]])) };
}
