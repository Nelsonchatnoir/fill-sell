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
  "👶": ["Famille", "Équipement bébé"],
  "🛞": ["Véhicules", "Équipement auto"], "🪖": ["Véhicules", "Équipement moto"],
  // Véhicules immatriculés complets : hors périmètre v1 (le dépôt LBC exige
  // plaque/carte grise, flux spécifique) — fallback explicite volontaire.
  "🚗": null, "🏍️": null, "🛵": null,
  // Beauté : aucun rayon Leboncoin (vérifié dans l'arbre) — fallback explicite.
  "🌸": null, "💄": null, "💅": null, "🧴": null,
};

/**
 * @param {string} icon — emoji retourné par detectObjectIcon
 * @returns {string[]|null} [racine, feuille] Leboncoin, ou null si non mappé
 */
export function getLbcCategoryPath(icon) {
  return LBC_CATEGORIES[icon] ?? null;
}
