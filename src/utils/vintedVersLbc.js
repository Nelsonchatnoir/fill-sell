// ═══════════════════════════════════════════════════════════════════════════
// LE CATALOGUE VINTED DE LA FICHE → SA FEUILLE LEBONCOIN, PAR IDENTIFIANT (12/11, Nico, point 1d-iii)
// ═══════════════════════════════════════════════════════════════════════════
// Cas réels (compte cfdfda6f et voisins, 14 j) : « Jouets musicaux en bois » (catalogue Vinted 3358), « Jouet VTech –
// Trompette » (3366), « Playset micro machines » (3468) — des JOUETS, déclarés comme tels sur Vinted — rangés sur
// Leboncoin en « Loisirs › Instruments de musique » par le mot de l'IA (« instruments », « trompette ») : Univers
// demandé 6 fois sur la même fiche, 5 abandons, rien n'est parti. La réponse était sur la fiche : Vinted range ces
// articles sous « Enfants › Jeux et jouets » (nœud 1499), et Leboncoin a « Loisirs › Jeux & Jouets ».
// Mesuré sur 60 j (export du 12/11) : les publications Leboncoin de fiches au catalogue « Jeux et jouets » partent
// déjà en « Jeux & Jouets » quand le mot y mène (Figurines 37/38, Poupées 25/29, Peluches 17/18, Jeux de
// construction 16/16, rangements à la main compris).
//
// La table est FERMÉE et tenue par IDENTIFIANTS (ceux de l'arbre relevé, docs/vinted-catalog-tree.txt) : un libellé
// Vinted qui changerait de langue ou de nom ne la touche pas. Elle PRIME sur le mot (comme les familles jeu vidéo et
// œuvre d'art, resolutionPublication.js) — jamais sur un rayon choisi par la personne, qui s'applique après.
// ⛔ EXCLUS, faute d'une feuille Leboncoin certaine (décision de Nico du 12/11, cf. audit 1d-iii) :
//   · « Déguisements et jeux de rôle » (3329 : déguisements, cuisines, tentes…) — Mode ? Jeux ? selon l'objet ;
//   · « Activités et jouets pour bébé » (3344 : trotteurs, tapis d'éveil…) — souvent « Famille › Équipement bébé » ;
//   · « Loisirs créatifs » (3314 : perles, pâte à modeler, kits) — Leboncoin a sa feuille « Loisirs créatifs ».
// Ce qui n'est pas ici garde la règle d'avant, à l'identique. Parité tenue par
// scripts/categorie-catalogue-vinted-selftest.mjs (chaque feuille du nœud 1499 est rangée OU exclue nommément).
// ═══════════════════════════════════════════════════════════════════════════

const JEUX_ET_JOUETS_LBC = Object.freeze(["Loisirs", "Jeux & Jouets"]);

// Feuilles du nœud Vinted 1499 « Enfants › Jeux et jouets », hors 3329, 3344, 3314 (cf. en-tête), groupées par nœud.
const IDS_JEUX_ET_JOUETS = new Set([
  3312, 3311, 3313,                         // 1730 Figurines et accessoires
  1767,                                     // Jeux de construction
  3327, 3324, 3325, 3326, 3328,             // 1731 Poupées, poupons et accessoires
  3354, 3355, 3356, 3357, 3358,             // 1763 Jeux éducatifs
  3364, 3360, 3361, 3363, 3362, 3359, 3365, 3366, // 1725 Jeux et jouets électroniques
  1766,                                     // Jeux/jouets musicaux et instruments
  3337, 3339, 3340, 3338, 3341, 3342, 3343, // 3336 Jeux de cirque, fidgets et gadgets
  3367, 3368, 3369, 3370, 3371, 3372, 3373, 3374, // 1771 Jeux de sport et de plein air
  1764,                                     // Peluches
  3471, 3468, 3470, 3469, 3472, 3473,       // 3375 Voitures, trains et autres véhicules
].map(String));

/**
 * La feuille Leboncoin que le catalogue Vinted de la fiche impose, ou null.
 * @param {string|number|null} catalogId  inventaire.vinted_catalog_id
 * @returns {{ chemin: string[], regle: string } | null}
 */
export function feuilleLbcDuCatalogueVinted(catalogId) {
  if (catalogId == null || catalogId === "") return null;
  if (IDS_JEUX_ET_JOUETS.has(String(catalogId).trim())) {
    return { chemin: [...JEUX_ET_JOUETS_LBC], regle: "catalogue_vinted_jeux_et_jouets" };
  }
  return null;
}

export const _internes = { IDS_JEUX_ET_JOUETS };
