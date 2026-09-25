// ═══════════════════════════════════════════════════════════════════════════
// LES DIMENSIONS EBAY SE SAISISSENT AVEC LEUR UNITÉ (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// Jocabroc, « Panier décoratif vintage Walther » (job 80d0704f) : eBay exige
// Hauteur, Largeur et Longueur. Ce sont des aspects en SAISIE LIBRE (mode
// FREE_TEXT du référentiel), mais ses propres suggestions portent l'unité
// (« 20 cm », « 31 cm », « 15" ») : un « 30 » tout seul ne dit pas 30 quoi.
// L'écran « Compléter » montre donc une case de saisie libre suivie de « cm »,
// et la valeur part avec son unité. Une valeur qui porte déjà la sienne
// (« 30 cm », « 12" », « 1,2 m ») part telle quelle — on ne convertit jamais.

const DIMENSION_RE = /^(hauteur|largeur|longueur|profondeur|[ée]paisseur|diam[èe]tre)\b/i;
const VALEUR_CM_RE = /^\s*\d+(?:[.,]\d+)?\s*cm\s*$/i;
const NOMBRE_NU_RE = /^\d+(?:[.,]\d+)?$/;

/**
 * L'unité à afficher à côté de la case, ou null (champ ordinaire).
 * Seulement eBay : c'est la seule plateforme dont les dimensions sont libres.
 */
export function uniteDuChamp(platform, cle, libelle, suggestions) {
  if (platform !== "ebay") return null;
  const nom = String(libelle ?? cle ?? "").trim();
  if (DIMENSION_RE.test(nom)) return "cm";
  const s = Array.isArray(suggestions) ? suggestions.map(String) : [];
  const enCm = s.filter((v) => VALEUR_CM_RE.test(v)).length;
  return s.length >= 2 && enCm * 2 >= s.length ? "cm" : null;
}

/** La valeur qui part : un nombre nu reçoit l'unité, le reste est gardé tel quel. */
export function valeurAvecUnite(valeur, unite) {
  const v = String(valeur ?? "").trim();
  if (!v || !unite) return v;
  return NOMBRE_NU_RE.test(v) ? `${v} ${unite}` : v;
}

/** Ce que montre la case : le nombre seul quand la valeur porte déjà l'unité affichée. */
export function nombreSansUnite(valeur, unite) {
  const v = String(valeur ?? "").trim();
  if (!unite) return v;
  const m = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*${unite}$`, "i").exec(v);
  return m ? m[1] : v;
}
