// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// (18/11, point 5 de Nico — 2f8b09d2) APRÈS UN REFUS, LE RAYON eBAY SE CHOISIT AVEC LE GENRE DE L'ARTICLE
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Cas (compte 2f8b09d2, tâche de2b3a54, 17/11 22:28) : « Parka longue NikeLab ACG Gore-Tex taille S », rangée par son
// vendeur dans l'étagère Vinted 2551 « Hommes › … › Vestes coupe-vent ». La copie eBay sort de la rédaction avec un
// genre DEVINÉ « Femme » (consigne « tranche toujours ») ; Beebs et Leboncoin, eux, partent en Homme. Notre
// correspondance (icône 🧥 + genre) donne donc « Femme : … › Manteaux, vestes et gilets » (63862) ; la vérification
// de l'app le refuse (incoherent) ; le worker retirait 63862 des suggestions d'eBay et demandait le plus proche… avec
// le genre « Femme » : « Homme : … › Manteaux, vestes et gilets » (57988), DANS la liste d'eBay, était écarté
// (« respecte le genre indiqué »). Aucun rayon sûr, en pause pour toujours.
// RÈGLE (tous les comptes, voie API, SEULEMENT après un refus de l'app) : le genre qui sert au choix est celui de
// l'ARTICLE — (ordre du 19/11, décision de Nico)
//   0. (19/11 midi) un GENRE tapé ou choisi par la personne (carte eBay, public choisi à l'écran) : gardé, avant tout ;
//   1. un genre choisi par la personne (rayon choisi, public choisi à l'écran) : gardé, la règle d'avant s'applique ;
//   2. le public de l'étagère Vinted où le VENDEUR l'a rangé (relevé : attribut categorie_vinted d'un relevé, sinon la
//      colonne vinted_catalog_id — lue par _shared/vinted-branche.ts, l'identifiant fait foi, jamais un libellé), quand
//      le genre deviné le contredit (ou manque) — _shared/genre-etagere-vinted.js ;
//   3. sans étagère genrée : le genre écrit dans le texte (_shared/genre-du-texte.js, règle du 30/10) ;
//   4. sinon le genre d'avant, au caractère près.
// Et le rayon que NOTRE correspondance (icône + ce genre, src/utils/ebayCategories.js) donne rejoint les candidates, en
// tête, s'il n'est pas un rayon refusé. L'IA tranche toujours ; « aucune » reste une réponse.
// ⛔ Hors refus, ce module n'est jamais appelé : le chemin des autres tâches ne change pas.
// (19/11, décision de Nico) L'étagère Vinted fait foi AVANT toute déduction, dans l'app comme ici : la règle (et la
// lecture de l'étagère) vivent dans _shared/genre-etagere-vinted.js, une seule fois — l'étagère passe donc désormais
// AVANT le genre lu dans le texte (titre et description de la copie, réécrits par l'IA). Le choix de la personne reste
// au-dessus ; sans étagère genrée, l'ordre d'avant (texte › choix › copie), au caractère près.
// Pur (Deno + Node), la lecture de l'étagère est injectée : scripts/ebay-genre-apres-refus-selftest.mjs,
// scripts/ebay-genre-etagere-selftest.mjs.
import { genreDuTexte } from "./genre-du-texte.js";
// (19/11 midi) genreSaisiParLaPersonne (dans genreAvantDeduction) : le genre tapé dans la carte eBay passe avant tout.
import { genreAvantDeduction } from "./genre-etagere-vinted.js";
// Lus par ebay-api-worker depuis ce module (import du 18/11) : la définition est dans la règle commune.
export { genreContredit, etagereDeLaFiche } from "./genre-etagere-vinted.js";

const plier = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Le genre du choix après refus.
 * @param {{ genre?: string|null, titre?: string, description?: string, pf?: object, etagere?: {genre: string, via: string}|null }} x
 * @returns {{ genre: string|null, source: "texte"|"choix"|"etagere_vinted"|"copie", avant: string|null, change: boolean, via?: string }}
 */
export function genreApresRefus({ genre = null, titre = "", description = "", pf = {}, etagere = null } = {}) {
  const g = String(genre ?? "").trim() || null;
  // (19/11) Le genre tapé ou choisi par la personne (trace de la carte eBay, public choisi à l'écran) d'abord, puis
  // l'étagère, puis le texte (genreAvantDeduction, la règle commune) ; après un refus, un genre vide se remplit
  // toujours par l'étagère (genreRequis), comme le 18/11.
  const e = genreAvantDeduction({ genre: g, pf, etagere, genreRequis: true });
  if (e) return { genre: e.genre, source: e.source, avant: g, change: e.change, ...(e.via ? { via: e.via } : {}) };
  const dit = genreDuTexte({ titre, description });
  if (dit) return { genre: dit, source: "texte", avant: g, change: dit !== g };
  const p = pf && typeof pf === "object" ? pf : {};
  if (String(p.categorie_source ?? "") === "choix_humain" || p.genre_du_choix || p.genre_aligne_sur_rayon) {
    return { genre: g, source: "choix", avant: g, change: false };
  }
  return { genre: g, source: "copie", avant: g, change: false };
}

const cle = (c) => (Array.isArray(c) ? c.map(plier).filter(Boolean).join(" > ") : "");

/**
 * Le rayon de NOTRE correspondance (icône + genre retenu), s'il n'est pas un rayon refusé. null sinon.
 * @param {{ icone?: string|null, genre?: string|null, refuses?: string[][], idRefuse?: string|null,
 *           correspondance: (icone: string, genre: string) => ({ id: string, chemin: string[] } | null) }} x
 */
export function rayonDeLaCorrespondance({ icone = null, genre = null, refuses = [], idRefuse = null, correspondance } = {}) {
  if (!icone || !genre || typeof correspondance !== "function") return null;
  const r = correspondance(String(icone), String(genre));
  if (!r?.id || !Array.isArray(r.chemin) || !r.chemin.length) return null;
  if (String(r.id) === String(idRefuse ?? "") || (refuses ?? []).some((c) => cle(c) === cle(r.chemin))) return null;
  return { id: String(r.id), chemin: r.chemin.map(String) };
}

/** Les candidates après refus : celle de la correspondance en tête (une seule fois), puis les suggestions d'eBay. */
export function avecCandidat(restantes, candidat) {
  const liste = Array.isArray(restantes) ? restantes : [];
  if (!candidat) return liste;
  return [candidat, ...liste.filter((s) => String(s.id) !== String(candidat.id))];
}
