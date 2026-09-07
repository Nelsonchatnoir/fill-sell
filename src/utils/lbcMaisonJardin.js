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
};

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
