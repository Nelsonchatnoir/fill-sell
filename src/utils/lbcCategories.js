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
  // Beauté (re-relevé LIVE 2026-07-19, wizard de dépôt) : toujours AUCUN rayon
  // beauté dans les 13 racines — mais un sérum/parfum se vend bel et bien sur
  // LBC (221 annonces « sérum visage », rangées au petit bonheur : Collection,
  // Équipements commerces, Matériel médical…). DÉFAUT ASSUMÉ : Divers > Autres,
  // l'unique fourre-tout officiel du dépôt — le null d'origine bloquait la
  // plateforme entière (« Non vendable sur Leboncoin ») pour des produits
  // parfaitement vendables. Appareils (💇🪒) déjà en Électroménager, inchangés.
  "🌸": ["Divers", "Autres"], "💄": ["Divers", "Autres"],
  "💅": ["Divers", "Autres"], "🧴": ["Divers", "Autres"],
  "📦": null, // filet générique (gourde, veilleuse, objets sans feuille dédiée)
  // ── Icônes DÉFAUT de type (audit 2026-07-19) : un article d'un type sans
  // mot-clé objet reconnu tombait sur une icône jamais mappée → 4 plateformes
  // grisées. Les feuilles LBC sont larges (2 niveaux) : parfaites en défaut.
  // 🎵 : les supports (CD/vinyles) ont leurs mots-clés → le défaut Musique ne
  // capte que le reste, c.-à-d. instruments et accessoires. ─────────────────
  "🏠": ["Maison & Jardin", "Décoration"],
  "⚡": ["Maison & Jardin", "Électroménager"],
  "🎵": ["Loisirs", "Instruments de musique"],
  "🏆": ["Loisirs", "Collection"],
  "🌿": ["Maison & Jardin", "Jardin & Plantes"],

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

// ═══════════════════════════════════════════════════════════════════════════
// PRODUITS INTERDITS PAR LEBONCOIN — cosmétiques consommables (2026-08-11)
// ═══════════════════════════════════════════════════════════════════════════
// Leboncoin INTERDIT la vente des produits cosmétiques (parfums, maquillage,
// crèmes, soins). Ce n'est PAS un problème de catégorie : aucune feuille de
// l'arbre ne les fait passer. Le mapping Beauté → Divers > Autres du 19/07
// (juste au-dessus) reposait sur une prémisse fausse — « LBC n'a pas de rayon
// beauté » — alors que le vrai obstacle est une interdiction de PRODUIT. Le
// message de refus (« le bien ou service que vous souhaitez proposer n'est pas
// adapté à la catégorie que vous avez sélectionnée ») est le texte générique de
// leur modération automatisée, pas un diagnostic.
//
// PREUVE EN BASE (relevé 2026-08-11) — les 4 SEULS jobs LBC jamais partis en
// Divers > Autres depuis le début du produit sont des cosmétiques, et AUCUN
// n'a abouti : parfum Karl Lagerfeld (11/08, published SANS URL), sérum Medik8
// (10/08, published SANS URL), masques Mixsoon ×2 (10/08, failed). Les deux qui
// ont traversé le tunnel ont reçu un mail de refus. Tous les autres dépôts LBC
// aboutis vivent dans d'autres feuilles.
//
// ⚠️ LA LIMITE EST LE CONSOMMABLE, PAS « LA BEAUTÉ ». Restent vendables, donc
// NON bloqués : flacons vides ou de collection, trousses/vanity/rangements,
// pinceaux, brosses, miroirs, et tous les APPAREILS (sèche-cheveux, lisseur,
// tondeuse, épilateur, Dyson Airwrap).
//
// ⚠️⚠️ L'ICÔNE NE SUFFIT PAS, ET C'EST MESURÉ. Sur les 4 881 lignes
// d'inventaire réelles, 205 tombent sur une icône cosmétique (🌸💄💅🧴), mais
// 166 d'entre elles (81 %) ne sont PAS des cosmétiques :
//   · 165 lignes / 108 titres = des cartes Pokémon de l'extension « MASCARADE
//     Crépusculaire ». La règle 💄 d'OBJECT_ICON_RULES contient `mascara` SANS
//     borne de mot : « Mascarade » matche. Griser LBC sur l'icône seule
//     retirerait la plateforme à 108 articles de collection parfaitement
//     vendables.
//   · 1 ligne = un « Ensemble » de Mode dont la description dit « Crème et
//     blanc, fille » — la COULEUR crème, pas un produit.
// D'où la règle en trois temps ci-dessous, avec des bornes de mot Unicode
// (`(?![\p{L}\p{N}])`, l'idiome déjà retenu dans shared.js contre le piège du
// \b ASCII-only : sans lui, `\bparfum\b` matche « parfumée »).
//
// DOCTRINE : en cas de doute, ON NE BLOQUE PAS. Griser à tort un article qui
// passerait est un dégât immédiat et visible ; ne pas bloquer laisse le
// comportement d'aujourd'hui (refus à la modération), qui est mauvais mais
// connu. Toute classe d'objets non tranchable reste donc publiable.

// Périmètre : les 4 seules icônes qui portent un produit cosmétique. Elles ne
// DÉCIDENT rien (cf. Mascarade) — elles bornent, pour que le vocabulaire
// ci-dessous ne puisse pas se déclencher sur un article d'une autre famille.
const ICONES_COSMETIQUES = new Set(["🌸", "💄", "💅", "🧴"]);

// Bornes de mot Unicode — « parfum » ne doit pas matcher dans « parfumée »,
// « mascara » pas dans « Mascarade », « fard » pas dans « fardeau ».
const D = "(?<![\\p{L}\\p{N}])";  // début de mot
const F = "(?![\\p{L}\\p{N}])";   // fin de mot

// ── 1. Le TITRE NOMME un consommable cosmétique ────────────────────────────
// Vocabulaire volontairement restreint aux termes qui désignent le PRODUIT
// lui-même. Les termes trop polysémiques en sont ABSENTS par décision :
//   · `savon` seul (savon de Marseille / noir / ménager = entretien),
//   · `vernis` seul (vernis à bois),
//   · `palette` seule (palette de bois, et « Mascarade » a déjà servi de leçon),
//   · `solaire` seul (panneau solaire, lunettes de soleil).
// Ces produits-là restent attrapés par la règle 3 quand l'article est typé
// Beauté — c'est-à-dire quand l'utilisateur a lui-même dit que c'en était un.
const CONSOMMABLE_TITRE = new RegExp([
  // Parfums
  `${D}parfums?${F}`, `eaux?.?de.?(?:toilette|parfum|cologne)`, `${D}colognes?${F}`,
  `${D}ed[tp]${F}`, `extraits?.?de.?parfum`,
  // Maquillage
  `${D}maquillages?${F}`, `${D}make.?up${F}`, `${D}mascaras?${F}`,
  `rouges?.?[àa].?l[èe]vres?`, `${D}lipsticks?${F}`, `${D}gloss(?:es)?${F}`,
  `${D}fards?${F}`, `${D}eye.?liners?${F}`, `fonds?.?de.?teint`, `${D}blush(?:es)?${F}`,
  `anti.?cernes?`, `poudres?.?(?:libres?|compactes?|bronzantes?)`,
  `${D}highlighters?${F}`, `${D}enlumineurs?${F}`, `${D}bronzers?${F}`,
  `crayons?.?(?:[àa].?)?(?:l[èe]vres?|yeux|sourcils)`, `${D}kh[ôo]l${F}`,
  `palettes?.?(?:de.?)?(?:fards?|maquillage|ombres?|yeux|teints?|contouring)`,
  // Ongles
  `vernis.?(?:[àa].?)?(?:ongles?|semi.?permanents?|gels?)`, `${D}manucures?${F}`,
  `faux.?ongles?`, `${D}dissolvants?${F}`,
  // Soins
  `${D}cr[èe]mes?${F}`, `${D}s[ée]rums?${F}`, `${D}lotions?${F}`,
  `${D}shampo(?:o)?ings?${F}`, `apr[èe]s.?shampo`, `gels?.?douche`,
  `${D}d[ée]odorants?${F}`, `${D}gommages?${F}`, `${D}exfoliants?${F}`,
  `${D}d[ée]maquillants?${F}`, `${D}dentifrices?${F}`,
  `baumes?.?(?:[àa].?)?(?:l[èe]vres?|corps|visage|cheveux)`,
  // « en feuille » : libellé du job LBC réellement refusé le 10/08 (« Mixsoon
  // Soybean Milk Pad - 10 packs masques en feuille »).
  `masques?.?(?:pour.?)?(?:les?.?)?(?:visages?|corps|cheveux|capillaires?|hydratants?|purifiants?|exfoliants?|de.?nuit|en.?tissu|en.?feuilles?|l[èe]vres?)`,
  `huiles?.?(?:pour.?)?(?:les?.?)?(?:visages?|corps|cheveux|barbe|s[èe]che|d[ée]maquillante|de.?massage)`,
  `soins?.?(?:de.?)?(?:la.?)?(?:peau|visage|corps|mains?|anti.?[âa]ges?|anti.?rides?|hydratants?|anti.?rougeurs?)`,
  `cr[èe]mes?.?solaires?`, `(?:lotion|protection|[ée]cran).?solaire`,
  `apr[èe]s.?(?:rasage|soleil)`, `contour.?des.?yeux`,
  // Anglais (titres importés : « Lip Sleeping Mask », « Unseen Sunscreen »)
  `${D}skincare${F}`, `${D}sunscreens?${F}`, `${D}spf.?\\d`,
  `${D}moisturi[sz]ers?${F}`, `${D}cleansers?${F}`, `${D}toners?${F}`,
  `lips?.?(?:balms?|masks?|oils?|glosses?|sticks?|scrubs?)`,
  `body.?(?:lotions?|butters?|scrubs?|oils?)`, `after.?shaves?`,
].join("|"), "iu");

// ── 2. Le TITRE nomme au contraire un NON-consommable ──────────────────────
// Veto ABSOLU : il prime sur tout le reste, y compris sur le type Beauté. Un
// « coffret » n'y est PAS (un coffret de parfums en est un) — seul le coffret
// DE RANGEMENT l'est. Vérifié sur le TITRE seul : la description d'un vrai
// parfum dit régulièrement « dans sa boîte d'origine », ce qui suffirait à
// laisser passer le produit interdit.
const NON_CONSOMMABLE_TITRE = new RegExp([
  // Contenants et rangement
  `${D}trousses?${F}`, `${D}vanity${F}`, `${D}vanity.?case`, `${D}beauty.?case`,
  `(?:coffrets?|bo[îi]tes?|caisses?).?de.?rangement`, `${D}rangements?${F}`,
  `${D}organi[sz]e(?:u)?rs?${F}`, `${D}pr[ée]sentoirs?${F}`, `${D}distributeurs?${F}`,
  `porte.?(?:pinceaux?|maquillage|parfums?|savons?)`, `${D}[ée]tuis?${F}`,
  `${D}pochettes?${F}`, `${D}sacoches?${F}`, `${D}mallettes?${F}`, `${D}valises?${F}`,
  // Vide, factice, collection
  `${D}vides?${F}`, `de.?collection`, `${D}collector${F}`, `${D}factices?${F}`,
  `${D}dummy${F}`, `sans.?produit`,
  // Outils et accessoires
  `${D}pinceaux?${F}`, `${D}brosses?${F}`, `${D}peignes?${F}`, `${D}[ée]ponges?${F}`,
  `beauty.?blender`, `${D}houppettes?${F}`, `${D}applicateurs?${F}`,
  `limes?.?[àa].?ongles?`, `coupe.?ongles?`, `${D}ciseaux${F}`, `pinces?.?[àa].?[ée]piler`,
  `recourbe.?cils`, `${D}miroirs?${F}`, `${D}bigoudis${F}`, `serre.?t[êe]tes?`,
  `${D}headbands?${F}`, `gants?.?de.?toilette`,
  // Appareils (déjà hors périmètre par l'icône 💇/🪒/⚡ — filet de sécurité)
  `${D}appareils?${F}`, `${D}lisseurs?${F}`, `s[èe]che.?cheveux`, `${D}tondeuses?${F}`,
  `${D}rasoirs?${F}`, `${D}[ée]pilateurs?${F}`, `${D}airwrap${F}`, `${D}dyson${F}`,
  `${D}babyliss${F}`, `${D}ghd${F}`, `masques?.?led`, `luminoth[ée]rapie`,
  `${D}st[ée]rilisateurs?${F}`, `${D}diffuseurs?${F}`, `${D}brumisateurs?${F}`,
  `${D}vaporisateurs?${F}`, `${D}nettoyeurs?${F}`,
  // Puériculture typée « Beauté » par erreur — relevé réel : « M5 Wearable
  // Breast Pump - Double Set » est en base sous type=Beauté. Sans mot-clé
  // français, il tombe sur le défaut 🧴 et la règle 3 le bloquerait.
  `tire.?laits?`, `breast.?pumps?`, `pompes?.?mammaires?`,
  // Parfum NON corporel : ce n'est pas un cosmétique, LBC ne l'interdit pas
  `parfums?.?d.?(?:ambiance|int[ée]rieur)`, `parfums?.?(?:de|pour).?(?:la.?)?(?:maison|linge|voiture)`,
  `${D}d[ée]sodorisants?${F}`, `${D}encens${F}`, `br[ûu]le.?parfums?`, `${D}bougies?${F}`,
  `senteurs?.?d.?int[ée]rieur`,
  // Masques qui n'ont rien de cosmétique
  `masques?.?(?:chirurgi|ffp\\d|de.?ski|de.?plong[ée]e|de.?carnaval|de.?d[ée]guisement|[àa].?gaz|de.?soudure|de.?protection|anti.?poussi[èe]re)`,
  // Savons d'entretien
  `savons?.?(?:de.?marseille|noirs?|vaisselle|m[ée]nagers?|d[ée]tachants?)`,
].join("|"), "iu");

/**
 * Cet article est-il un cosmétique CONSOMMABLE, donc interdit de vente sur
 * Leboncoin ? Règle en trois temps, dans cet ordre :
 *   1. l'icône objet est cosmétique (borne du périmètre — ne décide rien) ;
 *   2. le titre nomme un NON-consommable → NON, jamais (veto absolu) ;
 *   3. le titre nomme un consommable, OU l'article est typé « Beauté ».
 *
 * @param {string} icon — emoji retourné par detectObjectIcon
 * @param {{titre?: string, description?: string, type?: string}} article
 * @returns {boolean} true = à bloquer sur Leboncoin
 */
export function estCosmetiqueInterditeLbc(icon, article) {
  if (!ICONES_COSMETIQUES.has(icon)) return false;
  // Le TITRE, et lui seul : c'est lui qui NOMME l'objet (même doctrine que la
  // passe 1 de detectObjectIconKeyword). La description d'un vêtement dit
  // « crème » pour une couleur, celle d'un parfum dit « boîte d'origine » —
  // la lire dans un sens comme dans l'autre produit des faux verdicts.
  const titre = String(article?.titre ?? "");
  if (NON_CONSOMMABLE_TITRE.test(titre)) return false;
  if (CONSOMMABLE_TITRE.test(titre)) return true;
  // Le type ne suffit PAS seul (un Dyson Airwrap typé Beauté reste un
  // appareil) — mais ici l'icône est déjà cosmétique ET le veto est passé :
  // « Anti-Cernes », « Lip Sleeping Mask », « Soybean Milk Pads » n'ont aucun
  // mot-clé français et ne seraient sinon jamais vus.
  return String(article?.type ?? "").trim().toLowerCase() === "beauté";
}

/**
 * Statut de support Leboncoin — dérivé de LBC_CATEGORIES (même contrat que
 * vintedCategoryStatus) : "supported" | "unavailable" (null explicite —
 * véhicules immatriculés) | "unmapped", plus un état PROPRE à Leboncoin :
 *   "prohibited" — la catégorie existe, l'article y entrerait, mais Leboncoin
 *   INTERDIT ce produit (cosmétique consommable). Distinct d'"unavailable" :
 *   ce n'est pas un trou de catalogue, c'est un refus de vente, et le message
 *   affiché doit le dire — sinon l'utilisateur cherche à contourner.
 *
 * @param {string} icon — emoji retourné par detectObjectIcon
 * @param {{titre?: string, description?: string, type?: string}|null} article —
 *   OPTIONNEL. Absent = comportement d'avant 2026-08-11 à l'identique : aucun
 *   appelant qui ne connaît pas l'article ne peut déclencher un blocage.
 */
export function lbcCategoryStatus(icon, article = null) {
  if (article && estCosmetiqueInterditeLbc(icon, article)) return "prohibited";
  if (!Object.prototype.hasOwnProperty.call(LBC_CATEGORIES, icon)) return "unmapped";
  return LBC_CATEGORIES[icon] ? "supported" : "unavailable";
}

// ── Quota de photos GRATUITES par feuille (relevé LIVE 2026-08-10) ──────────
// Leboncoin n'offre PAS le même nombre de photos selon la catégorie. Au-delà du
// quota, le dépôt bascule en COMMANDE PAYANTE (« Pack photos supplémentaires »,
// 4 € relevé) et l'écran /deposer-une-annonce/options RETIRE le bouton
// « Déposer sans booster mon annonce » : il ne reste que « Valider et payer ».
// L'extension n'a alors plus AUCUNE sortie gratuite et échoue — correctement,
// elle ne clique jamais un CTA qui mentionne un paiement.
//
// MESURÉ en direct, même compte, même écran, à la photo près :
//   · Divers > Autres  → 3 emplacements (« Photo n° 1/2/3 »).
//       4 photos ⇒ « 4 € · Voir détail · Valider et payer », aucun bouton
//                  gratuit, pas même un « Retour » sur cette page ;
//       3 photos ⇒ « Déposer sans booster mon annonce ». Rien d'autre ne change.
//   · Mode > Vêtements → 20 emplacements (« Ajouter 20 photos »), AUCUN pack
//       déclenché à 4 photos.
// Corroboré en base : les 2 seuls échecs en Divers > Autres portaient 4 photos ;
// côté Mode/Famille/Loisirs, 11 publications à 4 photos, 8 à 5, une à 7, une à 9
// — toutes abouties.
//
// ⚠️ UNE SEULE FEUILLE EST PLAFONNÉE ICI, ET C'EST DÉLIBÉRÉ. Le quota des autres
// catégories n'a PAS été mesuré. Ne rien généraliser sans relevé : un plafond
// posé au jugé amputerait des annonces qui passent très bien aujourd'hui.
const LBC_FREE_PHOTO_QUOTA = {
  "Divers|Autres": 3,
};

/**
 * @param {string[]|null|undefined} categoryPath — [racine, feuille] Leboncoin
 * @returns {number|null} nombre de photos gratuites de la feuille, ou null si
 *   le quota de cette catégorie n'a pas été relevé (⇒ aucun plafonnement)
 */
export function getLbcFreePhotoQuota(categoryPath) {
  if (!Array.isArray(categoryPath) || categoryPath.length < 2) return null;
  return LBC_FREE_PHOTO_QUOTA[`${categoryPath[0]}|${categoryPath[1]}`] ?? null;
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
