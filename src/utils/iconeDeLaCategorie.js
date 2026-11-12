// ═══════════════════════════════════════════════════════════════════════════
// L'ICÔNE SE DÉDUIT DE L'IDENTIFIANT DE CATÉGORIE, PAS D'UN MOT (12/11, Nico, points 1b et 1d-iii)
// ═══════════════════════════════════════════════════════════════════════════
// Deux défauts prouvés le 12/11, une seule cause : l'icône (le pivot dont dérivent les rayons de quatre
// plateformes) écoutait un MOT quand un IDENTIFIANT de catégorie disait autre chose.
//
// 1b — compte c7c382b7, fiches Lens EN ANGLAIS (« knitted wool jumper, blue, EU M », « long herringbone coat »,
//   « London blue track trousers ») : aucune règle française ne connaît ces mots → repli du TYPE de la fiche,
//   `CAT_DEFAULT_ICONS['Mode'] = 👗` (shared.js). Pendant ce temps le rayon RÉSOLU (identifiant Vinted 267
//   « Hommes › … › Pulls », Depop « menswear/tops/jumpers ») disait « pull d'homme ». La garde de genre jugeait sur
//   la robe → « Homme n'est pas un rayon Vinted pour cet article », Publier grisé ; eBay rangé en « Robes ».
//   ⛔ Décision de Nico : PAS de lecture de la copie française, PAS de mots anglais ajoutés aux règles. Le repli 👗
//   (et tout repli de type) cède devant un rayon résolu : l'icône se lit sur l'identifiant de ce rayon, par la table
//   INVERSE des tables icône → catégorie qui existent déjà (vintedCategories, ebayCategories, beebsCategories,
//   lbcCategories ; depopCategories l'a déjà, identifiant par identifiant : depopVersInterne). Aucune langue n'entre :
//   un identifiant Vinted, eBay ou Depop est le même quelle que soit la langue du compte et de la fiche.
//
// 1d-iii — compte cfdfda6f, « Road Top 12,3" Écran CarPlay pour BMW… » : le mot « top » du titre (une marque
//   d'écrans auto) → 👕 → Leboncoin « Mode › Vêtements », alors que le catalogue Vinted de la fiche (3789,
//   Électronique › … › GPS) ET le mot de l'IA (« autoradio » → 🚗) disaient autre chose. Le mot du titre était
//   souverain (règle du 19/09). Décision de Nico du 12/11 : il CÈDE quand le catalogue Vinted ET l'IA le
//   contredisent — deux sources contre un mot. Même classe : « Paire d'assiettes … Derby » (3829, IA « assiette »)
//   partie en « Mode › Chaussures », « Cassette VHS Nikita … Jean Reno » (3048, IA « cassette vhs ») en 👖.
//   Et le mot de la DESCRIPTION (passe 2, le filet) cède au seul catalogue : « Jouets musicaux en bois » (3358,
//   Enfants › Jeux et jouets), « … + sac de rangement » → 👜.
//   ⛔ Ce n'est PAS un veto « famille Vinted ≠ famille Leboncoin » : un autoradio range en Électronique chez Vinted
//   et en « Véhicules › Équipement auto » chez Leboncoin — les deux sont justes (42 cas mesurés). Rien ici ne
//   juge un CHEMIN : seule l'icône est arbitrée, et seulement quand le mot du titre est contredit des deux côtés.
//
// Tout est pur (aucun accès réseau, aucun état) : scripts/icone-et-genre-fiche-anglaise-selftest.mjs et
// scripts/categorie-catalogue-vinted-selftest.mjs l'éprouvent sur les cas réels.
// ═══════════════════════════════════════════════════════════════════════════

import { ALL_OBJECT_ICONS } from "./shared";
import { getVintedCategoryPath } from "./vintedCategories";
import { getBeebsCategoryPath } from "./beebsCategories";
import { getEbayCategoryId, getEbayCategoryPath } from "./ebayCategories";
import { getLbcCategoryPath } from "./lbcCategories";
import { depopVersInterne } from "./depopCategories";
import { familleDeChemin, famillesCompatibles } from "./familleCategorie";

// Les genres sous lesquels les tables icône → catégorie rangent un article (les cinq rayons humains, « Enfant »,
// « Mixte », et sans genre). La table inverse les parcourt tous : une icône vaut pour TOUS ses rayons.
const GENRES = ["Femme", "Homme", "Fille", "Garçon", "Bébé", "Enfant", "Mixte", ""];

// Profondeur minimale du nœud commun pour qu'un rayon dise UNE icône. En dessous, le nœud est un rayon de genre
// (« Hommes › Vêtements », « Mode › Homme › Vêtements (homme) », « Vêtements, accessoires › Homme : … › Homme :
// vêtements ») partagé par toutes les icônes de vêtements : il ne nomme aucun objet. Leboncoin n'a que deux
// niveaux (« Mode › Vêtements ») : ses feuilles sont presque toutes partagées, et un nœud partagé ne dit rien.
// Depop : null — il range par IDENTIFIANT « département/groupe/type », lu ligne à ligne (depopVersInterne), jamais
// par un nœud commun.
const PROFONDEUR_MIN = { vinted: 3, ebay: 3, beebs: 3, opla: 3, leboncoin: 2, depop: null };

const CHEMIN_DE = {
  vinted: (icone, genre) => getVintedCategoryPath(icone, genre, ""),
  beebs: (icone, genre) => getBeebsCategoryPath(icone, genre),
  ebay: (icone, genre) => getEbayCategoryPath(icone, genre),
  leboncoin: (icone) => getLbcCategoryPath(icone),
};

let _index = null;
/** La table INVERSE, construite une fois : par plateforme, chaque (icône, genre) → son chemin (et son identifiant
 *  eBay). Elle se recalcule à partir des tables icône → catégorie : elle ne peut pas diverger d'elles. */
function index() {
  if (_index) return _index;
  const sortie = { vinted: [], beebs: [], ebay: [], leboncoin: [], ebayParId: new Map() };
  for (const icone of ALL_OBJECT_ICONS) {
    for (const plateforme of ["vinted", "beebs", "ebay", "leboncoin"]) {
      const vus = new Set();
      for (const genre of plateforme === "leboncoin" ? [""] : GENRES) {
        let chemin = null;
        try { chemin = CHEMIN_DE[plateforme](icone, genre); } catch { chemin = null; }
        if (!Array.isArray(chemin) || !chemin.length) continue;
        const cle = chemin.join(" > ");
        if (vus.has(cle)) continue;
        vus.add(cle);
        sortie[plateforme].push({ icone, chemin: chemin.map(String) });
      }
    }
    for (const genre of GENRES) {
      let id = null;
      try { id = getEbayCategoryId(icone, genre); } catch { id = null; }
      if (id == null || id === "") continue;
      const k = String(id);
      if (!sortie.ebayParId.has(k)) sortie.ebayParId.set(k, new Set());
      sortie.ebayParId.get(k).add(icone);
    }
  }
  _index = sortie;
  return sortie;
}

// ── QUAND UN RAYON VOISIN DIT L'ICÔNE, ET QUAND IL NE LE DIT PAS (mesuré sur les arbres relevés, 12/11) ──
// Les tables icône → catégorie ne rangent qu'UNE feuille par icône et par genre (🧶 Homme = « Hommes › Vêtements ›
// Sweats et pulls › Sweats »). Le rayon de la personne est souvent une feuille SŒUR (« … › Pulls et pulls à
// capuche »). Dans les rayons de VÊTEMENTS, CHAUSSURES et SACS, un groupe range un seul type d'objet (pulls,
// manteaux, pantalons…) : le nœud commun le plus profond, s'il n'est partagé qu'avec UNE icône, dit l'objet.
// Hors de la mode, NON : un groupe y range des objets différents, et la seule icône qu'il contient n'en est qu'un
// (« Outils de mesure » : 📏 mètre ruban… et les caméras thermiques ; « Couture, tricot » : 🧵 machine à coudre… et
// les laines ; « Chiens » : 🐕 gamelle… et les pulls pour chien). Hors mode, seule la feuille EXACTE de l'icône dit
// l'icône. Et dans la mode, une icône de SPÉCIALITÉ ne se lit que sur sa feuille : ⛸️ (patins) est la seule icône
// rangée sous « Chaussures de sport », qui porte aussi les chaussures de running et de football.
const SPECIALITES = new Set(["⛸️"]);

/** L'icône que désigne `chemin` : sa feuille exacte, ou — dans la mode seulement — le nœud commun le plus profond
 *  qu'il partage avec UNE seule icône. Sinon null. */
function iconeParLeChemin(plateforme, chemin) {
  const entrees = index()[plateforme];
  if (!entrees || !Array.isArray(chemin) || !chemin.length) return null;
  const c = chemin.map((s) => String(s ?? "").trim());
  const cle = c.join(" > ");
  const exactes = new Set(entrees.filter((e) => e.chemin.join(" > ") === cle).map((e) => e.icone));
  if (exactes.size) return exactes.size === 1 ? [...exactes][0] : null;
  if (familleDeChemin(plateforme, c) !== "mode") return null;
  let meilleur = 0;
  let icones = new Set();
  for (const { icone, chemin: e } of entrees) {
    if (SPECIALITES.has(icone)) continue;
    let l = 0;
    while (l < e.length && l < c.length && e[l] === c[l]) l++;
    if (l > meilleur) { meilleur = l; icones = new Set([icone]); }
    else if (l === meilleur && l > 0) icones.add(icone);
  }
  if (meilleur < (PROFONDEUR_MIN[plateforme] ?? 3) || icones.size !== 1) return null;
  return [...icones][0];
}

/**
 * L'icône d'un RAYON (identifiant de catégorie d'une plateforme), ou null si l'identifiant ne désigne pas une icône
 * sans ambiguïté. Jamais une icône devinée : un nœud partagé par deux icônes ne rend rien.
 * @param {"vinted"|"ebay"|"beebs"|"leboncoin"|"depop"|"opla"} plateforme
 * @param {{chemin?: string[]|null, id?: string|number|null}} rayon
 */
export function iconeDuRayon(plateforme, rayon) {
  const id = rayon?.id != null ? String(rayon.id).trim() : "";
  const chemin = Array.isArray(rayon?.chemin) ? rayon.chemin : null;
  if (plateforme === "depop") {
    // Depop : l'identifiant « département/groupe/type » a déjà sa table interne (09/10), une ligne par type.
    const r = id ? depopVersInterne(id) : null;
    return r?.icone ?? null;
  }
  if (plateforme === "ebay" && id) {
    const icones = index().ebayParId.get(id);
    if (icones?.size === 1) return [...icones][0];
  }
  if (!CHEMIN_DE[plateforme]) return null;
  return iconeParLeChemin(plateforme, chemin);
}

// L'ordre de lecture des rayons : les plateformes qui rangent par IDENTIFIANT et le plus finement d'abord.
const ORDRE = ["vinted", "depop", "ebay", "beebs", "leboncoin", "opla"];
// Les rayons qui DÉPENDENT de l'icône (familles jeu vidéo, œuvre, vêtement traditionnel : posés parce que l'icône
// valait 🎮, 🖼️ ou un vêtement) ne la décident pas en retour.
const REGLE_DEPENDANT_DE_L_ICONE = /^(?:jeux_video_|oeuvre_|vetement_traditionnel_)/;

/**
 * Les rayons connus d'un article, dans l'ordre où ils font foi pour l'icône :
 *   1. le rayon CHOISI par la personne, sur n'importe quelle plateforme (son geste) ;
 *   2. le catalogue Vinted de la fiche (`inventaire.vinted_catalog_id`, la catégorie déclarée sur la plateforme qui
 *      héberge déjà l'annonce) ;
 *   3. le rayon RÉSOLU par le mot ou par l'IA (`categorie_par_mot`), jamais un chemin posé depuis l'icône elle-même.
 * @param {object} p
 * @param {object} [p.edited]           les copies (`edited[p].rayon_choisi`)
 * @param {object} [p.pfParPlateforme]  le résultat de la résolution (`pf.categorie_par_mot`)
 * @param {{id?: any, chemin?: string[]|null}|null} [p.catalogueVinted]
 */
export function rayonsPourLIcone({ edited = null, pfParPlateforme = null, catalogueVinted = null } = {}) {
  const sortie = [];
  for (const p of ORDRE) {
    const choix = edited?.[p]?.rayon_choisi;
    if (Array.isArray(choix?.chemin) && choix.chemin.length) {
      sortie.push({ plateforme: p, chemin: choix.chemin, id: choix.id ?? null, origine: "choix" });
    }
  }
  if (catalogueVinted?.id != null && Array.isArray(catalogueVinted?.chemin) && catalogueVinted.chemin.length) {
    sortie.push({ plateforme: "vinted", chemin: catalogueVinted.chemin, id: String(catalogueVinted.id), origine: "catalogue_vinted" });
  }
  for (const p of ORDRE) {
    const r = pfParPlateforme?.[p]?.categorie_par_mot;
    if (!Array.isArray(r?.chemin) || !r.chemin.length) continue;
    if (r.famille_jeu_video || REGLE_DEPENDANT_DE_L_ICONE.test(String(r.regle ?? ""))) continue;
    sortie.push({ plateforme: p, chemin: r.chemin, id: r.id ?? null, origine: "resolu" });
  }
  return sortie;
}

/** La première icône que ces rayons désignent sans ambiguïté : { icone, plateforme, origine, chemin } ou null. */
export function iconeDesRayons(rayons) {
  for (const r of Array.isArray(rayons) ? rayons : []) {
    const icone = iconeDuRayon(r.plateforme, r);
    if (icone) return { icone, plateforme: r.plateforme, origine: r.origine, chemin: r.chemin ?? null, id: r.id ?? null };
  }
  return null;
}

/** La famille d'une icône, lue sur la taxonomie Leboncoin (la même que le garde-fou de catégorie). */
export function familleDeLIcone(icone) {
  if (!icone) return null;
  return familleDeChemin("leboncoin", getLbcCategoryPath(icone) ?? []);
}

/** La famille du catalogue Vinted de la fiche, ou null s'il est inconnu. */
export function familleDuCatalogueVinted(catalogueVinted) {
  const chemin = catalogueVinted?.chemin;
  if (!Array.isArray(chemin) || !chemin.length) return null;
  return familleDeChemin("vinted", chemin);
}

// ⛔ L'ÉQUIPEMENT AUTO ÉLECTRONIQUE (autoradio, dashcam, GPS, démarreur) est « Électronique » chez Vinted et
// « Véhicules › Équipement auto » chez Leboncoin : les deux sont justes (rejeu du 12/11 : 15 publications Leboncoin de
// 60 j rangées en Équipement auto avec un catalogue Vinted Électronique). Ici, ces deux familles ne se contredisent
// pas — sinon « … dashcam … voiture » (catalogue 3074) perdait son 🚗 pour 📷.
const SE_RECOUVRENT = [["electronique", "vehicules"]];
/** Deux familles CONNUES et incompatibles. Une famille inconnue ne contredit rien. */
function contredit(a, b) {
  if (!a || !b) return false;
  if (SE_RECOUVRENT.some(([x, y]) => (a === x && b === y) || (a === y && b === x))) return false;
  return !famillesCompatibles(a, b);
}

/**
 * Le mot du TITRE cède-t-il ? Oui seulement quand le catalogue Vinted ET le mot de l'IA (passé à nos règles)
 * contredisent tous les deux sa famille. Une seule source contre le titre : le titre garde la main (règle du 19/09).
 * Rend l'icône qui le remplace (celle du mot de l'IA), ou null.
 */
export function iconeQuandLeTitreCede({ iconeTitre, iconeIa, familleCatalogue }) {
  if (!iconeTitre || !iconeIa || iconeIa === iconeTitre) return null;
  const fTitre = familleDeLIcone(iconeTitre);
  if (!contredit(fTitre, familleCatalogue)) return null;
  if (!contredit(fTitre, familleDeLIcone(iconeIa))) return null;
  return iconeIa;
}

/** Le mot de la DESCRIPTION (passe 2) est-il contredit par le catalogue Vinted de la fiche ? */
export function passe2ContrediteParLeCatalogue(iconePasse2, familleCatalogue) {
  return contredit(familleDeLIcone(iconePasse2), familleCatalogue);
}

export const _internes = { index, iconeParLeChemin, PROFONDEUR_MIN, ORDRE, SPECIALITES };
