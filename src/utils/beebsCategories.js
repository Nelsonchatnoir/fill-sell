// Mapping icône objet (detectObjectIcon) + genre → chemin catalogue Beebs.
//
// Source : crawl réel du sélecteur de catégorie du formulaire "Mettre en
// vente" (www.beebs.app/fr/listing), juillet 2026 — arbre complet archivé
// dans docs/beebs-categories-raw.txt. Tous les libellés de ce fichier sont
// des libellés EXACTS relevés en cliquant réellement dans le sélecteur,
// jamais déduits par symétrie : aucun chemin "NON CONFIRMÉ" ici (contrairement
// au Lot 1 Vinted). Deux niveaux de confiance seulement :
//   - chemins directs (une seule feuille possible) : fiables tels quels
//   - "DÉFAUT ASSUMÉ" : l'icône regroupe plusieurs mots-clés qui pointent
//     vers des feuilles différentes — un seul chemin choisi par défaut,
//     documenté, approximation assumée
//
// Périmètre : branche "Mode" (genrée, 5 rayons Femme/Homme/Fille/Garçon/
// Bébé) + branches objets NON genrées activées en juillet 2026 (Beebs est
// une marketplace généraliste comme Leboncoin, pas fashion-only comme
// Vinted) : "Jeux, jouets et loisirs", "Hygiène et beauté", "Puériculture"
// — table HORS_MODE, chemin unique quel que soit le genre, même contrat que
// HORS_MODE Vinted.
// Reste hors périmètre : "Maison" — le crawl de cette branche est PARTIEL
// (interrompu pendant le relevé), aucune icône n'y est mappée volontairement.
// Candidats évidents le jour d'un re-crawl complet : ☕ machines à café,
// 🥣 mixeurs, 🍳 poêles/casseroles/plats, 🍽️ vaisselle, 🎒 cartables
// scolaires (Maison > Cartables et fournitures scolaires, doublon du chemin
// Mode actuel). Déguisements (sous Jeux, genrés femme/homme/fille/garçon/
// bébé) : pas de regex déguisement côté detectObjectIcon — backlog T3.
//
// Genre : getBeebsCategoryPath prend DIRECTEMENT les 5 valeurs Beebs
// (Femme/Homme/Fille/Garçon/Bébé). Il n'existe dans l'arbre NI rayon "Enfant"
// générique NI rayon "Mixte" (re-vérifié le 2026-07-09 sur
// docs/beebs-categories-raw.txt : les seuls niveaux 2 sous "Mode" sont ces 5).
//
// "Enfant" est donc INDÉCIDABLE (Fille ? Garçon ? Bébé ?) et ne sera jamais
// résolu automatiquement — le résoudre par défaut publierait l'article dans le
// mauvais rayon. "Mixte" n'a aucun équivalent : rejet légitime, même contrat
// que Mixte sur Vinted. Depuis le 2026-07-09 le stepper Beebs de l'app propose
// directement les 5 rayons réels (platformFieldsConfig.beebs → beebsGender),
// pour que l'utilisateur puisse trancher : avant, l'app réclamait un genre
// qu'elle ne permettait pas de choisir.
//
// ⚠️ Les 5 arborescences DIVERGENT structurellement et lexicalement — jamais
// de substitution automatique entre genres. Pièges de libellés confirmés :
//   - "Chaussures à talon (femme)" : talon au SINGULIER
//   - "Porte-monnaies (femme)" : avec un s à monnaies
//   - "Bijoux (filles)" : filles au PLURIEL (seul cas de tout l'arbre)
//   - "Casquettes, chapeaux et bandeaux (fille)" vs "Casquettes et chapeaux
//     (garçon)" (pas de bandeaux côté garçon)
//   - "Vestes sans manches (femme)" vs "Vestes sans manche (homme)"
//   - "Chaussures (bébé)" est une feuille TERMINALE (aucun sous-niveau,
//     contrairement aux 4 autres genres)
//
// Chaque chemin finit sur une feuille TERMINALE. Signal DOM côté extension
// (pour le futur handler Beebs, à construire dans une session dédiée) :
//   - options d'un niveau : button.CategoriesDropDown-module-scss-module__YKdtxa__category
//   - remonter d'un niveau : button.CategoriesDropDown-module-scss-module__YKdtxa__previousCategoryButton
//   - feuille terminale = les boutons contiennent une checkbox
//     (input[type=checkbox]) → sélectionner (cocher), ne plus drill down
// La consommation des chemins suit le même système de fallback que Vinted :
// exact → partiel → split → skip.
//
// Clé = emoji retourné par detectObjectIcon (src/utils/shared.js).
// Valeur = { Femme, Homme, Fille, Garçon, Bébé } — null si pas de chemin
// pour ce genre.

const MODE = {
  // ── Chaussures ────────────────────────────────────────────────────────────
  // DÉFAUT ASSUMÉ : la regex couvre aussi derby/mocassin/espadrille — feuilles
  // dédiées côté Homme (Mocassins et chaussures bateau, Chaussures habillées,
  // Espadrilles), non atteintes par ce défaut ; basket pris comme dominant.
  // Bébé : "Chaussures (bébé)" est LA feuille unique, aucun sous-niveau.
  "👟": {
    Femme: ["Mode", "Femme", "Chaussures (femme)", "Baskets (femme)"],
    Homme: ["Mode", "Homme", "Chaussures (homme)", "Baskets (homme)"],
    Fille: ["Mode", "Fille", "Chaussures (fille)", "Baskets (fille)"],
    Garçon: ["Mode", "Garçon", "Chaussures (garçon)", "Baskets (garçon)"],
    Bébé: ["Mode", "Bébé", "Chaussures (bébé)"],
  },
  // Fille/Garçon : "Bottes de pluie" est une feuille sœur, non atteinte par
  // ce défaut (DÉFAUT ASSUMÉ léger).
  "👢": {
    Femme: ["Mode", "Femme", "Chaussures (femme)", "Bottes (femme)"],
    Homme: ["Mode", "Homme", "Chaussures (homme)", "Bottes et bottines (homme)"],
    Fille: ["Mode", "Fille", "Chaussures (fille)", "Bottes et bottines (fille)"],
    Garçon: ["Mode", "Garçon", "Chaussures (garçon)", "Bottes et bottines (garçon)"],
    Bébé: ["Mode", "Bébé", "Chaussures (bébé)"],
  },
  // ⚠️ "Chaussures à talon (femme)" — talon au singulier (piège de libellé).
  // Pas d'équivalent Homme/Garçon (confirmé). Fille : la regex couvre aussi
  // ballerine → "Chaussures plates (fille)" est la feuille naturelle des
  // ballerines enfant (DÉFAUT ASSUMÉ léger : un escarpin fille, improbable,
  // y atterrirait aussi).
  "👠": {
    Femme: ["Mode", "Femme", "Chaussures (femme)", "Chaussures à talon (femme)"],
    Homme: null,
    Fille: ["Mode", "Fille", "Chaussures (fille)", "Chaussures plates (fille)"],
    Garçon: null,
    Bébé: ["Mode", "Bébé", "Chaussures (bébé)"],
  },
  // DÉFAUT ASSUMÉ : mule → "Mules et sabots (femme)" est une feuille sœur
  // côté Femme, non atteinte (sandale pris comme dominant).
  "🩴": {
    Femme: ["Mode", "Femme", "Chaussures (femme)", "Sandales et nu-pieds (femme)"],
    Homme: ["Mode", "Homme", "Chaussures (homme)", "Sandales (homme)"],
    Fille: ["Mode", "Fille", "Chaussures (fille)", "Sandales (fille)"],
    Garçon: ["Mode", "Garçon", "Chaussures (garçon)", "Sandales (garçon)"],
    Bébé: ["Mode", "Bébé", "Chaussures (bébé)"],
  },

  // ── Vêtements ─────────────────────────────────────────────────────────────
  // DÉFAUT ASSUMÉ (hérité de Vinted) : la regex robe|jupe couvre deux
  // catégories SŒURS (Robes / Jupes) — une jupe femme ou fille tombera à
  // tort sur Robes. Femme : "Autres robes (femme)" pris comme feuille
  // générique du niveau 5. Fille : "Robes (fille)" est terminale directe.
  // Bébé : "Robes et jupes (bébé)" couvre les DEUX mots-clés, aucune
  // approximation. Pas d'équivalent Homme/Garçon (confirmé).
  "👗": {
    Femme: ["Mode", "Femme", "Vêtements (femme)", "Robes (femme)", "Autres robes (femme)"],
    Homme: null,
    Fille: ["Mode", "Fille", "Vêtements (fille)", "Robes (fille)"],
    Garçon: null,
    Bébé: ["Mode", "Bébé", "Vêtements (bébé)", "Robes et jupes (bébé)"],
  },
  // DÉFAUT ASSUMÉ : la regex couvre manteau/veste/blouson/parka/doudoune/
  // trench — pas de feuille doudoune chez Beebs (contrairement à Vinted),
  // "Manteaux" pris comme dominant (1er mot-clé, couvre parka/trench) ; une
  // veste adulte atterrira sur Manteaux plutôt que sur la feuille sœur
  // "Vestes". Fille/Garçon : "Manteaux et blousons" est terminale directe,
  // "Vestes" est une sœur non atteinte. Bébé : "Manteaux et combipilotes".
  "🧥": {
    Femme: ["Mode", "Femme", "Vêtements (femme)", "Manteaux et vestes (femme)", "Manteaux (femme)"],
    Homme: ["Mode", "Homme", "Vêtements (homme)", "Manteaux et vestes (homme)", "Manteaux (homme)"],
    Fille: ["Mode", "Fille", "Vêtements (fille)", "Manteaux et blousons (fille)"],
    Garçon: ["Mode", "Garçon", "Vêtements (garçon)", "Manteaux et blousons (garçon)"],
    Bébé: ["Mode", "Bébé", "Vêtements (bébé)", "Manteaux et combipilotes (bébé)"],
  },
  // DÉFAUT ASSUMÉ (hérité de Vinted) : la regex couvre aussi cravate/costume —
  // deux branches à part (Homme : "Costumes et blazers" ; Accessoires >
  // "Cravates et noeuds papillon"), non atteignables depuis ce défaut ;
  // chemise pris comme cas dominant. Homme : "Chemises (homme)" est
  // terminale directe (pas de sous-niveau, divergence avec Femme).
  "👔": {
    Femme: ["Mode", "Femme", "Vêtements (femme)", "Chemises, blouses et tuniques (femme)", "Chemises (femme)"],
    Homme: ["Mode", "Homme", "Vêtements (homme)", "Chemises (homme)"],
    Fille: ["Mode", "Fille", "Vêtements (fille)", "Chemises et blouses (fille)"],
    Garçon: ["Mode", "Garçon", "Vêtements (garçon)", "Chemises et polos (garçon)"],
    Bébé: ["Mode", "Bébé", "Vêtements (bébé)", "Chemises et blouses (bébé)"],
  },
  // ⚠️ Divergence structurelle Homme : Beebs SCINDE "Pulls et gilets (homme)"
  // et "Sweats (homme)" en deux branches sœurs de niveau 4 (aucune feuille
  // générique commune). DÉFAUT ASSUMÉ : Sweats > "Autres sweats" choisi
  // (précédent Vinted : Sweats, gros volume revente hoodie/sweat) — un pull
  // ras de cou homme atterrira à tort sous Sweats. Femme : "Pulls (femme)"
  // pris comme dominant (1er mot-clé) — un sweat femme atterrira sur Pulls,
  // feuille sœur du même parent (conflation bénigne). Fille/Garçon :
  // cardigan/gilet → feuilles sœurs "Gilets et cardigans (fille)" / "Gilets
  // (garçon)", non atteintes. Bébé : "Pulls, gilets et sweats (bébé)" couvre
  // TOUT le groupe, aucune approximation.
  "🧶": {
    Femme: ["Mode", "Femme", "Vêtements (femme)", "Pulls et sweats (femme)", "Pulls (femme)"],
    Homme: ["Mode", "Homme", "Vêtements (homme)", "Sweats (homme)", "Autres sweats (homme)"],
    Fille: ["Mode", "Fille", "Vêtements (fille)", "Pulls et sweats (fille)"],
    Garçon: ["Mode", "Garçon", "Vêtements (garçon)", "Pulls et sweats (garçon)"],
    Bébé: ["Mode", "Bébé", "Vêtements (bébé)", "Pulls, gilets et sweats (bébé)"],
  },
  // DÉFAUT ASSUMÉ : la regex couvre aussi débardeur (feuille sœur "Débardeurs
  // (femme)") et tunique (branche "Chemises, blouses et tuniques > Tuniques"
  // côté Femme), non atteints. Homme : "T-shirts (homme)" terminale directe.
  "👕": {
    Femme: ["Mode", "Femme", "Vêtements (femme)", "T-shirts et tops (femme)", "T-shirts (femme)"],
    Homme: ["Mode", "Homme", "Vêtements (homme)", "T-shirts (homme)"],
    Fille: ["Mode", "Fille", "Vêtements (fille)", "T-shirts et débardeurs (fille)"],
    Garçon: ["Mode", "Garçon", "Vêtements (garçon)", "T-shirts (garçon)"],
    Bébé: ["Mode", "Bébé", "Vêtements (bébé)", "T-shirts (bébé)"],
  },
  // DÉFAUT ASSUMÉ (fragile côté Femme) : "Shorts et bermudas (femme)" n'a
  // AUCUNE feuille générique ("Autres") — 7 feuilles toutes spécifiques ;
  // "Shorts en jean (femme)" pris comme format de revente dominant, tout
  // autre short femme y atterrira. Homme : "Autres shorts (homme)" générique.
  "🩳": {
    Femme: ["Mode", "Femme", "Vêtements (femme)", "Shorts et bermudas (femme)", "Shorts en jean (femme)"],
    Homme: ["Mode", "Homme", "Vêtements (homme)", "Bermudas et shorts (homme)", "Autres shorts (homme)"],
    Fille: ["Mode", "Fille", "Vêtements (fille)", "Shorts (fille)"],
    Garçon: ["Mode", "Garçon", "Vêtements (garçon)", "Shorts (garçon)"],
    Bébé: ["Mode", "Bébé", "Vêtements (bébé)", "Shorts et bloomers (bébé)"],
  },
  // DÉFAUT ASSUMÉ (hérité de Vinted) : la regex couvre jean/jogging/legging/
  // salopette/survêtement — Jeans, Leggings (Vêtements de sport), Salopettes,
  // Survêtements sont des branches/feuilles à part chez Beebs adulte, non
  // atteintes depuis ce défaut pantalon générique. Fille/Garçon : "Pantalons
  // et jeans" couvre jean ET pantalon d'un coup (meilleur cas).
  "👖": {
    Femme: ["Mode", "Femme", "Vêtements (femme)", "Pantalons (femme)", "Autres pantalons (femme)"],
    Homme: ["Mode", "Homme", "Vêtements (homme)", "Pantalons (homme)", "Autres pantalons (homme)"],
    Fille: ["Mode", "Fille", "Vêtements (fille)", "Pantalons et jeans (fille)"],
    Garçon: ["Mode", "Garçon", "Vêtements (garçon)", "Pantalons et jeans (garçon)"],
    Bébé: ["Mode", "Bébé", "Vêtements (bébé)", "Pantalons (bébé)"],
  },
  // Femme : sous-niveau 1 pièce / 2 pièces / Autres — défaut générique
  // "Autres" (même choix que Vinted). Bébé : pas de feuille maillot de bain,
  // "Combinaisons de bain (bébé)" est l'équivalent le plus proche (DÉFAUT
  // ASSUMÉ léger).
  "👙": {
    Femme: ["Mode", "Femme", "Vêtements (femme)", "Maillots de bain (femme)", "Autres maillots de bain (femme)"],
    Homme: ["Mode", "Homme", "Vêtements (homme)", "Maillots de bain (homme)"],
    Fille: ["Mode", "Fille", "Vêtements (fille)", "Maillots de bain (fille)"],
    Garçon: ["Mode", "Garçon", "Vêtements (garçon)", "Maillots de bain (garçon)"],
    Bébé: ["Mode", "Bébé", "Vêtements (bébé)", "Combinaisons de bain (bébé)"],
  },
  // DÉFAUT ASSUMÉ : aucune feuille chaussettes/collants dans TOUT l'arbre
  // Mode Beebs (confirmé, tous genres) — on retombe sur la feuille fourre-
  // tout "Autres vêtements" de chaque genre plutôt que d'échouer (des
  // chaussettes restent des vêtements). Bébé n'a pas d'"Autres vêtements"
  // → null explicite.
  "🧦": {
    Femme: ["Mode", "Femme", "Vêtements (femme)", "Autres vêtements (femme)"],
    Homme: ["Mode", "Homme", "Vêtements (homme)", "Autres vêtements (homme)"],
    Fille: ["Mode", "Fille", "Vêtements (fille)", "Autres vêtements (fille)"],
    Garçon: ["Mode", "Garçon", "Vêtements (garçon)", "Autres vêtements (garçon)"],
    Bébé: null,
  },

  // ── Sacs & petite maroquinerie (asymétrie forte : branche riche de 10
  // feuilles côté Femme, une seule feuille "Sacs et sacoches" côté Homme,
  // seulement "Sacs à dos" côté Fille/Garçon, rien côté Bébé) ───────────────
  // DÉFAUT ASSUMÉ Fille/Garçon : pas de feuille sac à main enfant — "Sacs à
  // dos" pris comme réalité dominante d'un "sac" enfant.
  "👜": {
    Femme: ["Mode", "Femme", "Accessoires (femme)", "Sacs à main et pochettes (femme)", "Sacs à main (femme)"],
    Homme: ["Mode", "Homme", "Accessoires (homme)", "Sacs et sacoches (homme)"],
    Fille: ["Mode", "Fille", "Accessoires (fille)", "Sacs à dos (fille)"],
    Garçon: ["Mode", "Garçon", "Accessoires (garçon)", "Sacs à dos (garçon)"],
    Bébé: null,
  },
  // ⚠️ "Porte-monnaies (femme)" — avec un s (piège de libellé). Homme/Fille/
  // Garçon : aucune feuille porte-monnaie → "Autres accessoires" (DÉFAUT
  // ASSUMÉ).
  "👛": {
    Femme: ["Mode", "Femme", "Accessoires (femme)", "Sacs à main et pochettes (femme)", "Porte-monnaies (femme)"],
    Homme: ["Mode", "Homme", "Accessoires (homme)", "Autres accessoires (homme)"],
    Fille: ["Mode", "Fille", "Accessoires (fille)", "Autres accessoires (fille)"],
    Garçon: ["Mode", "Garçon", "Accessoires (garçon)", "Autres accessoires (garçon)"],
    Bébé: null,
  },
  // Femme : cartable → feuille sœur "Cartables (femme)", non atteinte (DÉFAUT
  // ASSUMÉ léger — et les cartables scolaires vivent aussi sous Maison >
  // Cartables et fournitures scolaires, branche hors périmètre). Homme : pas
  // de feuille sac à dos → "Sacs et sacoches" (DÉFAUT ASSUMÉ).
  "🎒": {
    Femme: ["Mode", "Femme", "Accessoires (femme)", "Sacs à main et pochettes (femme)", "Sacs à dos (femme)"],
    Homme: ["Mode", "Homme", "Accessoires (homme)", "Sacs et sacoches (homme)"],
    Fille: ["Mode", "Fille", "Accessoires (fille)", "Sacs à dos (fille)"],
    Garçon: ["Mode", "Garçon", "Accessoires (garçon)", "Sacs à dos (garçon)"],
    Bébé: null,
  },
  // DÉFAUT ASSUMÉ léger : pas de feuille "Sacs de sport" chez Beebs
  // (contrairement à Vinted) — "Accessoires de sport" de chaque genre est
  // l'équivalent le plus proche.
  "🎽": {
    Femme: ["Mode", "Femme", "Accessoires (femme)", "Accessoires de sport (femme)"],
    Homme: ["Mode", "Homme", "Accessoires (homme)", "Accessoires de sport (homme)"],
    Fille: ["Mode", "Fille", "Accessoires (fille)", "Accessoires de sport (fille)"],
    Garçon: ["Mode", "Garçon", "Accessoires (garçon)", "Accessoires de sport (garçon)"],
    Bébé: null,
  },
  // Valise/bagage : feuille exacte "Sacs de voyage (femme)" côté Femme ;
  // Homme : "Sacs et sacoches" au plus proche (DÉFAUT ASSUMÉ) ; rien côté
  // enfant/bébé (confirmé).
  "🧳": {
    Femme: ["Mode", "Femme", "Accessoires (femme)", "Sacs à main et pochettes (femme)", "Sacs de voyage (femme)"],
    Homme: ["Mode", "Homme", "Accessoires (homme)", "Sacs et sacoches (homme)"],
    Fille: null,
    Garçon: null,
    Bébé: null,
  },

  // ── Accessoires ───────────────────────────────────────────────────────────
  // Enfant/bébé : écharpes et gants vivent dans la feuille combinée
  // "Bonnets, écharpes et gants" — couvre les deux icônes 🧣 et 🧤 d'un coup.
  "🧣": {
    Femme: ["Mode", "Femme", "Accessoires (femme)", "Écharpes et foulards (femme)"],
    Homme: ["Mode", "Homme", "Accessoires (homme)", "Écharpes et foulards (homme)"],
    Fille: ["Mode", "Fille", "Accessoires (fille)", "Bonnets, écharpes et gants (fille)"],
    Garçon: ["Mode", "Garçon", "Accessoires (garçon)", "Bonnets, écharpes et gants (garçon)"],
    Bébé: ["Mode", "Bébé", "Accessoires (bébé)", "Bonnets, écharpes et gants (bébé)"],
  },
  "🧤": {
    Femme: ["Mode", "Femme", "Accessoires (femme)", "Gants (femme)"],
    Homme: ["Mode", "Homme", "Accessoires (homme)", "Gants (homme)"],
    Fille: ["Mode", "Fille", "Accessoires (fille)", "Bonnets, écharpes et gants (fille)"],
    Garçon: ["Mode", "Garçon", "Accessoires (garçon)", "Bonnets, écharpes et gants (garçon)"],
    Bébé: ["Mode", "Bébé", "Accessoires (bébé)", "Bonnets, écharpes et gants (bébé)"],
  },
  // DÉFAUT ASSUMÉ côté enfant/bébé : la regex couvre aussi bonnet, qui vit
  // dans la feuille sœur "Bonnets, écharpes et gants" — casquette/chapeau
  // pris comme dominants, un bonnet enfant atterrira à côté (même parent).
  // ⚠️ Libellés divergents : "Casquettes, chapeaux et bandeaux (fille)"/
  // "(bébé)" mais "Casquettes et chapeaux (garçon)" (pas de bandeaux).
  "🧢": {
    Femme: ["Mode", "Femme", "Accessoires (femme)", "Chapeaux et casquettes (femme)"],
    Homme: ["Mode", "Homme", "Accessoires (homme)", "Chapeaux et casquettes (homme)"],
    Fille: ["Mode", "Fille", "Accessoires (fille)", "Casquettes, chapeaux et bandeaux (fille)"],
    Garçon: ["Mode", "Garçon", "Accessoires (garçon)", "Casquettes et chapeaux (garçon)"],
    Bébé: ["Mode", "Bébé", "Accessoires (bébé)", "Casquettes, chapeaux et bandeaux (bébé)"],
  },
  // Seule icône avec une feuille exacte pour les 5 genres, Bébé compris.
  "🕶️": {
    Femme: ["Mode", "Femme", "Accessoires (femme)", "Lunettes de soleil (femme)"],
    Homme: ["Mode", "Homme", "Accessoires (homme)", "Lunettes de soleil (homme)"],
    Fille: ["Mode", "Fille", "Accessoires (fille)", "Lunettes de soleil (fille)"],
    Garçon: ["Mode", "Garçon", "Accessoires (garçon)", "Lunettes de soleil (garçon)"],
    Bébé: ["Mode", "Bébé", "Accessoires (bébé)", "Lunettes de soleil (bébé)"],
  },
  // Fille/Garçon : aucune feuille Montres → "Autres accessoires" (DÉFAUT
  // ASSUMÉ).
  "⌚": {
    Femme: ["Mode", "Femme", "Accessoires (femme)", "Montres (femme)"],
    Homme: ["Mode", "Homme", "Accessoires (homme)", "Montres (homme)"],
    Fille: ["Mode", "Fille", "Accessoires (fille)", "Autres accessoires (fille)"],
    Garçon: ["Mode", "Garçon", "Accessoires (garçon)", "Autres accessoires (garçon)"],
    Bébé: null,
  },
  // ⚠️ "Bijoux (filles)" — filles au PLURIEL, seul libellé de tout l'arbre
  // dans ce cas (confirmé par crawl, pas une coquille de relevé).
  "💍": {
    Femme: ["Mode", "Femme", "Accessoires (femme)", "Bijoux (femme)"],
    Homme: ["Mode", "Homme", "Accessoires (homme)", "Bijoux (homme)"],
    Fille: ["Mode", "Fille", "Accessoires (fille)", "Bijoux (filles)"],
    Garçon: ["Mode", "Garçon", "Accessoires (garçon)", "Bijoux (garçon)"],
    Bébé: null,
  },

  // ── Ajouts 2026-07-09 (mission mapping complet) — feuilles relevées dans
  // docs/beebs-categories-raw.txt (sélecteur du formulaire, crawl réel) ─────
  // Chaussons : 4 genres, pas de feuille Bébé (confirmé par le relevé Mode
  // complet).
  "🥿": {
    Femme: ["Mode", "Femme", "Chaussures (femme)", "Chaussons (femme)"],
    Homme: ["Mode", "Homme", "Chaussures (homme)", "Chaussons (homme)"],
    Fille: ["Mode", "Fille", "Chaussures (fille)", "Chaussons (fille)"],
    Garçon: ["Mode", "Garçon", "Chaussures (garçon)", "Chaussons (garçon)"],
    Bébé: null,
  },
  // Sac banane : feuille Femme uniquement (confirmé).
  "👝": {
    Femme: ["Mode", "Femme", "Accessoires (femme)", "Sacs à main et pochettes (femme)", "Sacs banane (femme)"],
    Homme: null, Fille: null, Garçon: null, Bébé: null,
  },
  "🪢": {
    Femme: ["Mode", "Femme", "Accessoires (femme)", "Ceintures (femme)"],
    Homme: ["Mode", "Homme", "Accessoires (homme)", "Ceintures (homme)"],
    Fille: null, Garçon: null, Bébé: null,
  },
  // ⚠️ "noeuds" SANS ligature chez Beebs (libellé exact du relevé).
  "🎀": {
    Femme: null,
    Homme: ["Mode", "Homme", "Accessoires (homme)", "Cravates et noeuds papillon (homme)"],
    Fille: null, Garçon: null, Bébé: null,
  },
  // Parapluies : feuille SANS suffixe de genre (seul cas du rayon Accessoires,
  // libellé exact "Parapluies" des deux côtés — relevé).
  "☂️": {
    Femme: ["Mode", "Femme", "Accessoires (femme)", "Parapluies"],
    Homme: ["Mode", "Homme", "Accessoires (homme)", "Parapluies"],
    Fille: null, Garçon: null, Bébé: null,
  },
  // Pyjamas : niveau différent selon le genre (branche "Nuit et pyjamas"
  // chez Femme/Homme/Bébé, feuille directe chez Fille/Garçon — relevé).
  "🩲": {
    Femme: ["Mode", "Femme", "Nuit et pyjamas (femme)", "Pyjamas (femme)"],
    Homme: ["Mode", "Homme", "Nuit et pyjamas (homme)", "Pyjamas (homme)"],
    Fille: ["Mode", "Fille", "Pyjamas (fille)"],
    Garçon: ["Mode", "Garçon", "Pyjamas (garçon)"],
    Bébé: ["Mode", "Bébé", "Nuit et pyjamas (bébé)", "Pyjamas (bébé)"],
  },
  // ⚠️ Homme : la feuille blazer s'appelle "Vestes et blazers (homme)" (pas
  // "Blazers") — libellé exact du relevé.
  "🥼": {
    Femme: ["Mode", "Femme", "Vêtements (femme)", "Blazers et tailleurs (femme)", "Blazers (femme)"],
    Homme: ["Mode", "Homme", "Vêtements (homme)", "Costumes et blazers (homme)", "Vestes et blazers (homme)"],
    Fille: null, Garçon: null, Bébé: null,
  },
  // Costume : branche Homme uniquement (pas d'équivalent femme au relevé —
  // les tailleurs femme vivent sous Blazers et tailleurs, cf. 🥼).
  "🤵": {
    Femme: null,
    Homme: ["Mode", "Homme", "Vêtements (homme)", "Costumes et blazers (homme)", "Ensembles de costume (homme)"],
    Fille: null, Garçon: null, Bébé: null,
  },
  // Déguisements : GENRÉ chez Beebs mais hors branche Mode (vit sous Jeux,
  // jouets et loisirs — seule branche genrée hors Mode, cf. en-tête).
  "🎭": {
    Femme: ["Jeux, jouets et loisirs", "Déguisements", "Déguisements (femme)"],
    Homme: ["Jeux, jouets et loisirs", "Déguisements", "Déguisements (homme)"],
    Fille: ["Jeux, jouets et loisirs", "Déguisements", "Déguisements (fille)"],
    Garçon: ["Jeux, jouets et loisirs", "Déguisements", "Déguisements (garçon)"],
    Bébé: ["Jeux, jouets et loisirs", "Déguisements", "Déguisements (bébé)"],
  },
};

// Icônes dont la catégorie Beebs vit HORS de la branche Mode. Branches NON
// genrées (confirmé : seul "Déguisements" est genré hors Mode) → chemin
// unique, retourné quel que soit platform_fields.genre, même contrat que
// HORS_MODE Vinted. Activées en juillet 2026 (Beebs = généraliste).
const HORS_MODE = {
  // ── "Jeux, jouets et loisirs" — le cœur historique de Beebs ──────────────
  // DÉFAUT ASSUMÉ : la regex couvre pokémon/magic/yu-gi-oh/panini/booster —
  // Panini/Dragon Ball/Harry Potter/One Piece/Yu-Gi-Oh!/Magic et "Autres
  // cartes à collectionner" sont des feuilles sœurs dédiées, et lots/
  // boosters/coffrets/sleeves des sœurs sous Cartes Pokémon — "à l'unité"
  // pris comme format dominant (même choix que Vinted), Pokémon comme
  // licence dominante.
  "🃏": ["Jeux, jouets et loisirs", "Cartes, figurines et collectibles", "Cartes Pokémon", "Cartes Pokémon à l'unité"],
  // DÉFAUT ASSUMÉ léger : doudou → "Doudous", feuille sœur non atteinte.
  "🧸": ["Jeux, jouets et loisirs", "Peluches"],
  // DÉFAUT ASSUMÉ léger : poupon → "Poupons et bébés", feuille sœur.
  "🪆": ["Jeux, jouets et loisirs", "Poupées", "Poupées"],
  // "Figurines" niveau 2, terminale directe ("Figurines de collection" sous
  // Cartes, figurines et collectibles serait l'alternative collectionneur).
  "🦸": ["Jeux, jouets et loisirs", "Figurines"],
  // DÉFAUT ASSUMÉ léger : kapla (bois) → "Jeux de construction en bois",
  // feuille sœur ; lego/duplo dominants.
  "🧱": ["Jeux, jouets et loisirs", "Jeux de construction", "LEGO et autres briques"],
  "🧩": ["Jeux, jouets et loisirs", "Puzzles"],
  "🎲": ["Jeux, jouets et loisirs", "Jeux de société"],
  // DÉFAUT ASSUMÉ (hérité de Vinted) : console/jeu/manette — "Jeux vidéo" et
  // "Accessoires pour consoles" sont des feuilles sœurs, console pris comme
  // dominant.
  "🎮": ["Jeux, jouets et loisirs", "Multimédia", "Consoles de jeux"],
  "🏎️": ["Jeux, jouets et loisirs", "Véhicules", "Voitures et autres véhicules"],
  // DÉFAUT ASSUMÉ : manga vs BD, deux feuilles sœurs ("Mangas" / "BDs") —
  // manga pris comme dominant (1er mot-clé), une BD atterrira à côté.
  "📖": ["Jeux, jouets et loisirs", "Livres", "Mangas"],
  // DÉFAUT ASSUMÉ : un "livre" générique peut être Romans pour enfant/pour
  // adultes/scolaires/de recettes... indéterminable depuis l'icône — feuille
  // fourre-tout "Autres livres" choisie plutôt qu'un pari sur l'âge.
  "📚": ["Jeux, jouets et loisirs", "Livres", "Autres livres"],
  // DÉFAUT ASSUMÉ (fragile) : la regex 💿 est vinyle/platine/33-45 tours et
  // Beebs n'a AUCUNE feuille vinyle — "CD" pris comme média musical physique
  // le plus proche (un vinyle y sera mal rangé mais dans la bonne famille ;
  // "DVD" est la sœur vidéo). À revoir si le volume vinyle le justifie.
  "💿": ["Jeux, jouets et loisirs", "Multimédia", "CD"],
  // Sport enfant (sous Jeux d'extérieur et sport) :
  // ⚠️ Contrairement à Vinted, un vélo complet EXISTE chez Beebs (marketplace
  // enfant d'origine) — draisienne/tricycle = feuilles sœurs dédiées.
  "🚲": ["Jeux, jouets et loisirs", "Jeux d'extérieur et sport", "Vélos, draisiennes et tricycles", "Vélos"],
  "🛴": ["Jeux, jouets et loisirs", "Jeux d'extérieur et sport", "Trottinettes"],
  // 🛹 et ⛸️ partagent la même feuille (skates ET rollers ensemble chez
  // Beebs) — le "patin à glace" de la regex ⛸️ y sera approximé comme sur
  // Vinted.
  "🛹": ["Jeux, jouets et loisirs", "Jeux d'extérieur et sport", "Rollers et skates"],
  "⛸️": ["Jeux, jouets et loisirs", "Jeux d'extérieur et sport", "Rollers et skates"],
  "⛑️": ["Jeux, jouets et loisirs", "Jeux d'extérieur et sport", "Casques et protections"],
  "⚽": ["Jeux, jouets et loisirs", "Jeux d'extérieur et sport", "Ballons et jeux de sport"],

  // ── "Hygiène et beauté" (non genrée, contrairement à Vinted où la beauté
  // vit sous Femmes/Hommes) ─────────────────────────────────────────────────
  "🌸": ["Hygiène et beauté", "Parfums"],
  "💄": ["Hygiène et beauté", "Cosmétiques", "Maquillage"],
  "💅": ["Hygiène et beauté", "Cosmétiques", "Vernis et soins des ongles"],
  // DÉFAUT ASSUMÉ : la regex conflate crème/sérum (→ Crème corps), shampooing
  // (→ Shampoing), gel douche (→ Gel douche), démaquillant — feuilles sœurs
  // sous le même parent ; "Crème corps" pris comme dominant (1er mot-clé),
  // conflation bénigne (même parent direct).
  "🧴": ["Hygiène et beauté", "Soins visage et corps", "Crème corps"],

  // ── "Puériculture" ────────────────────────────────────────────────────────
  // Scission de l'ancienne icône 👶 unique (juillet 2026) : poussette/siège
  // auto/biberon/babyphone ont chacun leur icône et leur branche exacte.
  // DÉFAUT ASSUMÉ résiduel sur 👶 seule : "Poussettes" n'a aucune feuille
  // générique (10 feuilles toutes spécifiques) — "Poussettes citadines"
  // prise comme format le plus courant ; une poussette duo/trio/canne
  // atterrira sur une feuille sœur du même parent (conflation bénigne
  // désormais, plus jamais inter-branches). 📟 : "Babyphones vidéo" est la
  // feuille sœur non atteinte.
  "👶": ["Puériculture", "Poussettes", "Poussettes citadines"],
  "💺": ["Puériculture", "Sièges auto", "Sièges auto"],
  "🍼": ["Puériculture", "Repas", "Biberons", "Biberons"],
  "📟": ["Puériculture", "Chambre et nuit", "Babyphones", "Babyphones"],

  // ── Ajouts 2026-07-09 (mission mapping complet) — feuilles du relevé ─────
  "🚁": ["Jeux, jouets et loisirs", "Véhicules", "Véhicules télécommandés"],
  "📀": ["Jeux, jouets et loisirs", "Multimédia", "DVD"],
  "💽": ["Jeux, jouets et loisirs", "Multimédia", "CD"],
  // DÉFAUT ASSUMÉ : Lits bébé dominant (Lits enfant/Berceaux/Co-dodos/Lits
  // parapluie = feuilles sœurs sous Lits et berceaux).
  "🚼": ["Puériculture", "Chambre et nuit", "Lits et berceaux", "Lits bébé"],
  // ⚠️ "Ecriture" SANS accent (libellé exact du relevé).
  "🖋️": ["Maison", "Cartables et fournitures scolaires", "Ecriture et correction"],
  "☕": ["Maison", "Petit électroménager", "Machines à café"],
  // DÉFAUT ASSUMÉ : la regex 🥣 couvre blender/robot — seule feuille
  // "Mixeurs" au relevé (Cuiseurs/Yaourtières = sœurs).
  "🥣": ["Maison", "Petit électroménager", "Mixeurs"],
  "🍳": ["Maison", "Cuisine", "Poêles, casseroles et plats"],
  "🍽️": ["Maison", "Cuisine", "Vaisselle et art de la table"],
  // Porte-clés : AUCUNE feuille dans le rayon Accessoires d'aucun genre
  // (relevé Mode complet) — null confirmé, pas un trou de crawl.
  "🗝️": null,

  // ── Racine Maison COMPLÈTE (re-crawl du 2026-07-09, session connectée :
  // lecture de l'état React du sélecteur, arbre entier — l'ancien relevé
  // s'arrêtait à "Cuisine"). Les 6 branches N2 qui manquaient sont ici ─────
  // Linge de maison. DÉFAUT ASSUMÉ 🛌 : housse de couette dominante
  // (Parures/Draps/Drap-housses = feuilles sœurs).
  "🛌": ["Maison", "Linge de maison", "Linge de lit", "Housses de couette"],
  "📜": ["Maison", "Linge de maison", "Linge de table"],
  // Meubles : "Mobilier de maison" est le bac générique (Meubles de rangement
  // et Accessoires de salle de bain = sœurs). Contrairement à Vinted, Beebs
  // vend bien le mobilier adulte.
  "🛋️": ["Maison", "Meubles", "Mobilier de maison"],
  "🪑": ["Maison", "Meubles", "Mobilier de maison"],
  // 🛏️ (lit/matelas MEUBLE) : "Mobilier de maison" ; la literie textile a sa
  // propre icône 🛌 ci-dessus, et Literie > Couettes/Oreillers/Surmatelas est
  // une branche distincte (couette seule → 🛌 via la regex housse/parure).
  "🛏️": ["Maison", "Meubles", "Mobilier de maison"],
  // Décoration.
  "💡": ["Maison", "Décoration", "Luminaires"],
  "🪶": ["Maison", "Décoration", "Coussins"],
  "🟫": ["Maison", "Décoration", "Tapis et paillassons"],
  // DÉFAUT ASSUMÉ : cadre/affiche/poster → "Cadres et affiches" ; "Tableaux"
  // (peinture) est la feuille sœur, non atteinte par ce défaut.
  "🖼️": ["Maison", "Décoration", "Cadres et affiches"],
  // DÉFAUT ASSUMÉ : "Décorations de fêtes" (Décorations d'anniversaire et de
  // naissance = sœurs) — pas de feuille Noël dédiée.
  "🎄": ["Maison", "Décoration", "Décorations de fêtes"],
  // Jardin et bricolage (5 feuilles, aucune sous-branche).
  "🪛": ["Maison", "Jardin et bricolage", "Perceuses et visseuses"],
  // DÉFAUT ASSUMÉ : marteau/clé/pince → "Outillage à main" (bac unique).
  "🔨": ["Maison", "Jardin et bricolage", "Outillage à main"],
  "🔧": ["Maison", "Jardin et bricolage", "Outillage à main"],
  "🔩": ["Maison", "Jardin et bricolage", "Quincaillerie"],
  "⛱️": ["Maison", "Jardin et bricolage", "Mobilier de jardin"],
  // DÉFAUT ASSUMÉ : taille-haie/sécateur/tondeuse → "Outils de jardin" (bac
  // unique, aucune feuille par outil).
  "✂️": ["Maison", "Jardin et bricolage", "Outils de jardin"],
  "🌱": ["Maison", "Jardin et bricolage", "Outils de jardin"],
  // Valises : feuille adulte dédiée (l'icône ne distingue pas l'âge).
  "🧳": ["Maison", "Valises et bagages", "Valises (adulte)"],

  // ── Absences CONFIRMÉES par le crawl complet du 2026-07-09 (5 racines,
  // 688 nœuds parcourus) — plus des "NON_CRAWLÉ" : Beebs est une marketplace
  // famille/enfant et n'a réellement aucune de ces branches ─────────────────
  // Petit électroménager = Cuiseurs/Mixeurs/Yaourtières/Machines à café/
  // Appareils de cuisson uniquement : ni bouilloire, ni aspirateur, ni gros
  // électroménager, ni entretien du linge, ni soins électriques.
  "🫖": null, "🧹": null, "🧊": null, "♨️": null, "🍞": null, "🍟": null,
  "🧺": null, "🧼": null, "🌀": null, "🌡️": null, "💇": null, "🪒": null,
  // Déco : ni miroir, ni bougie, ni vase, ni horloge (11 feuilles relevées).
  "🪞": null, "🕯️": null, "🏺": null, "🕰️": null, "🪟": null, "🪴": null,
  // Bricolage : ni scie, ni échelle, ni peinture, ni mesure (5 feuilles).
  "🪚": null, "🪜": null, "🖌️": null, "📏": null, "🔥": null,
  // Aucune racine High-Tech adulte, Sport adulte, Musique, Collection,
  // Animaux, Auto-Moto dans tout l'arbre (5 racines : Jeux/Mode/Hygiène/
  // Puériculture/Maison).
  "📱": null, "📲": null, "📇": null, "💻": null, "🖥️": null, "⌨️": null,
  "🖱️": null, "🖨️": null, "🎧": null, "🔊": null, "📡": null, "📺": null,
  "📷": null, "🛸": null, "🔌": null, "⏱️": null,
  "🎿": null, "🎾": null, "⛳": null, "🏋️": null, "🥊": null,
  "⛺": null, "🎣": null, "🧘": null, "🥽": null, "🏀": null, "🏃": null,
  "🐴": null, "🎱": null, "🤿": null, "🏄": null, "🎽": null,
  "📦": null, // filet générique (gourde, veilleuse, objets sans feuille dédiée)
  "🎸": null, "🎻": null, "🥁": null, "🎺": null, "🎹": null, "🎤": null,
  "🎼": null, "🧵": null,
  "📮": null, "🪙": null, "📰": null, "🐕": null,
  "🏍️": null, "🛵": null, "🛞": null, "🚗": null, "🪖": null,
  // ── Icônes DÉFAUT de type (audit 2026-07-19) : Beebs (marketplace
  // famille/enfant, 5 racines) n'a ni Collection, ni Musique, ni Jardin, et
  // sa racine Maison n'offre que des feuilles trop spécifiques pour un objet
  // inconnu → null documenté, LBC/eBay prennent le relais. ──────────────────
  "🏠": null, "⚡": null, "🎵": null, "🏆": null, "🌿": null,
};

/**
 * true si l'icône est un article de la branche Mode Beebs : son chemin dépend
 * du genre (rayon Femme/Homme/Fille/Garçon/Bébé obligatoire, pas de rayon
 * mixte dans l'arbre). Même contrat que vintedGenreRequired.
 * @param {string} icon — emoji retourné par detectObjectIcon
 */
export function beebsGenreRequired(icon) {
  if (Object.prototype.hasOwnProperty.call(HORS_MODE, icon)) return false;
  return Object.prototype.hasOwnProperty.call(MODE, icon);
}

/**
 * @param {string} icon  — emoji retourné par detectObjectIcon
 * @param {string} genre — valeur Beebs DIRECTE : "Femme" | "Homme" | "Fille"
 *   | "Garçon" | "Bébé" (les 5 rayons réels, désormais proposés tels quels
 *   par le stepper Beebs). "Enfant"/"Mixte"/"" → null : indécidable ou sans
 *   rayon Beebs correspondant, jamais résolu par défaut.
 * @returns {string[]|null} chemin catalogue Beebs, ou null si non mappé
 *   (icône hors périmètre Mode, genre absent ou non-Beebs)
 */
/**
 * Statut de support Beebs — dérivé des tables (même contrat que
 * vintedCategoryStatus). ⚠️ "unmapped" est fréquent ici : le crawl Beebs est
 * PARTIEL (racine Maison interrompue, cf. NON_CRAWLÉ en fin de HORS_MODE) —
 * ne pas le confondre avec une absence confirmée.
 */
export function beebsCategoryStatus(icon) {
  if (Object.prototype.hasOwnProperty.call(HORS_MODE, icon)) {
    return HORS_MODE[icon] ? "supported" : "unavailable";
  }
  const entry = MODE[icon];
  if (!entry) return "unmapped";
  return Object.values(entry).some(Boolean) ? "supported" : "unavailable";
}

export function getBeebsCategoryPath(icon, genre) {
  // HORS_MODE d'abord : branches non genrées et hors périmètre — null
  // documenté, quel que soit le genre.
  if (Object.prototype.hasOwnProperty.call(HORS_MODE, icon)) return HORS_MODE[icon];
  const entry = MODE[icon];
  if (!entry || !genre) return null;
  return entry[genre] ?? null;
}
