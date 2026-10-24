// ═══════════════════════════════════════════════════════════════════════════
// DÉPARTEMENT eBAY DEPUIS LE GENRE — UNE SEULE TABLE (24/10, lot « zéro blocage », A6)
// ═══════════════════════════════════════════════════════════════════════════
// Département eBay depuis le genre de la copie (2026-07-19, montre Casio 31387 :
// genre="Homme" présent sur le job, Département requis resté VIDE). Les LIBELLÉS
// varient par catégorie (relevé complet ebay_item_aspects : Homme/Femme/Fille/
// Garçon, « Bébé et tout-petit (unisexe) », « Enfant unisexe », « Adolescents »,
// « Adulte unisexe », « Unisexe », « Enfant », « Adulte ») : candidats du plus
// spécifique au plus général, seul un candidat PRÉSENT dans la liste de la
// catégorie est retenu — jamais de valeur inventée.
// (24/10) La table vivait dans ListingPreviewScreen ; la garde du clic
// (regles.gardeAspectsEbay) la lit aussi : quand la catégorie change au clic
// (Ornella, manteau fille 24 mois : 51580 « Fille » → 155201 dont la seule
// valeur est « Enfant unisexe »), le Département se RECALCULE pour la catégorie
// qui part au lieu d'être refusé.
export const EBAY_DEPARTMENT_BY_GENRE = Object.freeze({
  "Femme":  ["Femme", "Adulte unisexe", "Unisexe", "Adulte"],
  "Homme":  ["Homme", "Adulte unisexe", "Unisexe", "Adulte"],
  "Fille":  ["Fille", "Enfant unisexe", "Enfant", "Unisexe"],
  "Garçon": ["Garçon", "Enfant unisexe", "Enfant", "Unisexe"],
  "Bébé":   ["Bébé et tout-petit (unisexe)", "Bébé", "Enfant unisexe", "Enfant"],
  "Enfant": ["Enfant unisexe", "Enfant", "Adolescents", "Unisexe"],
  "Mixte":  ["Adulte unisexe", "Unisexe", "Adulte"],
});

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// Un Département déjà posé (« Fille », « Garçon »…) se relit comme un genre : le
// libellé eBay le plus spécifique porte le même mot que notre genre.
const GENRE_D_UN_DEPARTEMENT = Object.freeze({
  femme: "Femme", homme: "Homme", fille: "Fille", "garcon": "Garçon",
  "bebe et tout-petit (unisexe)": "Bébé", "bebe": "Bébé", "enfant unisexe": "Enfant", "enfant": "Enfant",
  "adulte unisexe": "Mixte", "unisexe": "Mixte", "adulte": "Mixte",
});

/**
 * Le Département de la liste `allowed` qui correspond au genre (ou à un Département
 * posé pour une AUTRE catégorie), du plus spécifique au plus général ; null sinon.
 * @param {string|null|undefined} genreOuDepartement
 * @param {string[]} allowed
 * @returns {string|null} la valeur EXACTE de la liste
 */
export function departementEbayPour(genreOuDepartement, allowed) {
  const liste = Array.isArray(allowed) ? allowed.map(String) : [];
  if (!liste.length) return null;
  const brut = String(genreOuDepartement ?? "").trim();
  if (!brut) return null;
  const genre = EBAY_DEPARTMENT_BY_GENRE[brut] ? brut : (GENRE_D_UN_DEPARTEMENT[norm(brut)] ?? null);
  if (!genre) return null;
  for (const c of EBAY_DEPARTMENT_BY_GENRE[genre]) {
    const trouve = liste.find((v) => norm(v) === norm(c));
    if (trouve) return trouve;
  }
  return null;
}
