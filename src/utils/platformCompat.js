// Compatibilité catégorie × plateforme — SOURCE DE VÉRITÉ UNIQUE : les 4
// fichiers de mapping (vinted/lbc/beebs/ebayCategories.js), via leurs exports
// *CategoryStatus dérivés directement des tables. AUCUNE liste parallèle à
// maintenir ici : ajouter une catégorie dans un mapping suffit à débloquer la
// checkbox de la plateforme correspondante.
//
// Trois états par plateforme (cf. chaque *CategoryStatus) :
//   "supported"   — au moins un chemin réel, validé contre le crawl archivé
//                   (scripts/audit-coverage.mjs --strict)
//   "unavailable" — absence CONFIRMÉE par crawl (null explicite) : l'article
//                   n'est pas vendable sur cette plateforme
//   "unmapped"    — catégorie pas encore mappée/crawlée (fréquent côté Beebs,
//                   crawl partiel) : peut-être vendable, mapping à faire
import { vintedCategoryStatus } from "./vintedCategories";
import { lbcCategoryStatus } from "./lbcCategories";
import { beebsCategoryStatus } from "./beebsCategories";
import { ebayCategoryStatus } from "./ebayCategories";

/**
 * @param {string} icon — emoji retourné par detectObjectIcon
 * @returns {{ vinted: string, leboncoin: string, beebs: string, ebay: string }}
 *   statut ("supported" | "unavailable" | "unmapped") par plateforme
 */
export function getPlatformSupport(icon) {
  return {
    vinted: vintedCategoryStatus(icon),
    leboncoin: lbcCategoryStatus(icon),
    beebs: beebsCategoryStatus(icon),
    ebay: ebayCategoryStatus(icon),
  };
}
