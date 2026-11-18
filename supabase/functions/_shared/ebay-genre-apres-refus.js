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
// l'ARTICLE —
//   1. le genre écrit dans le texte (_shared/genre-du-texte.js, règle du 30/10) ;
//   2. un genre choisi par la personne (rayon choisi, public choisi à l'écran) : gardé ;
//   3. le public de l'étagère Vinted où le VENDEUR l'a rangé (relevé : attribut categorie_vinted d'un relevé, sinon la
//      colonne vinted_catalog_id — lue par _shared/vinted-branche.ts, l'identifiant fait foi, jamais un libellé), quand
//      le genre deviné le contredit (ou manque) ;
//   4. sinon le genre d'avant, au caractère près.
// Et le rayon que NOTRE correspondance (icône + ce genre, src/utils/ebayCategories.js) donne rejoint les candidates, en
// tête, s'il n'est pas un rayon refusé. L'IA tranche toujours ; « aucune » reste une réponse.
// ⛔ Hors refus, ce module n'est jamais appelé : le chemin des autres tâches ne change pas.
// ⛔ La règle de l'app (faire primer l'étagère sur toutes les copies) n'est PAS ici : décision de Nico à prendre.
// Pur (Deno + Node), la lecture de l'étagère est injectée : scripts/ebay-genre-apres-refus-selftest.mjs.
import { genreDuTexte } from "./genre-du-texte.js";

const plier = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const PUBLIC = {
  femme: { age: "adulte", sexe: "f" }, homme: { age: "adulte", sexe: "m" },
  fille: { age: "enfant", sexe: "f" }, garcon: { age: "enfant", sexe: "m" },
  bebe: { age: "enfant", sexe: null }, enfant: { age: "enfant", sexe: null },
};

/** Le genre `g` contredit-il le public `cible` ? Vide, « Mixte », inconnu : oui (à remplir). Cible inconnue : non. */
export function genreContredit(g, cible) {
  const a = PUBLIC[plier(g)], b = PUBLIC[plier(cible)];
  if (!b) return false;
  if (!a) return true;
  if (a.age !== b.age) return true;
  return Boolean(a.sexe && b.sexe && a.sexe !== b.sexe);
}

const SOURCE_RELEVE = /^(capture|vinted|releve)/;
const idValide = (v) => {
  const n = Number(v && typeof v === "object" ? v.v : v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * L'étagère Vinted de la fiche et le public qu'elle porte : l'attribut d'un RELEVÉ d'abord, sinon la colonne
 * `vinted_catalog_id` (écrite par la synchronisation Vinted). `brancheVinted(id)` → « Femme » | « Homme » | « Enfant »
 * | « Fille » | « Garçon » | null (_shared/vinted-branche.ts). null = aucune étagère genrée connue.
 * @param {{ categorieVinted?: unknown, colonne?: unknown }} fiche
 * @param {(id: unknown) => string | null} brancheVinted
 * @returns {{ genre: string, via: string, id: number } | null}
 */
export function etagereDeLaFiche({ categorieVinted = null, colonne = null } = {}, brancheVinted) {
  if (typeof brancheVinted !== "function") return null;
  const cv = categorieVinted && typeof categorieVinted === "object" ? categorieVinted : null;
  const idAttribut = cv && SOURCE_RELEVE.test(String(cv.source ?? "")) ? idValide(cv.v) : null;
  for (const [id, d] of [[idAttribut, "attribut"], [idValide(colonne), "colonne"]]) {
    if (!id) continue;
    const genre = brancheVinted(id);
    if (genre) return { genre: String(genre), via: `étagère Vinted ${id} (${d})`, id };
  }
  return null;
}

/**
 * Le genre du choix après refus.
 * @param {{ genre?: string|null, titre?: string, description?: string, pf?: object, etagere?: {genre: string, via: string}|null }} x
 * @returns {{ genre: string|null, source: "texte"|"choix"|"etagere_vinted"|"copie", avant: string|null, change: boolean, via?: string }}
 */
export function genreApresRefus({ genre = null, titre = "", description = "", pf = {}, etagere = null } = {}) {
  const g = String(genre ?? "").trim() || null;
  const dit = genreDuTexte({ titre, description });
  if (dit) return { genre: dit, source: "texte", avant: g, change: dit !== g };
  const p = pf && typeof pf === "object" ? pf : {};
  if (String(p.categorie_source ?? "") === "choix_humain" || p.genre_du_choix || p.genre_aligne_sur_rayon) {
    return { genre: g, source: "choix", avant: g, change: false };
  }
  if (etagere?.genre && genreContredit(g, etagere.genre)) {
    return { genre: String(etagere.genre), source: "etagere_vinted", avant: g, change: true, via: etagere.via };
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
