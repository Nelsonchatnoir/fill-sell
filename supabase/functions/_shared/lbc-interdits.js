// ── Articles que Leboncoin INTERDIT : cosmétique, médicament, parapharmacie ──
// Source : https://assistance.leboncoin.info/hc/fr/articles/360000030540 (« Quelles règles doit respecter mon
// annonce ? », section « Les produits interdits », relue le 05/11/2026) : « Certains produits ou services ne sont pas
// autorisés sur le site (liste non exhaustive) : … – Cosmétique, médicament et parapharmacie … ». Aucune distinction
// neuf / entamé ; Leboncoin n'a AUCUNE catégorie Beauté (les 13 racines du formulaire de dépôt). Règle établie chez
// nous le 11/08 (5803a1a : les 4 dépôts partis en « Divers > Autres » — parfum, sérum, masques — tous refusés).
//
// (05/11, point 6 — Dylan62) Le coffret beauté rangé par Vinted en « Soins du corps » est parti en « Maison & Jardin >
// Décoration » : la règle du 11/08 ne lisait que l'ICÔNE et le TITRE (estCosmetiqueInterditeLbc,
// src/utils/lbcCategories.js) ; « coffret » n'y est volontairement pas, l'icône n'était pas cosmétique, et le rayon
// incertain a pris une suggestion de Leboncoin. Jamais un rayon faux : la catégorie VINTED de la fiche est une
// source CERTAINE (inventaire.vinted_catalog_id, écrit par la sync du dressing, le détail Vinted ou la capture —
// jamais par l'IA, même doctrine que beebs-interdits.js) ; une feuille de soin CONSOMMABLE grise Leboncoin, avec la
// raison écrite sous la case (platformProhibited).
//
// UN SEUL fichier, lu des deux côtés :
//   · l'app (src/utils/lbcCategories.js lbcCategoryStatus → platformCompat) : case Leboncoin grisée, motif sous la
//     case, l'unité n'est jamais débitée ;
//   · le serveur (get-pending-jobs) : filet sur un dépôt Leboncoin déjà en file (app d'avant, relance) — rien n'est
//     envoyé, la ligne dit pourquoi.
// ES module SANS import : chargé tel quel par Vite (app) et par Deno (fonctions).
//
// Volontairement ABSENTES (pas des cosmétiques, ou indécidables) :
//   · les ACCESSOIRES de beauté (1906 et ses feuilles 1903, 958, 962, 950, 967 ; Hommes 2055 : 1826, 1827, 971) —
//     trousse, brosse, rasoir, appareil : leur rayon vient de l'objet, jamais « Décoration » par défaut ;
//   · « Autres cosmétiques et accessoires » (153) : mélange — la règle du titre (estCosmetiqueInterditeLbc) tranche.

export const REGLE_LBC_URL = "https://assistance.leboncoin.info/hc/fr/articles/360000030540";

// Feuilles CONSOMMABLES du catalogue Vinted (docs/vinted-catalog-tree.json), libellés [fr, en].
export const CATEGORIES_INTERDITES_LBC = Object.freeze({
  // Femmes > Beauté (146)
  964: ["maquillage", "make-up"],
  152: ["parfums", "perfume"],
  948: ["soins du visage", "facial care"],
  1264: ["soins des mains", "hand care"],
  960: ["manucure", "manicure"],
  956: ["soins du corps", "body care"],
  1902: ["soins des cheveux", "hair care"],
  // Hommes > Soins (139)
  143: ["soins du visage", "facial care"],
  140: ["soins des cheveux", "hair care"],
  141: ["soins du corps", "body care"],
  142: ["soins des mains et des ongles", "hand and nail care"],
  145: ["parfums", "perfume"],
  144: ["maquillage", "make-up"],
  1863: ["coffrets de soins", "grooming sets"],
  968: ["cosmétiques", "cosmetics"],
});

/**
 * Leboncoin interdit-il cet article ? Lit la catégorie Vinted de la fiche, et elle seule (source certaine).
 * @param {{ vinted_catalog_id?: unknown }|null} article
 * @returns {null | { motif: "cosmetique", vinted_catalog_id: number, categorie: string[] }}
 */
export function verdictLbcInterdit(article) {
  const id = Number.parseInt(String(article?.vinted_catalog_id ?? ""), 10);
  if (!Number.isFinite(id)) return null;
  const categorie = CATEGORIES_INTERDITES_LBC[id];
  return categorie ? { motif: "cosmetique", vinted_catalog_id: id, categorie: [...categorie] } : null;
}

/** La phrase de la règle (case grisée de l'app, ligne d'un dépôt retenu par le serveur).
 * @param {{ categorie?: string[] } | null} [verdict]
 * @param {string} [lang] */
export function messageLbcInterdit(verdict = null, lang = "fr") {
  const en = lang === "en";
  const libelle = Array.isArray(verdict?.categorie) ? verdict.categorie[en ? 1 : 0] : null;
  return en
    ? `Leboncoin doesn't allow cosmetics, medicines or pharmacy products (a Leboncoin rule)${libelle ? `: this item (${libelle}) can't go to Leboncoin` : ""}. The other platforms remain available.`
    : `Leboncoin interdit la vente de cosmétiques, médicaments et produits de parapharmacie (règle de Leboncoin)${libelle ? ` : cet article (${libelle}) ne peut pas partir sur Leboncoin` : ""}. Les autres plateformes restent disponibles.`;
}
