// ══════════════════════════════════════════════════════════════════════════
// UN VÊTEMENT TRADITIONNEL NE PART JAMAIS EN « COSTUMES » (24/10, décision 6 de Nico)
// ══════════════════════════════════════════════════════════════════════════
// La règle de l'app (src/utils/vetementTraditionnel.js, 23/10) ne jouait qu'à l'écran Publier : une copie d'avant le
// 23/10, une relance, une remise en vente, le catalogue Vinted ou une suggestion d'eBay pouvaient encore ranger une
// djellaba en Déguisements › Costumes (Sébastien, 3001, « catalog_vinted »). Le serveur eBay (resoudreCategorie :
// publication, rayon aveugle, rangement d'une annonce en ligne) la joue désormais lui-même, avant toute suggestion
// d'eBay : un vêtement que la règle reconnaît (mots sûrs, une seule région ; jamais une poupée, un tissu, un kimono de
// judo) part dans SA feuille « Vêtements traditionnels, du monde ».
// Jamais touchés : le rayon choisi par la personne (categorie_source « choix_humain ») et un rayon déjà dans cette
// branche. Pur (Deno + Node) : scripts/ebay-rayon-traditionnel-selftest.mjs.
import { vetementTraditionnel, FEUILLES_EBAY_TRADITIONNELLES } from "../../../src/utils/vetementTraditionnel.js";

export const IDS_TRADITIONNELS = new Set(Object.values(FEUILLES_EBAY_TRADITIONNELLES).map((f) => f.id));

/**
 * @param {string} titre — le titre de la fiche (repli : celui du job)
 * @param {Record<string, unknown>} pf — platform_fields du job eBay
 * @returns {{ id: string, chemin: string[], detail: string } | null}
 */
export function rayonTraditionnelImpose(titre, pf) {
  const p = (pf && typeof pf === "object") ? pf : {};
  if (String(p.categorie_source ?? "") === "choix_humain") return null;
  if (IDS_TRADITIONNELS.has(String(p.ebayCategoryId ?? "").trim())) return null;
  const icone = String(p.categorie_icone ?? "").trim() || null;
  const t = vetementTraditionnel(icone, titre, typeof p.description === "string" ? p.description : "");
  return t ? { id: t.id, chemin: [...t.chemin], detail: `« ${t.mot} » : vêtement traditionnel (${t.region})` } : null;
}
