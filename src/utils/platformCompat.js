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
//   "prohibited"  — la catégorie existe et l'article y entrerait, mais la
//                   plateforme INTERDIT ce produit. Ni un trou de catalogue, ni
//                   un mapping manquant : un refus de vente, qui exige son
//                   propre message. Leboncoin (2026-08-11) : cosmétique
//                   consommable, cf. estCosmetiqueInterditeLbc. Beebs
//                   (2026-09-11) : règles du catalogue Beebs (marques Temu /
//                   Shein / Louis Vuitton / Chanel / Thermomix, sous-vêtements,
//                   électronique refusée, consommables usagés), sur source
//                   CERTAINE seulement — cf. _shared/beebs-interdits.js.
import { vintedCategoryStatus } from "./vintedCategories";
import { lbcCategoryStatus } from "./lbcCategories";
import { beebsCategoryStatus } from "./beebsCategories";
import { ebayCategoryStatus } from "./ebayCategories";
// Règles du catalogue Beebs (2026-09-11) : UN fichier, partagé avec le serveur
// (get-pending-jobs), chargé tel quel par Vite — cf. son en-tête.
import { verdictBeebsInterdit } from "../../supabase/functions/_shared/beebs-interdits.js";

/**
 * @param {string} icon — emoji retourné par detectObjectIcon
 * @param {{titre?: string, description?: string, type?: string,
 *   attributs?: object|null, vinted_catalog_id?: number|null}|null} article —
 *   OPTIONNEL. Leboncoin lit titre / type (interdiction de produit, qui ne se
 *   déduit pas de l'icône) ; Beebs lit attributs (marque et état AVEC leur
 *   source) et vinted_catalog_id — jamais le titre, jamais l'IA. Absent =
 *   comportement d'avant 2026-08-11 à l'identique. ⚠️ Vinted et eBay ne le
 *   reçoivent pas, et c'est délibéré — c'est là que ces articles doivent partir.
 * @returns {{ vinted: string, leboncoin: string, beebs: string, ebay: string }}
 *   statut ("supported" | "unavailable" | "unmapped" | "prohibited") par
 *   plateforme
 */
export function getPlatformSupport(icon, article = null) {
  return {
    vinted: vintedCategoryStatus(icon),
    leboncoin: lbcCategoryStatus(icon, article),
    // Beebs (2026-09-11) : "prohibited" quand une source CERTAINE (marque ou
    // état relevés sur Vinted, catalogue Vinted) tombe sous les règles du
    // catalogue Beebs — jamais le titre, jamais l'IA ; doute = statut d'avant.
    beebs: article && verdictBeebsInterdit(article) ? "prohibited" : beebsCategoryStatus(icon),
    ebay: ebayCategoryStatus(icon),
  };
}
