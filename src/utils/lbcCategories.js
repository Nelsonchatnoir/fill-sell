// Mapping icône objet (detectObjectIcon) → catégorie Leboncoin [racine, feuille].
//
// Arbre PLAT (2 niveaux, 13 racines, ~89 feuilles) relevé par navigation réelle
// du sélecteur du formulaire /deposer-une-annonce — référence complète dans
// docs/leboncoin-form-survey.md. Contrairement à Vinted : pas de niveau genre
// (l'équivalent est le critère "Univers" rempli séparément), et Leboncoin VEND
// les meubles, l'électroménager, le bricolage et les vélos — plusieurs null
// Vinted deviennent des vraies catégories ici.
//
// null = hors périmètre volontaire v1 (documenté) — le job échoue avant tout
// remplissage avec un message explicite, même fallback que Vinted.

const LBC_CATEGORIES = {
  // ── Mode ──────────────────────────────────────────────────────────────────
  // Tous les vêtements sur une seule feuille : la granularité fine (robe vs
  // pull) se joue dans les critères dynamiques de la feuille, pas l'arbre.
  "👗": ["Mode", "Vêtements"], "🧥": ["Mode", "Vêtements"], "👔": ["Mode", "Vêtements"],
  "👕": ["Mode", "Vêtements"], "🧶": ["Mode", "Vêtements"], "👖": ["Mode", "Vêtements"],
  "🩳": ["Mode", "Vêtements"], "👙": ["Mode", "Vêtements"], "🧦": ["Mode", "Vêtements"],
  "👟": ["Mode", "Chaussures"], "👢": ["Mode", "Chaussures"], "👠": ["Mode", "Chaussures"],
  "🩴": ["Mode", "Chaussures"], "⛸️": ["Loisirs", "Sport & Plein air"],
  "👜": ["Mode", "Accessoires & Bagagerie"], "👛": ["Mode", "Accessoires & Bagagerie"],
  "🎒": ["Mode", "Accessoires & Bagagerie"], "🎽": ["Mode", "Accessoires & Bagagerie"],
  "🧳": ["Mode", "Accessoires & Bagagerie"], "🧣": ["Mode", "Accessoires & Bagagerie"],
  "🧤": ["Mode", "Accessoires & Bagagerie"], "🧢": ["Mode", "Accessoires & Bagagerie"],
  "🕶️": ["Mode", "Accessoires & Bagagerie"],
  "⌚": ["Mode", "Montres & Bijoux"], "💍": ["Mode", "Montres & Bijoux"],

  // ── Électronique ──────────────────────────────────────────────────────────
  "📱": ["Électronique", "Téléphones & Objets connectés"],
  "💻": ["Électronique", "Ordinateurs"], "🖥️": ["Électronique", "Ordinateurs"],
  "⌨️": ["Électronique", "Accessoires informatique"], "🖱️": ["Électronique", "Accessoires informatique"],
  "🖨️": ["Électronique", "Accessoires informatique"],
  "🔌": ["Électronique", "Accessoires téléphone & Objets connectés"],
  "🎧": ["Électronique", "Photo, audio & vidéo"], "🔊": ["Électronique", "Photo, audio & vidéo"],
  "📷": ["Électronique", "Photo, audio & vidéo"], "🛸": ["Électronique", "Photo, audio & vidéo"],
  "📺": ["Électronique", "Photo, audio & vidéo"],
  "🎮": ["Électronique", "Consoles"],

  // ── Maison & Jardin (meubles/électroménager/bricolage VENDABLES ici,
  // contrairement à Vinted) ─────────────────────────────────────────────────
  "🛋️": ["Maison & Jardin", "Ameublement"], "🪑": ["Maison & Jardin", "Ameublement"],
  "🛏️": ["Maison & Jardin", "Ameublement"],
  "💡": ["Maison & Jardin", "Décoration"], "🪞": ["Maison & Jardin", "Décoration"],
  "🕯️": ["Maison & Jardin", "Décoration"], "🖼️": ["Maison & Jardin", "Décoration"],
  "🏺": ["Maison & Jardin", "Décoration"],
  "🪴": ["Maison & Jardin", "Jardin & Plantes"],
  // DÉFAUT ASSUMÉ : casseroles/ustensiles rangés avec la vaisselle sous
  // "Arts de la table" (pas de feuille cuisine dédiée chez LBC).
  "🍽️": ["Maison & Jardin", "Arts de la table"], "🍳": ["Maison & Jardin", "Arts de la table"],
  "🫖": ["Maison & Jardin", "Électroménager"], "🧹": ["Maison & Jardin", "Électroménager"],
  "🧊": ["Maison & Jardin", "Électroménager"], "♨️": ["Maison & Jardin", "Électroménager"],
  "🥣": ["Maison & Jardin", "Électroménager"], "🍞": ["Maison & Jardin", "Électroménager"],
  "🍟": ["Maison & Jardin", "Électroménager"], "☕": ["Maison & Jardin", "Électroménager"],
  "🧺": ["Maison & Jardin", "Électroménager"], "💇": ["Maison & Jardin", "Électroménager"],
  "🪒": ["Maison & Jardin", "Électroménager"],
  "🪛": ["Maison & Jardin", "Bricolage"], "🪚": ["Maison & Jardin", "Bricolage"],
  "🔨": ["Maison & Jardin", "Bricolage"], "🪜": ["Maison & Jardin", "Bricolage"],
  "🖌️": ["Maison & Jardin", "Bricolage"], "🔩": ["Maison & Jardin", "Bricolage"],
  "📏": ["Maison & Jardin", "Bricolage"], "🔧": ["Maison & Jardin", "Bricolage"],
  "🌱": ["Maison & Jardin", "Jardin & Plantes"], "✂️": ["Maison & Jardin", "Jardin & Plantes"],
  "🔥": ["Maison & Jardin", "Jardin & Plantes"], "⛱️": ["Maison & Jardin", "Jardin & Plantes"],

  // ── Loisirs ───────────────────────────────────────────────────────────────
  "🎸": ["Loisirs", "Instruments de musique"], "🎻": ["Loisirs", "Instruments de musique"],
  "🥁": ["Loisirs", "Instruments de musique"], "🎺": ["Loisirs", "Instruments de musique"],
  "🎹": ["Loisirs", "Instruments de musique"], "🎤": ["Loisirs", "Instruments de musique"],
  // DÉFAUT ASSUMÉ : 💿 couvre vinyle ET platine — disque pris comme dominant
  // (la platine devrait aller en Électronique > Photo, audio & vidéo).
  "💿": ["Loisirs", "CD - Musique"],
  "📖": ["Loisirs", "Livres"], "📚": ["Loisirs", "Livres"], "📰": ["Loisirs", "Livres"],
  "📮": ["Loisirs", "Collection"], "🪙": ["Loisirs", "Collection"], "🃏": ["Loisirs", "Collection"],
  "🧱": ["Loisirs", "Jeux & Jouets"], "🧸": ["Loisirs", "Jeux & Jouets"],
  "🪆": ["Loisirs", "Jeux & Jouets"], "🧩": ["Loisirs", "Jeux & Jouets"],
  "🎲": ["Loisirs", "Jeux & Jouets"], "🦸": ["Loisirs", "Jeux & Jouets"],
  "🏎️": ["Loisirs", "Jeux & Jouets"],
  "🚲": ["Loisirs", "Vélos"], // vendable chez LBC (null volontaire chez Vinted)
  "🛴": ["Loisirs", "Sport & Plein air"], "🛹": ["Loisirs", "Sport & Plein air"],
  "🎿": ["Loisirs", "Sport & Plein air"], "⚽": ["Loisirs", "Sport & Plein air"],
  "🎾": ["Loisirs", "Sport & Plein air"], "⛳": ["Loisirs", "Sport & Plein air"],
  "🏋️": ["Loisirs", "Sport & Plein air"], "🥊": ["Loisirs", "Sport & Plein air"],
  "⛺": ["Loisirs", "Sport & Plein air"], "🎣": ["Loisirs", "Sport & Plein air"],
  "🧘": ["Loisirs", "Sport & Plein air"], "⛑️": ["Loisirs", "Sport & Plein air"],
  "🏀": ["Loisirs", "Sport & Plein air"], "🏃": ["Loisirs", "Sport & Plein air"],
  "🥽": ["Loisirs", "Sport & Plein air"],

  // ── Famille / Véhicules ───────────────────────────────────────────────────
  // Scission 👶 (juillet 2026) : les 4 icônes puériculture tombent sur la
  // même feuille LBC — la granularité fine se joue dans les critères
  // dynamiques de la feuille, pas dans l'arbre (comme les vêtements).
  "👶": ["Famille", "Équipement bébé"], "💺": ["Famille", "Équipement bébé"],
  "🍼": ["Famille", "Équipement bébé"], "📟": ["Famille", "Équipement bébé"],
  "🛞": ["Véhicules", "Équipement auto"], "🪖": ["Véhicules", "Équipement moto"],
  // Véhicules immatriculés complets : hors périmètre v1 (le dépôt LBC exige
  // plaque/carte grise, flux spécifique) — fallback explicite volontaire.
  "🚗": null, "🏍️": null, "🛵": null,
  // Beauté : aucun rayon Leboncoin (vérifié dans l'arbre) — fallback explicite.
  "🌸": null, "💄": null, "💅": null, "🧴": null,
  "📦": null, // filet générique (gourde, veilleuse, objets sans feuille dédiée)

  // ── Ajouts 2026-07-09 (mission mapping complet) — mêmes feuilles plates
  // que leurs familles (relevé docs/leboncoin-form-survey.md, 13 racines) ───
  "🥿": ["Mode", "Chaussures"],
  "👝": ["Mode", "Accessoires & Bagagerie"], "🪢": ["Mode", "Accessoires & Bagagerie"],
  "🎀": ["Mode", "Accessoires & Bagagerie"], "☂️": ["Mode", "Accessoires & Bagagerie"],
  "🗝️": ["Mode", "Accessoires & Bagagerie"],
  "🩲": ["Mode", "Vêtements"], "🥼": ["Mode", "Vêtements"], "🤵": ["Mode", "Vêtements"],
  "📲": ["Électronique", "Tablettes & Liseuses"], "📇": ["Électronique", "Tablettes & Liseuses"],
  "⏱️": ["Électronique", "Téléphones & Objets connectés"],
  // DÉFAUT ASSUMÉ : enceinte connectée rangée en objets connectés (l'audio
  // classique vit sous Photo, audio & vidéo, cf. 🔊).
  "📡": ["Électronique", "Téléphones & Objets connectés"],
  "🪟": ["Maison & Jardin", "Linge de maison"], "🪶": ["Maison & Jardin", "Linge de maison"],
  "📜": ["Maison & Jardin", "Linge de maison"], "🛌": ["Maison & Jardin", "Linge de maison"],
  // DÉFAUT ASSUMÉ : tapis rangé en Décoration (pas de feuille tapis dédiée).
  "🟫": ["Maison & Jardin", "Décoration"],
  "🕰️": ["Maison & Jardin", "Décoration"], "🎄": ["Maison & Jardin", "Décoration"],
  "🖋️": ["Maison & Jardin", "Papeterie & Fournitures scolaires"],
  "🧼": ["Maison & Jardin", "Électroménager"], "🌀": ["Maison & Jardin", "Électroménager"],
  "🌡️": ["Maison & Jardin", "Électroménager"],
  // Machine à coudre : appareil → Électroménager (les fournitures de couture
  // iraient en Loisirs > Loisirs créatifs).
  "🧵": ["Maison & Jardin", "Électroménager"],
  "📀": ["Loisirs", "DVD - Films"], "💽": ["Loisirs", "CD - Musique"],
  "🎼": ["Loisirs", "Instruments de musique"],
  "🚁": ["Loisirs", "Jeux & Jouets"], "🎭": ["Loisirs", "Jeux & Jouets"],
  "🐴": ["Loisirs", "Sport & Plein air"], "🎱": ["Loisirs", "Sport & Plein air"],
  "🤿": ["Loisirs", "Sport & Plein air"], "🏄": ["Loisirs", "Sport & Plein air"],
  "🚼": ["Famille", "Mobilier enfant"],
  "🐕": ["Animaux", "Accessoires animaux"],
};

/**
 * @param {string} icon — emoji retourné par detectObjectIcon
 * @returns {string[]|null} [racine, feuille] Leboncoin, ou null si non mappé
 */
export function getLbcCategoryPath(icon) {
  return LBC_CATEGORIES[icon] ?? null;
}

/**
 * Statut de support Leboncoin — dérivé de LBC_CATEGORIES (même contrat que
 * vintedCategoryStatus) : "supported" | "unavailable" (null explicite —
 * véhicules immatriculés, Beauté) | "unmapped".
 */
export function lbcCategoryStatus(icon) {
  if (!Object.prototype.hasOwnProperty.call(LBC_CATEGORIES, icon)) return "unmapped";
  return LBC_CATEGORIES[icon] ? "supported" : "unavailable";
}

// ── Critères obligatoires de Famille > Équipement bébé ──────────────────────
// (relevé campagne dry-run 2026-07-08) La feuille exige DEUX critères
// FONCTIONNELS bloquants à l'aperçu, indéductibles du genre :
//   - Univers* (label for="baby_equipment_universe") : Alimentation | Mobilité
//     | Sécurité | Sommeil | Hygiène et Santé | Autres — ce n'est PAS l'univers
//     Femme/Homme/Enfant/Mixte du rayon Mode.
//   - Produit* (label for="baby_equipment_type") : options dépendantes de
//     l'univers choisi, non relevées exhaustivement — le handler matche en
//     tolérant le singulier/pluriel et, à défaut, l'erreur du job liste les
//     options réelles (relevé correctif, même méthode que Vinted).
// 👶 (poussette), 💺 (siège auto), 📟 (babyphone) restent à mapper après
// relevé de leurs univers/produits exacts — en attendant ils gardent le
// comportement antérieur (échec avec message correctif).
const LBC_BABY_EQUIPMENT = {
  "🍼": { univers: "Alimentation", produit: "Biberon" },
};

/**
 * @param {string} icon — emoji retourné par detectObjectIcon
 * @returns {{univers: string, produit: string}|null} critères fonctionnels
 *   Équipement bébé Leboncoin, ou null si l'icône n'en relève pas
 */
export function getLbcBabyEquipment(icon) {
  return LBC_BABY_EQUIPMENT[icon] ?? null;
}

// ── Famille > Vêtements bébé (2026-07-15, chantier tailles enfant) ──────────
// Relevé DOM réel (docs/sizes-baby-child-raw.txt) : la catégorie expose
// Genre (facultatif), Produit* (OBLIGATOIRE), Taille (facultative,
// « Prématuré / 44 cm » → « 36 mois / 98 cm »), Marque, Couleur, État.
// C'est LA feuille des vêtements 0-36 mois — la grille Univers-enfant de
// Mode > Vêtements démarre à 3 ans. Le routage (taille en mois → cette
// feuille) est fait par handlePublish via lbcChildSizeCategory ; ici on ne
// donne que le Produit* attendu, dans les libellés EXACTS du dropdown :
//   Bodies | T-shirt & brassières | Bermudas & Shorts | Pantalons | Jeans |
//   Dors-bien & Pyjamas | Pull & Gilets | Robes & Jupes | Manteaux & Vestes |
//   Legging & collants | Déguisements | Ensembles & Combinaisons | Bonnets |
//   Maillots de bain | Lot de vêtement | Chaussons | Mouffles | Accessoires |
//   Autre
// Défauts « Autre » assumés : pas de produit Chemises (👔) ni Chaussettes
// (le produit le plus proche de 🧦, « Legging & collants », ne couvre que
// les collants — la regex 🧦 est dominée par les chaussettes) ni costume
// (🤵) ni blazer (🥼).
const LBC_BABY_CLOTHING_PRODUCT = {
  "👕": "T-shirt & brassières",
  "👔": "Autre",
  "🧶": "Pull & Gilets",
  "👖": "Pantalons",
  "🩳": "Bermudas & Shorts",
  "👗": "Robes & Jupes",
  "🧥": "Manteaux & Vestes",
  "🧦": "Autre",
  "🩲": "Dors-bien & Pyjamas",
  "👙": "Maillots de bain",
  "🥿": "Chaussons",
  "🧤": "Mouffles",
  "🧢": "Bonnets",
  "🥼": "Autre",
  "🤵": "Autre",
};

/**
 * @param {string} icon — emoji retourné par detectObjectIcon
 * @returns {string|null} libellé EXACT du Produit* de Famille > Vêtements
 *   bébé, ou null si l'icône n'est pas un vêtement couvert (le routage bébé
 *   ne doit alors PAS s'appliquer — un jouet ou une poussette relèvent
 *   d'Équipement bébé / Jeux & Jouets, pas de Vêtements bébé)
 */
export function getLbcBabyClothingProduct(icon) {
  return LBC_BABY_CLOTHING_PRODUCT[icon] ?? null;
}
