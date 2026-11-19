// ═══════════════════════════════════════════════════════════════════════════
// LE POIDS ESTIMÉ DE LA COPIE, AU SERVICE (19/11/2026 soir, décision de Nico « zéro friction », client Business)
// ═══════════════════════════════════════════════════════════════════════════
// L'app pose, sur une copie Beebs ou Leboncoin dont la FICHE n'a pas de poids, platform_fields.poids_estime =
// { g, objet, source } (jamais inventaire.poids_g). Au service, la fiche passe toujours devant ; sans elle, ce poids
// estimé donne le palier Beebs « Poids jusqu'à … » (get-pending-jobs) et, pour Leboncoin, le format, la tranche PRO et
// les transporteurs (colisLbcAuService). Borné : 1 g à 30 kg (au-delà, aucun palier : rien d'inventé). Pur.
// Verrou : scripts/poids-estime-service-1911-selftest.mjs.
export const SOURCE_POIDS_ESTIME = "poids_estime";
const POIDS_ESTIME_MAX_G = 30000;

/** Le poids estimé porté par la copie (grammes entiers), ou null. */
export function poidsEstimeDeLaCopie(pf) {
  const brut = pf && typeof pf === "object" && pf.poids_estime && typeof pf.poids_estime === "object" ? pf.poids_estime.g : null;
  if (brut == null || brut === "") return null;
  const g = Math.round(Number(brut));
  return Number.isFinite(g) && g >= 1 && g <= POIDS_ESTIME_MAX_G ? g : null;
}

/** Beebs : le poids qui donne le palier — la fiche, sinon le poids estimé de la copie ; { g, source } ou null. */
export function poidsBeebsAuService(poidsFiche, pf) {
  const f = Math.round(Number(poidsFiche));
  if (poidsFiche != null && poidsFiche !== "" && Number.isFinite(f) && f >= 1) return { g: f, source: "fiche" };
  const e = poidsEstimeDeLaCopie(pf);
  return e != null ? { g: e, source: SOURCE_POIDS_ESTIME } : null;
}
