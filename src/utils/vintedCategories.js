// Mapping icône objet (detectObjectIcon) + genre → chemin catalogue Vinted.
//
// Lot 1 : Mode ADULTES uniquement (Femme/Homme). Enfant et Mixte retournent
// null → le job part sans platform_fields.categoryPath et l'extension le
// marque "failed" avec un message explicite (fallback volontaire, validé).
//
// Chemins construits à partir d'un relevé exhaustif par navigation réelle du
// catalogue Vinted (Femmes > Vêtements/Chaussures/Sacs/Accessoires et
// Hommes > Vêtements/Chaussures/Accessoires), sauf mention contraire en
// commentaire. Trois niveaux de confiance à distinguer :
//   - chemins directs (une seule feuille possible) : fiables tels quels
//   - "DÉFAUT ASSUMÉ" : l'icône regroupe plusieurs mots-clés qui pointent
//     vers des feuilles différentes chez Vinted (ex: 🧥 couvre manteau ET
//     veste, deux branches distinctes) — un seul chemin est choisi par
//     défaut, documenté, approximation assumée plutôt que choix parfait
//   - "NON CONFIRMÉ" : chemin déduit par symétrie Femme/Homme faute de
//     relevé réel à cet endroit précis, à vérifier au premier dry-run
//
// ⚠️ Femme et Homme ont des arborescences qui DIVERGENT structurellement
// (pas de "Chaussures à talons" ni de "Sacs" séparé côté Hommes, pas de
// "Collants" ni de niveau supplémentaire sous "T-shirts" côté Femme...) —
// jamais de substitution automatique Femme→Homme, deux tables indépendantes.
//
// Chaque chemin doit finir sur une feuille TERMINALE du catalogue (option
// radio, pas chevron) — si Vinted affiche encore des sous-niveaux après le
// dernier clic, selectCategory remonte la liste des options disponibles
// dans l'erreur du job : corriger le chemin ici avec ces libellés.
//
// Clé = emoji retourné par detectObjectIcon (src/utils/shared.js).
// Valeur = { Femme: [...], Homme: [...] } — null si pas de chemin pour ce genre.

const MODE_ADULTE = {
  // ── Chaussures ────────────────────────────────────────────────────────────
  "👟": { Femme: ["Femmes", "Chaussures", "Baskets"], Homme: ["Hommes", "Chaussures", "Baskets"] },
  // Bottes a un sous-niveau (Bottines/Bottes hautes/Cuissardes/...) — feuille
  // par défaut la plus générique de chaque arbre (DÉFAUT ASSUMÉ).
  "👢": { Femme: ["Femmes", "Chaussures", "Bottes", "Bottines"], Homme: ["Hommes", "Chaussures", "Bottes", "Bottines à lacets"] },
  // Chaussures à talons n'existe pas côté Hommes (confirmé, pas d'équivalent).
  "👠": { Femme: ["Femmes", "Chaussures", "Chaussures à talons"], Homme: null },
  "🩴": { Femme: ["Femmes", "Chaussures", "Sandales"], Homme: ["Hommes", "Chaussures", "Sandales"] },

  // ── Vêtements ─────────────────────────────────────────────────────────────
  // DÉFAUT ASSUMÉ : la regex robe|jupe couvre deux catégories Vinted SŒURS
  // (Robes / Jupes), pas une hiérarchie — un article "jupe" tombera à tort
  // sur Robes avec ce mapping (icône à scinder en Lot 2 si le volume le
  // justifie). Pas d'équivalent Homme (confirmé).
  "👗": { Femme: ["Femmes", "Vêtements", "Robes", "Midi"], Homme: null },
  // DÉFAUT ASSUMÉ (le plus large de tous) : la regex couvre manteau/veste/
  // blouson/parka/doudoune/trench/imperméable/kimono — trois branches Vinted
  // différentes (Manteaux et vestes > Manteaux, > Vestes, et même "Kimonos"
  // qui vit sous Sweats et sweats à capuche côté Femme, une tout autre
  // catégorie). Défaut choisi : Vestes > Doudounes (mot-clé explicite de la
  // regex, très gros volume en revente) — manteau/parka/trench/imperméable
  // avec ce mapping atterriront à tort sur Doudounes plutôt que sur la
  // branche Manteaux. Bon candidat de scission en Lot 2.
  "🧥": { Femme: ["Femmes", "Vêtements", "Manteaux et vestes", "Vestes", "Doudounes"], Homme: ["Hommes", "Vêtements", "Manteaux et vestes", "Vestes", "Doudounes"] },
  // DÉFAUT ASSUMÉ : la regex couvre aussi cravate/costume, deux branches à
  // part entière chez Vinted (Costumes et blazers ; Accessoires > Cravates
  // et nœuds papillons, Hommes seulement) — non atteignables depuis ce
  // défaut. "chemise" pris comme cas dominant.
  "👔": { Femme: ["Femmes", "Vêtements", "Hauts et t-shirts", "Chemises"], Homme: ["Hommes", "Vêtements", "Hauts et t-shirts", "Chemises", "Chemises unies"] },
  // ⚠️ Divergence structurelle confirmée sur l'item même testé en dry-run :
  // côté Femme, "T-shirts" EST la feuille terminale (4 niveaux) ; côté
  // Homme, "T-shirts" a un niveau de plus (5, "T-shirts unis" — celui validé
  // par notre dry-run réel). Une substitution Femme→Homme aurait cassé côté
  // Femme (5e niveau inexistant). DÉFAUT ASSUMÉ supplémentaire : la regex
  // couvre aussi pull/sweat/hoodie/cardigan, qui vivent chez Vinted sous
  // "Sweats et pulls" / "Sweats et sweats à capuche" — branche totalement
  // différente, non atteignable ici. Bon candidat de scission en Lot 2 vu le
  // volume probable de pulls/sweats en revente.
  "👕": { Femme: ["Femmes", "Vêtements", "Hauts et t-shirts", "T-shirts"], Homme: ["Hommes", "Vêtements", "Hauts et t-shirts", "T-shirts", "T-shirts unis"] },
  // DÉFAUT ASSUMÉ : la regex couvre jean/pantalon/jogging/legging/chino/
  // salopette/survêtement — "Jeans" est une catégorie Vinted à part entière,
  // distincte de "Pantalons (et leggings)". Défaut choisi sur la branche
  // pantalon générique plutôt que Jeans, pour ne pas mal classer les
  // joggings/leggings/chinos qui sont majoritaires dans cette liste de
  // mots-clés (une regex dédiée "jean" pourrait être scindée en Lot 2).
  "👖": { Femme: ["Femmes", "Vêtements", "Pantalons et leggings", "Autres pantalons"], Homme: ["Hommes", "Vêtements", "Pantalons", "Autres pantalons"] },
  "🩳": { Femme: ["Femmes", "Vêtements", "Shorts", "Autres shorts"], Homme: ["Hommes", "Vêtements", "Shorts", "Autres shorts"] },
  // Femme : Maillots de bain a un sous-niveau (Une pièce/Deux pièces/...),
  // défaut "Autres" (DÉFAUT ASSUMÉ). Homme : feuille directe, confirmée
  // terminale sans sous-niveau — existe bien (à ne pas laisser en null).
  "👙": { Femme: ["Femmes", "Vêtements", "Maillots de bain", "Autres"], Homme: ["Hommes", "Vêtements", "Maillots de bain"] },
  // Chaussettes/collants vivent dans des branches au nom différent selon le
  // genre (Lingerie et pyjamas côté Femme, Sous-vêtements et chaussettes
  // côté Homme) ; pas de "Collants" côté Hommes (confirmé, absent de
  // l'arbre) — les deux genres retombent donc sur "Chaussettes".
  "🧦": { Femme: ["Femmes", "Vêtements", "Lingerie et pyjamas", "Chaussettes"], Homme: ["Hommes", "Vêtements", "Sous-vêtements et chaussettes", "Chaussettes"] },

  // ── Sacs & petite maroquinerie (arborescence très différente par genre :
  // "Sacs" est un niveau 2 séparé côté Femme, tout est sous
  // Accessoires > Sacs et sacoches côté Homme — pas de "Sacs à main" homme,
  // équivalent le plus proche = Sacs à bandoulière) ─────────────────────────
  "👜": { Femme: ["Femmes", "Sacs", "Sacs à main"], Homme: ["Hommes", "Accessoires", "Sacs et sacoches", "Sacs à bandoulière"] },
  "👛": { Femme: ["Femmes", "Sacs", "Porte-monnaie"], Homme: ["Hommes", "Accessoires", "Sacs et sacoches", "Porte-monnaie"] },
  "🎒": { Femme: ["Femmes", "Sacs", "Sacs à dos"], Homme: ["Hommes", "Accessoires", "Sacs et sacoches", "Sacs à dos"] },

  // ── Accessoires ───────────────────────────────────────────────────────────
  "🧣": { Femme: ["Femmes", "Accessoires", "Écharpes et châles"], Homme: ["Hommes", "Accessoires", "Écharpes et châles"] },
  "🧤": { Femme: ["Femmes", "Accessoires", "Gants"], Homme: ["Hommes", "Accessoires", "Gants"] },
  // NON CONFIRMÉ côté Homme : sous-niveau "Chapeaux et casquettes" non
  // exploré par le relevé (chevron non ouvert), structure supposée identique
  // à Femme par analogie — à vérifier au premier dry-run sur cet item.
  "🧢": { Femme: ["Femmes", "Accessoires", "Chapeaux & casquettes", "Casquettes"], Homme: ["Hommes", "Accessoires", "Chapeaux & casquettes", "Casquettes"] },
  "🕶️": { Femme: ["Femmes", "Accessoires", "Lunettes de soleil"], Homme: ["Hommes", "Accessoires", "Lunettes de soleil"] },
  "⌚": { Femme: ["Femmes", "Accessoires", "Montres"], Homme: ["Hommes", "Accessoires", "Montres"] },
  // DÉFAUT ASSUMÉ : la regex couvre collier/bracelet/bague/boucle d'oreille/
  // pendentif/broche — chacun est sa propre feuille distincte chez Vinted ;
  // on retombe sur la feuille générique de chaque arbre plutôt que de
  // deviner un type précis.
  "💍": { Femme: ["Femmes", "Accessoires", "Bijoux", "Autres bijoux"], Homme: ["Hommes", "Accessoires", "Bijoux", "Autre"] },

  // Hors périmètre Lot 1 (pas demandés dans cette passe, faible volume ou
  // hors Mode adultes) : 🧳 valises (Homme confirmé "Bagages et valises"
  // sous Sacs et sacoches, Femme approximable par "Sacs de voyage" — à
  // ajouter si besoin), 👶 puériculture (Enfant uniquement, hors périmètre
  // Femme/Homme par construction).
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
