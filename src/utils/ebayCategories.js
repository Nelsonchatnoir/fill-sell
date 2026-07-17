// Mapping icône objet (detectObjectIcon) + genre → chemin catalogue eBay.fr
// + categoryId numérique.
//
// Source : crawl réel du sélecteur de catégorie du FORMULAIRE de vente
// (www.ebay.fr/sl/sell → /sl/prelist), juillet 2026, via l'API interne que le
// formulaire appelle lui-même (/sl/prelist/api/category/browse?categoryId=X
// — renvoie libellé exact + id + flag feuille par nœud). Arbre archivé dans
// docs/ebay-categories-raw.txt (~4 650 lignes, IDs inclus, section
// RATTRAPAGE en fin de fichier pour 6 branches re-crawlées). Tous les
// libellés sont EXACTS (relevés, jamais déduits) : aucun chemin
// "NON CONFIRMÉ" activé — les branches non crawlées restent non mappées et
// sont listées en fin d'en-tête.
//
// Chaque feuille porte un categoryId STABLE (le même id circule dans l'URL
// du flow : caty=63861&catyIdPath[]=11450&... — chemin d'ids complet).
// getEbayCategoryPath retourne le chemin de libellés (contrat miroir de
// vintedCategories/lbcCategories/beebsCategories) ; getEbayCategoryId
// retourne l'id de la feuille (à stocker À CÔTÉ du path, pas à la place).
//
// ── Flow du formulaire (notes pour le futur handler d'extension, à
// construire dans une session dédiée — même fallback exact→partiel→split→
// skip que les autres plateformes) :
//   1. /sl/prelist/suggest : champ "Dites-nous ce que vous vendez" —
//      recherche par mots-clés. Un titre précis fait choisir UNE catégorie
//      automatiquement (sr=sug dans l'URL) ; un titre ambigu ("veste")
//      ouvre une modale Catégorie avec une liste "Suggérées" de PLUSIEURS
//      chemins complets (ex : veste → Femme Manteaux/vestes, Homme
//      Manteaux/vestes, Collections>Militaria) + l'arbre entier cliquable
//      ("Toutes les catégories") + un champ de recherche de catégorie.
//      → l'ambiguïté existe et se résout soit par titre plus précis, soit
//      en pilotant l'arbre avec les chemins de ce fichier (préférable).
//   2. /sl/prelist/identify : objets catalogue similaires + chips d'item
//      specifics pré-remplis (voir plus bas) + "Continuer sans objet
//      correspondant".
//   3. Étape "Sélectionner l'état" (view=cgtype) : liste FERMÉE, pour les
//      vêtements : Neuf avec étiquettes / Neuf sans étiquettes / Neuf avec
//      imperfections / Occasion - Parfait état / Occasion - Très bon état /
//      Occasion - Bon état. conditionId numérique dans l'URL (relevé :
//      3000 = Occasion - Très bon état).
//   4. /sl/list?mode=AddItem&categoryId=... : LE FORMULAIRE FINAL — DERRIÈRE
//      LE LOGIN (signin.ebay.fr). Non explorable sans session : l'audit
//      complet des item specifics obligatoires/optionnels par catégorie
//      reste à faire une fois connecté.
//
// ── Item specifics (relevé partiel, page identify, catégorie Robes) :
// Marque, Taille, Couleur, Style, Département (=genre !), Longueur de la
// robe, Saison, Matière, Type de taille — set qui VARIE par catégorie
// (les critères fins arrivent au formulaire final, comme les critères
// dynamiques Leboncoin). "Département" existe en critère même quand la
// catégorie est déjà genrée par l'arbre.
//
// ── Genre : l'arbre Mode a 5 rayons genrés + un rayon mixte enfant :
// Femme / Homme / Fille / Garçon / Bébé / "Enfant : unisexe".
// getEbayCategoryPath prend donc DIRECTEMENT : "Femme" | "Homme" | "Fille"
// | "Garçon" | "Bébé" | "Enfant" — et contrairement à Beebs, notre valeur
// interne "Enfant" (platform_fields.genre) est utilisable TELLE QUELLE
// (rayon unisexe réel). "Mixte"/vide → null (sauf 🌸 : eBay a une feuille
// "Parfums mixtes", clé Mixte mappée pour cette icône seule).
//
// ── Pièges de libellés confirmés (jamais de substitution entre genres) :
//   - "Porte-monnaie, portefeuilles" (Femme/Garçon) vs "Portes-monnaie,
//     portefeuilles" (Homme, s à Portes) vs "Porte-monnaies" (Fille)
//   - "Écharpes, châles" (Femme/Fille) vs "Écharpes" (Homme/Garçon/Bébé)
//   - "Manteaux et vestes" (Fille/Enfant) vs "Manteaux, vestes et gilets"
//     (Femme/Homme/Garçon) vs "Manteaux, vestes, tenues neige" (Bébé)
//   - Lunettes de soleil : niveau intermédiaire "Lunettes de soleil et
//     accessoires" chez les adultes, feuille DIRECTE chez Fille/Garçon/Bébé
//   - Babyphone = "Moniteurs de surveillance" (le mot babyphone n'existe
//     pas dans l'arbre)
//   - "Au coup/traditionelles/simples" (cannes à pêche) : "traditionelles"
//     avec un seul n, sic — reproduire tel quel
//
// ── Non mappé (assumé, documenté — PAS d'oubli silencieux) :
//   - 🧳 valise/bagage : aucune branche bagagerie dans Vêtements,
//     accessoires (5 rayons genre seulement, confirmé) ; piste probable
//     "Sports, vacances > Vacances" [id=3252], NON CRAWLÉE → à re-crawler
//     avant de mapper, null en attendant
//   - 🚗 🏍️ 🛵 véhicules immatriculés : racine "Auto, moto - véhicules"
//     existe mais le dépôt exige un flow VIN spécifique — hors périmètre v1
//     (même choix que Leboncoin)
//   - parasol (mot-clé de ⛱️) : vivrait sous "Jardin, terrasse > Structures
//     de jardin et ombrage", NON CRAWLÉE — ⛱️ mappé sur Salons de jardin
//     en attendant
//   - branches volontairement non crawlées (filtres) : listées dans la
//     section "BRANCHES NON EXPLORÉES" du fichier raw
//
// Clé = emoji retourné par detectObjectIcon (src/utils/shared.js).
// Valeur MODE = { Femme, Homme, Fille, Garçon, Bébé, Enfant[, Mixte] } —
// chaque genre : { path: [...], id } ou null.
// Valeur HORS_MODE = { path: [...], id } ou null (chemin unique, non genré).

const VA = "Vêtements, accessoires";
const F = [VA, "Femme : vêtements, accessoires"];
const H = [VA, "Homme : vêtements, accessoires"];
const E = [VA, "Enfant : vêtements, accessoires"];
const FI = [...E, "Fille : vêtements, accessoires"];
const GA = [...E, "Garçon : vêtements, accessoires"];
const BB = [VA, "Bébé : vêtements, accessoires"];

const MODE = {
  // ── Chaussures ────────────────────────────────────────────────────────────
  // ⚠️ Divergence structurelle : les chaussures enfant/bébé sont des feuilles
  // TERMINALES sans sous-type ("Fille : chaussures", "Garçon : chaussures",
  // "Bébé : chaussures", "Enfant unisexe : chaussures") — tous les mots-clés
  // chaussure y retombent, quel que soit le type.
  "👟": {
    Femme: { path: [...F, "Femme : chaussures", "Baskets"], id: 95672 },
    Homme: { path: [...H, "Homme : chaussures", "Baskets"], id: 15709 },
    Fille: { path: [...FI, "Fille : chaussures"], id: 57974 },
    Garçon: { path: [...GA, "Garçon : chaussures"], id: 57929 },
    Bébé: { path: [...BB, "Bébé : chaussures"], id: 147285 },
    Enfant: { path: [...E, "Enfant : unisexe", "Enfant unisexe : chaussures"], id: 155202 },
  },
  "👢": {
    Femme: { path: [...F, "Femme : chaussures", "Bottes, bottines"], id: 53557 },
    Homme: { path: [...H, "Homme : chaussures", "Bottes, bottines"], id: 11498 },
    Fille: { path: [...FI, "Fille : chaussures"], id: 57974 },
    Garçon: { path: [...GA, "Garçon : chaussures"], id: 57929 },
    Bébé: { path: [...BB, "Bébé : chaussures"], id: 147285 },
    Enfant: { path: [...E, "Enfant : unisexe", "Enfant unisexe : chaussures"], id: 155202 },
  },
  // DÉFAUT ASSUMÉ (hérité) : ballerine → "Chaussures plates, ballerines"
  // (feuille sœur Femme, non atteinte) — escarpin/talon pris comme dominant.
  // Pas d'équivalent Homme/Garçon (confirmé).
  "👠": {
    Femme: { path: [...F, "Femme : chaussures", "Escarpins, talons"], id: 55793 },
    Homme: null,
    Fille: { path: [...FI, "Fille : chaussures"], id: 57974 },
    Garçon: null,
    Bébé: { path: [...BB, "Bébé : chaussures"], id: 147285 },
    Enfant: { path: [...E, "Enfant : unisexe", "Enfant unisexe : chaussures"], id: 155202 },
  },
  "🩴": {
    Femme: { path: [...F, "Femme : chaussures", "Sandales, tongues"], id: 62107 },
    Homme: { path: [...H, "Homme : chaussures", "Sandales, tongues"], id: 11504 },
    Fille: { path: [...FI, "Fille : chaussures"], id: 57974 },
    Garçon: { path: [...GA, "Garçon : chaussures"], id: 57929 },
    Bébé: { path: [...BB, "Bébé : chaussures"], id: 147285 },
    Enfant: { path: [...E, "Enfant : unisexe", "Enfant unisexe : chaussures"], id: 155202 },
  },

  // ── Vêtements ─────────────────────────────────────────────────────────────
  // DÉFAUT ASSUMÉ (hérité) : jupe → feuilles sœurs "Jupes" (Femme 63864,
  // Fille "Jupes et jupe-shorts" 51583, Bébé "Jupes" 260025), non atteintes
  // — robe dominante. Pas de Robes dans le rayon Enfant unisexe (confirmé).
  "👗": {
    Femme: { path: [...F, "Femme : vêtements", "Robes"], id: 63861 },
    Homme: null,
    Fille: { path: [...FI, "Vêtements fille (2-16 ans)", "Robes"], id: 51581 },
    Garçon: null,
    Bébé: { path: [...BB, "Bébé : vêtements", "Robes"], id: 260021 },
    Enfant: null,
  },
  // Meilleur cas du fichier : une SEULE feuille couvre tout le groupe
  // manteau/veste/blouson/parka/doudoune (pas de scission Manteaux/Vestes
  // comme chez Vinted et Beebs). ⚠️ libellés divergents par genre.
  "🧥": {
    Femme: { path: [...F, "Femme : vêtements", "Manteaux, vestes et gilets"], id: 63862 },
    Homme: { path: [...H, "Homme : vêtements", "Manteaux, vestes et gilets"], id: 57988 },
    Fille: { path: [...FI, "Vêtements fille (2-16 ans)", "Manteaux et vestes"], id: 51580 },
    Garçon: { path: [...GA, "Vêtements garçon (2-16 ans)", "Manteaux, vestes et gilets"], id: 51933 },
    Bébé: { path: [...BB, "Bébé : vêtements", "Manteaux, vestes, tenues neige"], id: 260023 },
    Enfant: { path: [...E, "Enfant : unisexe", "Vêtements enfant unisexe (2-16 ans)", "Manteaux et vestes"], id: 155201 },
  },
  // DÉFAUT ASSUMÉ : Femme n'a PAS de feuille chemises dédiée → "Hauts,
  // chemises" (partage la feuille avec 👕). Homme : "Chemises décontractées,
  // hauts" pris comme dominant (chemise de costume → feuille sœur).
  // costume → "Costumes, tailleurs"/"Costumes", cravate → accessoires, non
  // atteints (hérité).
  "👔": {
    Femme: { path: [...F, "Femme : vêtements", "Hauts, chemises"], id: 53159 },
    Homme: { path: [...H, "Homme : vêtements", "Chemises, hauts", "Chemises décontractées, hauts"], id: 57990 },
    Fille: { path: [...FI, "Vêtements fille (2-16 ans)", "T-shirts, hauts et chemises"], id: 260965 },
    Garçon: { path: [...GA, "Vêtements garçon (2-16 ans)", "T-shirts, hauts et chemises"], id: 260966 },
    Bébé: { path: [...BB, "Bébé : vêtements", "Hauts, T-shirts"], id: 260031 },
    Enfant: { path: [...E, "Enfant : unisexe", "Vêtements enfant unisexe (2-16 ans)", "Hauts, T-shirts"], id: 155199 },
  },
  // ⚠️ Femme n'a AUCUNE feuille T-shirts (confirmé) : tout tombe sur
  // "Hauts, chemises" — même feuille que 👔 côté Femme, assumé. Homme :
  // feuille "T-shirts" exacte (niveau 5).
  "👕": {
    Femme: { path: [...F, "Femme : vêtements", "Hauts, chemises"], id: 53159 },
    Homme: { path: [...H, "Homme : vêtements", "Chemises, hauts", "T-shirts"], id: 15687 },
    Fille: { path: [...FI, "Vêtements fille (2-16 ans)", "T-shirts, hauts et chemises"], id: 260965 },
    Garçon: { path: [...GA, "Vêtements garçon (2-16 ans)", "T-shirts, hauts et chemises"], id: 260966 },
    Bébé: { path: [...BB, "Bébé : vêtements", "Hauts, T-shirts"], id: 260031 },
    Enfant: { path: [...E, "Enfant : unisexe", "Vêtements enfant unisexe (2-16 ans)", "Hauts, T-shirts"], id: 155199 },
  },
  // DÉFAUT ASSUMÉ : sweat/hoodie → feuilles sœurs "Sweats, vestes à
  // capuches" (Fille 152554, Garçon 57916, Enfant 155200 ; côté adultes les
  // sweats vivent sous Vêtements de sport), non atteintes — pull/cardigan
  // dominant sur "Pulls, cardigans" partout.
  "🧶": {
    Femme: { path: [...F, "Femme : vêtements", "Pulls, cardigans"], id: 63866 },
    Homme: { path: [...H, "Homme : vêtements", "Pulls, cardigans"], id: 11484 },
    Fille: { path: [...FI, "Vêtements fille (2-16 ans)", "Pulls, cardigans"], id: 51582 },
    Garçon: { path: [...GA, "Vêtements garçon (2-16 ans)", "Pulls, cardigans"], id: 51946 },
    Bébé: { path: [...BB, "Bébé : vêtements", "Pulls, cardigans"], id: 260029 },
    Enfant: { path: [...E, "Enfant : unisexe", "Vêtements enfant unisexe (2-16 ans)", "Pulls, cardigans"], id: 175657 },
  },
  // DÉFAUT ASSUMÉ (hérité) : jean → "Jeans" (feuille sœur partout),
  // legging → "Leggings" (Femme/Fille), non atteints — pantalon générique
  // dominant. Bébé : pas de feuille Pantalons, "Bas" est le bac à bas de
  // corps bébé (DÉFAUT léger).
  "👖": {
    Femme: { path: [...F, "Femme : vêtements", "Pantalons"], id: 63863 },
    Homme: { path: [...H, "Homme : vêtements", "Pantalons"], id: 57989 },
    Fille: { path: [...FI, "Vêtements fille (2-16 ans)", "Pantalons"], id: 51568 },
    Garçon: { path: [...GA, "Vêtements garçon (2-16 ans)", "Pantalons"], id: 51920 },
    Bébé: { path: [...BB, "Bébé : vêtements", "Bas"], id: 260020 },
    Enfant: { path: [...E, "Enfant : unisexe", "Vêtements enfant unisexe (2-16 ans)", "Pantalons"], id: 175654 },
  },
  // Bébé : pas de feuille Shorts → "Bas" (même DÉFAUT léger que 👖).
  "🩳": {
    Femme: { path: [...F, "Femme : vêtements", "Shorts"], id: 11555 },
    Homme: { path: [...H, "Homme : vêtements", "Shorts"], id: 15689 },
    Fille: { path: [...FI, "Vêtements fille (2-16 ans)", "Shorts"], id: 15648 },
    Garçon: { path: [...GA, "Vêtements garçon (2-16 ans)", "Shorts"], id: 15615 },
    Bébé: { path: [...BB, "Bébé : vêtements", "Bas"], id: 260020 },
    Enfant: { path: [...E, "Enfant : unisexe", "Vêtements enfant unisexe (2-16 ans)", "Shorts"], id: 175655 },
  },
  // Feuille exacte pour les 6 genres — aucun défaut.
  "👙": {
    Femme: { path: [...F, "Femme : vêtements", "Maillots de bain"], id: 63867 },
    Homme: { path: [...H, "Homme : vêtements", "Maillots de bain"], id: 15690 },
    Fille: { path: [...FI, "Vêtements fille (2-16 ans)", "Maillots de bain"], id: 51567 },
    Garçon: { path: [...GA, "Vêtements garçon (2-16 ans)", "Maillots de bain"], id: 51919 },
    Bébé: { path: [...BB, "Bébé : vêtements", "Maillots de bain"], id: 260030 },
    Enfant: { path: [...E, "Enfant : unisexe", "Vêtements enfant unisexe (2-16 ans)", "Maillots de bain"], id: 175653 },
  },
  // Contrairement à Beebs (aucune feuille), eBay a des chaussettes PARTOUT.
  // Femme : collant → feuille sœur "Collants" (même parent direct, conflation
  // bénigne).
  "🧦": {
    Femme: { path: [...F, "Femme : vêtements", "Collants, bas et chaussettes", "Chaussettes"], id: 163588 },
    Homme: { path: [...H, "Homme : vêtements", "Chaussettes"], id: 11511 },
    Fille: { path: [...FI, "Vêtements fille (2-16 ans)", "Chaussettes, collants"], id: 153797 },
    Garçon: { path: [...GA, "Vêtements garçon (2-16 ans)", "Chaussettes"], id: 153564 },
    Bébé: { path: [...BB, "Bébé : vêtements", "Chaussettes, collants"], id: 260027 },
    Enfant: { path: [...E, "Enfant : unisexe", "Vêtements enfant unisexe (2-16 ans)", "Chaussettes"], id: 175697 },
  },

  // ── Sacs & petite maroquinerie ────────────────────────────────────────────
  // Femme : "Femme : sacs, sacs à main" est une feuille terminale directe
  // de niveau 3 (pas de sous-types). Enfant : une seule feuille MIXTE
  // "Sacs à dos et sacs" pour Fille/Garçon/Enfant (niveau Enfant, hors
  // rayons genrés). Bébé : rien (confirmé).
  "👜": {
    Femme: { path: [...F, "Femme : sacs, sacs à main"], id: 169291 },
    Homme: { path: [...H, "Homme : accessoires", "Sacs"], id: 52357 },
    Fille: { path: [...E, "Sacs à dos et sacs"], id: 260988 },
    Garçon: { path: [...E, "Sacs à dos et sacs"], id: 260988 },
    Bébé: null,
    Enfant: { path: [...E, "Sacs à dos et sacs"], id: 260988 },
  },
  // ⚠️ Trois orthographes différentes du même concept selon le genre (voir
  // pièges en tête de fichier).
  "👛": {
    Femme: { path: [...F, "Femme : accessoires", "Porte-monnaie, portefeuilles"], id: 45258 },
    Homme: { path: [...H, "Homme : accessoires", "Portes-monnaie, portefeuilles"], id: 2996 },
    Fille: { path: [...FI, "Fille : accessoires", "Porte-monnaies"], id: 15629 },
    Garçon: { path: [...GA, "Garçon : accessoires", "Porte-monnaie, portefeuilles"], id: 57887 },
    Bébé: null,
    Enfant: null,
  },
  // DÉFAUT ASSUMÉ adultes : pas de feuille sac à dos dédiée (Femme → feuille
  // sacs générique, Homme → "Sacs"). Enfants : feuille mixte exacte.
  "🎒": {
    Femme: { path: [...F, "Femme : sacs, sacs à main"], id: 169291 },
    Homme: { path: [...H, "Homme : accessoires", "Sacs"], id: 52357 },
    Fille: { path: [...E, "Sacs à dos et sacs"], id: 260988 },
    Garçon: { path: [...E, "Sacs à dos et sacs"], id: 260988 },
    Bébé: null,
    Enfant: { path: [...E, "Sacs à dos et sacs"], id: 260988 },
  },

  // ── Accessoires ───────────────────────────────────────────────────────────
  // ⚠️ "Écharpes, châles" (Femme/Fille) vs "Écharpes" (Homme/Garçon/Bébé).
  "🧣": {
    Femme: { path: [...F, "Femme : accessoires", "Écharpes, châles"], id: 45238 },
    Homme: { path: [...H, "Homme : accessoires", "Écharpes"], id: 52382 },
    Fille: { path: [...FI, "Fille : accessoires", "Écharpes, châles"], id: 57927 },
    Garçon: { path: [...GA, "Garçon : accessoires", "Écharpes"], id: 122321 },
    Bébé: { path: [...BB, "Bébé : accessoires", "Écharpes"], id: 175523 },
    Enfant: null,
  },
  "🧤": {
    Femme: { path: [...F, "Femme : accessoires", "Gants, moufles"], id: 105559 },
    Homme: { path: [...H, "Homme : accessoires", "Gants, moufles"], id: 2994 },
    Fille: { path: [...FI, "Fille : accessoires", "Gants, moufles"], id: 57919 },
    Garçon: { path: [...GA, "Garçon : accessoires", "Gants, moufles"], id: 57885 },
    Bébé: { path: [...BB, "Bébé : accessoires", "Gants, moufles"], id: 163225 },
    Enfant: null,
  },
  // casquette/bonnet/chapeau → une seule feuille "Chapeaux" par genre
  // (Bébé : "Casquettes, chapeaux") — couvre tout le groupe, aucune sœur.
  "🧢": {
    Femme: { path: [...F, "Femme : accessoires", "Chapeaux"], id: 45230 },
    Homme: { path: [...H, "Homme : accessoires", "Chapeaux"], id: 52365 },
    Fille: { path: [...FI, "Fille : accessoires", "Chapeaux"], id: 15630 },
    Garçon: { path: [...GA, "Garçon : accessoires", "Chapeaux"], id: 57884 },
    Bébé: { path: [...BB, "Bébé : accessoires", "Casquettes, chapeaux"], id: 163224 },
    Enfant: null,
  },
  // ⚠️ Divergence structurelle : niveau intermédiaire "Lunettes de soleil et
  // accessoires" chez les adultes, feuille directe chez les enfants.
  "🕶️": {
    Femme: { path: [...F, "Femme : accessoires", "Lunettes de soleil et accessoires", "Lunettes de soleil"], id: 45246 },
    Homme: { path: [...H, "Homme : accessoires", "Lunettes de soleil et accessoires", "Lunettes de soleil"], id: 79720 },
    Fille: { path: [...FI, "Fille : accessoires", "Lunettes de soleil"], id: 122340 },
    Garçon: { path: [...GA, "Garçon : accessoires", "Lunettes de soleil"], id: 131411 },
    Bébé: { path: [...BB, "Bébé : accessoires", "Lunettes de soleil"], id: 176967 },
    Enfant: null,
  },

  // ── Ajouts 2026-07-09 (mission mapping complet) — feuilles + ids relevés
  // dans docs/ebay-categories-raw.txt (API browse du prelist) ───────────────
  // Chaussons : feuilles adultes uniquement (aucune feuille enfant/bébé dans
  // le relevé complet — confirmé, pas un trou de crawl).
  "🥿": {
    Femme: { path: [...F, "Femme : chaussures", "Chaussons"], id: 11632 },
    Homme: { path: [...H, "Homme : chaussures", "Chaussons"], id: 11505 },
    Fille: null, Garçon: null, Bébé: null, Enfant: null,
  },
  // ⚠️ Libellés divergents par genre : "Ceintures, boucles de ceinture" chez
  // Fille/Garçon, "Ceintures" ailleurs.
  "🪢": {
    Femme: { path: [...F, "Femme : accessoires", "Ceintures"], id: 3003 },
    Homme: { path: [...H, "Homme : accessoires", "Ceintures"], id: 2993 },
    Fille: { path: [...FI, "Fille : accessoires", "Ceintures, boucles de ceinture"], id: 57918 },
    Garçon: { path: [...GA, "Garçon : accessoires", "Ceintures, boucles de ceinture"], id: 57883 },
    Bébé: { path: [...BB, "Bébé : accessoires", "Ceintures"], id: 176966 },
    Enfant: null,
  },
  // eBay a des cravates FEMME (contrairement à Vinted) ; Homme = feuille
  // combinée "Cravates, noeuds papillon et foulards" ; pas de feuille Fille.
  "🎀": {
    Femme: { path: [...F, "Femme : accessoires", "Cravates"], id: 151486 },
    Homme: { path: [...H, "Homme : accessoires", "Cravates, noeuds papillon et foulards"], id: 15662 },
    Fille: null,
    Garçon: { path: [...GA, "Garçon : accessoires", "Cravates"], id: 57886 },
    Bébé: { path: [...BB, "Bébé : accessoires", "Cravates"], id: 176968 },
    Enfant: null,
  },
  "☂️": {
    Femme: { path: [...F, "Femme : accessoires", "Parapluies"], id: 105569 },
    Homme: { path: [...H, "Homme : accessoires", "Parapluies"], id: 90634 },
    Fille: { path: [...FI, "Fille : accessoires", "Parapluies"], id: 122341 },
    Garçon: { path: [...GA, "Garçon : accessoires", "Parapluies"], id: 175525 },
    Bébé: null, Enfant: null,
  },
  "🗝️": {
    Femme: { path: [...F, "Femme : accessoires", "Porte-clés"], id: 45237 },
    Homme: { path: [...H, "Homme : accessoires", "Porte-clés"], id: 52373 },
    Fille: { path: [...FI, "Fille : accessoires", "Porte-clés"], id: 175527 },
    Garçon: { path: [...GA, "Garçon : accessoires", "Porte-clés"], id: 175524 },
    Bébé: null, Enfant: null,
  },
  // Lingerie/nuit : DÉFAUT ASSUMÉ pyjama (la branche Femme "Lingerie, nuit"
  // a 15 feuilles sœurs — Culottes/Soutiens-gorge/Bodys… non atteintes).
  "🩲": {
    Femme: { path: [...F, "Femme : vêtements", "Lingerie, nuit", "Pyjamas, nuisettes"], id: 63855 },
    Homme: { path: [...H, "Homme : vêtements", "Pyjamas"], id: 11510 },
    Fille: { path: [...FI, "Vêtements fille (2-16 ans)", "Pyjamas"], id: 99735 },
    Garçon: { path: [...GA, "Vêtements garçon (2-16 ans)", "Pyjamas"], id: 84544 },
    Bébé: { path: [...BB, "Bébé : vêtements", "Pyjamas"], id: 260026 },
    Enfant: { path: [...E, "Enfant : unisexe", "Vêtements enfant unisexe (2-16 ans)", "Pyjamas"], id: 175656 },
  },
  // Blazer/costume : eBay n'a PAS de feuille Blazers dédiée (0 hit dans le
  // relevé complet) — les deux icônes retombent sur les feuilles Costumes
  // de chaque genre (DÉFAUT ASSUMÉ documenté).
  "🥼": {
    Femme: { path: [...F, "Femme : vêtements", "Costumes, tailleurs"], id: 63865 },
    Homme: { path: [...H, "Homme : vêtements", "Costumes"], id: 3001 },
    Fille: null, Garçon: null, Bébé: null, Enfant: null,
  },
  "🤵": {
    Femme: { path: [...F, "Femme : vêtements", "Costumes, tailleurs"], id: 63865 },
    Homme: { path: [...H, "Homme : vêtements", "Costumes"], id: 3001 },
    Fille: null,
    Garçon: { path: [...GA, "Vêtements garçon (2-16 ans)", "Costumes"], id: 99754 },
    Bébé: { path: [...BB, "Bébé : vêtements", "Costumes"], id: 260028 },
    Enfant: null,
  },

  // ── Parfums (racine Beauté, genrée UNIQUEMENT pour les parfums) ───────────
  // Seule icône avec une clé Mixte : eBay a une vraie feuille
  // "Parfums mixtes". Fille/Garçon/Enfant → "Parfums pour enfant".
  "🌸": {
    Femme: { path: ["Beauté, bien-être, parfums", "Parfums", "Parfums pour femme"], id: 11848 },
    Homme: { path: ["Beauté, bien-être, parfums", "Parfums", "Parfums et after-shaves pour homme"], id: 29585 },
    Fille: { path: ["Beauté, bien-être, parfums", "Parfums", "Parfums pour enfant"], id: 159719 },
    Garçon: { path: ["Beauté, bien-être, parfums", "Parfums", "Parfums pour enfant"], id: 159719 },
    Bébé: null,
    Enfant: { path: ["Beauté, bien-être, parfums", "Parfums", "Parfums pour enfant"], id: 159719 },
    Mixte: { path: ["Beauté, bien-être, parfums", "Parfums", "Parfums mixtes"], id: 112661 },
  },
};

// Catégories SANS niveau genre — chemin unique quelle que soit la valeur de
// platform_fields.genre (même contrat que HORS_MODE Vinted/Beebs).
const HORS_MODE = {
  "📦": null, // filet générique (gourde, veilleuse, objets sans feuille dédiée)
  // ── Bijoux, montres (racine dédiée, non genrée — "Bijoux pour hommes"
  // existe en branche sœur, non atteinte par ce défaut) ─────────────────────
  // DÉFAUT ASSUMÉ : collier/bracelet/bague → feuilles sœurs dédiées sous
  // Bijoux fantaisie ; "Autres" pris comme bac générique (comme Vinted).
  // La Joaillerie (or/diamant) est une branche sœur, non atteinte.
  "💍": { path: ["Bijoux, montres", "Bijoux fantaisie", "Autres"], id: 499 },
  // DÉFAUT léger : "Montres classiques" = la feuille montre-bracelet
  // (gousset et Autres = sœurs). Montres connectées → Téléphonie (sœur
  // racine, non atteinte — même piège que Vinted ⌚).
  "⌚": { path: ["Bijoux, montres", "Montres, pièces et accessoires", "Montres", "Montres classiques"], id: 31387 },

  // ── Beauté (hors parfums, non genrée) ─────────────────────────────────────
  // DÉFAUT ASSUMÉ : rouge à lèvres dominant (1er mot-clé) ; mascara/fard →
  // branche Yeux, fond de teint/blush → branche Visage, sœurs non atteintes.
  "💄": { path: ["Beauté, bien-être, parfums", "Maquillage", "Lèvres", "Rouges à lèvres"], id: 31804 },
  "💅": { path: ["Beauté, bien-être, parfums", "Manucure et pédicure", "Vernis à ongles et poudres pour ongles", "Vernis à ongles"], id: 11873 },
  // DÉFAUT ASSUMÉ : crème/sérum dominants → Soins de la peau ; shampooing →
  // Soins cheveux, gel douche/savon → Bain, branches sœurs non atteintes.
  "🧴": { path: ["Beauté, bien-être, parfums", "Soins de la peau", "Hydratants et nourrissants"], id: 21205 },
  // DÉFAUT léger : lisseur/boucleur → "Lisseurs et fers à boucler", sœur.
  "💇": { path: ["Beauté, bien-être, parfums", "Soins cheveux et coiffure", "Appareils et outils de coiffure", "Sèche-cheveux"], id: 11858 },
  // DÉFAUT ASSUMÉ : tondeuse → "Tondeuses", épilateur → "Épilateurs et
  // électrolyse" (sœurs) ; rasoir électrique homme pris comme dominant.
  "🪒": { path: ["Beauté, bien-être, parfums", "Épilation et rasage", "Appareils électriques", "Rasoirs électriques", "Rasoirs pour homme"], id: 11844 },

  // ── Téléphonie / Informatique ─────────────────────────────────────────────
  // DÉFAUT ASSUMÉ (hérité) : conflate téléphone ET tablette — tablette a sa
  // feuille ("Informatique > Tablettes, liseuses" [171485]), candidat de
  // scission d'icône déjà identifié chez Vinted aussi.
  "📱": { path: ["Téléphonie, mobilité", "Téléphones mobiles"], id: 9355 },
  // DÉFAUT ASSUMÉ : chargeur/dock dominants ; câble → "Câbles, adaptateurs",
  // powerbank → "Batteries", feuilles sœurs non atteintes.
  "🔌": { path: ["Téléphonie, mobilité", "Tél. mobiles: accessoires", "Chargeurs, stations d'accueil"], id: 123417 },
  // DÉFAUT léger : un MacBook irait sur "Macs portables", sœur.
  "💻": { path: ["Informatique, réseaux", "Portables, netbooks", "Ordinateurs portables"], id: 177 },
  // DÉFAUT ASSUMÉ (hérité) : écran/moniteur → "Ecrans, projecteurs, access.
  // > Ecrans" [80053], branche sœur non atteinte — PC de bureau dominant.
  "🖥️": { path: ["Informatique, réseaux", "PC de bureau, tout-en-un", "PC de bureau"], id: 179 },
  "⌨️": { path: ["Informatique, réseaux", "Claviers, souris, pointeurs", "Claviers, pavés numériques"], id: 33963 },
  "🖱️": { path: ["Informatique, réseaux", "Claviers, souris, pointeurs", "Souris, pavés tactiles"], id: 47779 },
  // DÉFAUT ASSUMÉ (hérité) : scanner → "Scanners" [11205], sœur.
  "🖨️": { path: ["Informatique, réseaux", "Imprimantes, scanners, access.", "Imprimantes"], id: 1245 },

  // ── Image, son / Photo / Jeux vidéo ───────────────────────────────────────
  // "Écouteurs" couvre écouteurs ET casques audio chez eBay (une seule
  // feuille grand public ; les casques informatique/téléphone sont des
  // feuilles d'accessoires ailleurs, non atteintes).
  "🎧": { path: ["Image, son", "Enceintes portables, écouteurs", "Écouteurs"], id: 112529 },
  // DÉFAUT ASSUMÉ : barre de son → "Home cinéma" (branche DVD, Blu-ray, home
  // cinéma), enceinte portable → "Stations audio, mini enceintes" — sœurs
  // non atteintes, enceinte hi-fi prise comme dominante.
  "🔊": { path: ["Image, son", "Hi-Fi, son, matériel audio", "Enceintes, caissons de basses"], id: 14990 },
  // DÉFAUT ASSUMÉ (hérité) : projecteur → "Projecteurs home cinéma", sœur.
  "📺": { path: ["Image, son", "Télévisions"], id: 11071 },
  // DÉFAUT ASSUMÉ (hérité) : objectif → "Objectifs", gopro/caméscope →
  // "Caméscopes", sœurs.
  "📷": { path: ["Photo, caméscopes", "Appareils photo numériques"], id: 31388 },
  "🛸": { path: ["Photo, caméscopes", "Drones, FPV, vol en immersion"], id: 179697 },
  // DÉFAUT ASSUMÉ (hérité) : jeu → "Jeux" [139973], manette → Accessoires >
  // "Manettes, périphériques de jeu" [117042], sœurs — console dominante.
  "🎮": { path: ["Jeux vidéo, consoles", "Consoles"], id: 139971 },

  // ── Maison ────────────────────────────────────────────────────────────────
  "🛋️": { path: ["Maison", "Meubles", "Canapés, fauteuils et salons"], id: 38208 },
  "🪑": { path: ["Maison", "Meubles", "Chaises"], id: 54235 },
  // DÉFAUT ASSUMÉ (hérité de l'icône) : couette/drap/parure → "Literie,
  // linge de lit" (branche sœur réelle chez eBay), matelas → "Matelas",
  // sœur directe — lit pris comme dominant. Contrairement à Vinted (null),
  // eBay VEND les meubles.
  "🛏️": { path: ["Maison", "Meubles", "Lits, matelas", "Lits, cadres, sommiers"], id: 175758 },
  "💡": { path: ["Maison", "Éclairage intérieur", "Lampes"], id: 112581 },
  "🪞": { path: ["Maison", "Décoration d'intérieur", "Miroirs"], id: 20580 },
  // Bougeoir → "Bougeoirs, photophores", sœur (DÉFAUT léger).
  "🕯️": { path: ["Maison", "Décoration d'intérieur", "Bougies, chauffe-plats"], id: 46782 },
  // DÉFAUT ASSUMÉ (hérité) : poster/affiche → "Posters, affiches" [41511],
  // sœur directe — cadre dominant.
  "🖼️": { path: ["Maison", "Décoration d'intérieur", "Cadres"], id: 79654 },
  "🏺": { path: ["Maison", "Décoration d'intérieur", "Vases"], id: 101415 },
  // DÉFAUT ASSUMÉ (hérité) : bol → "Bols, saladiers", tasse/mug → "Mugs"/
  // "Tasses, soucoupes", verre → "Verrerie" — sœurs, assiette dominante.
  "🍽️": { path: ["Maison", "Cuisine, arts de la table", "Arts de la table", "Assiettes"], id: 36030 },
  // DÉFAUT léger : poêle → "Poêles à frire et poêles grill", cocotte →
  // "Cocottes", sœurs du même parent.
  "🍳": { path: ["Maison", "Cuisine, arts de la table", "Casseroles, poêles", "Casseroles, marmites"], id: 98846 },

  // ── Électroménager (tout est vendable ici, contrairement à Vinted) ───────
  "🫖": { path: ["Électroménager", "Petit électroménager: cuisine", "Bouilloires"], id: 133705 },
  "🧹": { path: ["Électroménager", "Nettoyage, repassage", "Aspirateurs"], id: 20614 },
  // DÉFAUT léger : congélateur → "Congélateurs", combiné → "Réfrigérateurs-
  // congélateurs", sœurs directes.
  "🧊": { path: ["Électroménager", "Réfrigérateurs, congélateurs", "Réfrigérateurs"], id: 71262 },
  // DÉFAUT ASSUMÉ : micro-onde → "Fours à micro-ondes" [150140] (Petit
  // électroménager), non atteint — "four" pris comme dominant (vendable ici,
  // contrairement au choix inverse fait sur Vinted).
  "♨️": { path: ["Électroménager", "Appareils de cuisson", "Fours"], id: 71318 },
  // DÉFAUT ASSUMÉ : blender/robot cuisine/robot pâtissier/batteur → feuilles
  // sœurs dédiées sous le même parent — mixeur pris (1er mot-clé), conflation
  // bénigne.
  "🥣": { path: ["Électroménager", "Petit électroménager: cuisine", "Mixeurs"], id: 184667 },
  "🍞": { path: ["Électroménager", "Petit électroménager: cuisine", "Grille-pain"], id: 77285 },
  "🍟": { path: ["Électroménager", "Petit électroménager: cuisine", "Friteuses"], id: 185033 },
  // DÉFAUT ASSUMÉ : nespresso/senseo/dolce gusto = 3 des 6 mots-clés →
  // dosettes/capsules pris comme dominant ; expresso → "Machines à café
  // expresso", filtre → "Cafetières à filtre", sœurs.
  "☕": { path: ["Électroménager", "Machines à café, expresso, thé", "Cafetières à dosettes, capsules"], id: 156775 },
  // DÉFAUT ASSUMÉ : sèche-linge → "Sèche-linges", lave-vaisselle → branche
  // "Lave-vaisselles et pièces" — lave-linge dominant (1er mot-clé).
  // Vendable ici, contrairement à Vinted (null).
  "🧺": { path: ["Électroménager", "Lave-linges, sèche-linges", "Lave-linges"], id: 71256 },

  // ── Bricolage ─────────────────────────────────────────────────────────────
  // DÉFAUT ASSUMÉ : visseuse → "Visseuses/dévisseuses", tournevis manuel →
  // Outils à main > "Tournevis, tournevis à douille", perforateur → pas de
  // feuille dédiée — perceuse sans fil prise comme dominante revente.
  "🪛": { path: ["Bricolage", "Matériel d'atelier et de bricolage", "Outils électriques", "Perceuses sans fil"], id: 184655 },
  // DÉFAUT ASSUMÉ : tronçonneuse → Jardin > Outils motorisés >
  // "Tronçonneuses" [42226] (autre RACINE), scie électrique → Outils
  // électriques > Scies électriques > ... — scie à main générique prise
  // comme défaut du mot-clé le plus large.
  "🪚": { path: ["Bricolage", "Matériel d'atelier et de bricolage", "Outils à main", "Scies"], id: 122853 },
  "🔨": { path: ["Bricolage", "Matériel d'atelier et de bricolage", "Outils à main", "Marteaux, maillets"], id: 20763 },
  // Escabeau : pas de feuille dédiée, "Échelles" couvre le groupe.
  "🪜": { path: ["Bricolage", "Matériel d'atelier et de bricolage", "Équipements d'atelier", "Échelles"], id: 112567 },
  // DÉFAUT ASSUMÉ : pinceau/rouleau → "Peinture : matériel > Pinceaux et
  // éponges"/"Rouleaux de peinture" (branche sœur) — pot de peinture pris
  // comme dominant (1er mot-clé).
  "🖌️": { path: ["Bricolage", "Peintures, vernis, lasures", "Peintures"], id: 180164 },
  // DÉFAUT léger : clou → "Clous", cheville → "Chevilles", sœurs directes.
  "🔩": { path: ["Bricolage", "Visserie, boulonnerie", "Vis, boulons"], id: 180976 },
  // DÉFAUT léger : niveau laser → "Instruments de mesure à laser", niveau à
  // bulle → "Niveaux", sœurs — mètre ruban dominant.
  "📏": { path: ["Bricolage", "Matériel d'atelier et de bricolage", "Instruments de mesure", "Mètres à ruban, règles"], id: 29524 },
  // DÉFAUT ASSUMÉ : pince → "Pinces, tenailles", étau/serre-joint → "Étaux
  // et serre-joints", clé allen → "Clés hexagonales" — clé à molette
  // (= ajustable) prise comme dominante.
  "🔧": { path: ["Bricolage", "Matériel d'atelier et de bricolage", "Outils à main", "Clés", "Clés ajustables"], id: 20771 },

  // ── Jardin ────────────────────────────────────────────────────────────────
  // DÉFAUT léger : débroussailleuse/scarificateur → Outils motorisés, sœurs.
  "🌱": { path: ["Jardin, terrasse", "Tondeuses à gazon, pièces et accessoires", "Tondeuses à gazon"], id: 260921 },
  // DÉFAUT ASSUMÉ : sécateur/cisaille manuels → Outils à main > "Sécateurs"/
  // "Cisailles" — taille-haie électrique pris comme dominant.
  "✂️": { path: ["Jardin, terrasse", "Outils et équipements motorisés", "Taille-haies"], id: 71268 },
  // Feuille combinée exacte (barbecue ET plancha).
  "🔥": { path: ["Jardin, terrasse", "Barbecues et chauffage extérieur", "Barbecues, planchas et fumoirs"], id: 151621 },
  // DÉFAUT ASSUMÉ : transat → "Chaises longues et transats" (sœur) ;
  // parasol → "Structures de jardin et ombrage" NON CRAWLÉE (cf. en-tête).
  "⛱️": { path: ["Jardin, terrasse", "Meubles de jardin et terrasse", "Salons de jardin"], id: 139849 },
  // DÉFAUT ASSUMÉ (hérité) : plante vivante → "Plantes, graines et bulbes >
  // Plantes et jeunes pousses", branche sœur — pot/jardinière dominant.
  "🪴": { path: ["Jardin, terrasse", "Plantes et sols : soins et accessoires", "Paniers, pots, jardinières de fenêtre et soucoupes"], id: 20518 },

  // ── Instruments de musique ────────────────────────────────────────────────
  // DÉFAUT ASSUMÉ (hérité) : acoustique/classique/ukulélé → feuilles sœurs.
  "🎸": { path: ["Instruments de musique", "Guitares, basses, accessoires", "Guitares électriques"], id: 33034 },
  "🎻": { path: ["Instruments de musique", "Instruments à cordes", "Orchestre", "Violons"], id: 38107 },
  // Meilleur cas que Vinted : une vraie feuille "Kits de batterie" existe
  // (cymbale → "Cymbales", caisse claire → "Caisses claires", sœurs).
  "🥁": { path: ["Instruments de musique", "Batteries, percussions", "Batteries", "Kits de batterie"], id: 38097 },
  // DÉFAUT ASSUMÉ (hérité) : trompette → Cuivres > "Trompettes" [16214],
  // autre branche — flûte prise (3 mots-clés sur 4 = Bois).
  "🎺": { path: ["Instruments de musique", "Instruments à vent (Bois)", "Orchestre", "Flûtes"], id: 10183 },
  // DÉFAUT ASSUMÉ : piano → Pianos > (droits/numériques/à queue), clavier
  // maître → "Contrôleurs audio/MIDI" (Equipement audio pro) — clavier
  // arrangeur/synthé pris comme dominant revente.
  "🎹": { path: ["Instruments de musique", "Pianos, claviers", "Claviers arrangeurs, synthés"], id: 38088 },
  // Micro karaoké/ordinateur → feuilles d'accessoires ailleurs, non
  // atteintes (hérité).
  "🎤": { path: ["Instruments de musique", "Equipement audio professionnel", "Microphones"], id: 29946 },

  // ── Musique / Livres / Collection ─────────────────────────────────────────
  // Feuille Vinyles EXACTE (platine → Image, son > Hi-Fi > "Tourne-disques,
  // platines" [48647], autre racine, non atteinte — hérité).
  "💿": { path: ["Musique, CD, vinyles", "Vinyles"], id: 176985 },
  // DÉFAUT ASSUMÉ : BD → "BD franco-belges et européennes > BD et romans
  // graphiques" [121889], comics → "Comics > Comics et romans graphiques"
  // [259104], sœurs — manga pris comme dominant revente ("Tomes" = les
  // volumes eux-mêmes).
  "📖": { path: ["Livres, BD, revues", "Bandes dessinées, comics et produits dérivés", "Mangas et BD asiatiques", "Tomes"], id: 259109 },
  // DÉFAUT ASSUMÉ (hérité) : roman dominant → Fiction ; encyclopédie/
  // dictionnaire → "Non-fiction", jeunesse → "Jeunesse > Fiction", sœurs.
  "📚": { path: ["Livres, BD, revues", "Fiction"], id: 171228 },
  // DÉFAUT : thème indéterminable depuis l'icône → bac générique "Autres"
  // (les Revues eBay sont classées par thème : 23 feuilles sœurs).
  "📰": { path: ["Livres, BD, revues", "Revues", "Autres"], id: 162517 },
  // DÉFAUT ASSUMÉ : période/type indéterminables → bac "Autres" du rayon
  // France (neufs/oblitérés/premier jour = sous-branches sœurs).
  "📮": { path: ["Timbres", "France", "Autres"], id: 3488 },
  // DÉFAUT ASSUMÉ : pièce euro France prise comme cas dominant revente FR ;
  // une monnaie ancienne → "Pièces France"/"Pièces antiques", branches
  // sœurs non atteintes.
  "🪙": { path: ["Monnaies", "Pièces euro", "France"], id: 127292 },
  // Même logique que Vinted/Beebs : carte à l'unité comme format dominant ;
  // booster → "JCC : boosters scellés", deck → "JCC : decks et kits
  // scellés", sœurs. Toutes licences confondues (pas de scission Pokémon
  // chez eBay, un critère s'en charge).
  "🃏": { path: ["Collections", "Jeux de cartes à collectionner", "JCC : cartes à l'unité"], id: 183454 },

  // ── Jouets ────────────────────────────────────────────────────────────────
  // DÉFAUT léger : kapla/duplo génériques → "Briques, blocs de construction",
  // playmobil → "Playmobil", meccano → "Meccano", sœurs — kit LEGO complet
  // pris comme dominant revente.
  "🧱": { path: ["Jouets et jeux", "Jeux de construction", "LEGO", "Kits complets et packs"], id: 19006 },
  // DÉFAUT léger : peluche récente standard → "Modernes" ; Disney/Pokémon/
  // anciennes = sœurs. Un doudou bébé a aussi sa feuille côté puériculture
  // ("Bébé, puériculture > Peluches, doudous" [148373]), non atteinte.
  "🧸": { path: ["Jouets et jeux", "Peluches, doudous", "Modernes"], id: 92141 },
  // DÉFAUT ASSUMÉ : barbie = mot-clé explicite de la regex → branche Barbie ;
  // poupon → "Poupons et accessoires", poupée porcelaine/russe → sœurs.
  "🪆": { path: ["Jouets et jeux", "Poupées, vêtements, access.", "Poupées mannequins, mini", "Barbie: poupées, accessoires", "Poupées"], id: 33305 },
  "🧩": { path: ["Jouets et jeux", "Puzzles", "Puzzles"], id: 19183 },
  // DÉFAUT ASSUMÉ : funko/figurine pop culture → "TV, film, jeux vidéo" ;
  // figurine anime → "Anime, manga", héros BD → "Héros de BD", sœurs.
  "🦸": { path: ["Jouets et jeux", "Figurines, statues", "TV, film, jeux vidéo"], id: 75708 },
  "🎲": { path: ["Jouets et jeux", "Jeux de société", "Jeux de société, traditionnels"], id: 2550 },
  "🏎️": { path: ["Jouets et jeux", "Véhicules miniatures", "Voitures, camions et fourgons"], id: 180273 },

  // ── Sport ─────────────────────────────────────────────────────────────────
  // Vélo adulte complet VENDABLE (feuille dédiée), contrairement à Vinted.
  // Vélo électrique → "Vélos électriques", sœur (DÉFAUT léger).
  "🚲": { path: ["Sports, vacances", "Cyclisme, vélos", "Vélos"], id: 177831 },
  // ⚠️ ARBITRAGE (signalé) : la regex ne distingue pas trottinette enfant
  // (→ "Trottinettes manuelles" [11331]) de trottinette électrique adulte —
  // l'électrique est prise par défaut (plus grosse valeur/volume eBay).
  // À inverser si le stock FillSell penche enfant.
  "🛴": { path: ["Sports, vacances", "Skate, roller, trottinette", "Trottinettes et gyroskates", "Trottinettes électriques"], id: 47349 },
  "🛹": { path: ["Sports, vacances", "Skate, roller, trottinette", "Skateboards"], id: 16264 },
  // Patin à glace → "Patinage sur glace, hockey" [115194], sœur racine
  // (DÉFAUT hérité : roller dominant).
  "⛸️": { path: ["Sports, vacances", "Skate, roller, trottinette", "Rollers, patins"], id: 134414 },
  // DÉFAUT ASSUMÉ (hérité) : snowboard → "Snowboards" [134401], sœur.
  "🎿": { path: ["Sports, vacances", "Sports d'hiver", "Skis"], id: 134391 },
  // DÉFAUT ASSUMÉ (hérité) : ballon générique → Football (volley/rugby/hand
  // sans feuille dédiée crawlée).
  "⚽": { path: ["Sports, vacances", "Football", "Ballons"], id: 20863 },
  // DÉFAUT ASSUMÉ (hérité) : badminton/squash/ping-pong → "Sports de
  // raquette" (feuilles sœurs), tennis dominant.
  "🎾": { path: ["Sports, vacances", "Tennis", "Raquettes"], id: 20871 },
  "⛳": { path: ["Sports, vacances", "Golf", "Clubs et matériels", "Clubs"], id: 115280 },
  "🏋️": { path: ["Sports, vacances", "Fitness, athlétisme, yoga", "Musculation, poids", "Haltères"], id: 137865 },
  // Feuille unique combinée boxe + arts martiaux (pas de sous-niveau gants).
  "🥊": { path: ["Sports, vacances", "Arts martiaux, sport de combat"], id: 134214 },
  // Sac de couchage → Camping > "Matériel de couchage", sœur (DÉFAUT hérité).
  "⛺": { path: ["Sports, vacances", "Camping, randonnée", "Tentes, auvents", "Tentes"], id: 179010 },
  // ⚠️ "traditionelles" sic (libellé eBay avec un seul n). Moulinet →
  // "Moulinets de pêche", sœur (DÉFAUT hérité).
  "🎣": { path: ["Sports, vacances", "Pêche", "Cannes à pêche", "Au coup/traditionelles/simples"], id: 56743 },
  "🧘": { path: ["Sports, vacances", "Fitness, athlétisme, yoga", "Yoga, pilates", "Tapis, serviette antidérapante"], id: 158928 },
  // Feuille unique natation (lunettes comprises — pas de sous-niveau).
  "🥽": { path: ["Sports, vacances", "Natation, aquagym"], id: 62482 },
  // DÉFAUT ASSUMÉ (hérité) : casque ski/snow → Sports d'hiver > "Equipements
  // de neige", non atteint — casque vélo dominant.
  "⛑️": { path: ["Sports, vacances", "Cyclisme, vélos", "Casques, protections", "Casques"], id: 70911 },
  // Pas de feuille Ballons dédiée basket : "Equipements" est le bac matériel.
  "🏀": { path: ["Sports, vacances", "Basketball", "Equipements"], id: 105079 },
  // Cardio VENDABLE (feuilles dédiées), contrairement à Vinted (null) —
  // rameur/elliptique/vélo d'appartement = sœurs directes (DÉFAUT léger,
  // tapis de course = 1er mot-clé).
  "🏃": { path: ["Sports, vacances", "Fitness, athlétisme, yoga", "Cardio-training", "Tapis de course"], id: 15280 },
  // Feuille exacte "Sacs de sport" (comme Vinted, mieux que Beebs).
  "🎽": { path: ["Sports, vacances", "Fitness, athlétisme, yoga", "Sacs de sport"], id: 68816 },

  // ── Auto-moto (pièces/équipement seulement) ───────────────────────────────
  // DÉFAUT léger : jante → "Jantes", roue complète → "Roues complètes",
  // sœurs — pneu dominant.
  "🛞": { path: ["Auto, moto - pièces, accessoires", "Pneus, chambres à air", "Pneus, chambres à air, tubes"], id: 124313 },
  "🪖": { path: ["Auto, moto - pièces, accessoires", "Casques, vêtements", "Casques, accessoires", "Casques"], id: 177076 },
  // Véhicules immatriculés : hors périmètre v1 (flow VIN spécifique côté
  // eBay, même exclusion que Leboncoin) — fallback explicite volontaire.
  "🚗": null,
  "🏍️": null,
  "🛵": null,

  // ── Puériculture (racine "Bébé, puériculture", non genrée) — les 4 icônes
  // issues de la scission 👶 de juillet 2026, chacune sa feuille exacte ────
  // DÉFAUT léger : "Poussettes, systèmes combinés" = LA feuille poussette
  // (accessoires/pièces = sœurs).
  "👶": { path: ["Bébé, puériculture", "Poussettes, systèmes, access.", "Poussettes, systèmes combinés"], id: 66700 },
  // Feuille combinée auto+vélo (pas de scission possible côté eBay).
  "💺": { path: ["Bébé, puériculture", "Equipements de promenade", "Sièges: auto, vélo"], id: 66695 },
  "🍼": { path: ["Bébé, puériculture", "Alimentation pour bébé", "Alimentation au biberon", "Biberons"], id: 20402 },
  // ⚠️ Piège de libellé : le babyphone s'appelle "Moniteurs de surveillance".
  "📟": { path: ["Bébé, puériculture", "Équipement de sécurité", "Moniteurs de surveillance"], id: 20435 },

  // ── Ajouts 2026-07-09 (mission mapping complet) — feuilles + ids relevés
  // dans docs/ebay-categories-raw.txt ───────────────────────────────────────
  // eBay fusionne tablettes ET liseuses dans une seule feuille [171485] —
  // les deux icônes y pointent (contrairement à Vinted qui les sépare).
  "📲": { path: ["Informatique, réseaux", "Tablettes, liseuses"], id: 171485 },
  "📇": { path: ["Informatique, réseaux", "Tablettes, liseuses"], id: 171485 },
  "⏱️": { path: ["Téléphonie, mobilité", "Montres connectées"], id: 178893 },
  // DÉFAUT ASSUMÉ : pas de feuille "enceinte connectée" dédiée — rangée avec
  // les enceintes Hi-Fi (une Alexa/Google Home y sera approximée).
  "📡": { path: ["Image, son", "Hi-Fi, son, matériel audio", "Enceintes, caissons de basses"], id: 14990 },
  "🪟": { path: ["Maison", "Rideaux et accessoires pour fenêtre"], id: 63514 },
  "🪶": { path: ["Maison", "Décoration d'intérieur", "Coussins, galettes de sièges"], id: 20563 },
  "🟫": { path: ["Maison", "Tapis et moquettes"], id: 20571 },
  "📜": { path: ["Maison", "Cuisine, arts de la table", "Linge de cuisine", "Nappes"], id: 20663 },
  "🛌": { path: ["Maison", "Literie, linge de lit", "Parures de lit, housses de couette"], id: 37644 },
  // DÉFAUT ASSUMÉ : murales dominant — "Réveils et radios-réveils" [79643]
  // est une feuille sœur réelle (contrairement à Vinted où réveil n'existe
  // pas), scission possible si le volume le justifie.
  "🕰️": { path: ["Maison", "Horloges", "Horloges murales"], id: 20561 },
  "🖋️": { path: ["Bijoux, montres", "Stylos"], id: 7278 },
  "💽": { path: ["Musique, CD, vinyles", "CD"], id: 176984 },
  "🎼": { path: ["Instruments de musique", "Instruments à vent (Bois)", "Traditionnels, du monde", "Harmonicas"], id: 47078 },
  "🧼": { path: ["Électroménager", "Nettoyage, repassage", "Fers à repasser, centrales"], id: 43513 },
  "🌀": { path: ["Électroménager", "Chauffage, clim, ventilation", "Qualité air intérieur, ventilateurs", "Ventilateurs"], id: 20612 },
  "🌡️": { path: ["Électroménager", "Chauffage, clim, ventilation", "Climatiseurs et radiateurs", "Chauffage d'appoint"], id: 20613 },
  "🚁": { path: ["Jouets et jeux", "Modélisme RC, jouets RC", "Jouets télécommandés"], id: 84912 },
  "🎭": { path: ["Jouets et jeux", "Déguisements, masques"], id: 128961 },
  "🚼": { path: ["Bébé, puériculture", "Lits, équipements d'intérieur", "Lits, matelas, berceaux"], id: 93391 },
  // Sports nautiques : feuille terminale générique unique [121048] — plongée
  // et glisse (paddle/kayak/kitesurf) y retombent toutes deux.
  "🤿": { path: ["Sports, vacances", "Sports nautiques, plongée"], id: 121048 },
  "🏄": { path: ["Sports, vacances", "Sports nautiques, plongée"], id: 121048 },
  // Sac banane : la seule feuille du relevé vit sous Camping, randonnée —
  // DÉFAUT ASSUMÉ (une banane mode y sera approximée, feuille littérale).
  "👝": { path: ["Sports, vacances", "Camping, randonnée", "Sacs de randonnée", "Sacs bananes"], id: 181380 },

  // ── Ajouts 2026-07-09 (re-crawl ciblé du prelist, SANS compte connecté —
  // lève les 6 derniers NON_CRAWLÉ ; ids vérifiés contre le relevé) ─────────
  // DÉFAUT ASSUMÉ : "DVD, Blu-ray" est la feuille commune aux deux formats ;
  // "Cassettes vidéo" [309] et "Laserdiscs" [381] sont des sœurs, non
  // atteintes par ce défaut (la regex 📀 les couvre pourtant).
  "📀": { path: ["DVD, cinéma", "DVD, Blu-ray"], id: 617 },
  // DÉFAUT ASSUMÉ (double) : Chiens pris avant Chats (branches jumelles,
  // même choix que Vinted), et la feuille combine gamelles ET distributeurs.
  "🐕": { path: ["Animalerie", "Chiens", "Gamelles, distributeurs"], id: 177789 },
  "🧵": { path: ["Loisirs créatifs", "Couture", "Machines à coudre, surjeteuses"], id: 3118 },
  // DÉFAUT ASSUMÉ : la regex 🎄 couvre sapin/guirlande/boule/crèche — chacun
  // a sa feuille sœur exacte (Sapins de Noël [117414], Couronnes et
  // guirlandes [117419], Santons, crèches [156862]) ; "Décorations de sapin"
  // pris comme dominant (le plus gros volume de revente).
  "🎄": { path: ["Maison", "Fêtes, occasions spéciales", "Décorations de Noël, sapins", "Décorations de sapin de Noël"], id: 166725 },
  // "Autres" est le bac générique de la branche Equitation : l'icône 🐴 est
  // elle-même générique (équitation/cravache/licol/étriers/tapis de selle) et
  // chaque objet a sa feuille sœur dédiée — un défaut vers "Cravaches" y
  // enverrait toutes les bombes et selles.
  "🐴": { path: ["Sports, vacances", "Equitation", "Autres"], id: 1048 },
  // "Jeux de café" = pub games (billard, baby-foot, fléchettes, flipper) :
  // couvre la regex 🎱 sauf pétanque, qui a sa propre feuille [115195].
  "🎱": { path: ["Jouets et jeux", "Jeux de café"], id: 92101 },

  // ── Non mappé assumé (cf. en-tête) ────────────────────────────────────────
  // Piste "Sports, vacances > Vacances" [3252] NON CRAWLÉE — à re-crawler
  // avant d'activer, pas de pari.
  "🧳": null,
};

/**
 * true si l'icône est un article dont le chemin eBay dépend du genre
 * (rayons Femme/Homme/Fille/Garçon/Bébé/Enfant de "Vêtements, accessoires",
 * + Parfums). Même contrat que vintedGenreRequired/beebsGenreRequired.
 * @param {string} icon — emoji retourné par detectObjectIcon
 */
export function ebayGenreRequired(icon) {
  if (Object.prototype.hasOwnProperty.call(HORS_MODE, icon)) return false;
  return Object.prototype.hasOwnProperty.call(MODE, icon);
}

/**
 * Statut de support eBay — dérivé des tables (même contrat que
 * vintedCategoryStatus) : "supported" | "unavailable" (null explicite) |
 * "unmapped" (dont les NON_CRAWLÉ listés en fin de HORS_MODE).
 */
export function ebayCategoryStatus(icon) {
  if (Object.prototype.hasOwnProperty.call(HORS_MODE, icon)) {
    return HORS_MODE[icon] ? "supported" : "unavailable";
  }
  const entry = MODE[icon];
  if (!entry) return "unmapped";
  return Object.values(entry).some(Boolean) ? "supported" : "unavailable";
}

function resolve(icon, genre) {
  if (Object.prototype.hasOwnProperty.call(HORS_MODE, icon)) return HORS_MODE[icon];
  const entry = MODE[icon];
  if (!entry || !genre) return null;
  return entry[genre] ?? null;
}

/**
 * @param {string} icon  — emoji retourné par detectObjectIcon
 * @param {string} genre — valeur eBay DIRECTE : "Femme" | "Homme" | "Fille"
 *   | "Garçon" | "Bébé" | "Enfant" (rayon unisexe réel — notre valeur
 *   interne passe telle quelle, contrairement à Beebs). "Mixte" → null sauf
 *   🌸 (feuille Parfums mixtes).
 * @returns {string[]|null} chemin catalogue eBay (libellés exacts), ou null
 */
export function getEbayCategoryPath(icon, genre) {
  return resolve(icon, genre)?.path ?? null;
}

/**
 * categoryId numérique de la feuille (celui du flow /sl/prelist :
 * caty=<id> et catyIdPath[] dans l'URL). À stocker À CÔTÉ du path.
 * @returns {number|null}
 */
export function getEbayCategoryId(icon, genre) {
  return resolve(icon, genre)?.id ?? null;
}
