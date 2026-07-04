// Mapping icône objet (detectObjectIcon) + genre → chemin catalogue Vinted.
//
// Lot 1 : Mode ADULTES uniquement (Femme/Homme). Enfant et Mixte retournent
// null → le job part sans platform_fields.categoryPath et l'extension le
// marque "failed" avec un message explicite (fallback volontaire, validé).
//
// ⚠️ LIBELLÉS À VÉRIFIER AU DRY-RUN. Le content script matche par
// sous-chaîne insensible à la casse (findOptionByText → includes), donc on
// utilise des fragments courts et discriminants ("Manteaux" matche
// "Manteaux et vestes"). Les accents comptent. Chaque chemin doit finir sur
// une feuille TERMINALE du catalogue (option radio, pas chevron) — si Vinted
// affiche encore des sous-niveaux après le dernier clic, selectCategory
// remonte la liste des options disponibles dans l'erreur du job : corriger
// le chemin ici avec ces libellés.
//
// Clé = emoji retourné par detectObjectIcon (src/utils/shared.js).
// Valeur = { Femme: [...], Homme: [...] } — null si pas de chemin pour ce genre.

const MODE_ADULTE = {
  // Chaussures
  "👟": { Femme: ["Femmes", "Chaussures", "Baskets"],           Homme: ["Hommes", "Chaussures", "Baskets"] },
  "👢": { Femme: ["Femmes", "Chaussures", "Bottes"],            Homme: ["Hommes", "Chaussures", "Bottes"] },
  "👠": { Femme: ["Femmes", "Chaussures", "Escarpins"],         Homme: null },
  "🩴": { Femme: ["Femmes", "Chaussures", "Sandales"],          Homme: ["Hommes", "Chaussures", "Sandales"] },
  // Vêtements
  "👗": { Femme: ["Femmes", "Vêtements", "Robes"],              Homme: null },
  "🧥": { Femme: ["Femmes", "Vêtements", "Manteaux"],           Homme: ["Hommes", "Vêtements", "Manteaux"] },
  "👔": { Femme: ["Femmes", "Vêtements", "Chemises"],           Homme: ["Hommes", "Vêtements", "Chemises"] },
  // Arbre confirmé aux dry-runs : "Hauts et t-shirts" → ["Chemises",
  // "T-shirts","Polos","T-shirts sans manches"], puis "T-shirts" a encore un
  // niveau (unis/imprimés/...). Feuille par défaut : "T-shirts unis" —
  // approximation assumée, le mapping statique icône→chemin ne voit pas le
  // motif de l'article. Côté Femme, même structure supposée (à confirmer).
  "👕": { Femme: ["Femmes", "Vêtements", "Tops et t-shirts", "T-shirts", "T-shirts unis"],   Homme: ["Hommes", "Vêtements", "Hauts et t-shirts", "T-shirts", "T-shirts unis"] },
  "👖": { Femme: ["Femmes", "Vêtements", "Pantalons"],          Homme: ["Hommes", "Vêtements", "Pantalons"] },
  "🩳": { Femme: ["Femmes", "Vêtements", "Shorts"],             Homme: ["Hommes", "Vêtements", "Shorts"] },
  "👙": { Femme: ["Femmes", "Vêtements", "Maillots de bain"],   Homme: null },
  // Sacs & petite maroquinerie
  "👜": { Femme: ["Femmes", "Sacs", "Sacs à main"],             Homme: ["Hommes", "Accessoires", "Sacs"] },
  "👛": { Femme: ["Femmes", "Accessoires", "Portefeuille"],     Homme: ["Hommes", "Accessoires", "Portefeuille"] },
  "🎒": { Femme: ["Femmes", "Sacs", "Sacs à dos"],              Homme: ["Hommes", "Accessoires", "Sacs à dos"] },
  // Accessoires
  "🧣": { Femme: ["Femmes", "Accessoires", "Écharpes"],         Homme: ["Hommes", "Accessoires", "Écharpes"] },
  "🧤": { Femme: ["Femmes", "Accessoires", "Gants"],            Homme: ["Hommes", "Accessoires", "Gants"] },
  "🧢": { Femme: ["Femmes", "Accessoires", "Chapeaux"],         Homme: ["Hommes", "Accessoires", "Chapeaux"] },
  "🕶️": { Femme: ["Femmes", "Accessoires", "Lunettes de soleil"], Homme: ["Hommes", "Accessoires", "Lunettes de soleil"] },
  "⌚": { Femme: ["Femmes", "Accessoires", "Montres"],          Homme: ["Hommes", "Accessoires", "Montres"] },
  "💍": { Femme: ["Femmes", "Accessoires", "Bijoux"],           Homme: ["Hommes", "Accessoires", "Bijoux"] },
  // Hors périmètre Lot 1 (chemins incertains, faible volume) :
  // 🧳 valises, 🧦 chaussettes/collants (arbre Lingerie), 👶 puériculture.
};

/**
 * @param {string} icon  — emoji retourné par detectObjectIcon
 * @param {string} genre — "Femme" | "Homme" | "Enfant" | "Mixte" | "" (platform_fields.genre)
 * @returns {string[]|null} chemin catalogue Vinted, ou null si non mappé
 *   (icône hors périmètre, genre absent, Enfant/Mixte → Lot 2)
 */
export function getVintedCategoryPath(icon, genre) {
  const entry = MODE_ADULTE[icon];
  if (!entry || !genre) return null;
  return entry[genre] ?? null;
}
