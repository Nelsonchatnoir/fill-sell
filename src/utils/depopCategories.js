// ═══════════════════════════════════════════════════════════════════════════
// DEPOP ↔ TAXONOMIE INTERNE — CATÉGORIES (2026-10-08 ; BRANCHÉ le 09/10)
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ BRANCHÉ LE 09/10/2026 POUR LES SEULS COMPTES AUTORISÉS (bêta de Nico ;
//    coin_config `depop_ouvert` = 0, migration 20261009020000 : la base
//    refuse tout Depop d'un compte non autorisé). Importé par l'app
//    (utils/depopPublication.js, platformCompat.js, resolutionPublication.js) :
//    pour un compte non autorisé, rien n'y mène (selftest:depop-app).
//    Rattachement : docs/plateformes/depop/RATTACHEMENT.md.
//
// MÊME PATRON QUE beebsCategories.js / vintedCategories.js, pas une deuxième
// mécanique : clé = icône de detectObjectIcon (src/utils/shared.js), MODE
// dépend du genre, HORS_MODE non, `null` documenté, et le même statut
// (supported | unavailable | no_default | unmapped).
//
// CE QUI DIFFÈRE, ET POURQUOI : chez Depop une catégorie n'est pas un chemin
// de libellés mais TROIS IDENTIFIANTS — département (menswear, womenswear,
// kidswear, everything-else), groupe, type de produit — plus, en Enfants, un
// genre obligatoire (male, female, unisex). Les valeurs ci-dessous sont donc
// des clés « groupe/type » relevées (docs/plateformes/depop/arbre.json), et le
// département vient du genre de la fiche. On n'écrit JAMAIS un libellé : ceux
// de Depop en français sont parfois faux ou en double (« shirts » et
// « tshirts » tous deux « T-shirts », trois « Vestes », « Robe habillée »
// pour un déguisement) — un rattachement par le texte se tromperait.
//
// Chaque clé a été vérifiée contre le relevé : la feuille existe, le
// formulaire la propose, et l'API rattache OFFICIELLEMENT le type au
// département (seules ces feuilles ont une grille de tailles). Un type que le
// formulaire propose hors de sa liste officielle (Homme > Hauts > Blouses)
// n'est jamais visé : il n'a pas de champ Taille.
// ═══════════════════════════════════════════════════════════════════════════

/** Genre de la fiche (vocabulaire FillSell) → département Depop. */
export const DEPOP_DEPARTEMENT_PAR_GENRE = Object.freeze({
  Femme: "womenswear",
  Homme: "menswear",
  Fille: "kidswear",
  "Garçon": "kidswear",
  Enfant: "kidswear",
  "Bébé": "kidswear",
  // « Mixte » : Depop n'a AUCUN département adulte unisexe (relevé : Homme,
  // Femme, Enfants, Tout le reste). Indécidable → absent, jamais un défaut.
});

/**
 * Genre enfant Depop (obligatoire en Enfants : male, female, unisex).
 * « Bébé » ne dit pas le sexe : null = la question se pose, on ne choisit pas
 * « unisex » à la place de la personne.
 */
export const DEPOP_GENRE_ENFANT = Object.freeze({
  Fille: "female",
  "Garçon": "male",
  Enfant: "unisex",
  "Bébé": null,
});

// ── MODE : le département vient du genre. Valeur = { département: "groupe/type" }.
// Un département absent = Depop n'y rattache pas ce type (null documenté).
const MODE = {
  // ── Hauts ─────────────────────────────────────────────────────────────────
  // DÉFAUT ASSUMÉ : 👕 couvre aussi polo, débardeur, maillot de sport — feuilles
  // sœurs dédiées (tops/polo-shirts, tops/vests-tanks-camis, tops/jerseys),
  // non atteintes par ce défaut.
  "👕": { womenswear: "tops/tshirts", menswear: "tops/tshirts", kidswear: "tops/tshirts" },
  // DÉFAUT ASSUMÉ : sweat, hoodie, cardigan ont chacun leur feuille sœur
  // (tops/sweatshirts, tops/hoodies, tops/cardigans) ; le pull est pris comme
  // dominant (même choix que Beebs côté femme).
  "🧶": { womenswear: "tops/jumpers", menswear: "tops/jumpers", kidswear: "tops/jumpers" },
  // « chemise, blouse » : chemise dominante ; tops/blouses n'est officiel
  // qu'en Femme et Enfants, d'où le défaut sur shirts partout.
  "👔": { womenswear: "tops/shirts", menswear: "tops/shirts", kidswear: "tops/shirts" },
  // ── Bas ───────────────────────────────────────────────────────────────────
  // DÉFAUT ASSUMÉ : jean, jogging, legging ont leur feuille (bottoms/jeans,
  // bottoms/joggers-tracksuits, bottoms/leggings) ; pantalon dominant.
  "👖": { womenswear: "bottoms/trousers", menswear: "bottoms/trousers", kidswear: "bottoms/trousers" },
  "🩳": { womenswear: "bottoms/shorts", menswear: "bottoms/shorts", kidswear: "bottoms/shorts" },
  // « robe, jupe » : la robe dominante (feuille générique dresses/dresses, qui
  // porte l'attribut dress-type). Homme : aucun groupe Robes chez Depop.
  "👗": { womenswear: "dresses/dresses", kidswear: "dresses/dresses" },
  // ── Manteaux, costumes ────────────────────────────────────────────────────
  // DÉFAUT ASSUMÉ : veste, blouson, doudoune → coats-jackets/jackets, feuille
  // sœur ; le manteau est pris comme dominant (même choix que Beebs).
  "🧥": { womenswear: "coats-jackets/coats", menswear: "coats-jackets/coats", kidswear: "coats-jackets/coats" },
  // Costumes : officiels en Homme et Femme seulement (Enfants > Costumes est
  // proposé par le formulaire HORS liste officielle, sans tailles).
  "🥼": { womenswear: "suits/tailored-jackets", menswear: "suits/tailored-jackets" },
  "🤵": { womenswear: "suits/suits", menswear: "suits/suits" },
  // ── Dessous, nuit, bain ───────────────────────────────────────────────────
  // « sous-vêtements, lingerie, pyjama » : pyjama, comme Beebs et Vinted.
  "🩲": { womenswear: "nightwear/pajamas", menswear: "nightwear/pajamas", kidswear: "nightwear/pajamas" },
  // Sous-vêtements : pas de groupe en Enfants.
  "🧦": { womenswear: "underwear/socks", menswear: "underwear/socks" },
  // Maillot de bain : la feuille « Autre » du groupe, comme Beebs (femme) et
  // Vinted (« Autres ») — bikini, une pièce et short de bain sont des sœurs.
  "👙": { womenswear: "swim-beach-wear/other-swim-beach-wear", menswear: "swim-beach-wear/other-swim-beach-wear", kidswear: "swim-beach-wear/other-swim-beach-wear" },
  // ── Chaussures ────────────────────────────────────────────────────────────
  // DÉFAUT ASSUMÉ : 👟 couvre aussi derby, mocassin, chaussure de ville
  // (footwear/brogues, oxfords, loafers, boat-shoes : sœurs non atteintes).
  "👟": { womenswear: "footwear/trainers", menswear: "footwear/trainers", kidswear: "footwear/trainers" },
  "👢": { womenswear: "footwear/boots", menswear: "footwear/boots", kidswear: "footwear/boots" },
  // « talons, escarpins, ballerines » : footwear/courts (Pumps), officiel en
  // Femme et Enfants ; ballet-shoes est une sœur.
  "👠": { womenswear: "footwear/courts", kidswear: "footwear/courts" },
  // « sandales, tongs, claquettes, mules » : sandales dominantes.
  "🩴": { womenswear: "footwear/sandals", menswear: "footwear/sandals", kidswear: "footwear/sandals" },
  "🥿": { womenswear: "footwear/slippers", menswear: "footwear/slippers", kidswear: "footwear/slippers" },
  // ── Accessoires (tous rattachés aux trois départements) ───────────────────
  "🧢": { womenswear: "accessories/hat", menswear: "accessories/hat", kidswear: "accessories/hat" },
  // Sacs : un seul type « Sacs » chez Depop ; la nature du sac passe par
  // l'attribut bag-type (shoulder-bag, backpacks-rucksacks, bum-bag,
  // luggage-travel…), pas par la catégorie.
  "👜": { womenswear: "accessories/bag", menswear: "accessories/bag", kidswear: "accessories/bag" },
  "🎒": { womenswear: "accessories/bag", menswear: "accessories/bag", kidswear: "accessories/bag" },
  "👝": { womenswear: "accessories/bag", menswear: "accessories/bag", kidswear: "accessories/bag" },
  "🎽": { womenswear: "accessories/bag", menswear: "accessories/bag", kidswear: "accessories/bag" },
  "🧳": { womenswear: "accessories/bag", menswear: "accessories/bag", kidswear: "accessories/bag" },
  "👛": { womenswear: "accessories/wallet-purses", menswear: "accessories/wallet-purses", kidswear: "accessories/wallet-purses" },
  "🧣": { womenswear: "accessories/scarf-wraps", menswear: "accessories/scarf-wraps", kidswear: "accessories/scarf-wraps" },
  "🧤": { womenswear: "accessories/gloves", menswear: "accessories/gloves", kidswear: "accessories/gloves" },
  "⌚": { womenswear: "accessories/watch", menswear: "accessories/watch", kidswear: "accessories/watch" },
  // Montre connectée : watches-type porte `smartwatch` — c'est le même type.
  "⏱️": { womenswear: "accessories/watch", menswear: "accessories/watch", kidswear: "accessories/watch" },
  "🕶️": { womenswear: "accessories/sunglasses", menswear: "accessories/sunglasses", kidswear: "accessories/sunglasses" },
  // Bijoux : le seul type ACTIF est accessories/jewellery (collier, bague…
  // sont des valeurs de jewellery-type ; les anciens types dédiés et le
  // groupe « jewellery » sont inactifs).
  "💍": { womenswear: "accessories/jewellery", menswear: "accessories/jewellery", kidswear: "accessories/jewellery" },
  "🪢": { womenswear: "accessories/belt", menswear: "accessories/belt", kidswear: "accessories/belt" },
  // Déguisement : un seul type, dans les trois départements (libellé français
  // servi par Depop : « Robe habillée » — faux, le type est « Costume »).
  "🎭": { womenswear: "fancy-dress/fancy-dress", menswear: "fancy-dress/fancy-dress", kidswear: "fancy-dress/fancy-dress" },
  // ── Sans rayon Depop (null documenté, jamais un « Autre » par défaut) ─────
  // 🎀 cravate, nœud papillon : aucun type ; seul accessories/other-accessories
  //    les accueillerait, et un fourre-tout ne se choisit pas par défaut.
  "🎀": {},
  // 🗝️ porte-clés : même raison.
  "🗝️": {},
};

// ── HORS_MODE : département « everything-else », aucun genre. ───────────────
const HORS_MODE = {
  // ── Beauté (les 6 types marqués n'acceptent que l'état « brand_new ») ────
  "🌸": "beauty/fragrance",
  "💄": "beauty/makeup",
  "💅": "beauty/nails",
  "🧴": "beauty/skincare",
  // Rasoir, tondeuse, épilateur : grooming (grooming-type : hair-removal,
  // grooming-tools). Libellé français de Depop : « Toilettage » — faux.
  "🪒": "beauty/grooming",
  // Sèche-cheveux, lisseur : tools-and-brushes (tools-type : appliances).
  "💇": "beauty/tools-and-brushes",
  // ── Maison ────────────────────────────────────────────────────────────────
  "🍽️": "home/dinnerware",
  "🛋️": "home/furniture",
  "🪑": "home/furniture",
  "🛏️": "home/furniture",
  "💡": "home/decor-home-accesories",
  "🪞": "home/decor-home-accesories",
  "🕯️": "home/decor-home-accesories",
  "🏺": "home/decor-home-accesories",
  "🕰️": "home/decor-home-accesories",
  // DÉFAUT ASSUMÉ : « cadre, tableau, poster, sculpture » — le cadre, comme
  // Beebs (« Cadres et affiches ») et Vinted (« Encadrements ») ; les œuvres
  // ont leurs feuilles (art/paintings, art/prints, art/sculptures).
  "🖼️": "home/decor-home-accesories",
  "🛌": "home/soft-furnishings-textiles",
  "🪟": "home/soft-furnishings-textiles",
  "🪶": "home/soft-furnishings-textiles",
  "🟫": "home/soft-furnishings-textiles",
  "📜": "home/soft-furnishings-textiles",
  "🎄": "party-supplies/decorations",
  // ── Jouets ────────────────────────────────────────────────────────────────
  "🦸": "toys/action-figures-playsets",
  "🏎️": "toys/cars-vehicles",
  "🚁": "toys/cars-vehicles",
  "🃏": "toys/trading-cards",
  "🎲": "toys/puzzles-games",
  "🧩": "toys/puzzles-games",
  "🧸": "toys/stuffed-animals",
  "🧱": "toys/building-sets-blocks",
  "🪆": "toys/dolls-accessories",
  // ── Livres, musique, image ────────────────────────────────────────────────
  "📚": "books-and-magazine/books",
  "📖": "books-and-magazine/books",
  "📰": "books-and-magazine/magazines",
  "💿": "music/cds-and-vinyl",
  "💽": "music/cds-and-vinyl",
  "🎸": "music/musical-instruments-and-dj",
  "🎻": "music/musical-instruments-and-dj",
  "🥁": "music/musical-instruments-and-dj",
  "🎺": "music/musical-instruments-and-dj",
  "🎹": "music/musical-instruments-and-dj",
  "🎼": "music/musical-instruments-and-dj",
  "🎤": "music/musical-instruments-and-dj",
  // Casque audio : musical-instruments-and-dj-type porte `headphones`.
  "🎧": "music/musical-instruments-and-dj",
  "📷": "film/cameras-and-accessories",
  // DVD, VHS : cameras-and-accessories-type porte `dvd` et `vhs` — c'est LÀ
  // que Depop les range (relevé tel quel, aussi étrange qu'il paraisse).
  "📀": "film/cameras-and-accessories",
  // ── Sport ─────────────────────────────────────────────────────────────────
  "⚽": "sports-equipment-accesories/ball-sports",
  "🏀": "sports-equipment-accesories/ball-sports",
  "🎾": "sports-equipment-accesories/raquet-sports",
  "⛳": "sports-equipment-accesories/golf",
  "🚲": "sports-equipment-accesories/cycling",
  // DÉFAUT ASSUMÉ : « casque de vélo ou de ski » — vélo (cycling-type :
  // helmets-accessories) ; le casque de ski vit sous winter-sports.
  "⛑️": "sports-equipment-accesories/cycling",
  "🛹": "sports-equipment-accesories/skates-skateboards-scooters",
  "⛸️": "sports-equipment-accesories/skates-skateboards-scooters",
  "🛴": "sports-equipment-accesories/skates-skateboards-scooters",
  "🎿": "sports-equipment-accesories/winter-sports",
  "🏄": "sports-equipment-accesories/water-sports",
  "🤿": "sports-equipment-accesories/water-sports",
  "🥽": "sports-equipment-accesories/water-sports",
  "⛺": "sports-equipment-accesories/camping-hiking",
  "🏋️": "sports-equipment-accesories/fitness",
  "🏃": "sports-equipment-accesories/fitness",
  "🧘": "sports-equipment-accesories/fitness",
  // ── Collection, divers ────────────────────────────────────────────────────
  "📮": "art/collectibles",
  "🪙": "art/collectibles",
  "🏆": "art/collectibles",
  "☂️": "umbrella/umbrella",

  // ── ABSENCES RÉELLES : Depop n'a aucun rayon (catalogue relevé le 08/10) ─
  // Téléphonie, informatique, image, son : seuls existent les étuis
  // (tech-accessories/phone-cases, laptop-cases-bag) — pas les appareils.
  "📱": null, "💻": null, "📲": null, "🖥️": null, "⌨️": null, "🖱️": null,
  "🖨️": null, "📺": null, "🔊": null, "📡": null, "📇": null, "🎮": null,
  "🔌": null, "🛸": null,
  // Électroménager : home/home-appliances est INACTIF chez Depop.
  "🧺": null, "☕": null, "🧼": null, "🧵": null, "🫖": null, "🧹": null,
  "🧊": null, "♨️": null, "🥣": null, "🍞": null, "🍟": null, "🌀": null,
  "🌡️": null, "⚡": null,
  // Cuisson : home n'a que la vaisselle (dinnerware) — une casserole n'en est pas.
  "🍳": null,
  // Bricolage, jardin : aucun rayon.
  "🪛": null, "🪚": null, "🔨": null, "🪜": null, "🖌️": null, "🔩": null,
  "📏": null, "🔧": null, "🌱": null, "✂️": null, "🔥": null, "⛱️": null,
  "🪴": null, "🌿": null,
  // Véhicules : aucun rayon.
  "🏍️": null, "🛵": null, "🛞": null, "🚗": null, "🪖": null,
  // Puériculture, animaux : aucun rayon.
  "👶": null, "💺": null, "🍼": null, "📟": null, "🚼": null, "🐕": null,
  // Sports sans type : boxe, pêche, équitation, billard/fléchettes.
  "🥊": null, "🎣": null, "🐴": null, "🎱": null,
  // Papeterie : aucun type (les cartes de party-supplies sont des cartes de vœux).
  "🖋️": null,
};

// ── Icônes DÉFAUT de type : la racine existe, l'objet n'est pas nommé ───────
// (même contrat que SANS_FEUILLE_DEFAUT de Vinted et Beebs).
const SANS_FEUILLE_DEFAUT = new Set([
  "🏠", // Maison — 5 types actifs, aucun fourre-tout
  "🎵", // Musique — disques OU instruments
  "💎", // Luxe — aucun objet précis
  "📦", // filet générique
]);

/** true si le chemin Depop de l'icône dépend du genre (MODE). */
export function depopGenreRequired(icon) {
  if (Object.prototype.hasOwnProperty.call(HORS_MODE, icon)) return false;
  return Object.prototype.hasOwnProperty.call(MODE, icon);
}

/** Statut de support Depop — même contrat que vintedCategoryStatus / beebsCategoryStatus. */
export function depopCategoryStatus(icon) {
  if (SANS_FEUILLE_DEFAUT.has(icon)) return "no_default";
  if (Object.prototype.hasOwnProperty.call(HORS_MODE, icon)) {
    return HORS_MODE[icon] ? "supported" : "unavailable";
  }
  const entry = MODE[icon];
  if (!entry) return "unmapped";
  return Object.values(entry).some(Boolean) ? "supported" : "unavailable";
}

/**
 * La catégorie Depop d'une icône pour un genre.
 * @param {string} icon  — emoji de detectObjectIcon
 * @param {string} genre — « Femme » | « Homme » | « Fille » | « Garçon » |
 *   « Enfant » | « Bébé » (« Mixte » ou vide : null — indécidable)
 * @returns {{departement:string, groupe:string, type_produit:string,
 *   cle:string, genre_enfant:string|null, genre_a_demander:boolean}|null}
 */
export function getDepopCategory(icon, genre) {
  let departement = null;
  let cleType = null;
  if (Object.prototype.hasOwnProperty.call(HORS_MODE, icon)) {
    cleType = HORS_MODE[icon];
    departement = "everything-else";
  } else {
    const entry = MODE[icon];
    departement = DEPOP_DEPARTEMENT_PAR_GENRE[genre] ?? null;
    if (!entry || !departement) return null;
    cleType = entry[departement] ?? null;
  }
  if (!cleType) return null;
  const [groupe, type_produit] = cleType.split("/");
  const enfant = departement === "kidswear";
  const genre_enfant = enfant ? (DEPOP_GENRE_ENFANT[genre] ?? null) : null;
  return {
    departement,
    groupe,
    type_produit,
    cle: `${departement}/${cleType}`,
    genre_enfant,
    genre_a_demander: enfant && !genre_enfant,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// L'AUTRE SENS : CHAQUE TYPE DE PRODUIT DEPOP → LA TAXONOMIE INTERNE
// ═══════════════════════════════════════════════════════════════════════════
// Sert au relevé (une annonce Depop importée prend une icône, un type et une
// famille) et prouve qu'AUCUNE feuille ne disparaît en silence : les 160
// types relevés sont tous ici, un par un (le selftest le vérifie).
//   { icone, type, famille }   rattaché à une icône d'ALL_OBJECT_ICONS ;
//   { icone: null, type, famille, pourquoi }
//                              rattaché au TYPE seulement : aucune icône ne dit
//                              cet objet sans le déformer — l'icône reste à la
//                              détection du titre, comme pour toute fiche ;
//   { non_rattachee: "raison" } inactif chez Depop, absent du formulaire.
// `type` ∈ detectType (shared.js), `famille` ∈ FAMILLES (familleCategorie.js).
// Le département donne le genre (menswear → Homme, womenswear → Femme,
// kidswear → Fille / Garçon / Enfant selon le genre enfant de l'annonce).
const M = (icone, famille = "mode", type = "Mode") => ({ icone, type, famille });
const T = (type, famille, pourquoi) => ({ icone: null, type, famille, pourquoi });
const INACTIF = { non_rattachee: "type INACTIF chez Depop (status inactive) : le formulaire ne le propose pas" };

export const DEPOP_TYPE_VERS_INTERNE = Object.freeze({
  // tops
  "tops/tshirts": M("👕"),
  "tops/jerseys": M("👕"),
  "tops/hoodies": M("🧶"),
  "tops/sweatshirts": M("🧶"),
  "tops/jumpers": M("🧶"),
  "tops/cardigans": M("🧶"),
  "tops/shirts": M("👔"),
  "tops/polo-shirts": M("👕"),
  "tops/blouses": M("👔"),
  "tops/crop-top": M("👕"),
  "tops/vests-tanks-camis": M("👕"),
  "tops/corsets": T("Mode", "mode", "corset : ni t-shirt ni lingerie dans la légende des icônes"),
  "tops/bodysuits": T("Mode", "mode", "body : aucune icône ne le dit"),
  "tops/other-tops": T("Mode", "mode", "« Autre » : objet non nommé"),
  // bottoms
  "bottoms/jeans": M("👖"),
  "bottoms/joggers-tracksuits": M("👖"),
  "bottoms/trousers": M("👖"),
  "bottoms/shorts": M("🩳"),
  "bottoms/leggings": M("👖"),
  "bottoms/skirts": M("👗"),
  "bottoms/other-bottoms": T("Mode", "mode", "« Autre » : objet non nommé"),
  // dresses
  "dresses/casual-dresses": M("👗"),
  "dresses/formal-dresses": M("👗"),
  "dresses/going-out-dresses": M("👗"),
  "dresses/prom-dresses": M("👗"),
  "dresses/summer-dresses": M("👗"),
  "dresses/shift-dresses": M("👗"),
  "dresses/shirt-dresses": M("👗"),
  "dresses/wrap-dresses": M("👗"),
  "dresses/babydoll-dresses": M("👗"),
  "dresses/bodycon-dresses": M("👗"),
  "dresses/work-dresses": M("👗"),
  "dresses/wedding-dresses": M("👗"),
  "dresses/other-dresses": M("👗"),
  "dresses/dresses": M("👗"),
  // coats-jackets
  "coats-jackets/coats": M("🧥"),
  "coats-jackets/jackets": M("🧥"),
  "coats-jackets/gilets": M("🧥"),
  "coats-jackets/other-coats-jackets": M("🧥"),
  // jumpsuit-and-playsuit
  "jumpsuit-and-playsuit/jumpsuit": T("Mode", "mode", "combinaison : aucune icône (👖 ne couvre que la salopette)"),
  "jumpsuit-and-playsuit/playsuit-romper": T("Mode", "mode", "combishort : aucune icône"),
  "jumpsuit-and-playsuit/dungarees-overalls": M("👖"),
  "jumpsuit-and-playsuit/other-jumpsuit-and-playsuit": T("Mode", "mode", "« Autre » : objet non nommé"),
  // suits
  "suits/suits": M("🤵"),
  "suits/tailored-jackets": M("🥼"),
  "suits/tailored-trousers": M("👖"),
  "suits/waistcoats-vests": T("Mode", "mode", "gilet de costume : ni costume entier ni veste"),
  "suits/tuxedos": M("🤵"),
  "suits/other-suits": T("Mode", "mode", "« Autre » : objet non nommé"),
  // footwear
  "footwear/oxfords-brogues": INACTIF,
  "footwear/trainers": M("👟"),
  "footwear/slides": M("🩴"),
  "footwear/sandals": M("🩴"),
  "footwear/flipflops": M("🩴"),
  "footwear/slippers": M("🥿"),
  "footwear/brogues": M("👟"),
  "footwear/oxfords": M("👟"),
  "footwear/loafers": M("👟"),
  "footwear/boots": M("👢"),
  "footwear/boat-shoes": M("👟"),
  "footwear/espadrilles": M("👟"),
  "footwear/ballet-shoes": M("👠"),
  "footwear/clogs": M("🩴"),
  "footwear/courts": M("👠"),
  "footwear/mules": M("🩴"),
  "footwear/first-shoes-baby-shoes": T("Mode", "mode", "chaussures de bébé : aucune icône dédiée"),
  "footwear/other-footwear": T("Mode", "mode", "« Autre » : objet non nommé"),
  // accessories
  "accessories/necklace": INACTIF,
  "accessories/body-jewellery": INACTIF,
  "accessories/brooches-pins": INACTIF,
  "accessories/caps-snapbacks": INACTIF,
  "accessories/rings": INACTIF,
  "accessories/earrings-and-ear-cuffs": INACTIF,
  "accessories/bracelet-anklets": INACTIF,
  "accessories/bag": M("👜"),
  "accessories/belt": M("🪢"),
  "accessories/hat": M("🧢"),
  "accessories/gloves": M("🧤"),
  "accessories/scarf-wraps": M("🧣"),
  "accessories/sunglasses": M("🕶️"),
  "accessories/wallet-purses": M("👛"),
  "accessories/jewellery": M("💍"),
  "accessories/watch": M("⌚"),
  "accessories/hair-accessories": T("Mode", "mode", "accessoire pour cheveux : aucune icône"),
  "accessories/other-accessories": T("Mode", "mode", "« Autre » : objet non nommé"),
  // nightwear
  "nightwear/pajamas": M("🩲"),
  "nightwear/robes": T("Mode", "mode", "robe de chambre : aucune icône (👗 serait une robe)"),
  "nightwear/other-nightwear": T("Mode", "mode", "« Autre » : objet non nommé"),
  // underwear
  "underwear/bandeaus": M("🩲"),
  "underwear/bras": M("🩲"),
  "underwear/panties": M("🩲"),
  "underwear/shapewear": M("🩲"),
  "underwear/boxers-and-briefs": M("🩲"),
  "underwear/vest-undershirts": M("🩲"),
  "underwear/socks": M("🧦"),
  "underwear/hosiery-tights": M("🧦"),
  "underwear/other-underwear": M("🩲"),
  // swim-beach-wear
  "swim-beach-wear/bikinis-and-tankini-sets": M("👙"),
  "swim-beach-wear/bikini-and-tankini-tops": M("👙"),
  "swim-beach-wear/bikini-and-tankini-bottoms": M("👙"),
  "swim-beach-wear/swimsuit-one-piece": M("👙"),
  "swim-beach-wear/swim-briefs-shorts": M("👙"),
  "swim-beach-wear/cover-ups": T("Mode", "mode", "paréo, cache-maillot : aucune icône"),
  "swim-beach-wear/other-swim-beach-wear": M("👙"),
  // fancy-dress, sleepsuits, bundles
  "fancy-dress/fancy-dress": M("🎭", "loisirs", "Jouets"),
  "sleepsuits-and-bodysuits/sleepsuits-babygrows": T("Mode", "mode", "grenouillère, body bébé : aucune icône"),
  "bundles/bundles": T("Mode", "mode", "lot de vêtements : plusieurs objets"),
  // beauty
  "beauty/bath-and-body": M("🧴", "beaute", "Beauté"),
  "beauty/fragrance": M("🌸", "beaute", "Beauté"),
  "beauty/hair-products": M("🧴", "beaute", "Beauté"),
  "beauty/makeup": M("💄", "beaute", "Beauté"),
  "beauty/nails": M("💅", "beaute", "Beauté"),
  "beauty/grooming": M("🪒", "beaute", "Beauté"),
  "beauty/skincare": M("🧴", "beaute", "Beauté"),
  "beauty/tools-and-brushes": T("Beauté", "beaute", "appareils OU pinceaux : deux objets"),
  // face-masks
  "face-masks/face-masks": T("Mode", "mode", "masque en tissu : aucune icône"),
  // home
  "home/dinnerware": M("🍽️", "maison", "Maison"),
  "home/furniture": M("🛋️", "maison", "Maison"),
  "home/decor-home-accesories": M("🏠", "maison", "Maison"),
  "home/home-appliances": INACTIF,
  "home/soft-furnishings-textiles": M("🏠", "maison", "Maison"),
  "home/storage-and-organisation": M("🏠", "maison", "Maison"),
  // tech-accessories, film
  "tech-accessories/laptop-cases-bag": T("High-Tech", "electronique", "housse d'ordinateur : aucune icône (💻 serait l'ordinateur)"),
  "tech-accessories/phone-cases": T("High-Tech", "electronique", "coque de téléphone : aucune icône (📱 serait le téléphone)"),
  "film/cameras-and-accessories": M("📷", "electronique", "High-Tech"),
  // art
  "art/collectibles": M("🏆", "loisirs", "Collection"),
  "art/drawing-and-illustrations": M("🖼️", "maison", "Maison"),
  "art/mixed-media": M("🖼️", "maison", "Maison"),
  "art/paintings": M("🖼️", "maison", "Maison"),
  "art/photography": M("🖼️", "maison", "Maison"),
  "art/prints": M("🖼️", "maison", "Maison"),
  "art/sculptures": M("🖼️", "maison", "Maison"),
  "art/stickers": T("Collection", "loisirs", "autocollants : aucune icône"),
  // books-and-magazine, music
  "books-and-magazine/books": M("📚", "loisirs", "Livres"),
  "books-and-magazine/magazines": M("📰", "loisirs", "Livres"),
  "music/cds-and-vinyl": M("🎵", "loisirs", "Musique"),
  "music/musical-instruments-and-dj": M("🎵", "loisirs", "Musique"),
  // party-supplies
  "party-supplies/cake-decor": T("Maison", "maison", "décoration de gâteau : aucune icône"),
  "party-supplies/cards-invitations-gift-wrap": T("Maison", "maison", "cartes et papier cadeau : aucune icône"),
  "party-supplies/decorations": T("Maison", "maison", "décoration de fête : 🎄 ne dit que Noël"),
  "party-supplies/favours": T("Maison", "maison", "articles de fête : aucune icône"),
  "party-supplies/party-hats": T("Maison", "maison", "chapeaux de fête : aucune icône"),
  // sports
  "sports-equipment-accesories/ball-sports": M("⚽", "loisirs", "Sport"),
  "sports-equipment-accesories/camping-hiking": M("⛺", "loisirs", "Sport"),
  "sports-equipment-accesories/cycling": M("🚲", "loisirs", "Sport"),
  "sports-equipment-accesories/fitness": M("🏋️", "loisirs", "Sport"),
  "sports-equipment-accesories/golf": M("⛳", "loisirs", "Sport"),
  "sports-equipment-accesories/skates-skateboards-scooters": M("🛹", "loisirs", "Sport"),
  "sports-equipment-accesories/raquet-sports": M("🎾", "loisirs", "Sport"),
  "sports-equipment-accesories/water-sports": M("🏄", "loisirs", "Sport"),
  "sports-equipment-accesories/winter-sports": M("🎿", "loisirs", "Sport"),
  // toys
  "toys/action-figures-playsets": M("🦸", "loisirs", "Jouets"),
  "toys/building-sets-blocks": M("🧱", "loisirs", "Jouets"),
  "toys/cars-vehicles": M("🏎️", "loisirs", "Jouets"),
  "toys/dolls-accessories": M("🪆", "loisirs", "Jouets"),
  "toys/learning-toys": T("Jouets", "loisirs", "jouet d'éveil : aucune icône"),
  "toys/puzzles-games": T("Jouets", "loisirs", "puzzle OU jeu : deux icônes (🧩, 🎲)"),
  "toys/stuffed-animals": M("🧸", "loisirs", "Jouets"),
  "toys/trading-cards": M("🃏", "loisirs", "Jouets"),
  // umbrella
  "umbrella/umbrella": M("☂️"),
});

/** Le département Depop → genre FillSell (Enfants : selon le genre enfant). */
export function depopGenreDepuis(departement, genreEnfant = null) {
  if (departement === "womenswear") return "Femme";
  if (departement === "menswear") return "Homme";
  if (departement === "kidswear") {
    if (genreEnfant === "female") return "Fille";
    if (genreEnfant === "male") return "Garçon";
    return "Enfant";
  }
  return null;
}

/** Une feuille Depop (« departement/groupe/type ») → la taxonomie interne. */
export function depopVersInterne(cle) {
  const [departement, groupe, type] = String(cle ?? "").split("/");
  const r = DEPOP_TYPE_VERS_INTERNE[`${groupe}/${type}`];
  if (!r) return null;
  if (r.non_rattachee) return { ...r };
  return { ...r, departement };
}

export const _internes = { MODE, HORS_MODE, SANS_FEUILLE_DEFAUT };
