// ═══════════════════════════════════════════════════════════════════════════
// LE CHEMIN DU CATALOGUE VINTED D'UNE FICHE, LU PAR SON IDENTIFIANT (12/11, lot « zéro problème », 1d-ii — Nico)
// ═══════════════════════════════════════════════════════════════════════════
// L'écran de publication lisait `attributs.categorie_vinted.chemin` (Univers Leboncoin « depuis la catégorie Vinted »,
// seconde passe IA de Leboncoin, pointure, longueur de robe eBay). Personne ne l'écrit : l'extension (relevé, page
// publique) et l'app (texteDuVendeur) n'écrivent que l'IDENTIFIANT — 0 fiche sur 313 portait un chemin. « Pull vintage
// Easy Line » (compte cca934e7, 11/11), catalogue 1813 = Hommes > Vêtements > … : l'Univers « Homme », certain, était
// demandé.
// LA RÈGLE, UN RÉSOLVEUR UNIQUE : l'identifiant de la fiche (colonne `inventaire.vinted_catalog_id`, sinon
// `attributs.categorie_vinted.v`) → son chemin dans l'arbre RELEVÉ (src/utils/arbres/vintedFeuilles.js). L'identifiant
// fait foi (il est le même sur tous les sites Vinted, quelle que soit la langue du compte ; un libellé se renomme) ; le
// chemin écrit (src/utils/vintedAttributs.js) ne sert qu'à défaut d'un identifiant connu de l'arbre. Rien d'autre :
// jamais un chemin deviné. Le chemin rendu est celui de l'arbre relevé (libellés français), le même pour tous les comptes.
// Pur, sauf le chargement de l'arbre (import() dynamique : 125 Ko qui ne pèsent rien tant qu'on ne publie pas).
// Verrou : scripts/chemin-vinted-fiche-selftest.mjs.

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const cle = (c) => (Array.isArray(c) ? c.map((s) => String(s ?? "").trim()).join(" > ") : String(c ?? "").split(">").map((s) => s.trim()).join(" > "));

/** L'identifiant Vinted de la fiche (texte), ou null : la colonne d'abord, sinon l'attribut relevé. */
export function idCatalogueVintedDeLaFiche(fiche) {
  const f = objet(fiche);
  if (!f) return null;
  const cv = objet(objet(f.attributs)?.categorie_vinted);
  for (const brut of [f.vinted_catalog_id, cv?.v]) {
    const n = Number(typeof brut === "object" && brut ? brut.v : brut);
    if (Number.isInteger(n) && n > 0) return String(n);
  }
  return null;
}

/** Le chemin ÉCRIT sur la fiche (vintedAttributs.js), ou null. */
export function cheminEcritDeLaFiche(fiche) {
  const cv = objet(objet(objet(fiche)?.attributs)?.categorie_vinted);
  const c = Array.isArray(cv?.chemin) ? cv.chemin : (Array.isArray(objet(cv?.v)?.chemin) ? cv.v.chemin : null);
  const propre = Array.isArray(c) ? c.map((s) => String(s ?? "").trim()).filter(Boolean) : [];
  return propre.length ? propre : null;
}

/** Le chemin d'un identifiant dans l'arbre relevé, ou null. */
export function cheminVintedParId(id, feuilles) {
  const v = String(id ?? "").trim();
  if (!v || !Array.isArray(feuilles)) return null;
  const f = feuilles.find((x) => x?.id != null && String(x.id) === v);
  return f && Array.isArray(f.chemin) ? [...f.chemin] : null;
}

/** L'identifiant d'un rayon Vinted depuis son chemin (« Femmes > Beauté > Parfums » → « 152 »), ou null. */
export function idVintedDuChemin(chemin, feuilles) {
  const c = cle(chemin);
  if (!c || !Array.isArray(feuilles)) return null;
  const f = feuilles.find((x) => Array.isArray(x?.chemin) && cle(x.chemin) === c);
  return f?.id != null ? String(f.id) : null;
}

/**
 * LE chemin du catalogue Vinted de la fiche : l'identifiant résolu dans l'arbre, sinon le chemin écrit, sinon null.
 * @param {{vinted_catalog_id?: unknown, attributs?: object}|null} fiche
 * @param {Array<{chemin: string[], id: string|null}>|null} feuilles  l'arbre relevé (chargerFeuillesVinted)
 * @returns {string[]|null}
 */
export function cheminVintedDeLaFiche(fiche, feuilles) {
  const parId = cheminVintedParId(idCatalogueVintedDeLaFiche(fiche), feuilles);
  return parId ?? cheminEcritDeLaFiche(fiche);
}

let chargement = null;
/** L'arbre relevé de Vinted, chargé une fois par session. */
export function chargerFeuillesVinted() {
  if (!chargement) {
    chargement = import("./arbres/vintedFeuilles.js").then((m) => m.FEUILLES ?? []).catch((e) => { chargement = null; throw e; });
  }
  return chargement;
}
