// ═══════════════════════════════════════════════════════════════════════════
// LES CHAMPS PARTAGÉS ET LEURS CORRESPONDANCES PAR PLATEFORME
// (refonte du stepper, 24/09/2026 — extrait tel quel de ListingPreviewScreen)
// ═══════════════════════════════════════════════════════════════════════════
// Ces tables vivaient en tête de components/ListingPreviewScreen.jsx. Elles
// sont sorties ICI, sans changer une valeur, pour deux raisons :
//   · le stepper (ancien comme nouveau) les lit ;
//   · la publication en masse les lira aussi, en boucle, sans monter un écran.
// ⛔ Aucune logique nouvelle dans ce fichier : c'est un déménagement. Les
//    commentaires d'origine sont conservés là où ils expliquent une décision.
// Prouvé par scripts/publication-moteur-selftest.mjs.

// Valeur canonique pour un objet sans marque (meubles, artisanat, lots…).
// C'est le libellé que les plateformes attendent — Vinted et eBay ont tous deux
// une entrée « Sans marque » dans leur référentiel de marques. On l'envoie donc
// telle quelle : la garde Marque reste satisfaite sans rien inventer.
export const NO_BRAND_VALUE = "Sans marque";

export const SHARED_FIELD_KEYS = ["taille", "couleur", "matiere", "marque"];
// PROPAGATION : qui reçoit la valeur répliquée — suit les schémas/handlers
// réels (taille inclut leboncoin : leboncoin.js remplit la Pointure,
// critère OBLIGATOIRE sur Mode>Chaussures, depuis fields.taille).
export const SHARED_PROPAGATION = {
  taille:  ["vinted", "beebs", "leboncoin", "ebay", "opla"],
  couleur: ["vinted", "beebs", "ebay", "opla"],
  matiere: ["vinted", "beebs", "leboncoin", "ebay", "opla"],
  marque:  ["vinted", "beebs", "leboncoin", "ebay", "opla"],
};
// GARDE : qui peut BLOQUER la publication si le champ manque — mémoire des
// périmètres historiques (le repli statique est mort le 02/09, la garde est
// data-driven), conservée telle quelle.
export const SHARED_GUARD = {
  taille:  ["vinted", "beebs", "ebay"],
  couleur: ["vinted", "beebs", "ebay"],
  matiere: ["beebs", "leboncoin", "ebay"],
  marque:  ["vinted", "beebs", "leboncoin", "ebay"],
};
// Icônes beauté PRODUIT (mêmes 4 que generate-listing).
export const BEAUTY_PRODUCT_ICONS = ["🌸", "💄", "💅", "🧴"];

// Correspondances label d'aspect eBay → champ partagé de l'app — UNE seule
// source pour l'encart eBay (ebayRequiredStatus) ET la garde data-driven du
// bloc rouge : aucune divergence possible entre les deux.
export const EBAY_ASPECT_LABELS = {
  marque:  ["Marque"],
  taille:  ["Taille", "Pointure EU", "Pointure"],
  couleur: ["Couleur", "Couleur de la monture", "Couleur extérieure"],
  matiere: ["Matière", "Matériau", "Matériaux", "Matière de la couche extérieure", "Matière doublure externe", "Matière extérieure"],
};

// field_key du catalogue platform_category_aspects → champ partagé de l'app.
// MÊMES correspondances que genericKnownSource (qui mappe champ→valeur) — les
// deux doivent évoluer ensemble : vinted = codes d'attribut serveur, LBC =
// attribut for= des labels du wizard, Beebs = libellés exacts.
export function genericFieldToSharedKey(platform, key) {
  if (platform === "vinted") {
    return { brand: "marque", size: "taille", color: "couleur", material: "matiere" }[key] ?? null;
  }
  if (platform === "leboncoin") {
    if (/_brand$/.test(key)) return "marque";
    if (/_size$/.test(key) || key === "clothing_st" || key === "baby_age") return "taille";
    if (/_material$/.test(key)) return "matiere";
    if (/_colou?r$/.test(key)) return "couleur";
    return null;
  }
  if (platform === "beebs") {
    return { "Marque": "marque", "Pointure": "taille", "Taille": "taille", "Couleur": "couleur", "Matière": "matiere" }[key] ?? null;
  }
  // Opla (chantier du 24/09) : « size » = la taille de l'article, dans le
  // vocabulaire de SA grille (le serveur retraduit en code au départ).
  if (platform === "opla") return key === "size" ? "taille" : null;
  return null;
}

// ── Le canal générique est-il RÉELLEMENT posé sur la plateforme ? ────────────
// (2026-08-11) MIROIR EXACT des listes de saut des content scripts. Un aspect
// écrit dans pf.lbcAspects / pf.beebsAspects sous une clé que le handler SAUTE
// n'est jamais posé : la valeur est perdue en silence.
// ⚠️ Si une de ces listes change côté extension, elle doit changer ICI aussi.
export const LBC_GENERIQUE_SAUTE =
  /(_condition$|^condition$|_univers$|_universe$|_type$|^baby_clothing_category$|_size$|^clothing_st$|^baby_age$|_brand$|_material$)/;
export const BEEBS_GENERIQUE_SAUTE = new Set(
  ["Couleur", "Marque", "Pointure", "Taille", "État", "Matière", "Âge", "Format du colis"]
);
export function canalGeneriquePose(platform, key) {
  if (platform === "vinted") return true;
  if (platform === "leboncoin") return !LBC_GENERIQUE_SAUTE.test(key);
  if (platform === "beebs") return !BEEBS_GENERIQUE_SAUTE.has(key);
  return false;
}

// Canal générique de saisie manuelle des requis par plateforme : la clé du
// champ dans platform_fields de la copie, consommée telle quelle par le
// content script correspondant.
export const GENERIC_ASPECTS_PF_KEY = { vinted: "vintedAspects", leboncoin: "lbcAspects", beebs: "beebsAspects", opla: "oplaAspects" };
export const GENERIC_PLATFORM_LABELS = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", opla: "Opla" };

// Plateformes qui exigent l'adresse de remise des Réglages (2026-08-10) :
// Leboncoin la demande à chaque dépôt, Beebs réutilise LA MÊME valeur.
export const PLATEFORMES_ADRESSE_LBC = ["leboncoin", "beebs"];

export const PLATFORM_LABELS = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", ebay: "eBay", opla: "Opla" };
