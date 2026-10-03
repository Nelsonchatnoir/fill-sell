// ═══════════════════════════════════════════════════════════════════════════
// VINTED — LE FORMAT DU COLIS, CHOISI PAR LE VENDEUR (2026-09-27, Louis)
// ═══════════════════════════════════════════════════════════════════════════
// « Je veux choisir moi-même la taille du colis Vinted. »
//
// LES VALEURS SONT CELLES DU FORMULAIRE, JAMAIS INVENTÉES :
//   · l'id ↔ libellé est la table de vinted.js (VINTED_PACKAGE_SIZES_PAR_ID),
//     relevée sur le formulaire réel : 1 Petit / 2 Moyen / 3 Grand (05/08),
//     8-10 = 5/10/20 kg (« Vases », 16/08), 11-14 = 5/10/20/30 kg
//     (« Nacelles », 16/08) ;
//   · la GRILLE d'un rayon (laquelle des trois) est celle VUE sur de vraies
//     annonces de ce rayon (arbres/vintedColisGrilles.js, généré). Un rayon
//     jamais observé → aucun choix proposé, Vinted garde la main ;
//   · seule extension de ce relevé : les rayons Femmes et Hommes, 4 224
//     formats observés sur 255 rayons, ZÉRO hors Petit/Moyen/Grand — c'est
//     aussi la grille que vinted.js suppose en y posant « Petit » d'office.
//     « Enfants » n'y est PAS : la puériculture y sert des kilos.
//
// ⛔ SANS CHOIX, RIEN NE CHANGE : aucune clé n'est posée sur le job, et
//    vinted.js fait exactement ce qu'il faisait (« Petit » sur la Mode, le
//    format recommandé par Vinted ailleurs).
// ⛔ VINTED SEULEMENT : les formats Leboncoin/Beebs (`format_colis`) ne sont
//    ni lus ni écrits ici.
// ⛔ LA REPUBLICATION n'a rien à faire : elle recrée l'annonce avec l'id de
//    colis CAPTURÉ sur l'annonce en ligne (background.js, packageSizeId) —
//    c'est-à-dire le format choisi ici.
//
// L'extension sait déjà poser un id : `platform_fields.packageSizeId` (et
// son libellé `packageSize`) — le canal de la recréation depuis le 16/08
// (selectPackageSize : id d'abord, même libellé sous un autre id ensuite,
// sinon le format recommandé par Vinted est gardé). Aucun changement
// d'extension.
// ═══════════════════════════════════════════════════════════════════════════
import { GRILLE_PAR_CHEMIN } from "./arbres/vintedColisGrilles.js";

/** Id Vinted → libellé affiché par le formulaire (miroir de vinted.js). */
export const COLIS_VINTED = {
  1: "Petit", 2: "Moyen", 3: "Grand",
  8: "5 kg", 9: "10 kg", 10: "20 kg",
  11: "5 kg", 12: "10 kg", 13: "20 kg", 14: "30 kg",
};
const GRILLES = { PMG: [1, 2, 3], KG3: [8, 9, 10], KG4: [11, 12, 13, 14] };
const RACINES_PMG = new Set(["Femmes", "Hommes"]);

const cheminTexte = (chemin) =>
  Array.isArray(chemin) ? chemin.map((s) => String(s ?? "").trim()).filter(Boolean).join(" > ") : String(chemin ?? "").trim();

/** Le rayon est-il de la Mode adulte (où vinted.js pose « Petit » d'office) ? */
export function rayonModeVinted(chemin) {
  const racine = cheminTexte(chemin).split(" > ")[0];
  return RACINES_PMG.has(racine);
}

/**
 * Les formats que Vinted propose pour ce rayon, ou null si sa grille n'a
 * jamais été observée (aucun choix proposé dans ce cas).
 * @returns {{id:number, libelle:string}[] | null}
 */
export function grilleColisVinted(chemin) {
  const cle = cheminTexte(chemin);
  if (!cle) return null;
  const genere = GRILLE_PAR_CHEMIN.get(cle);
  if (genere && GRILLES[genere]) return GRILLES[genere].map((id) => ({ id, libelle: COLIS_VINTED[id] }));
  // (03/10, point 13) La grille RELEVÉE par l'extension sur le formulaire de
  // CE rayon (catalogue, chargée par chargerGrilleColisRelevee) passe avant le
  // défaut de la Mode : c'est ce que Vinted a réellement offert.
  const relevee = GRILLES_RELEVEES.get(cle);
  if (relevee?.length) return relevee;
  const ids = rayonModeVinted(cle) ? GRILLES.PMG : null;
  return ids ? ids.map((id) => ({ id, libelle: COLIS_VINTED[id] })) : null;
}

// ── LES GRILLES RELEVÉES PAR L'EXTENSION (03/10, point 13, Louis) ───────────
// 8 des 20 publications Vinted de Louis tombaient dans des rayons inconnus de
// la table générée (« Petits appareils de cuisine », « Autres rangements ») :
// la carte ne proposait rien, Vinted choisissait seul. L'extension (0.6.90)
// range les formats offerts par le formulaire au catalogue
// (platform_category_aspects vinted / package_size, « id|libellé ») ; la carte
// les relit ici. Cache par rayon, le temps de la session.
const GRILLES_RELEVEES = new Map();

/** « 11|5 kg » → { id: 11, libelle: "5 kg" } (le libellé seul ne suffit pas : « 5 kg » existe sous 8 et 11). */
export function grilleReleveeDepuisOptions(options) {
  const vus = new Set();
  return (Array.isArray(options) ? options : [])
    .map((o) => { const m = String(o ?? "").match(/^(\d+)\|(.+)$/); return m ? { id: Number(m[1]), libelle: m[2].trim() } : null; })
    .filter((g) => g && g.id > 0 && g.libelle && !vus.has(g.id) && vus.add(g.id));
}

/** Charge (une fois par rayon) la grille relevée au catalogue ; rend la grille du rayon. */
export async function chargerGrilleColisRelevee(supabase, chemin) {
  const cle = cheminTexte(chemin);
  if (!cle || GRILLE_PAR_CHEMIN.has(cle) || GRILLES_RELEVEES.has(cle) || !supabase) return grilleColisVinted(chemin);
  try {
    const { data } = await supabase.from("platform_category_aspects").select("allowed_values")
      .eq("platform", "vinted").eq("category_key", cle).eq("field_key", "package_size").maybeSingle();
    const g = grilleReleveeDepuisOptions(data?.allowed_values);
    GRILLES_RELEVEES.set(cle, g);
  } catch { /* lecture ratée : la carte garde son comportement habituel */ }
  return grilleColisVinted(chemin);
}

/** Le choix rangé sur la fiche (attributs.colis_vinted, source manuel) : id > 0, 0 = « Vinted choisit », null = rien. */
export function colisVintedDeLaFiche(attributs) {
  const a = attributs && typeof attributs === "object" ? attributs.colis_vinted : null;
  if (!a || typeof a !== "object" || a.source !== "manuel") return null;
  const id = Number(a.v);
  return Number.isInteger(id) && id >= 0 ? id : null;
}

/**
 * Ce que la carte affiche, et ce que le job emportera.
 * `pf` = platform_fields de la copie Vinted. `packageSizeId` > 0 = choix fait
 * ici ; 0 = « Vinted choisit », choisi ici ; absent = on relit la fiche.
 * @returns {{id:number, libelle:string, origine:"choix"|"fiche"} | null} null = comportement habituel
 */
export function colisVintedRetenu({ pf, chemin, attributsFiche = null }) {
  const grille = grilleColisVinted(chemin);
  if (!grille) return null;
  const dansGrille = (id) => grille.find((g) => g.id === id) ?? null;
  const brut = pf?.packageSizeId;
  if (brut !== undefined && brut !== null && brut !== "") {
    const g = dansGrille(Number(brut));
    return g ? { ...g, origine: "choix" } : null;
  }
  const fiche = colisVintedDeLaFiche(attributsFiche);
  const g = fiche ? dansGrille(fiche) : null;
  return g ? { ...g, origine: "fiche" } : null;
}

/**
 * Au clic Publier : pose (ou retire) le format sur la copie Vinted du job, et
 * dit ce qu'il faut ranger sur la fiche. MUTE `pf`.
 *   · choix fait ici, dans la grille du rayon PUBLIÉ → packageSizeId +
 *     packageSize ; rangé sur la fiche ;
 *   · « Vinted choisit » fait ici → clés retirées (comportement habituel) ;
 *     rangé sur la fiche (v = 0) pour ne plus reprendre l'ancien choix ;
 *   · rien fait ici → le choix de la fiche s'il est dans la grille, sinon
 *     rien (comportement habituel) ; rien n'est rangé ;
 *   · choix hors de la grille du rayon publié (rayon changé depuis) → retiré,
 *     comportement habituel, rien n'est rangé.
 * @returns {{ranger: {v:number, libelle:string|null} | null}}
 */
export function colisVintedPourJob(pf, attributsFiche = null) {
  if (!pf || typeof pf !== "object") return { ranger: null };
  const brut = pf.packageSizeId;
  const choixIci = brut !== undefined && brut !== null && brut !== "";
  const grille = grilleColisVinted(pf.categoryPath);
  if (choixIci) {
    // Clés posées par la carte : retirées, puis reposées seulement si valides.
    delete pf.packageSizeId;
    delete pf.packageSize;
    const id = Number(brut);
    if (id === 0) return { ranger: { v: 0, libelle: null } };
    const g = grille?.find((x) => x.id === id);
    if (!g) return { ranger: null };
    pf.packageSizeId = g.id;
    pf.packageSize = g.libelle;
    return { ranger: { v: g.id, libelle: g.libelle } };
  }
  const fiche = colisVintedDeLaFiche(attributsFiche);
  const g = fiche ? grille?.find((x) => x.id === fiche) : null;
  if (g) {
    pf.packageSizeId = g.id;
    pf.packageSize = g.libelle;
  }
  return { ranger: null };
}
