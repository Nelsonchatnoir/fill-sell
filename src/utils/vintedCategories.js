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
  // Femme (5e niveau inexistant).
  "👕": { Femme: ["Femmes", "Vêtements", "Hauts et t-shirts", "T-shirts"], Homme: ["Hommes", "Vêtements", "Hauts et t-shirts", "T-shirts", "T-shirts unis"] },
  // 🧶 scindé de 👕 (shared.js) : pull/sweat/hoodie/cardigan vivent sous une
  // branche entièrement différente de "Hauts et t-shirts". Femme : "Sweats &
  // sweats à capuche" est la feuille directe générique (niveau 3, pas de
  // sous-niveau pour cette entrée précise). Homme : "Sweats et pulls" n'a
  // aucun sous-niveau du tout, "Sweats" y est déjà terminal (niveau 3).
  "🧶": { Femme: ["Femmes", "Vêtements", "Sweats et sweats à capuche", "Sweats & sweats à capuche"], Homme: ["Hommes", "Vêtements", "Sweats et pulls", "Sweats"] },
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

// Catégories SANS niveau genre (racines confirmées par relevé DOM : Maison,
// Électronique, Divertissement, Loisirs et collections, Sport — Femmes/
// Hommes/Enfants sont les 3 seules racines genrées). Chemin unique par
// icône, valable quel que soit platform_fields.genre.
//
// null explicite = vérifié, pas de feuille exploitable (à distinguer d'un
// simple oubli) :
//   - gros électroménager / mobilier (canapé, chaise, lit, frigo, lave-linge)
//     confirmé absent de tout l'arbre Maison — Vinted ne semble pas vendre
//     ces formats, cohérent avec l'exclusion déjà actée de Bricolage/Auto-Moto
//   - vélo adulte complet confirmé absent (seulement vélo enfant + pièces
//     détachées) — un défaut vers "Vélos pour enfant" serait activement
//     trompeur, pire qu'un fallback explicite
//   - branches dont le relevé confirme l'EXISTENCE du niveau 2 mais qui n'ont
//     pas été explorées jusqu'à la feuille (chevron "non détaillé" dans le
//     rapport) : imprimante/scanner, mixeur/robot cuisine, sèche-cheveux/
//     rasoir (Électronique > Produits de beauté, non détaillé), instruments
//     à cordes/vent/percussions, poupée/miniatures (jouets), trottinette/
//     skate/roller, ballon (Sports d'équipe), golf, pêche, yoga — deviner un
//     chemin ici reproduirait exactement le bug T-shirt (niveau intermédiaire
//     pris pour une feuille)
const HORS_MODE = {
  // ── Électronique ──────────────────────────────────────────────────────────
  // DÉFAUT ASSUMÉ : conflate téléphone ET tablette (même icône côté
  // detectObjectIcon) — tablette non détaillée à la feuille dans le relevé.
  "📱": ["Électronique", "Téléphones portables et équipements de communication", "Téléphones portables"],
  "💻": ["Électronique", "Ordinateurs et accessoires", "Ordinateurs portables"],
  // DÉFAUT ASSUMÉ : conflate pc/imac (ordinateur de bureau) ET écran/moniteur
  // (périphérique), deux feuilles différentes sous le même parent.
  "🖥️": ["Électronique", "Ordinateurs et accessoires", "Ordinateurs de bureau"],
  "🎧": ["Électronique", "Audio, casques et hi-fi", "Casques audio et écouteurs"],
  // DÉFAUT ASSUMÉ : enceinte portable (majoritaire) vs barre de son (home
  // cinema, branche "Systèmes audio domestiques" différente).
  "🔊": ["Électronique", "Audio, casques et hi-fi", "Enceintes portables"],
  // DÉFAUT ASSUMÉ : console/jeu/manette partagent l'icône, 3 feuilles sœurs
  // sous le même parent (risque de conflation faible, même catégorie).
  "🎮": ["Électronique", "Jeux vidéo et consoles", "Consoles"],
  // DÉFAUT ASSUMÉ : tv/projecteur partagent l'icône, 2 feuilles sœurs sous
  // le même parent (risque faible).
  "📺": ["Électronique", "TV et home cinema", "Téléviseurs"],
  // DÉFAUT ASSUMÉ : appareil photo/objectif/gopro/caméscope partagent
  // l'icône — un objectif ou une GoPro atterrira à tort sur "numériques".
  "📷": ["Électronique", "Appareils photo et accessoires", "Appareils photo", "Appareils photo numériques"],
  "🛸": ["Électronique", "Appareils photo et accessoires", "Drones et accessoires", "Drones-caméras"],
  "⌨️": ["Électronique", "Ordinateurs et accessoires", "Claviers et accessoires", "Claviers"],
  "🖱️": ["Électronique", "Ordinateurs et accessoires", "Souris"],
  "🖨️": null, // imprimante/scanner : branche existe (niveau 2 nommé) mais non détaillée à la feuille
  "🔌": null, // chargeurs/câbles/powerbank : branche non détaillée à la feuille

  // ── Maison — décoration / arts de la table ────────────────────────────────
  "💡": ["Maison", "Décoration", "Éclairage", "Lampes"],
  "🪞": ["Maison", "Décoration", "Miroirs", "Miroirs muraux"],
  "🕯️": ["Maison", "Décoration", "Bougies et parfums d'ambiance", "Bougies"],
  // DÉFAUT ASSUMÉ : "Encadrements" (cadre) est la seule feuille confirmée de
  // ce groupe — poster/affiche/tableau (sans cadre) n'ont pas de feuille
  // confirmée séparée ("Décorations murales" non détaillé).
  "🖼️": ["Maison", "Décoration", "Encadrements"],
  // "Pots, jardinières et accessoires" : le relevé lui-même le signale non
  // descendu jusqu'à la feuille (niveau 3, chevron potentiel) — pas assez
  // confirmé pour l'utiliser, contrairement aux autres entrées de ce fichier.
  "🪴": null,
  "🏺": ["Maison", "Décoration", "Vases"],
  // DÉFAUT ASSUMÉ : assiette/bol confirmés (Vaisselle), verre/carafe/tasse
  // non confirmés à la feuille ("Verres" listé comme chevron non détaillé).
  "🍽️": ["Maison", "Arts de la table", "Vaisselle", "Assiettes"],
  // DÉFAUT ASSUMÉ : casserole/poêle confirmés (Cuisson et pâtisserie),
  // "ustensile" générique vit en réalité sous Maison > Outils de cuisine
  // (catégorie sœur différente, non atteinte par ce défaut).
  "🍳": ["Maison", "Cuisson et pâtisserie", "Casseroles"],

  // Pas de catégorie Mobilier chez Vinted côté Maison adulte — confirmé en
  // explorant tout l'arbre (existe seulement sous Enfants, non exploré ici).
  "🛋️": null, // canapé/fauteuil
  "🪑": null, // chaise/tabouret
  // "lit/matelas/sommier" (meuble) n'a pas de catégorie, confirmé — mais
  // "couette/drap/parure" (linge de lit, même icône) EN a une réelle
  // (Textiles > Linge de lit). Icône non scindée pour l'instant : par
  // prudence on laisse tout le groupe en null plutôt que de risquer de
  // classer un matelas comme de la literie — bon candidat de scission Lot 2
  // si le volume de literie textile le justifie (chemin déjà identifié :
  // ["Maison","Textiles","Linge de lit","Housses de couette"]).
  "🛏️": null,

  // ── Maison — petit électroménager ─────────────────────────────────────────
  "🫖": ["Maison", "Petits appareils de cuisine", "Bouilloires"],
  "🧹": ["Maison", "Entretien de la maison", "Aspirateurs et nettoyage", "Aspirateurs"],
  // Gros électroménager (frigo/réfrigérateur/congélateur) absent de tout
  // l'arbre Maison, confirmé — même famille que le gap Mobilier.
  "🧊": null,
  // DÉFAUT ASSUMÉ : "four" (encastrable, gros électroménager, probablement
  // non vendable comme frigo/lave-linge) vs "micro-onde" (petit appareil,
  // confirmé feuille) — l'icône ne permet pas de distinguer, on prend le cas
  // vendable par défaut.
  "♨️": ["Maison", "Petits appareils de cuisine", "Micro-ondes"],
  "🥣": null, // mixeur/blender/robot cuisine : "Blenders, mixeurs et robots" non détaillé à la feuille
  "🍞": ["Maison", "Petits appareils de cuisine", "Grille-pain"],
  "🍟": ["Maison", "Petits appareils de cuisine", "Friteuses"],
  "💇": null, // sèche-cheveux/lisseur : Électronique > Produits de beauté non détaillé
  // Gros électroménager (lave-linge/sèche-linge/lave-vaisselle) absent de
  // tout l'arbre Maison, confirmé — aucune catégorie niveau 2 correspondante.
  "🧺": null,
  "☕": ["Maison", "Petits appareils de cuisine", "Préparation du café, du thé et de l'expresso", "Machines à café"],
  "🪒": null, // rasoir/tondeuse/épilateur : même branche non détaillée que 💇

  // ── Musique / Livres / Collection ─────────────────────────────────────────
  "🎸": ["Loisirs et collections", "Instruments de musique et équipement", "Guitares et basses", "Guitares électriques"],
  "🎻": null, // violon/violoncelle/contrebasse : "Instruments à cordes" non détaillé
  "🥁": null, // batterie/cymbale : "Batterie et percussions" non détaillé
  "🎺": null, // trompette/saxophone/clarinette/flûte : "Instruments à vent" non détaillé
  // DÉFAUT ASSUMÉ : "vinyle" (disque, Divertissement) vs "platine" (lecteur,
  // Électronique > Systèmes audio domestiques > Platines vinyle) — deux
  // racines différentes pour le même mot-clé. Disque pris comme cas
  // dominant (33/45 tours confirment l'intention "disque").
  "💿": ["Divertissement", "Musique", "Vinyles"],
  // Pas de feuille confirmée pour un micro autonome (studio/karaoké) — seul
  // "Microphones d'ordinateur" est confirmé, un mauvais candidat sémantique
  // pour un micro de musique/karaoké.
  "🎤": null,
  "🎹": null, // clavier midi/piano/synthé : "Claviers et synthétiseurs" non détaillé
  "📖": ["Divertissement", "Livres", "Bandes dessinées, mangas et romans graphiques"],
  // DÉFAUT ASSUMÉ : roman (Fiction) vs encyclopédie/dictionnaire (Non-fiction
  // serait plus juste) — feuilles sœurs confirmées, roman pris comme
  // dominant.
  "📚": ["Divertissement", "Livres", "Fiction"],
  "📰": ["Divertissement", "Magazines"],
  "📮": ["Loisirs et collections", "Timbres", "Timbres à l'unité"],
  "🪙": ["Loisirs et collections", "Pièces de monnaie et billets", "Pièces de monnaie"],

  // ── Jouets (piège confirmé : la plupart vivent sous Enfants > Jeux et
  // jouets, PAS sous Divertissement ni Loisirs et collections) ─────────────
  "🧱": ["Enfants", "Jeux et jouets", "Jeux de construction"],
  "🧸": ["Enfants", "Jeux et jouets", "Peluches"],
  "🪆": null, // poupée/barbie/poupon : "Poupées, poupons et accessoires" non détaillé
  // Règle simple pour le piège signalé : "Puzzles" n'est confirmé QUE sous
  // Loisirs et collections (pas retrouvé dans la liste Enfants > Jeux et
  // jouets du relevé) — un seul chemin connu, utilisé sans condition
  // adulte/enfant plutôt que de deviner une distinction qu'on n'a pas les
  // moyens de faire.
  "🧩": ["Loisirs et collections", "Puzzles"],
  "🦸": ["Enfants", "Jeux et jouets", "Figurines et accessoires", "Figurines"],
  "🃏": ["Loisirs et collections", "Cartes à collectionner", "Cartes à collectionner à l'unité"],
  "🎲": ["Loisirs et collections", "Jeux de société"],
  "🏎️": null, // voiture miniature/hot wheels : "Voitures, trains et véhicules" non détaillé

  // ── Sport ─────────────────────────────────────────────────────────────────
  // Piège confirmé : pas de "vélo adulte complet" (seulement vélo enfant +
  // pièces détachées) — un défaut vers l'un ou l'autre serait trompeur pour
  // un vrai vélo adulte entier, fallback explicite volontaire.
  "🚲": null,
  "🛴": null, // trottinette : catégorie "Skateboards et trottinettes" nommée mais pas détaillée
  "🛹": null, // skate/longboard : même branche non détaillée
  "⛸️": null, // roller/patin : pas de feuille confirmée pertinente
  // DÉFAUT ASSUMÉ : ski (Matériel de ski) vs snowboard (Matériel de
  // snowboard), feuilles sœurs confirmées sous Sports d'hiver.
  "🎿": ["Sport", "Sports d'hiver", "Matériel de ski", "Skis alpins"],
  "⚽": null, // ballon/football : "Sports d'équipe" non détaillé
  // DÉFAUT ASSUMÉ : tennis vs badminton, feuilles sœurs confirmées sous
  // Sports de raquette.
  "🎾": ["Sport", "Sports de raquette", "Tennis", "Raquettes de tennis"],
  "⛳": null, // golf : catégorie nommée mais non détaillée
  "🏋️": ["Sport", "Fitness, course à pied et yoga", "Musculation", "Haltères"],
  "🥊": null, // boxe/mma : "Boxe et arts martiaux" nommé mais non détaillé
  "⛺": ["Sport", "Sports de plein air", "Tentes et matériel de couchage", "Tentes"],
  "🎣": null, // pêche/moulinet : "Pêche et chasse" chevron non détaillé
  "🧘": null, // yoga/pilates : "Matériel de yoga et de pilates" chevron non détaillé
  // DÉFAUT ASSUMÉ : casque vélo (Cyclisme) vs casque ski/snow (Sports
  // d'hiver) — même icône, deux feuilles confirmées dans des catégories
  // parentes différentes ; vélo pris comme cas dominant.
  "⛑️": ["Sport", "Cyclisme", "Casques de vélo"],
  "🏀": null, // basket-ball : "Sports d'équipe" non détaillé
  "🏃": null, // tapis de course/rameur/elliptique : équipement cardio non détaillé
};

/**
 * @param {string} icon  — emoji retourné par detectObjectIcon
 * @param {string} genre — "Femme" | "Homme" | "Enfant" | "Mixte" | "" (platform_fields.genre)
 * @returns {string[]|null} chemin catalogue Vinted, ou null si non mappé
 *   (icône hors périmètre, genre absent, Enfant/Mixte → Lot 2)
 */
export function getVintedCategoryPath(icon, genre) {
  // HORS_MODE d'abord : ces catégories n'ont pas de niveau genre (racines
  // confirmées : Maison/Électronique/Divertissement/Loisirs et collections/
  // Sport), donc pas besoin d'attendre platform_fields.genre pour elles.
  if (Object.prototype.hasOwnProperty.call(HORS_MODE, icon)) return HORS_MODE[icon];
  const entry = MODE_ADULTE[icon];
  if (!entry || !genre) return null;
  return entry[genre] ?? null;
}
