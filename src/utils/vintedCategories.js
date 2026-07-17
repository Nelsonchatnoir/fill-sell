// Mapping icône objet (detectObjectIcon) + genre → chemin catalogue Vinted.
//
// Lot 1 : Mode adultes (Femme/Homme). Lot enfant (2026-07-15, chantier
// « trou tailles ») : Fille/Garçon résolvent les branches réelles
// Enfants > Vêtements pour filles/garçons (table MODE_ENFANT). Bébé,
// Enfant (unisexe) et Mixte retournent null — l'arbre Vinted est genré
// fille/garçon de bout en bout, aucun rayon enfant unisexe (vérifié) → le
// job part sans platform_fields.categoryPath et l'extension le marque
// "failed" avec un message explicite (fallback volontaire, validé).
//
// Chemins construits à partir d'un relevé exhaustif par navigation réelle du
// catalogue Vinted (Femmes > Vêtements/Chaussures/Sacs/Accessoires et
// Hommes > Vêtements/Chaussures/Accessoires), sauf mention contraire en
// commentaire. Depuis juillet 2026, l'arbre COMPLET du FORMULAIRE de vente
// (API /api/v2/item_upload/catalogs, celle qui alimente le dropdown que
// l'extension navigue) est archivé dans docs/vinted-catalog-tree.json
// (+ version lisible .txt) : tout chemin de ce fichier a été validé
// programmatiquement contre cet arbre (feuille terminale comprise) — s'y
// référer avant d'ajouter ou corriger un chemin.
// ⚠️ PIÈGE VÉCU : Vinted expose DEUX arbres différents — celui du formulaire
// (8 racines, "Divertissement") et celui de la navigation/navbar (9 racines,
// "Livres et médias", "Articles de créateurs"). Seul celui du FORMULAIRE
// fait foi ici ; un audit contre l'arbre navbar a brièvement cassé les
// chemins 💿📖📚📰 en juillet 2026. Trois niveaux de confiance à distinguer :
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
  // ⛸️ vivait en null dans HORS_MODE — l'arbre complet montre que rollers et
  // patins sont en réalité des feuilles GENRÉES (Chaussures > Chaussures de
  // sport), d'où la migration ici. DÉFAUT ASSUMÉ : la regex couvre roller ET
  // patin (à glace) — "Patins à glace" est une feuille sœur, un patin à glace
  // atterrira à tort sur rollers avec ce défaut.
  "⛸️": { Femme: ["Femmes", "Chaussures", "Chaussures de sport", "Patins à roulettes et rollers"], Homme: ["Hommes", "Chaussures", "Chaussures de sport", "Patins à roulettes et rollers"] },
  // Chaussons et pantoufles : feuille exacte des deux côtés (2026-07-09, T3).
  "🥿": { Femme: ["Femmes", "Chaussures", "Chaussons et pantoufles"], Homme: ["Hommes", "Chaussures", "Chaussons et pantoufles"] },

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
  // 🎽 (sac de sport/gym) : désambiguïsé de 👜 dans shared.js — feuille
  // dédiée des deux côtés, même asymétrie structurelle que les autres sacs.
  "🎽": { Femme: ["Femmes", "Sacs", "Sacs de sport"], Homme: ["Hommes", "Accessoires", "Sacs et sacoches", "Sacs de sport"] },
  // Ajouts 2026-07-09 (backlog T2/T3) — feuilles exactes relevées dans
  // l'arbre archivé, même asymétrie structurelle Femme/Homme que ci-dessus.
  "👝": { Femme: ["Femmes", "Sacs", "Sacs banane"], Homme: ["Hommes", "Accessoires", "Sacs et sacoches", "Sacs banane"] },
  // Valise : pas de feuille "Bagages et valises" côté Femme — "Sacs de
  // voyage" est l'équivalent le plus proche (DÉFAUT ASSUMÉ léger).
  "🧳": { Femme: ["Femmes", "Sacs", "Sacs de voyage"], Homme: ["Hommes", "Accessoires", "Sacs et sacoches", "Bagages et valises"] },

  // ── Accessoires ───────────────────────────────────────────────────────────
  "🧣": { Femme: ["Femmes", "Accessoires", "Écharpes et châles"], Homme: ["Hommes", "Accessoires", "Écharpes et châles"] },
  "🧤": { Femme: ["Femmes", "Accessoires", "Gants"], Homme: ["Hommes", "Accessoires", "Gants"] },
  // ⚠️ Piège de libellé confirmé par l'arbre : "Chapeaux & casquettes" (avec
  // esperluette) côté Femme, mais "Chapeaux et casquettes" (avec "et") côté
  // Homme — l'ancien chemin Homme par analogie était cassé.
  "🧢": { Femme: ["Femmes", "Accessoires", "Chapeaux & casquettes", "Casquettes"], Homme: ["Hommes", "Accessoires", "Chapeaux et casquettes", "Casquettes"] },
  "🕶️": { Femme: ["Femmes", "Accessoires", "Lunettes de soleil"], Homme: ["Hommes", "Accessoires", "Lunettes de soleil"] },
  "⌚": { Femme: ["Femmes", "Accessoires", "Montres"], Homme: ["Hommes", "Accessoires", "Montres"] },
  // DÉFAUT ASSUMÉ : la regex couvre collier/bracelet/bague/boucle d'oreille/
  // pendentif/broche — chacun est sa propre feuille distincte chez Vinted ;
  // on retombe sur la feuille générique de chaque arbre plutôt que de
  // deviner un type précis.
  "💍": { Femme: ["Femmes", "Accessoires", "Bijoux", "Autres bijoux"], Homme: ["Hommes", "Accessoires", "Bijoux", "Autre"] },
  // Ajouts 2026-07-09 (backlog T3) — accessoires à feuille exacte. Parapluies
  // et Porte-clés n'existent QUE côté Femmes (vérifié : 1 seul hit dans tout
  // l'arbre) ; Cravates et nœuds papillons n'existe QUE côté Hommes.
  "🪢": { Femme: ["Femmes", "Accessoires", "Ceintures"], Homme: ["Hommes", "Accessoires", "Ceintures"] },
  "🎀": { Femme: null, Homme: ["Hommes", "Accessoires", "Cravates et nœuds papillons"] },
  "☂️": { Femme: ["Femmes", "Accessoires", "Parapluies"], Homme: null },
  "🗝️": { Femme: ["Femmes", "Accessoires", "Porte-clés"], Homme: null },
  // Lingerie/nuit (T3) : DÉFAUT ASSUMÉ par genre — la regex 🩲 couvre
  // pyjama/soutien-gorge/culotte/caleçon/boxer ; côté Femme "Pyjamas et
  // tenues de nuit" pris comme dominant (Soutiens-gorge/Culottes = sœurs),
  // côté Homme "Sous-vêtements" est le bac générique réel.
  "🩲": { Femme: ["Femmes", "Vêtements", "Lingerie et pyjamas", "Pyjamas et tenues de nuit"], Homme: ["Hommes", "Vêtements", "Sous-vêtements et chaussettes", "Sous-vêtements"] },
  // Blazer/tailleur et costume (T3 + fix T4 "Pantalon de costume") : branches
  // aux noms DIFFÉRENTS par genre (Blazers et tailleurs vs Costumes et
  // blazers) ; côté Femme "Costumes et tenues particulières" est une feuille
  // terminale directe (niveau 3, vérifié).
  "🥼": { Femme: ["Femmes", "Vêtements", "Blazers et tailleurs", "Blazers"], Homme: ["Hommes", "Vêtements", "Costumes et blazers", "Blazers"] },
  "🤵": { Femme: ["Femmes", "Vêtements", "Costumes et tenues particulières"], Homme: ["Hommes", "Vêtements", "Costumes et blazers", "Ensembles costume"] },

  // ── Beauté (GENRÉE, asymétrie de libellés confirmée par l'arbre : la
  // branche s'appelle "Beauté" côté Femmes mais "Soins" côté Hommes, et
  // "Soins du visage" (F) vs "Soins visage" (H) — jamais de substitution
  // automatique, comme pour les sacs) ───────────────────────────────────────
  "🌸": { Femme: ["Femmes", "Beauté", "Parfums"], Homme: ["Hommes", "Soins", "Parfums"] },
  "💄": { Femme: ["Femmes", "Beauté", "Maquillage"], Homme: ["Hommes", "Soins", "Maquillage"] },
  // Femme : feuille "Manucure" dédiée. Homme : pas d'équivalent manucure,
  // feuille la plus proche = "Soins mains et ongles" (DÉFAUT ASSUMÉ léger).
  "💅": { Femme: ["Femmes", "Beauté", "Manucure"], Homme: ["Hommes", "Soins", "Soins mains et ongles"] },
  // DÉFAUT ASSUMÉ : la regex conflate visage (crème/sérum), corps (lotion/
  // gel douche/savon) et cheveux (shampooing) — trois feuilles sœurs par
  // genre. Visage pris comme dominant (mots-clés crème/sérum en tête, plus
  // gros volume revente en cosmétique) ; un shampooing ou un gel douche
  // atterrira sur la feuille visage, même parent direct.
  "🧴": { Femme: ["Femmes", "Beauté", "Soins du visage"], Homme: ["Hommes", "Soins", "Soins visage"] },

  // Hors périmètre Lot 1 (pas demandés dans cette passe, faible volume ou
  // hors Mode adultes) : 🧳 valises (Homme confirmé "Bagages et valises"
  // sous Sacs et sacoches, Femme approximable par "Sacs de voyage" — à
  // ajouter si besoin). La puériculture (👶💺🍼📟, non genrée, racine
  // Enfants) est mappée côté HORS_MODE depuis la scission de l'icône 👶
  // en juillet 2026.
};

// ── Mode ENFANT (2026-07-15, chantier « trou tailles bébé/enfant ») ─────────
// Rayon réel : Enfants > Vêtements pour filles / Vêtements pour garçons —
// chemins pris dans l'arbre archivé du FORMULAIRE (docs/
// vinted-catalog-tree.txt L463-699), mêmes règles que MODE_ADULTE (feuilles
// terminales, libellés exacts, défauts documentés). Relevé DOM du
// 2026-07-15 : les feuilles par type (T-shirts, Chemises…) portent TOUTE la
// grille de tailles enfant (« Prématuré, jusqu'à 44cm » → « 16 ans /
// 176 cm ») — pas besoin de router les tailles mois vers la branche « Bébé
// filles/garçons » (réservée aux types spécifiquement bébé : bodies,
// grenouillères — aucune icône dédiée aujourd'hui).
//
// ⚠️ Pas de clé "Bébé" ni "Enfant" : l'arbre Vinted est genré fille/garçon
// de bout en bout (AUCUNE branche enfant unisexe, vérifié sur l'arbre
// complet). Un genre Bébé/Enfant retourne null → même fallback explicite
// que le reste du fichier (vintedGenreRequired → l'utilisateur tranche
// Fille/Garçon dans le stepper), jamais un rayon deviné.
//
// ⚠️ Pièges de libellés RÉELS de l'arbre (ne pas « corriger ») :
//   - fille « Pulls à capuche & sweatshirts » (esperluette) vs garçon
//     « Pulls à capuche et sweatshirts » (« et ») — même piège que
//     Chapeaux F/H côté adulte ;
//   - garçon « Nœuds papillon et cravattes » avec DEUX t (sic, crawl) ;
//   - pyjamas : branche « Pyjamas et chemises de nuit » côté fille,
//     « Pyjamas » tout court côté garçon.
const FI = ["Enfants", "Vêtements pour filles"];
const GA = ["Enfants", "Vêtements pour garçons"];
const MODE_ENFANT = {
  // ── Chaussures (grille pointures nues « 15 et moins » → 40, relevée) ──────
  // DÉFAUT ASSUMÉ 👟 : Baskets a 3 sous-feuilles (à scratch/à lacets/sans
  // lacets) — « à lacets » pris comme dominant revente.
  "👟": { Fille: [...FI, "Chaussures", "Baskets", "Baskets à lacets"], Garçon: [...GA, "Chaussures", "Baskets", "Baskets à lacets"] },
  "👢": { Fille: [...FI, "Chaussures", "Bottes", "Bottines"], Garçon: [...GA, "Chaussures", "Bottes", "Bottines"] },
  // Chaussures à talons : existe côté fille (feuille directe), pas côté garçon.
  "👠": { Fille: [...FI, "Chaussures", "Chaussures à talons"], Garçon: null },
  "🩴": { Fille: [...FI, "Chaussures", "Sandales, claquettes et tongs", "Sandales"], Garçon: [...GA, "Chaussures", "Sandales, claquettes et tongs", "Sandales"] },
  "🥿": { Fille: [...FI, "Chaussures", "Chaussons et pantoufles"], Garçon: [...GA, "Chaussures", "Chaussons et pantoufles"] },
  "⛸️": { Fille: [...FI, "Chaussures", "Chaussures de sport", "Patins à roulettes et rollers"], Garçon: [...GA, "Chaussures", "Chaussures de sport", "Patins à roulettes et rollers"] },

  // ── Vêtements ─────────────────────────────────────────────────────────────
  // DÉFAUT ASSUMÉ 👗 : Robes n'a que courtes/longues — courtes dominant.
  "👗": { Fille: [...FI, "Robes", "Robes courtes"], Garçon: null },
  // Même défaut Doudounes que l'adulte (regex manteau/veste très large).
  "🧥": { Fille: [...FI, "Vêtements d'extérieur", "Vestes", "Doudounes"], Garçon: [...GA, "Vêtements d'extérieur", "Vestes", "Doudounes"] },
  "👔": { Fille: [...FI, "Chemises et t-shirts", "Chemises"], Garçon: [...GA, "Chemises et t-shirts", "Chemises"] },
  "👕": { Fille: [...FI, "Chemises et t-shirts", "T-shirts"], Garçon: [...GA, "Chemises et t-shirts", "T-shirts"] },
  "🧶": { Fille: [...FI, "Pulls & sweats", "Pulls à capuche & sweatshirts"], Garçon: [...GA, "Pulls & sweats", "Pulls à capuche et sweatshirts"] },
  "👖": { Fille: [...FI, "Pantalons et shorts", "Autres"], Garçon: [...GA, "Pantalons et shorts", "Autres"] },
  "🩳": { Fille: [...FI, "Pantalons et shorts", "Shorts et pantacourts"], Garçon: [...GA, "Pantalons et shorts", "Shorts et pantacourts"] },
  // Natation : fille 1 pièce/2 pièces (1 pièce dominant enfant), garçon
  // feuille directe « Maillots de bain ».
  "👙": { Fille: [...FI, "Équipements de natation", "Maillot de bain 1 pièce"], Garçon: [...GA, "Équipements de natation", "Maillots de bain"] },
  "🧦": { Fille: [...FI, "Sous-vêtements", "Chaussettes"], Garçon: [...GA, "Sous-vêtements", "Chaussettes"] },
  // DÉFAUT ASSUMÉ 🩲 (regex pyjama/sous-vêtements) : pyjama dominant.
  "🩲": { Fille: [...FI, "Pyjamas et chemises de nuit", "Pyjamas deux pièces"], Garçon: [...GA, "Pyjamas", "Pyjamas deux pièces"] },
  "🥼": { Fille: [...FI, "Vêtements d'extérieur", "Vestes", "Blazers"], Garçon: [...GA, "Vêtements d'extérieur", "Vestes", "Blazers"] },
  "🤵": { Fille: [...FI, "Tenues de soirée"], Garçon: [...GA, "Tenues de soirée"] },

  // ── Sacs (une seule feuille « Sacs et sacs à dos » par genre — pas de
  // granularité sac à main/banane/voyage côté enfant) ───────────────────────
  "👜": { Fille: [...FI, "Sacs et sacs à dos"], Garçon: [...GA, "Sacs et sacs à dos"] },
  "👛": { Fille: [...FI, "Accessoires", "Porte-monnaie"], Garçon: [...GA, "Accessoires", "Porte-monnaie"] },
  "🎒": { Fille: [...FI, "Sacs et sacs à dos"], Garçon: [...GA, "Sacs et sacs à dos"] },
  "🎽": { Fille: [...FI, "Sacs et sacs à dos"], Garçon: [...GA, "Sacs et sacs à dos"] },
  "🧳": { Fille: [...FI, "Sacs et sacs à dos"], Garçon: [...GA, "Sacs et sacs à dos"] },
  "👝": { Fille: [...FI, "Sacs et sacs à dos"], Garçon: [...GA, "Sacs et sacs à dos"] },

  // ── Accessoires ───────────────────────────────────────────────────────────
  "🧣": { Fille: [...FI, "Accessoires", "Écharpes et châles"], Garçon: [...GA, "Accessoires", "Écharpes et châles"] },
  "🧤": { Fille: [...FI, "Accessoires", "Gants"], Garçon: [...GA, "Accessoires", "Gants"] },
  "🧢": { Fille: [...FI, "Accessoires", "Casquettes et chapeaux"], Garçon: [...GA, "Accessoires", "Casquettes et chapeaux"] },
  // DÉFAUT ASSUMÉ léger : pas de feuille Lunettes ni Montres côté enfant
  // (vérifié dans les deux listes Accessoires) → bac générique.
  "🕶️": { Fille: [...FI, "Accessoires", "Autres accessoires"], Garçon: [...GA, "Accessoires", "Autres accessoires"] },
  "⌚": { Fille: [...FI, "Accessoires", "Autres accessoires"], Garçon: [...GA, "Accessoires", "Autres accessoires"] },
  // Bijoux : feuille réelle côté fille uniquement.
  "💍": { Fille: [...FI, "Accessoires", "Bijoux"], Garçon: [...GA, "Accessoires", "Autres accessoires"] },
  "🪢": { Fille: [...FI, "Accessoires", "Ceintures"], Garçon: [...GA, "Accessoires", "Ceintures"] },
  "🎀": { Fille: null, Garçon: [...GA, "Accessoires", "Nœuds papillon et cravattes"] },
};

// Catégories SANS niveau genre. Racines réelles du FORMULAIRE (juillet
// 2026) : Femmes, Hommes, Enfants, Maison, Électronique, Divertissement,
// Loisirs et collections, Sport. ⚠️ La navbar affiche "Livres et médias"
// mais le formulaire de vente dit bien "Divertissement" (deux arbres
// distincts, cf. header) — revalider contre docs/vinted-catalog-tree.json
// (arbre du formulaire) en cas d'échec en série. Chemin unique par icône,
// valable quel que soit platform_fields.genre.
//
// null explicite = vérifié dans l'arbre COMPLET, pas de feuille exploitable
// (à distinguer d'un simple oubli). RE-VÉRIFICATION du 2026-07-09 (mission
// mapping complet, recherche par mot-clé sur les 2493 feuilles de l'arbre
// archivé) :
//   - gros électroménager (frigo, lave-linge, lave-vaisselle) : CONFIRMÉ
//     absent — seul hit "Aimants pour réfrigérateur" (déco)
//   - mobilier ADULTE (canapé, chaise, lit) : CONFIRMÉ absent de Maison —
//     ⚠️ mais Enfants > Meubles et décoration EXISTE (12 sous-branches,
//     l'ancien audit l'avait ratée) : couverte via 🚼 (chambre de bébé),
//     le mobilier générique adulte reste null
//   - vélo adulte complet : CONFIRMÉ absent (Cyclisme = vélos enfant,
//     pièces, accessoires uniquement) — un défaut vers "Vélos pour enfant"
//     serait activement trompeur, pire qu'un fallback explicite
//   - équipement cardio (tapis de course/rameur/elliptique) : CONFIRMÉ absent
//   - Auto-Moto : CONFIRMÉ, aucune racine (8 racines : Femmes/Hommes/Enfants/
//     Maison/Électronique/Divertissement/Loisirs et collections/Sport)
//   - Bricolage et Jardin : exclusion RÉVOQUÉE — Maison > Outils et
//     bricolage et Maison > Extérieur et jardin sont des branches réelles et
//     détaillées, désormais mappées (🪛🪚🔨🪜🖌️📏🔧 / ✂️⛱️)
// Les anciennes branches "non détaillées à la feuille" (imprimante, mixeur,
// coiffure/rasage, instruments, poupées, glisse urbaine, ballons, golf,
// pêche, yoga...) ont toutes été résolues via l'arbre complet en juillet
// 2026 — voir chaque entrée.
const HORS_MODE = {
  // ── Électronique ──────────────────────────────────────────────────────────
  // DÉFAUT ASSUMÉ : conflate téléphone ET tablette (même icône côté
  // detectObjectIcon). Une feuille tablette existe désormais (Électronique >
  // Tablettes, liseuses et accessoires > Tablettes) — bon candidat de
  // scission d'icône en Lot 2, chemin déjà identifié.
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
  // DÉFAUT ASSUMÉ : imprimante vs scanner, deux branches sœurs ("Imprimantes
  // et accessoires" / "Scanners et accessoires > Scanners") — pas de feuille
  // "Imprimantes" générique, jet d'encre pris comme format grand public
  // dominant (laser/photo/multifonctions = feuilles sœurs).
  "🖨️": ["Électronique", "Ordinateurs et accessoires", "Imprimantes et accessoires", "Imprimantes à jet d'encre"],
  // DÉFAUT ASSUMÉ : seule feuille générique du groupe = "Batteries externes"
  // (mots-clés batterie externe/powerbank). Les chargeurs/câbles/hubs/docks
  // n'existent que par appareil (chargeurs pour ordinateurs portables, docks
  // gaming...) — un câble ou un chargeur atterrira sur Batteries externes
  // avec ce défaut, approximation dans la même racine Électronique.
  "🔌": ["Électronique", "Autres appareils et accessoires", "Batteries externes"],
  // Ajouts 2026-07-09 : scissions T4 (tablette, montre connectée) et T3
  // (liseuse, enceinte connectée) — feuilles exactes de l'arbre archivé.
  "📲": ["Électronique", "Tablettes, liseuses et accessoires", "Tablettes"],
  "📇": ["Électronique", "Tablettes, liseuses et accessoires", "Liseuses"],
  "⏱️": ["Électronique", "Objets connectés", "Montres connectées"],
  "📡": ["Électronique", "Audio, casques et hi-fi", "Enceintes connectées"],

  // ── Maison — décoration / arts de la table ────────────────────────────────
  "💡": ["Maison", "Décoration", "Éclairage", "Lampes"],
  "🪞": ["Maison", "Décoration", "Miroirs", "Miroirs muraux"],
  "🕯️": ["Maison", "Décoration", "Bougies et parfums d'ambiance", "Bougies"],
  // DÉFAUT ASSUMÉ : "Encadrements" (cadre) est la seule feuille confirmée de
  // ce groupe — poster/affiche/tableau (sans cadre) n'ont pas de feuille
  // confirmée séparée ("Décorations murales" non détaillé).
  "🖼️": ["Maison", "Décoration", "Encadrements"],
  // Branche réelle : Extérieur et jardin (pas Décoration comme supposé par
  // l'ancien relevé). DÉFAUT ASSUMÉ : plante/cache-pot/jardinière — "Pots de
  // fleurs" pris comme feuille générique (jardinières murales/suspendues/
  // balcon = feuilles sœurs plus spécifiques).
  "🪴": ["Maison", "Extérieur et jardin", "Pots, jardinières et accessoires", "Pots de fleurs"],
  "🏺": ["Maison", "Décoration", "Vases"],
  // DÉFAUT ASSUMÉ : assiette/bol→Vaisselle > Assiettes (dominant) ; verre a
  // ses propres feuilles (Arts de la table > Verres > Verres à eau/à pied),
  // non atteintes par ce défaut — scission possible en Lot 2.
  "🍽️": ["Maison", "Arts de la table", "Vaisselle", "Assiettes"],
  // DÉFAUT ASSUMÉ : casserole/poêle confirmés (Cuisson et pâtisserie),
  // "ustensile" générique vit en réalité sous Maison > Outils de cuisine
  // (catégorie sœur différente, non atteinte par ce défaut).
  "🍳": ["Maison", "Cuisson et pâtisserie", "Casseroles"],

  // ── Maison — textiles / horlogerie / animaux / fêtes / papeterie (ajouts
  // 2026-07-09, backlog T3 — branches Textiles, Décoration > Horloges,
  // Animaux, Célébrations et fêtes, Fournitures de bureau toutes réelles) ───
  // DÉFAUT ASSUMÉ : rideau→Rideaux opaques (Voilages/Stores = sœurs).
  "🪟": ["Maison", "Textiles", "Rideaux et stores", "Rideaux opaques"],
  "🪶": ["Maison", "Textiles", "Coussins décoratifs"],
  // DÉFAUT ASSUMÉ : Petits tapis (Tapis d'extérieur = sœur).
  "🟫": ["Maison", "Textiles", "Tapis", "Petits tapis"],
  // DÉFAUT ASSUMÉ : nappe dominante (Napperons = sœur).
  "📜": ["Maison", "Textiles", "Linge de table", "Nappes"],
  // Scission de 🛏️ (T2) : la LITERIE TEXTILE a une branche réelle (Linge de
  // lit), le lit-MEUBLE reste null (voir 🛏️). DÉFAUT ASSUMÉ : housse de
  // couette dominante (Draps/Taies/Parures = sœurs).
  "🛌": ["Maison", "Textiles", "Linge de lit", "Housses de couette"],
  // DÉFAUT ASSUMÉ : murale dominante ; "réveil" n'a AUCUNE feuille dédiée
  // dans tout l'arbre (vérifié) — Horloges de table serait la sœur la plus
  // proche, non atteinte.
  "🕰️": ["Maison", "Décoration", "Horloges", "Horloges murales"],
  // DÉFAUT ASSUMÉ (double) : Chiens pris avant Chats (arbres jumeaux), et
  // Gamelles avant Distributeurs.
  "🐕": ["Maison", "Animaux", "Chiens", "Gamelles & distributeurs", "Gamelles"],
  // DÉFAUT ASSUMÉ : Décorations pour le sapin (Décorations saisonnières et
  // Couronnes = sœurs sous Célébrations et fêtes).
  "🎄": ["Maison", "Célébrations et fêtes", "Décorations pour le sapin"],
  // DÉFAUT ASSUMÉ : stylo dominant — carnet/calculatrice/agenda/trousse ont
  // chacun leur feuille sœur exacte sous Fournitures de bureau, non atteintes.
  "🖋️": ["Maison", "Fournitures de bureau", "Fournitures d'écriture", "Stylos"],

  // ── Maison — Outils et bricolage (branche RÉELLE de l'arbre du formulaire,
  // re-vérifiée le 2026-07-09 : l'ancienne exclusion "Bricolage hors
  // périmètre Vinted" était FAUSSE, la racine Maison porte bien Outils et
  // bricolage avec 13 sous-branches détaillées jusqu'à la feuille) ──────────
  // DÉFAUT ASSUMÉ : perceuse-visseuse dominante (tournevis À MAIN = Outils à
  // main > Tournevis, branche sœur non atteinte).
  "🪛": ["Maison", "Outils et bricolage", "Outils électriques", "Perceuses", "Perceuses-visseuses"],
  // DÉFAUT ASSUMÉ : scie circulaire dominante ; tronçonneuse COMPLÈTE sans
  // feuille (seuls ses accessoires existent, sous Extérieur et jardin).
  "🪚": ["Maison", "Outils et bricolage", "Outils électriques", "Scies électriques", "Scies circulaires"],
  "🔨": ["Maison", "Outils et bricolage", "Outils à main", "Marteaux"],
  // DÉFAUT ASSUMÉ : échelle dominante (Marchepieds = sœur pour escabeau).
  "🪜": ["Maison", "Outils et bricolage", "Équipement d'atelier et de chantier", "Échelles"],
  // DÉFAUT ASSUMÉ : pinceau dominant (rouleaux/manchons = sœurs).
  "🖌️": ["Maison", "Outils et bricolage", "Outils et accessoires de peinture", "Pinceaux"],
  // DÉFAUT ASSUMÉ : mètre ruban dominant (Niveaux/Télémètres laser = sœurs).
  "📏": ["Maison", "Outils et bricolage", "Outils de mesure", "Mètres rubans"],
  // DÉFAUT ASSUMÉ : clé à molette dominante (Pinces/Clés à cliquet = sœurs ;
  // serre-joints vivent sous Accessoires pour outils, non atteints).
  "🔧": ["Maison", "Outils et bricolage", "Outils à main", "Clés à molette"],
  // Visserie/boulonnerie : AUCUNE feuille dans Quincaillerie (vérifié
  // 2026-07-09 — poignées/charnières/verrous seulement) — null explicite.
  "🔩": null,

  // ── Maison — Extérieur et jardin (branche réelle, exclusion "Jardin"
  // révoquée le 2026-07-09 — même re-vérification que Bricolage) ────────────
  // DÉFAUT ASSUMÉ : taille-haies électrique dominant (Sécateurs = Outils
  // manuels de jardin, branche sœur).
  "✂️": ["Maison", "Extérieur et jardin", "Outils électriques d'extérieur", "Taille-haies"],
  "⛱️": ["Maison", "Extérieur et jardin", "Décorations de jardin et d'extérieur", "Parasols et parasols déportés"],
  // Tondeuse à gazon COMPLÈTE absente de l'arbre (seuls ses accessoires,
  // re-vérifié 2026-07-09) — même famille de gap que le gros électroménager.
  "🌱": null,
  // Barbecue/plancha : aucun appareil complet ("Cuisine et grillade
  // d'extérieur" ne contient que outils et accessoires, re-vérifié) — null.
  "🔥": null,

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
  // DÉFAUT ASSUMÉ : chaque mot-clé de la regex a sa feuille sœur exacte sous
  // le même parent (blender→Blenders, mixeur→Mixeurs plongeants, thermomix/
  // robot cuisine→Robots de cuisine, robot pâtissier→Robots pâtissiers,
  // batteur→Batteur électrique) — "Blenders" pris par défaut (1er mot-clé),
  // conflation bénigne car tout reste sous le bon parent.
  "🥣": ["Maison", "Petits appareils de cuisine", "Blenders, mixeurs et robots de cuisine", "Blenders"],
  "🍞": ["Maison", "Petits appareils de cuisine", "Grille-pain"],
  "🍟": ["Maison", "Petits appareils de cuisine", "Friteuses"],
  // Branche réelle : "Produits de beauté et de soins personnels" (racine
  // Électronique, pas Maison malgré la section). DÉFAUT ASSUMÉ : sèche-cheveux
  // vs lisseur/boucleur, feuilles sœurs (Lisseurs / Autres appareils de
  // coiffure) — sèche-cheveux pris comme dominant.
  "💇": ["Électronique", "Produits de beauté et de soins personnels", "Appareils de coiffure", "Sèche-cheveux"],
  // Gros électroménager (lave-linge/sèche-linge/lave-vaisselle) absent de
  // tout l'arbre Maison, confirmé — aucune catégorie niveau 2 correspondante.
  "🧺": null,
  "☕": ["Maison", "Petits appareils de cuisine", "Préparation du café, du thé et de l'expresso", "Machines à café"],
  // Entretien de la maison (ajouts 2026-07-09, T3) — trois sous-branches
  // réelles : Fers à repasser et entretien du linge / Chauffage,
  // climatisation et ventilation. DÉFAUTS ASSUMÉS : fer dominant
  // (Défroisseurs/Tables à repasser = sœurs), ventilateur dominant
  // (Climatiseurs/Purificateurs = sœurs), chauffage dominant.
  "🧼": ["Maison", "Entretien de la maison", "Fers à repasser et entretien du linge", "Fers à repasser"],
  "🌀": ["Maison", "Entretien de la maison", "Chauffage, climatisation et ventilation", "Ventilateurs"],
  "🌡️": ["Maison", "Entretien de la maison", "Chauffage, climatisation et ventilation", "Chauffages et radiateurs"],
  // DÉFAUT ASSUMÉ : rasoir→Rasoirs électriques, tondeuse→Tondeuses,
  // épilateur→Épilateurs électriques, toutes feuilles sœurs sous "Rasage et
  // épilation" — rasoir pris comme dominant (1er mot-clé de la regex).
  "🪒": ["Électronique", "Produits de beauté et de soins personnels", "Rasage et épilation", "Rasoirs électriques"],

  // ── Musique / Livres / Collection ─────────────────────────────────────────
  "🎸": ["Loisirs et collections", "Instruments de musique et équipement", "Guitares et basses", "Guitares électriques"],
  // DÉFAUT ASSUMÉ : violon→Violons (dominant), violoncelle→Violoncelles
  // (feuille sœur), contrebasse→pas de feuille dédiée ("Instruments à cordes
  // spéciaux" serait le vrai bac).
  "🎻": ["Loisirs et collections", "Instruments de musique et équipement", "Instruments à cordes", "Violons"],
  // DÉFAUT ASSUMÉ (fragile) : pas de feuille "batterie acoustique complète" —
  // "Batteries électroniques" pris comme cas de revente le plus courant ;
  // une cymbale seule (Kits de cymbales) ou une caisse claire (feuille sœur
  // "Caisses claires") atterriront à côté.
  "🥁": ["Loisirs et collections", "Instruments de musique et équipement", "Batterie et percussions", "Batteries", "Batteries électroniques"],
  // DÉFAUT ASSUMÉ : la regex écartèle deux sous-branches (trompette→Cuivres,
  // saxo/clarinette/flûte→Bois) — "Flûtes" pris par défaut (3 mots-clés sur 4
  // sont des Bois, flûte = plus gros volume écoles) ; une trompette atterrira
  // dans la mauvaise sous-branche.
  "🎺": ["Loisirs et collections", "Instruments de musique et équipement", "Instruments à vent", "Bois", "Flûtes"],
  // DÉFAUT ASSUMÉ : "vinyle" (disque, Divertissement) vs "platine" (lecteur,
  // Électronique > Systèmes audio domestiques > Platines vinyle) — deux
  // racines différentes pour le même mot-clé. Disque pris comme cas
  // dominant (33/45 tours confirment l'intention "disque").
  "💿": ["Divertissement", "Musique", "Vinyles"],
  // Médias physiques (2026-07-09, T3) : Divertissement > Vidéo et > Musique.
  // DÉFAUT ASSUMÉ 📀 : DVD dominant (Blu-ray/Blu-ray 4K/VHS/LaserDisc =
  // feuilles sœurs). 💽 : CD dominant (Cassettes audio/MiniDiscs = sœurs).
  "📀": ["Divertissement", "Vidéo", "DVD"],
  "💽": ["Divertissement", "Musique", "CD"],
  "🎼": ["Loisirs et collections", "Instruments de musique et équipement", "Instruments à vent", "Harmonicas"],
  // Machine à coudre (T3) : vit sous Loisirs créatifs, pas Électroménager.
  "🧵": ["Loisirs et collections", "Loisirs créatifs", "Couture, tricot et travaux d'aiguille", "Machines à coudre"],
  // Feuille réelle trouvée dans l'arbre complet : "Microphones" sous Matériel
  // de studio et sonorisation live (l'ancien relevé ne connaissait que
  // "Microphones d'ordinateur"). Un micro karaoké a sa propre feuille
  // (Équipement de karaoké > Microphones karaoké), non atteinte par ce défaut.
  "🎤": ["Loisirs et collections", "Instruments de musique et équipement", "Matériel de studio et sonorisation live", "Microphones"],
  // DÉFAUT ASSUMÉ : piano numérique/clavier arrangeur→Claviers électroniques
  // (dominant), synthé→Synthétiseurs, clavier maître→Contrôleurs MIDI
  // (feuilles sœurs).
  "🎹": ["Loisirs et collections", "Instruments de musique et équipement", "Claviers et synthétiseurs", "Claviers électroniques"],
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
  "🪆": ["Enfants", "Jeux et jouets", "Poupées, poupons et accessoires", "Poupées et poupons"],
  // Règle TRANCHÉE par l'arbre complet (juillet 2026) : "Puzzles" n'existe
  // qu'à UN seul endroit dans tout le catalogue — Loisirs et collections >
  // Puzzles (feuille). Aucune entrée Puzzles sous Enfants > Jeux et jouets.
  // Chemin unique, aucune condition adulte/enfant à faire.
  "🧩": ["Loisirs et collections", "Puzzles"],
  "🦸": ["Enfants", "Jeux et jouets", "Figurines et accessoires", "Figurines"],
  // Ajouts 2026-07-09 : jouets télécommandés (T2, feuille exacte) et
  // déguisements (T3 — feuille "Déguisements" sous Jeux et jouets, distincte
  // des Déguisements par genre sous Vêtements pour filles/garçons).
  "🚁": ["Enfants", "Jeux et jouets", "Jeux et jouets électroniques", "Jouets télécommandés"],
  "🎭": ["Enfants", "Jeux et jouets", "Déguisements et jeux de rôle", "Déguisements"],
  // Chambre de bébé (2026-07-09) : la branche Enfants > Meubles et décoration
  // EXISTE (12 sous-branches — l'ancien commentaire "non exploré" est levé).
  // Seuls les mots-clés SANS ambiguïté adulte/enfant (lit à barreaux,
  // berceau, table à langer…) y sont routés via 🚼 — le mobilier générique
  // (🛋️🪑🛏️) reste null : un canapé adulte n'a toujours aucune catégorie.
  // DÉFAUT ASSUMÉ : Lits à barreaux dominant (Berceaux/Cododos/Tables à
  // langer = feuilles sœurs sous Chambre de bébé).
  "🚼": ["Enfants", "Meubles et décoration", "Chambre de bébé", "Lits à barreaux"],

  // ── Puériculture (racine Enfants, non genrée — même famille de piège que
  // les jouets). Scission de l'ancienne icône 👶 unique (juillet 2026) :
  // poussette/siège auto/biberon/babyphone ont chacun leur icône et leur
  // feuille EXACTE dans l'arbre — plus aucun défaut inter-branches ─────────
  "👶": ["Enfants", "Poussettes, porte-bébé et sièges auto", "Poussettes et landaus"],
  "💺": ["Enfants", "Poussettes, porte-bébé et sièges auto", "Sièges auto"],
  "🍼": ["Enfants", "Allaitement et alimentation", "Alimentation au biberon", "Biberons"],
  "📟": ["Enfants", "Sommeil et literie", "Babyphones"],
  "🃏": ["Loisirs et collections", "Cartes à collectionner", "Cartes à collectionner à l'unité"],
  "🎲": ["Loisirs et collections", "Jeux de société"],
  "🏎️": ["Enfants", "Jeux et jouets", "Voitures, trains et autres véhicules", "Voitures"],

  // ── Sport ─────────────────────────────────────────────────────────────────
  // Piège confirmé : pas de "vélo adulte complet" (seulement vélo enfant +
  // pièces détachées) — un défaut vers l'un ou l'autre serait trompeur pour
  // un vrai vélo adulte entier, fallback explicite volontaire.
  "🚲": null,
  "🛴": ["Sport", "Skateboards et trottinettes", "Trottinettes"],
  // DÉFAUT ASSUMÉ : skate→Skateboards (dominant), longboard→Longboards
  // (feuille sœur).
  "🛹": ["Sport", "Skateboards et trottinettes", "Skateboards"],
  // ⛸️ (roller/patin) migré vers MODE_ADULTE : feuilles réelles genrées sous
  // Femmes/Hommes > Chaussures > Chaussures de sport.
  // DÉFAUT ASSUMÉ : ski (Matériel de ski) vs snowboard (Matériel de
  // snowboard), feuilles sœurs confirmées sous Sports d'hiver.
  "🎿": ["Sport", "Sports d'hiver", "Matériel de ski", "Skis alpins"],
  // DÉFAUT ASSUMÉ : la regex couvre "ballon" générique — un ballon de volley/
  // rugby/hand a sa feuille sœur dédiée sous Sports d'équipe, football pris
  // comme dominant.
  "⚽": ["Sport", "Sports d'équipe", "Football", "Ballons de football"],
  // DÉFAUT ASSUMÉ : tennis vs badminton, feuilles sœurs confirmées sous
  // Sports de raquette.
  "🎾": ["Sport", "Sports de raquette", "Tennis", "Raquettes de tennis"],
  // DÉFAUT ASSUMÉ : "Clubs de golf" pris comme article de revente dominant
  // (balles/sacs/gants/chariots = feuilles sœurs directes sous Golf).
  "⛳": ["Sport", "Golf", "Clubs de golf"],
  "🏋️": ["Sport", "Fitness, course à pied et yoga", "Musculation", "Haltères"],
  // DÉFAUT ASSUMÉ : "Gants de boxe et d'arts martiaux" pris comme article
  // dominant (sacs de frappe/protections/kimonos-ceintures = feuilles sœurs).
  "🥊": ["Sport", "Boxe et arts martiaux", "Gants de boxe et d'arts martiaux"],
  "⛺": ["Sport", "Sports de plein air", "Tentes et matériel de couchage", "Tentes"],
  // Branche réelle : Pêche et chasse vit SOUS Sports de plein air (niveau 3,
  // pas niveau 2 comme supposé). DÉFAUT ASSUMÉ : canne→Cannes à pêche
  // (dominant), moulinet→Moulinets de pêche (feuille sœur).
  "🎣": ["Sport", "Sports de plein air", "Pêche et chasse", "Cannes à pêche"],
  // DÉFAUT ASSUMÉ : "Tapis de yoga" pris comme article dominant (briques,
  // coussins, sangles, accessoires pilates = feuilles sœurs).
  "🧘": ["Sport", "Fitness, course à pied et yoga", "Matériel de yoga et de pilates", "Tapis de yoga"],
  // 🥽 (lunettes de natation/piscine) : désambiguïsé de 🕶️ dans shared.js.
  "🥽": ["Sport", "Sports nautiques", "Natation", "Lunettes de natation"],
  // DÉFAUT ASSUMÉ : casque vélo (Cyclisme) vs casque ski/snow (Sports
  // d'hiver) — même icône, deux feuilles confirmées dans des catégories
  // parentes différentes ; vélo pris comme cas dominant.
  "⛑️": ["Sport", "Cyclisme", "Casques de vélo"],
  "🏀": ["Sport", "Sports d'équipe", "Basketball", "Ballons de basket"],
  // Confirmé absent de TOUT l'arbre Sport (aucune feuille tapis de course/
  // rameur/elliptique/vélo d'appartement) — même gap que le gros
  // électroménager, fallback explicite volontaire.
  "🏃": null,
  // Ajouts Sport 2026-07-09 — deux branches N2 jamais couvertes (Équitation,
  // Sports et jeux de loisir) + Sports nautiques élargi.
  // DÉFAUT ASSUMÉ : bombe dominante (Selles et harnachement = sous-branche
  // pour cravache/étriers/tapis de selle, non atteinte).
  "🐴": ["Sport", "Équitation", "Bombes d'équitation"],
  // DÉFAUT ASSUMÉ (large) : la regex couvre billard/pétanque/fléchettes/
  // bowling/frisbee — chacun a sa sous-branche sœur sous Sports et jeux de
  // loisir ; Queues (billard) pris comme article de revente dominant.
  "🎱": ["Sport", "Sports et jeux de loisir", "Billard et snooker", "Queues"],
  // DÉFAUT ASSUMÉ : masque dominant (Palmes/Tubas/Kits = sœurs sous
  // Natation ; Combinaisons de plongée = branche sœur).
  "🤿": ["Sport", "Sports nautiques", "Natation", "Masques de plongée"],
  // DÉFAUT ASSUMÉ : paddle gonflable dominant (Kayaks/Planches de kitesurf/
  // Skis nautiques = sœurs). ⚠️ Planche de SURF classique : aucune feuille
  // dans tout l'arbre (vérifié 2026-07-09, seul le kitesurf existe).
  "🏄": ["Sport", "Sports nautiques", "Paddles", "Paddles gonflables"],

  // ── Auto-Moto : AUCUNE racine dans l'arbre du formulaire (8 racines
  // confirmées, re-vérifié le 2026-07-09) — nulls EXPLICITES pour que
  // l'absence soit une décision datée, pas un oubli ─────────────────────────
  "🏍️": null,
  "🛵": null,
  "🛞": null,
  "🚗": null,
  "🪖": null, // casque moto — équipement du motard, même racine absente
  "📦": null, // filet générique (gourde, veilleuse, objets sans feuille dédiée)
};

/**
 * @param {string} icon  — emoji retourné par detectObjectIcon
 * @param {string} genre — "Femme" | "Homme" | "Enfant" | "Mixte" | "" (platform_fields.genre)
 * @returns {string[]|null} chemin catalogue Vinted, ou null si non mappé
 *   (icône hors périmètre, genre absent, Enfant/Mixte → Lot 2)
 */
/**
 * true si l'icône est un article de mode adulte : son chemin Vinted dépend du
 * genre (rayon Femmes/Hommes obligatoire, aucun rayon Mixte dans tout l'arbre
 * — vérifié sur les 2920 nœuds). Sert au blocage UI avant publication et au
 * flag platform_fields.vintedGenreRequired lu par l'extension.
 * @param {string} icon — emoji retourné par detectObjectIcon
 */
export function vintedGenreRequired(icon) {
  if (Object.prototype.hasOwnProperty.call(HORS_MODE, icon)) return false;
  return Object.prototype.hasOwnProperty.call(MODE_ADULTE, icon);
}

/**
 * Statut de support Vinted d'une icône — DÉRIVÉ des tables ci-dessus (aucune
 * liste parallèle) :
 *   "supported"   — au moins un chemin réel (validé contre le crawl archivé)
 *   "unavailable" — null explicite : absence CONFIRMÉE par crawl (ex: vélo
 *                   adulte, gros électroménager, Auto-Moto)
 *   "unmapped"    — aucune clé : catégorie pas encore mappée/crawlée
 */
export function vintedCategoryStatus(icon) {
  if (Object.prototype.hasOwnProperty.call(HORS_MODE, icon)) {
    return HORS_MODE[icon] ? "supported" : "unavailable";
  }
  const entry = MODE_ADULTE[icon];
  if (!entry) return "unmapped";
  return entry.Femme || entry.Homme ? "supported" : "unavailable";
}

export function getVintedCategoryPath(icon, genre) {
  // HORS_MODE d'abord : ces catégories n'ont pas de niveau genre (racines
  // confirmées : Maison/Électronique/Divertissement/Loisirs et collections/
  // Sport), donc pas besoin d'attendre platform_fields.genre pour elles.
  if (Object.prototype.hasOwnProperty.call(HORS_MODE, icon)) return HORS_MODE[icon];
  // Adulte (Femme/Homme) puis enfant (Fille/Garçon, 2026-07-15) : les deux
  // tables sont disjointes par genre, jamais de substitution croisée.
  // Bébé/Enfant/Mixte ne résolvent rien → null (fallback explicite,
  // vintedGenreRequired fait trancher Fille/Garçon dans le stepper).
  const adulte = MODE_ADULTE[icon];
  const enfant = MODE_ENFANT[icon];
  if ((!adulte && !enfant) || !genre) return null;
  return adulte?.[genre] ?? enfant?.[genre] ?? null;
}
