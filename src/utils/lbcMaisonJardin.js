// ═══════════════════════════════════════════════════════════════════════════
// Leboncoin — Maison & Jardin : les 6 feuilles à DEUX critères obligatoires,
// dont le second DÉPEND du premier. Relevé LIVE du 07/09/2026 par
// Claude-in-Chrome sur le vrai formulaire (docs/leboncoin-maison-jardin-
// releve-2026-09-07.md, même contenu, lisible). Ce relevé PILOTE le code : la
// table platform_category_aspects ne sait pas représenter une dépendance
// (une seule liste par clé), elle ne peut donc pas servir ici.
//
// Ce que le relevé a établi, et que ce module encode :
//   · sur chaque feuille, le premier combobox (Univers/Type, clé `*_type`) et
//     le second (Produit, clé `*_product` — `decoration_type` sur Décoration)
//     sont TOUS DEUX requis, et changer le premier VIDE le second ;
//   · « Autre » est une valeur du PREMIER combobox ; « Autres » (pluriel)
//     n'existe que dans les listes Produit d'Électroménager. Le job c324b5ee
//     (07/09) a posé « Autre » sur Produit : hors liste, « Ce champ est requis ».
//
// ⛔ Ce n'est PAS un repli statique de champs obligatoires (règle du 02/09) :
// les requis restent ceux du catalogue/de la plateforme. Ce module ne sert
// qu'à proposer, pour le champ Produit, LA liste qui correspond à l'Univers/
// Type choisi — au lieu d'une liste unique fausse (ou vide) venue du catalogue.
// Une valeur hors de ces listes n'est jamais bloquante (les listes LBC ne
// « font pas foi », cf. listeFaitFoi) : Leboncoin reste le juge.
// ═══════════════════════════════════════════════════════════════════════════

export const LBC_MAISON_JARDIN_DEPENDANTS = {
  "Maison & Jardin > Électroménager": {
    typeKey: "home_appliance_type",
    produitKey: "home_appliance_product",
    produits: {
      "Gros électroménager": ["Cave à vin", "Climatiseur mobile", "Congélateur", "Cuisinière", "Four", "Four à micro-ondes", "Gazinière", "Hotte aspirante", "Lave-linge", "Lave-vaisselle", "Piano de cuisson", "Plaque de cuisson", "Réfrigérateur", "Réfrigérateur américain", "Réfrigérateur congélateur", "Sèche linge", "Autres"],
      "Cuisine et cuisson": ["Appareil à raclette et fondue", "Appareil de cuisson", "Balance de cuisine", "Barbecue et plancha électrique", "Blender", "Bouilloire", "Crêpière", "Extracteur de jus", "Fontaine à eau", "Friteuse et airfryer", "Gaufrier et croque-monsieur", "Grille-pain", "Hâchoir, mixeur, batteur", "Machine à café", "Machine à eau gazeuse et soda", "Machine à glaçons", "Machine à pain", "Machine à pâtes", "Machine à thé", "Plancha intérieure", "Presse-agrumes", "Rice cooker", "Robot cuiseur", "Robot multifonction", "Robot pâtissier", "Autre robot", "Sorbetière", "Tireuse à bière", "Yaourtière", "Autres"],
      "Entretien de la maison": ["Aspirateur", "Centrale vapeur", "Centre de repassage", "Chauffage d'appoint soufflant", "Défroisseur", "Fer à repasser", "Humidificateur et déshumidificateur", "Machine à coudre", "Nettoyeur vapeur", "Radiateur bain d'huile", "Ventilateur", "Autres"],
      "Beauté et Soin de la personne": ["Appareil de massage", "Brosse à dents électrique", "Brosse coiffante", "Epilateur", "Fer à boucler", "Lampe à luminothérapie", "Lisseur", "Machine à pédicure / manucure", "Pèse personne", "Rasoir électrique", "Sèche-cheveux", "Tondeuse", "Autres"],
      "Autre": ["Autres"],
    },
  },
  "Maison & Jardin > Décoration": {
    typeKey: "house_and_garden_type",
    produitKey: "decoration_type",
    produits: {
      "Éclairage": ["Abat-jour", "Applique", "Bougeoir et photophore", "Guirlande", "Lampadaire", "Lampe à poser", "Lampe sur pied", "Lustre", "Suspension"],
      "Décoration textile": ["Coussin", "Rideaux, voilage et store", "Tapis"],
      "Accessoire de rangement": ["Rangement", "Accessoire de salle de bain", "Cendrier et vide-poche", "Panier, boîte"],
      "Décoration murale": ["Cadre photo", "Miroir", "Pêle-mêle photo", "Poster", "Tableau et toile"],
      "Objet décoratif": ["Bibelot", "Bouquet et plante artificielle", "Dame-jeanne et bonbonne", "Horloge, pendule et réveil", "Paravent", "Sculpture et statue", "Vase, cache pot et céramique"],
      "Autre": ["Autre"],
    },
  },
  "Maison & Jardin > Arts de la table": {
    typeKey: "table_art_type",
    produitKey: "table_art_product",
    produits: {
      "Vaisselle de table": ["Assiette", "Bol", "Carafe et pichet", "Coquetier", "Coupe et coupelle", "Couvert", "Flûte", "Mazagran", "Plat apéritif", "Plat de service", "Ramequin", "Saladier", "Saucière", "Service à café ou à thé", "Service de vaisselle", "Soucoupe", "Soupière", "Tasse et mug", "Théière, tisanière", "Verre", "Verrine"],
      "Accessoire de table": ["Beurrier", "Corbeille", "Dessous de plat", "Huilier et vinaigrier", "Plateau", "Rond de serviette", "Salière, poivrière et sucrier", "Seau à glaçons", "Set de table", "Sous verre"],
      "Matériel de cuisine": ["Accessoire de pâtisserie", "Casserole", "Cocotte", "Couteaux", "Couvercle", "Moule", "Planche à découper", "Plat à four et à tarte", "Poêle", "Terrine", "Tire-bouchon", "Ustensile de cuisine"],
      "Rangement et conservation": ["Bocaux et pots", "Bonbonnière", "Boîte de conservation et boîte en métal"],
      "Autre": ["Coffret", "Gourde", "Shaker", "Autre"],
    },
  },
  "Maison & Jardin > Bricolage": {
    typeKey: "diy_type",
    produitKey: "diy_product",
    produits: {
      "Chauffage et ventilation": ["Accessoire poêle et cheminée", "Chaudière", "Chauffage fixe", "Climatiseur fixe", "Granulés de bois", "Grille de ventilation", "Pompe à chaleur", "Poêle et cheminée", "Radiateur en fonte", "Radiateur électrique", "Sèche-serviettes", "Thermostat et accessoire chauffage", "VMC et extracteur d'air", "Autre"],
      "Électricité, éclairage et domotique": ["Alarme, caméra et détecteur de fumée", "Ampoule", "Interphone et sonnette", "Interrupteur et prise", "Lampe torche", "Luminaire et pile", "Motorisation portail et volet", "Néons", "Panneau solaire", "Plafonnier", "Projecteurs", "Rallonge, multiprise, câble électrique", "Spots lumineux", "Tableau électrique et disjoncteur", "Autre"],
      "Équipement et protection": ["Bâche", "Bétonnière", "Casque de chantier", "Chariots", "Combinaison de protection", "Compresseur", "Cordes et câbles", "Diable", "Echafaudage", "Echelle", "Escabeau", "Etabli", "Extincteur", "Masque et lunettes de protection", "Matériel de sécurité", "Mousquetons et sangles", "Plate-forme de travail", "Servantes multifonctions", "Tabouret et marche pied", "Tréteau", "Ventouse", "Autre"],
      "Matériel": ["Nettoyage des canalisations", "Tout pour le sol", "Tuyau, fixation et accessoires", "Autre"],
      "Menuiserie et matériaux de construction": ["Baie coulissante", "Béton, ciment, mortier", "Escalier et rambarde", "Fenêtre et porte-fenêtre", "Fixation, équerre d'assemblage", "Moulure et plinthe", "Moustiquaire", "Palette", "Panneau, planche et lambris", "Parpaing et brique", "Porte d'entrée", "Porte de garage", "Porte intérieure", "Store banne et store extérieur", "Tasseau", "Tuiles", "Verrière et cloison", "Volet", "Autre"],
      "Outils à main": ["Accessoires à mélanger", "Burin", "Caisse à outils", "Clé et douille", "Couteau et grattoir", "Cutter et ciseau", "Etau et enclume", "Lime, rabot et ciseau à bois", "Lot d'outils", "Marteau, maillet et masse", "Mètre, niveau et outils de mesure", "Pince et tenaille", "Pinceau et rouleau", "Pistolet à colle, agrafeuse et rivet", "Scie à main", "Serre-joint", "Tournevis", "Autre"],
      "Outils électroportatifs": ["Chargeurs et batteries", "Clé à choc et boulonneuse", "Compresseur d'air", "Défonceuse et rabot", "Outil multifonction et de précision", "Perceuse et visseuse", "Perforateur, burineur et marteau-piqueur", "Pistolet et machine à peindre", "Ponceuse", "Poste à souder", "Scie et meuleuse électrique", "Autre"],
      "Revêtement sol, mur et peinture": ["Accessoires et pièces détachées", "Barre de seuil et plinthe", "Carrelage", "Crédence", "Dalles et lames PVC", "Matériel de préparation", "Mosaïque", "Papier peint et sticker", "Parquet", "Peinture extérieure", "Peinture intérieure", "Sous-couche", "Autre"],
      "Plomberie et sanitaire": ["Baignoire", "Bonde, siphon et caniveau", "Chasse d'eau", "Chauffe-eau et pièces détachées", "Citerne et cuve", "Douche et pièces détachées", "Filtre à eau", "Furet", "Joints d'étanchéité", "Lavabo et évier", "Pompe à eau et accessoires", "Robinet, mitigeur et vanne", "Tuyau, tube et raccord", "Valve", "WC et pièces détachées", "Autre"],
      "Quincaillerie et droguerie": ["Boulon, écrou et rondelle", "Boîtes aux lettres", "Clous, vis et cheville", "Coffre et boîte à clé", "Colles, mastics et adhésifs", "Cornière, tube, tôle et profilé", "Crochet, piton, gond à visser", "Papier de verre", "Poignée", "Produit d'entretien et de nettoyage", "Roue et roulette", "Serrure, antivol, verrou et cadenas", "Autre"],
      "Autre": ["Autre"],
    },
  },
  "Maison & Jardin > Jardin & Plantes": {
    typeKey: "gardening_type",
    produitKey: "gardening_product",
    produits: {
      "Aménagement extérieur": ["Abri de jardin", "Barrière et clôture", "Brise vue / lame occultante", "Caillebotis", "Fontaine de jardin", "Grillage", "Pavé et dalle", "Pergola", "Portail", "Porte de jardin et portillon", "Serre", "Système d'arrosage", "Autre"],
      "Barbecue et cuisson extérieure": ["Accessoires barbecue", "Barbecue charbon", "Barbecue électrique", "Barbecue gaz", "Four à pizza", "Plancha extérieure", "Table roulante", "Autre"],
      "Équipement du jardinier": ["Arrosoir", "Bottes", "Casque antibruit", "Gants de jardin", "Masque et lunettes de protection", "Tablier et combinaisons", "Tuyau d'arrosoir", "Autre"],
      "Mobilier de jardin": ["Banc de jardin", "Barbecue et plancha", "Bassin, pompe et filtre", "Brasero", "Chauffage et éclairage d'extérieur", "Coffre de rangement extérieur", "Fontaine de jardin", "Grillage, canisse et clotûre", "Jardinière", "Jeux pour enfants", "Parasol et voile d'ombrage", "Piscine et spa", "Pot et bac", "Salon, table, chaise de jardin", "Statue et sculpture de jardin", "Table de pique-nique", "Terrasse et sol extérieur", "Tonnelle", "Transat, hamac et balancelle", "Autre"],
      "Outils à main": ["Balai d'extérieur", "Brouette, chariot et remorque", "Faux, faucille, serpe, croissant", "Outils pour le travail du sol", "Pelle et pioche", "Rateaux, croc, griffe, émietteur", "Sécateur et cisailles", "Scarificateur, désherbeur, aérateur", "Tondeuse à gazon manuelle", "Autre"],
      "Outils à moteur": ["Aspirateur et souffleur", "Broyeur de végétaux", "Coupe-bordure et débroussailleuse", "Motoculteur et motobineuse", "Nettoyeur haute pression", "Taille-haie et élagueuse", "Tondeuse et accessoires", "Tronçonneuse", "Autre"],
      "Piscine et spa": ["Abri de piscine", "Accessoire piscine", "Bâche de protection", "Bouée, ballon", "Douche extérieure", "Echelle de piscine", "Piscine gonflable", "Piscine hors sol", "Pompe de filtration", "Robot nettoyeur", "Sécurité et alarme piscine", "Spa gonflable", "Spa rigide", "Autre"],
      "Plantes et matériaux pour le jardin": ["Abris à insectes", "Arrosage du jardin", "Cache pot", "Composteur et lombricomposteur", "Fruits et légumes", "Gravier", "Paillage", "Produit d'entretien", "Protection des cultures", "Récupérateur d'eau", "Semence, engrais, terreau et gazon", "Terrasse et sol extérieur", "Plantes, fleurs, arbres et arbustes", "Autre"],
      "Autre": ["Balançoire", "Bois de chauffage", "Foin", "Ruche", "Autre"],
    },
  },
  "Maison & Jardin > Linge de maison": {
    typeKey: "linens_type",
    produitKey: "linens_product",
    produits: {
      "Linge de lit": ["Housse de couette", "Drap housse", "Taie d'oreiller", "Traversin", "Drap", "Boutis, edredon", "Couvre lit", "Cache-sommier", "Parure de lit", "Autre"],
      "Linge de bain": ["Fouta", "Gants de toilette", "Peignoir", "Rideau de douche", "Serviette de plage", "Serviette de toilette", "Tapis de bain", "Autre"],
      "Déco textile": ["Rideaux", "Voilage", "Store", "Coussin", "Housse de coussin", "Plaid et jeté", "Housse de canapé", "Housse de chaise", "Housse de fauteuil", "Galette de chaise", "Coussins d'extérieur", "Tapis", "Tissu", "Autre"],
      "Linge de table": ["Nappe", "Serviette de table", "Chemin de table", "Set de table", "Tablier", "Gants et maniques", "Torchon", "Protection de table", "Autre"],
      "Équipement du lit": ["Couette", "Couverture", "Oreiller", "Traversin", "Protège matelas", "Alèse", "Protège oreiller", "Autre"],
      "Autre": ["Autre"],
    },
  },
  // ── AMEUBLEMENT — 7e feuille, relevée LIVE le 2026-09-20 ──────────────────
  // Elle manquait. Le catalogue portait ses trois champs (furniture_category
  // « Type », furniture_type « Produit », furniture_quantity « Quantité »)
  // en OBLIGATOIRES et SANS AUCUNE VALEUR : l'écran demandait donc un
  // « Type » et un « Produit » en saisie LIBRE, où il faut deviner le libellé
  // exact de Leboncoin. Même mécanique que les six autres : le second
  // combobox dépend du premier et se vide quand il change.
  //
  // ⚠️ « Quantité » N'EXISTE PAS sur le formulaire particulier (relevé du
  //    20/09 : Type*, Produit*, Démontable, Pièce, Poids (kg), Marque,
  //    Matière, Couleur, État — et rien d'autre). La ligne du catalogue vient
  //    donc d'un relevé fait sur un compte PRO, dont les formulaires portent
  //    des champs que le parc n'a pas — c'est la contamination déjà vue le
  //    16/09. On ne la corrige pas ici : ce module ne décide pas des requis,
  //    il ne fait que fournir les listes (règle du 02/09).
  "Maison & Jardin > Ameublement": {
    typeKey: "furniture_category",
    produitKey: "furniture_type",
    produits: {
      "Canapé et fauteuil": ["Canapé", "Canapé convertible et clic clac", "Canapé 2 places", "Canapé 3 places", "Canapé 4 places et plus", "Canapé d'angle", "Banquette", "Méridienne", "Chauffeuse", "Fauteuil", "Fauteuil électrique", "Autre"],
      "Meuble de rangement": ["Bibliothèque et étagère", "Meuble de rangement", "Armoire", "Buffet bas", "Bibliothèque", "Commode", "Etagère sur pied", "Etagère murale", "Meuble TV", "Meuble de cuisine", "Meuble de jardin", "Meuble de salle de bain", "Meuble à chaussures", "Vaisselier", "Coffre et malle", "Caisson de rangement", "Meuble bar", "Dressing et penderie", "Autre"],
      "Lit et matelas": ["Lit pour enfant", "Lit", "Sommier", "Pied de lit", "Tête de lit", "Matelas", "Lit + matelas", "Lit superposé et lit mezzanine", "Lit gigogne", "Cadre de lit", "Autre"],
      "Table et bureau": ["Table de salle à manger", "Table extensible", "Table ronde", "Table haute", "Table d'appoint", "Table basse", "Table de chevet", "Table pliante", "Table bistrot", "Console", "Desserte", "Ensemble table et chaises", "Bureau", "Bureau d'angle", "Secrétaire", "Coiffeuse", "Autre"],
      "Chaise et tabouret": ["Chaise, tabouret et banc", "Chaise", "Chaise pliante", "Chaise et tabouret de bar", "Chaise de bureau", "Tabouret", "Banc", "Pouf et repose pied", "Autre"],
      "Accessoire": ["Poubelle", "Etendoir à linge", "Planche à repasser", "Porte-serviette", "Marche-pied", "Panière à linge", "Panier à linge", "Porte-manteau", "Luminaire", "Bain et baignoire", "Porte", "Tapis", "Accessoire", "Autre"],
      "Autre": ["Autre"],
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// LES LISTES PLATES — un champ obligatoire dont la liste ne dépend de rien
// ═══════════════════════════════════════════════════════════════════════════
// (2026-09-20, point 3-b du lot de clôture.) Le module ci-dessus ne sait
// porter que des paires DÉPENDANTES (Univers → Produit). Or plusieurs rayons
// Leboncoin ont un champ obligatoire à liste FERMÉE et INDÉPENDANTE, que le
// catalogue a relevé SANS ses valeurs — l'écran les demandait donc en saisie
// libre, où il faut deviner le libellé exact de Leboncoin. Un champ
// obligatoire en texte libre sur une liste fermée est un champ bloqué.
//
// ⛔ MÊME DOCTRINE QUE CI-DESSUS : ce module ne décide pas des REQUIS (c'est
//    le catalogue et la plateforme qui décident), il ne fait que fournir la
//    liste quand on la connaît. Une valeur hors liste n'est jamais bloquante.
// ⛔ CHAQUE LISTE EST UN RELEVÉ LIVE, daté, jamais une reconstruction.
const LBC_LISTES_PLATES = {
  // Relevé LIVE du 20/09/2026 sur le formulaire de dépôt (compte particulier),
  // titre « Souris sans fil Logitech pour ordinateur » → Électronique >
  // Accessoires informatique. Champ « Produit* », 17 valeurs.
  "Électronique > Accessoires informatique": {
    computer_accessories_product: [
      "Carte graphique", "Carte mère", "Processeur", "Refroidisseur et ventilateur",
      "Logiciel", "Écran / moniteur", "Clavier et souris", "Tapis de souris",
      "Imprimante et scanner", "Réseau et modem", "Webcam / caméra",
      "Câble et adaptateur", "Disque dur (SSD, HDD) et lecteur",
      "Stockage léger (cartes SD, disques, clés USB)", "Hub / station d'accueil", "Autre",
    ],
  },
  // Relevé LIVE du 20/09/2026, cinq rayons ouverts un par un sur le vrai
  // formulaire (compte particulier). Ce sont les cinq derniers que le
  // catalogue portait OBLIGATOIRES et SANS VALEURS — donc en saisie libre.
  "Maison & Jardin > Papeterie & Fournitures scolaires": {
    home_office_stationery_school_supplies_product: [
      "Agenda scolaire", "Calculatrice", "Cahiers et carnets", "Carnet", "Classeurs",
      "Crayons à papier et crayons de couleur", "Effaceurs, gommes, correcteurs", "Feuilles",
      "Lot de fournitures scolaires", "Pochettes", "Règles, compas, équerres",
      "Stylos & feutres", "Trousses", "Autre",
    ],
  },
  "Loisirs > DVD - Films": {
    dvd_movies_format: ["DVD", "Blu-ray", "Cassettes vidéo"],
  },
  "Loisirs > Loisirs créatifs": {
    creative_activities_product: [
      "Création de bijoux", "Décoration DIY", "Fournitures de base (papier, carton, tissu, perles...)",
      "Livres / tutoriels / patrons", "Loisirs créatifs enfants",
      "Matériel de couture / tricot / crochet / broderie", "Modelage et sculpture",
      "Peinture et dessin", "Scrapbooking", "Autre",
    ],
  },
  "Loisirs > Équipements vélos": {
    bicycle_equipment_product: [
      "Antivol", "Béquille", "Bidon et porte-bidon", "Casque", "Compteur et GPS vélo",
      "Éclairage", "Gants de cyclisme", "Garde-boue", "Guidon", "Housse de transport",
      "Lunettes et masque", "Objets réfléchissants", "Outils et Kit de réparation",
      "Pompe à vélo", "Porte-bagages et panier", "Racks et porte-vélo",
      "Roues et chambres à air", "Sacoche et bagagerie", "Selle", "Vêtements vélo", "Autre",
    ],
  },
  "Électronique > Téléphones & Objets connectés": {
    phone_product: [
      "Smartphone", "Téléphone fixe", "Montre connectée", "GPS et balise (AirTag, SmarTag)",
      "Bracelet connecté", "Assistant vocal", "Domotique", "Autres",
    ],
  },
  // ⚠️ « Famille > Équipement bébé » (baby_equipment_type) n'est PAS ici : son
  //    Produit est déjà servi par getLbcBabyEquipment (lbcCategories.js), qui
  //    le déduit de l'icône. Ajouter une seconde source ferait deux vérités.
};

/** La liste d'un champ à liste PLATE, ou null si on ne la connaît pas.
 *  Sert AUSSI le PREMIER combobox des feuilles Maison & Jardin : ses valeurs
 *  sont les CLÉS de la table des produits dépendants, et personne ne les
 *  servait (2026-09-20) — le champ « Type »/« Univers » y était obligatoire,
 *  sans liste, donc en saisie libre, alors que la liste était juste au-dessus. */
export function lbcListePlate(categoryKey, fieldKey) {
  const liste = LBC_LISTES_PLATES[String(categoryKey ?? "")]?.[String(fieldKey ?? "")];
  if (Array.isArray(liste) && liste.length) return liste;
  const feuille = LBC_MAISON_JARDIN_DEPENDANTS[String(categoryKey ?? "")];
  if (feuille && feuille.typeKey === String(fieldKey ?? "")) return Object.keys(feuille.produits);
  return null;
}

// Texte comparable pour retrouver la valeur du premier combobox telle que
// l'app la porte (relevé, saisie, IA) : accents, casse, espaces et apostrophes
// ne doivent pas faire rater la correspondance — mais on ne réécrit jamais une
// valeur avec, on COMPARE seulement (règle du 05/09).
const comparable = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[’'`]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * La liste Produit qui correspond à la valeur courante du premier combobox
 * d'une feuille Maison & Jardin — null si la feuille n'est pas concernée, si le
 * premier combobox est vide, ou si sa valeur n'est pas dans le relevé (l'app
 * retombe alors sur la liste du catalogue, comme avant).
 * @param {string} categoryKey  « Racine > Feuille » (clé du catalogue LBC)
 * @param {string} produitKey   clé for= du champ Produit affiché
 * @param {(key: string) => string} valeurDe  lecture de la valeur d'une clé
 * @returns {string[] | null}
 */
export function lbcProduitsDependants(categoryKey, produitKey, valeurDe) {
  const feuille = LBC_MAISON_JARDIN_DEPENDANTS[categoryKey];
  if (!feuille || feuille.produitKey !== produitKey) return null;
  const type = comparable(valeurDe(feuille.typeKey));
  if (!type) return null;
  const entree = Object.entries(feuille.produits).find(([k]) => comparable(k) === type);
  return entree ? entree[1] : null;
}

/** Clé du PREMIER combobox (Univers/Type) d'une feuille Maison & Jardin, sinon null. */
export function lbcClePremierCombobox(categoryKey) {
  return LBC_MAISON_JARDIN_DEPENDANTS[categoryKey]?.typeKey ?? null;
}

/** La feuille Maison & Jardin à deux combobox dépendants, ou null. */
export function lbcFeuilleDependante(categoryKey) {
  const def = LBC_MAISON_JARDIN_DEPENDANTS[String(categoryKey ?? "")];
  return def ? { typeKey: def.typeKey, produitKey: def.produitKey, produits: def.produits } : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// LA PAIRE (UNIVERS, PRODUIT) QUE L'ANNONCE NOMME (2026-09-24)
// ═══════════════════════════════════════════════════════════════════════════
// Sur NOTRE feuille cette fois (pairesMaisonJardinDeSecours, plus bas, sert les
// AUTRES feuilles). Quand ni la liste de l'Univers courant ni la valeur posée ne
// conviennent, on cherche le PRODUIT que nomment le titre, puis l'objet IA,
// puis la description, parmi TOUS les produits de la feuille — et l'Univers
// suit, puisque la liste Produit en dépend. Cas type : Univers « Accessoire de
// table » + Produit « Assiette » (hors liste de cet univers) sur « Lot de 6
// assiettes » → Univers « Vaisselle de table », Produit « Assiette ».
// ⛔ Même règle que tous les champs à liste fermée (_shared/option-du-texte.js) :
//    mots entiers, jamais « Autre », jamais au hasard. Un produit que la feuille
//    range sous DEUX univers (« Traversin » en Linge de lit et en Équipement du
//    lit) ne départage rien : on ne pose pas la paire.
/**
 * @param {string} categoryKey  « Maison & Jardin > … »
 * @param {(opts: {options: string[]}) => {valeur: string|null, source: string|null, candidats: string[]}} chercher
 *        la recherche (optionDepuisTextes lié aux textes de l'annonce)
 * @returns {{ typeKey, produitKey, univers, produit, source } | { candidats: string[] } | null}
 */
export function lbcPaireDepuisTextes(categoryKey, chercher) {
  const feuille = LBC_MAISON_JARDIN_DEPENDANTS[String(categoryKey ?? "")];
  if (!feuille || typeof chercher !== "function") return null;
  const universDe = new Map();
  for (const [univers, produits] of Object.entries(feuille.produits)) {
    for (const p of produits) {
      if (/^autres?$/i.test(p.trim())) continue;
      if (!universDe.has(p)) universDe.set(p, []);
      universDe.get(p).push(univers);
    }
  }
  const r = chercher({ options: [...universDe.keys()] });
  if (!r?.valeur) return r?.candidats?.length > 1 ? { candidats: r.candidats } : null;
  const univers = universDe.get(r.valeur) ?? [];
  if (univers.length !== 1) return { candidats: [r.valeur] };
  return { typeKey: feuille.typeKey, produitKey: feuille.produitKey, univers: univers[0], produit: r.valeur, source: r.source };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUAND LEBONCOIN CHOISIT UNE AUTRE FEUILLE QUE LA NÔTRE (2026-09-22)
// ═══════════════════════════════════════════════════════════════════════════
// Cas jocabroc8, deux dépôts du 22/09, MESURÉ EN DIRECT sur le formulaire :
//   · job 206cd33b « Ancien plateau à olives faïence peint main » — notre
//     chemin : Maison & Jardin > Décoration ; nos critères posés :
//     house_and_garden_type = « Objet décoratif », decoration_type = « Vase,
//     cache pot et céramique ». Leboncoin, lui, propose TROIS feuilles pour ce
//     titre (Arts de la table, Bricolage, Décoration) et met Arts de la table
//     EN TÊTE. Le formulaire rend donc `table_art_type` / `table_art_product`
//     — deux champs obligatoires que nos critères ne peuvent pas remplir,
//     puisqu'ils portent les clés de l'autre feuille.
//   · job fc5e4bff « Présentoir vintage en bois sculpté » — exactement
//     l'inverse : notre chemin Arts de la table, le formulaire Décoration.
//
// POURQUOI LE FORMULAIRE PART AILLEURS : les deux jobs portent
// `categorie_incertaine = true` (categorie_source = « ia »). Depuis le 07/09,
// leboncoin.js laisse dans ce cas la SUGGESTION de Leboncoin l'emporter sur
// notre supposition — décision juste, et c'est bien Leboncoin qui avait raison
// ici (un plateau à olives est un accessoire de table). Mais nos critères, eux,
// restaient collés à notre feuille.
//
// CE QUI ARRIVAIT ENSUITE : le Produit obligatoire restait vide, le repli
// écrivait « Autre » — or la liste Produit DÉPEND de l'Univers, et « Autre »
// n'existe pas dans la liste d'« Accessoire de table ». D'où le message que
// jocabroc8 a lu : « Produit : la valeur "Autre" n'a pas été reconnue » — une
// valeur qu'il n'a jamais choisie, dans une catégorie que nous n'avions pas
// retenue.
//
// CE QUE FAIT CETTE FONCTION : pour chaque feuille Maison & Jardin AUTRE que
// la nôtre, elle propose la paire (Univers, Produit) que le formulaire
// attendrait si Leboncoin s'y arrêtait. Deux étages, jamais davantage :
//   1. un Produit de la feuille dont le libellé figure MOT POUR MOT dans le
//      titre (« plateau » → « Plateau », dans l'Univers « Accessoire de
//      table ») — la vraie valeur, celle que Leboncoin lui-même pré-remplit ;
//   2. à défaut, la paire fourre-tout DE CETTE FEUILLE : Univers « Autre » et
//      son Produit (« Autre » en Décoration et Bricolage, « Autres » en
//      Électroménager, « Autre » en Arts de la table). Elle est TOUJOURS
//      valide, parce qu'elle vient de la liste elle-même.
//
// ⛔ ON N'INVENTE AUCUNE VALEUR. Les deux étages ne rendent que des libellés
//    présents dans LBC_MAISON_JARDIN_DEPENDANTS, lui-même relevé sur le vrai
//    formulaire. Et on n'écrase jamais une clé déjà posée : ce qui vient de la
//    personne ou du relevé passe avant.
// ⛔ ON NE TOUCHE PAS À NOTRE FEUILLE. Ses deux clés sont déjà servies par le
//    stepper ; les rejouer ici ferait deux vérités.

/** Un libellé de Produit figure-t-il, mot pour mot, dans le texte de l'annonce ? */
function libelleDansLeTexte(libelle, texteComparable) {
  const l = comparable(libelle);
  // Les libellés composés (« Vase, cache pot et céramique ») ne se cherchent
  // pas entiers : on teste chacun de leurs segments, et on exige au moins
  // quatre lettres pour ne pas accrocher sur « et », « de », « à ».
  const segments = l.split(/[,/]| et /).map((s) => s.trim()).filter((s) => s.length >= 4);
  const echappe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return segments.some((s) => new RegExp(`(^| )${echappe(s)}s?( |$)`, "i").test(texteComparable));
}

/**
 * Les paires (Univers, Produit) de secours, pour les feuilles Maison & Jardin
 * où Leboncoin pourrait faire atterrir le formulaire.
 * @param {string} texte          titre (et description) de l'annonce
 * @param {string} feuilleChoisie « Maison & Jardin > … », notre propre feuille
 * @returns {Record<string,string>} clés `for=` → libellé exact de la liste LBC
 */
export function pairesMaisonJardinDeSecours(texte, feuilleChoisie) {
  const out = {};
  const t = ` ${comparable(texte)} `;
  for (const [feuille, def] of Object.entries(LBC_MAISON_JARDIN_DEPENDANTS)) {
    if (feuille === feuilleChoisie) continue;
    // Étage 1 : un Produit nommé dans le titre. Le libellé le PLUS LONG gagne
    // (« Plat de service » avant « Plat »), pour ne pas répondre plus court
    // que ce que l'annonce dit.
    let meilleur = null;
    for (const [univers, produits] of Object.entries(def.produits)) {
      for (const produit of produits) {
        if (/^autres?$/i.test(produit)) continue;          // le fourre-tout est l'étage 2
        if (!libelleDansLeTexte(produit, t)) continue;
        if (!meilleur || produit.length > meilleur.produit.length) meilleur = { univers, produit };
      }
    }
    // ⛔ PAS DE SECOND ÉTAGE « Autre/Autre », ET C'EST MESURÉ (22/09).
    //    On avait écrit la paire fourre-tout de chaque feuille en repli. Elle
    //    est valide EN PAIRE, mais l'extension pose les critères un par un
    //    avec `skipIfPrefilled` : si Leboncoin a déjà pré-rempli l'Univers
    //    (« Accessoire de table », qu'il déduit du titre — vérifié en direct
    //    sur son formulaire), notre « Autre » est sauté, et notre Produit
    //    « Autre » atterrit dans une liste qui ne le contient pas. C'est
    //    EXACTEMENT la panne qu'on corrige. Une paire qui ne peut pas être
    //    garantie atomique ne se pose pas.
    //    Sans correspondance, on ne pose rien : la personne choisit dans la
    //    VRAIE liste (le job la porte déjà dans needsUserField.allowed_values).
    if (!meilleur) continue;
    out[def.typeKey] = meilleur.univers;
    out[def.produitKey] = meilleur.produit;
  }
  return out;
}
