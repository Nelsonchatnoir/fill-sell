// Compatibilité catégorie × plateforme — SOURCE DE VÉRITÉ UNIQUE : les 4
// fichiers de mapping (vinted/lbc/beebs/ebayCategories.js), via leurs exports
// *CategoryStatus dérivés directement des tables. AUCUNE liste parallèle à
// maintenir ici : ajouter une catégorie dans un mapping suffit à débloquer la
// checkbox de la plateforme correspondante.
//
// Quatre états par plateforme (cf. chaque *CategoryStatus) :
//   "supported"   — au moins un chemin réel, validé contre le crawl archivé
//                   (scripts/audit-coverage.mjs --strict)
//   "unavailable" — absence CONFIRMÉE par crawl (null explicite) : l'article
//                   n'est pas vendable sur cette plateforme
//   "unmapped"    — catégorie pas encore mappée/crawlée (fréquent côté Beebs,
//                   crawl partiel) : peut-être vendable, mapping à faire
//   "prohibited"  — LEBONCOIN SEUL (2026-08-11) : la catégorie existe et
//                   l'article y entrerait, mais la plateforme INTERDIT ce
//                   produit (cosmétique consommable). Ni un trou de catalogue,
//                   ni un mapping manquant : un refus de vente, qui exige son
//                   propre message — cf. estCosmetiqueInterditeLbc.
import { vintedCategoryStatus } from "./vintedCategories";
import { lbcCategoryStatus } from "./lbcCategories";
import { beebsCategoryStatus } from "./beebsCategories";
import { ebayCategoryStatus } from "./ebayCategories";

/**
 * @param {string} icon — emoji retourné par detectObjectIcon
 * @param {{titre?: string, description?: string, type?: string}|null} article —
 *   OPTIONNEL, lu par Leboncoin SEUL (interdiction de produit, qui ne se déduit
 *   pas de l'icône). Absent = comportement d'avant 2026-08-11 à l'identique.
 *   ⚠️ Vinted, eBay et Beebs acceptent les cosmétiques : ils ne le reçoivent
 *   pas, et c'est délibéré — c'est là que ces articles doivent partir.
 * @returns {{ vinted: string, leboncoin: string, beebs: string, ebay: string }}
 *   statut ("supported" | "unavailable" | "unmapped" | "prohibited") par
 *   plateforme
 */
export function getPlatformSupport(icon, article = null) {
  return {
    vinted: vintedCategoryStatus(icon),
    leboncoin: lbcCategoryStatus(icon, article),
    beebs: beebsCategoryStatus(icon),
    ebay: ebayCategoryStatus(icon),
  };
}
