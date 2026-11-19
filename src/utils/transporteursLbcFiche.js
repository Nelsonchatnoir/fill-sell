// ═══════════════════════════════════════════════════════════════════════════
// LES TRANSPORTEURS LEBONCOIN DE LA FICHE (19/11/2026, Louis — décision de Nico, point b)
// ═══════════════════════════════════════════════════════════════════════════
// « Le choix des transporteurs Leboncoin dans la fiche article, et dans le lot, l'indication que les transporteurs et
// le format viennent de la fiche (comme le poids aujourd'hui). » Un article léger part en Courrier suivi, un rangement
// non : le choix est celui de l'ARTICLE, rangé sur sa fiche (attributs.transporteurs_lbc, source « manuel », fusionné
// par le trigger inventaire_attributs_fusion — aucune migration), et il passe devant le choix retenu du compte
// (platform_settings.leboncoin.transporteurs) à la publication, en lot comme à l'unité.
// ⛔ Toujours borné au poids de l'article (un transporteur qui ne prend pas ce poids n'est jamais coché).
// ⛔ Les noms sont ceux de Leboncoin (LBC_TRANSPORTEURS) : un nom inconnu est écarté, jamais envoyé.
// Pur (Node + Vite) : scripts/lot-corrections-1911-selftest.mjs.
import { LBC_TRANSPORTEURS, transporteursPourPoids } from "./leboncoinColis.js";

export const CLE_TRANSPORTEURS_LBC = "transporteurs_lbc";
const NOMS = new Set(LBC_TRANSPORTEURS.map((t) => t.nom));

/** Les noms valides d'une liste, sans doublon, dans l'ordre de Leboncoin ; null si rien de valide. */
export function transporteursValides(liste) {
  if (!Array.isArray(liste)) return null;
  const voulus = new Set(liste.map((n) => String(n ?? "").trim()).filter((n) => NOMS.has(n)));
  const out = LBC_TRANSPORTEURS.map((t) => t.nom).filter((n) => voulus.has(n));
  return out.length ? out : null;
}

/** Les transporteurs choisis sur la fiche (attributs), ou null (aucun choix : le choix du compte vaut). */
export function transporteursDeLaFiche(attributs) {
  const a = attributs && typeof attributs === "object" ? attributs[CLE_TRANSPORTEURS_LBC] : null;
  const v = a && typeof a === "object" && !Array.isArray(a) && "v" in a ? a.v : a;
  return transporteursValides(v);
}

/** L'objet `attributs` à écrire pour un choix fait sur l'article (liste vide ou null : rien d'écrit). */
export function choixTransporteursPourLaFiche(liste, maintenant = new Date()) {
  const v = transporteursValides(liste);
  return v ? { [CLE_TRANSPORTEURS_LBC]: { v, source: "manuel", at: maintenant.toISOString() } } : null;
}

/**
 * Les transporteurs qui partent pour CET article : ceux de sa fiche, sinon ceux du lot (ou retenus du compte),
 * bornés au poids. { noms: string[] | null, source: "fiche" | "lot" | null } — noms null : Leboncoin propose les siens.
 */
export function transporteursDeLArticle({ attributs = null, choixFiche = undefined, duLot = null, poids_g = null } = {}) {
  const fiche = choixFiche !== undefined ? transporteursValides(choixFiche) : transporteursDeLaFiche(attributs);
  const base = fiche ?? transporteursValides(duLot);
  if (!base) return { noms: null, source: null };
  const permis = transporteursPourPoids(poids_g);
  const noms = base.filter((n) => permis.includes(n));
  return { noms: noms.length ? noms : null, source: fiche ? "fiche" : "lot" };
}

/** Basculer un transporteur dans une liste (null = tous ceux de Leboncoin). */
export function basculerTransporteur(liste, nom) {
  const base = transporteursValides(liste) ?? LBC_TRANSPORTEURS.map((t) => t.nom);
  const suite = base.includes(nom) ? base.filter((n) => n !== nom) : [...base, nom];
  return transporteursValides(suite) ?? [];
}
