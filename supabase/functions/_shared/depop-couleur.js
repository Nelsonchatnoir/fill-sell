// ═══════════════════════════════════════════════════════════════════════════
// DEPOP : LA COULEUR PAR IDENTIFIANTS — LA COPIE, PUIS LA VALEUR COMMUNE, PUIS LA FICHE (13/11/2026, point 5c)
// ═══════════════════════════════════════════════════════════════════════════
// Compte 8ac5bbda (lot « zéro problème », étape 5) : 30 publications Depop sur 49 (45 jours) sont parties SANS couleur
// alors que la fiche en porte une (`inventaire.attributs.couleur`) — 28 imports `vinted_sync` ; depuis le 07/11, 100 %
// (096856f2 « Gris », 755d1a13 « Marine », 90ff4b58 « Orange »…). Cause : la copie Depop dérive de la copie Vinted
// (deriverCopieDepop) et ne reprend la couleur que d'elle ; un import n'en porte pas, et rien ne retombait sur la fiche
// — alors que la matière, elle, y retombe (resolutionPublication.js). La copie d'une republication (copie-republication-
// depop.js) ne la reprenait que du dépôt.
// LA RÈGLE (tous les comptes, unité, lot, republication) — décision de Nico du 13/11 :
//   · la couleur Depop vient de la copie Depop, sinon de la valeur commune (encart partagé), sinon de la fiche ;
//   · la PREMIÈRE source qui porte une couleur décide : une couleur écrite sur la copie (par la personne ou la
//     rédaction) n'est jamais remplacée par celle de la fiche, et une teinte sans équivalent Depop (« Turquoise ») ne
//     laisse pas passer une autre couleur à sa place — rien plutôt qu'une voisine ;
//   · une couleur RETIRÉE à la main de la copie Depop n'est jamais reposée (depop_couleur_source « retiree_a_la_main ») ;
//   · republication : l'annonce EN LIGNE d'abord (relevé par l'API Depop) — une couleur qu'elle a posée sur Depop reste
//     la sienne (9ec3b807 : « Bleu, Marine » en ligne, fiche « Bleu ») ; en ligne SANS couleur alors que notre dépôt en
//     avait envoyé une : retirée sur Depop, on ne la remet pas ; sinon le dépôt FillSell, puis la fiche.
// PAR IDENTIFIANTS (principe de Nico du 12/11 : jamais une règle qui cherche un texte français). Ce qui part est
// l'identifiant Depop (19 couleurs, relevé du 08/10). Une couleur de la fiche est un libellé de la palette Vinted dans
// la langue du compte : il est lu en IDENTIFIANT Vinted (palettes relevées, français et italien, mêmes identifiants —
// couleur-posee-par-nous.js), puis l'identifiant Vinted donne l'identifiant Depop (DEPOP_COULEUR_PAR_ID_VINTED). Les
// autres langues passent par les synonymes exacts de la palette (src/utils/vintedColors.js : anglais, espagnol,
// allemand, néerlandais, portugais) — un seul résultat, sinon rien. Les libellés de Depop lui-même (français et anglais
// du relevé) et ses identifiants se lisent tels quels.
// Pur, sans I/O : app (depopAttributs.js, depopPublication.js), serveur (get-pending-jobs, copie-republication-depop.js).
// Verrou : scripts/depop-couleur-fiche-selftest.mjs.

import { COULEURS_VINTED_PAR_LANGUE } from "./couleur-posee-par-nous.js";
import { normalizeVintedColors } from "../../../src/utils/vintedColors.js";

/** Les 19 couleurs actives de Depop (docs/plateformes/depop/attributs.json, relevé du 08/10, ordre du relevé). */
export const DEPOP_COULEURS = Object.freeze([
  "black", "grey", "white", "brown", "tan", "cream", "yellow", "red", "burgundy", "orange",
  "pink", "purple", "blue", "navy", "green", "khaki", "multi", "silver", "gold",
]);
/** Deux couleurs au plus par annonce (max_selection du relevé). */
export const DEPOP_COULEURS_MAX = 2;

/**
 * Identifiant de couleur Vinted (GET /api/v2/colors, le même sur tous les sites Vinted) → identifiant Depop.
 * Une nuance claire ou foncée rejoint sa couleur (26 Bleu clair → blue, 28 Vert foncé → green, 29 Moutarde → yellow) ;
 * une teinte À CHEVAL sur deux couleurs Depop n'en reçoit aucune (22 Corail, 17 Turquoise) et 32 Transparence n'a pas
 * d'équivalent : null. Même table que DEPOP_COULEUR_PAR_LIBELLE (src/utils/depopAttributs.js), lue par identifiant.
 */
export const DEPOP_COULEUR_PAR_ID_VINTED = Object.freeze({
  1: "black", 3: "grey", 12: "white", 20: "cream", 4: "tan", 21: "orange", 11: "orange", 22: null, 7: "red",
  23: "burgundy", 5: "pink", 24: "pink", 6: "purple", 25: "purple", 26: "blue", 9: "blue", 27: "navy", 17: null,
  30: "green", 10: "green", 28: "green", 16: "khaki", 2: "brown", 29: "yellow", 8: "yellow", 13: "silver", 14: "gold",
  15: "multi", 32: null,
});

/** Les libellés de Depop lui-même (relevé du 08/10 : libelle_fr, libelle_en), pour lire une réponse ou une capture. */
const LIBELLES_DEPOP = Object.freeze({
  black: ["Noir", "Black"], grey: ["Gris", "Grey"], white: ["Blanc", "White"], brown: ["Marron", "Brown"],
  tan: ["Beige", "Tan"], cream: ["Crème", "Cream"], yellow: ["Jaune", "Yellow"], red: ["Rouge", "Red"],
  burgundy: ["Bourgogne", "Burgundy"], orange: ["Orange"], pink: ["Rose", "Pink"], purple: ["Violet", "Purple"],
  blue: ["Bleu", "Blue"], navy: ["Marin", "Navy"], green: ["Vert", "Green"], khaki: ["Kaki", "Khaki"], multi: ["Multi"],
  silver: ["Argent", "Silver"], gold: ["Or", "Gold"],
});
export { LIBELLES_DEPOP };

const comparable = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const IDS_DEPOP = new Set(DEPOP_COULEURS);
const DEPOP_PAR_LIBELLE = new Map();
for (const [id, libs] of Object.entries(LIBELLES_DEPOP)) for (const l of libs) DEPOP_PAR_LIBELLE.set(comparable(l), id);
// Libellé EXACT d'une palette Vinted relevée (toutes langues relevées) → identifiants Vinted (« Rosa » → 5 et 24).
const IDS_VINTED_PAR_LIBELLE = new Map();
for (const table of Object.values(COULEURS_VINTED_PAR_LANGUE)) {
  for (const [id, t] of Object.entries(table)) {
    const k = comparable(t);
    const l = IDS_VINTED_PAR_LIBELLE.get(k) ?? [];
    if (!l.includes(Number(id))) l.push(Number(id));
    IDS_VINTED_PAR_LIBELLE.set(k, l);
  }
}
const ID_VINTED_PAR_LIBELLE_FR = new Map(Object.entries(COULEURS_VINTED_PAR_LANGUE.fr).map(([id, t]) => [t, Number(id)]));

// Séparateurs d'une couleur composée (« Rouge et Blanc », « Nero e bianco », « Bleu, Marine », « Noir/Blanc »).
const SEPARATEURS = /\s+(?:et|and|e|y|und|en)\s+|[,/&+·|]/i;

/**
 * L'identifiant Depop d'UN libellé (une couleur), ou un verdict :
 *   { id } | { a_cheval: true } (la palette le connaît, Depop n'a pas d'équivalent) | { inconnu: true }.
 */
export function idDepopDuLibelle(libelle) {
  const k = comparable(libelle);
  if (!k) return { inconnu: true };
  if (IDS_DEPOP.has(k)) return { id: k };
  if (DEPOP_PAR_LIBELLE.has(k)) return { id: DEPOP_PAR_LIBELLE.get(k) };
  const parId = (ids) => {
    const cibles = [...new Set(ids.map((id) => DEPOP_COULEUR_PAR_ID_VINTED[id]).filter((v) => v !== undefined))];
    if (!cibles.length) return { inconnu: true };
    const nonNulles = cibles.filter(Boolean);
    if (nonNulles.length === 1 && cibles.length === 1) return { id: nonNulles[0] };
    if (!nonNulles.length) return { a_cheval: true };
    return { inconnu: true }; // deux couleurs Depop pour un même libellé : jamais tranché
  };
  const exacts = IDS_VINTED_PAR_LIBELLE.get(k);
  if (exacts?.length) return parId(exacts);
  // Les synonymes EXACTS de la palette (anglais, espagnol, allemand, néerlandais, portugais) : un seul résultat.
  const { colors } = normalizeVintedColors(String(libelle));
  if (colors.length === 1 && ID_VINTED_PAR_LIBELLE_FR.has(colors[0])) return parId([ID_VINTED_PAR_LIBELLE_FR.get(colors[0])]);
  return { inconnu: true };
}

/**
 * Les couleurs Depop d'une valeur (chaîne, éventuellement composée, ou tableau de chaînes), 2 au plus, sans doublon.
 * @returns {{ ids: string[], ecartees: string[], tronquees: string[] }}
 */
export function depopCouleursDe(valeur) {
  const brut = Array.isArray(valeur) ? valeur : [valeur];
  const morceaux = brut.flatMap((v) => String(v ?? "").split(SEPARATEURS)).map((s) => s.trim()).filter(Boolean);
  const ids = [];
  const ecartees = [];
  for (const m of morceaux) {
    const r = idDepopDuLibelle(m);
    if (r.id) { if (!ids.includes(r.id)) ids.push(r.id); } else ecartees.push(m);
  }
  return { ids: ids.slice(0, DEPOP_COULEURS_MAX), ecartees, tronquees: ids.slice(DEPOP_COULEURS_MAX) };
}

const valeurAttribut = (a) => String((a && typeof a === "object" ? a.v : a) ?? "").trim();
/** Les couleurs écrites sur la fiche (inventaire.attributs.couleur puis couleur2), telles quelles. */
export function couleursDeLaFiche(attributs) {
  const a = attributs && typeof attributs === "object" ? attributs : {};
  return [valeurAttribut(a.couleur), valeurAttribut(a.couleur2)].filter(Boolean);
}

const texte = (v) => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean).join(", ") : String(v ?? "").trim());

/**
 * La couleur Depop d'une copie, à la publication (app) : copie → valeur commune → fiche. La première source qui porte
 * une couleur décide (même si elle n'a pas d'équivalent Depop : rien ne part alors). null : aucune source.
 * @param {{ copie?: unknown, commune?: unknown, ficheAttributs?: Record<string, any> | null, retireeALaMain?: boolean }} [a]
 * @returns {null | { ids: string[], source: "copie"|"valeur_commune"|"fiche"|"retiree_a_la_main", de: string|null, ecartees: string[] }}
 */
export function couleurDepopPourLaCopie({ copie = null, commune = null, ficheAttributs = null, retireeALaMain = false } = {}) {
  if (retireeALaMain === true) return { ids: [], source: "retiree_a_la_main", de: null, ecartees: [] };
  for (const [v, source] of [[copie, "copie"], [commune, "valeur_commune"]]) {
    const t = texte(v);
    if (t) { const r = depopCouleursDe(t); return { ids: r.ids, source, de: t, ecartees: r.ecartees }; }
  }
  const fiche = couleursDeLaFiche(ficheAttributs);
  if (fiche.length) { const r = depopCouleursDe(fiche); return { ids: r.ids, source: "fiche", de: fiche.join(", "), ecartees: r.ecartees }; }
  return null;
}

const idsValides = (l) => [...new Set((Array.isArray(l) ? l : []).map((x) => String(x ?? "").trim()).filter((x) => IDS_DEPOP.has(x)))].slice(0, DEPOP_COULEURS_MAX);

/**
 * Le job Depop attend-il encore ses identifiants de couleur ? Aucun depopCouleurs valable, et la couleur n'a pas été
 * retirée à la main. (La couleur écrite sur la copie, elle, se lit d'abord — voir les deux fonctions suivantes.)
 * @param {unknown} pf
 */
export function couleurDepopACompleter(pf) {
  const p = pf && typeof pf === "object" ? pf : {};
  if (idsValides(p.depopCouleurs).length) return false;
  if (String(p.depop_couleur_source ?? "") === "retiree_a_la_main") return false;
  return true;
}

/**
 * LE FILET DU SERVEUR (get-pending-jobs) pour une PUBLICATION Depop servie sans couleur (tous les builds de l'app, lot
 * compris) : la couleur de la copie quand elle en porte une (libellé d'une autre langue que l'app d'avant ne lisait
 * pas), sinon celle de la fiche. Jamais par-dessus des identifiants déjà posés ; null = rien à écrire.
 * `ficheAttributs` peut être absent : la fiche n'est lue que si la copie ne dit rien (`besoinFiche`).
 * @param {{ pf?: Record<string, any> | null, ficheAttributs?: Record<string, any> | null }} [a]
 * @returns {null | { depopCouleurs: string[], source: "copie"|"fiche", de: string }}
 */
export function couleurDepopDuJobServeur({ pf, ficheAttributs = null } = {}) {
  if (!couleurDepopACompleter(pf)) return null;
  const copie = texte(pf?.couleur);
  if (copie) {
    const r = depopCouleursDe(copie);
    return r.ids.length ? { depopCouleurs: r.ids, source: "copie", de: copie } : null;
  }
  const fiche = couleursDeLaFiche(ficheAttributs);
  if (!fiche.length) return null;
  const r = depopCouleursDe(fiche);
  return r.ids.length ? { depopCouleurs: r.ids, source: "fiche", de: fiche.join(", ") } : null;
}
/** Le filet doit-il lire la fiche ? (la copie ne porte aucune couleur) */
export const besoinFicheCouleurDepop = (pf) => couleurDepopACompleter(pf) && !texte(pf?.couleur);

/**
 * LA COULEUR D'UNE REPUBLICATION DEPOP (copie-republication-depop.js). Une republication remet l'annonce telle qu'elle
 * est EN LIGNE : la couleur relevée par l'API Depop d'abord (identifiants `couleurs_ids` de l'extension 0.6.187, sinon
 * le libellé de la capture) ; en ligne SANS couleur alors que le dépôt FillSell en a envoyé une → retirée sur Depop,
 * rien n'est remis ; sans relevé de l'API : le dépôt FillSell, puis la fiche. Une couleur déjà écrite sur la copie
 * décide (lue en identifiants ; sans équivalent Depop : rien).
 * @param {{ pf?: Record<string, any> | null, depot?: Record<string, any> | null, capture?: Record<string, any> | null,
 *   ficheAttributs?: Record<string, any> | null }} [a]
 * @returns {null | { ids: string[], source: "copie"|"annonce_en_ligne"|"depot_fillsell"|"fiche" } | { ids: [], source: "retiree_en_ligne" }}
 */
export function couleurDepopRepublication({ pf, depot = null, capture = null, ficheAttributs = null } = {}) {
  if (!couleurDepopACompleter(pf)) return null;
  const copie = texte(pf?.couleur);
  if (copie) {
    const r = depopCouleursDe(copie);
    return r.ids.length ? { ids: r.ids, source: "copie" } : null;
  }
  const pfD = depot?.platform_fields && typeof depot.platform_fields === "object" ? depot.platform_fields : {};
  const duDepot = idsValides(pfD.depopCouleurs).length ? idsValides(pfD.depopCouleurs) : depopCouleursDe(texte(pfD.couleur)).ids;
  if (String(capture?.source ?? "") === "api") {
    const enLigne = Array.isArray(capture?.couleurs_ids) ? idsValides(capture.couleurs_ids) : depopCouleursDe(texte(capture?.couleur)).ids;
    if (enLigne.length) return { ids: enLigne, source: "annonce_en_ligne" };
    if (duDepot.length) return { ids: [], source: "retiree_en_ligne" };
  } else if (duDepot.length) {
    return { ids: duDepot, source: "depot_fillsell" };
  }
  const fiche = couleursDeLaFiche(ficheAttributs);
  const r = fiche.length ? depopCouleursDe(fiche) : { ids: [] };
  return r.ids.length ? { ids: r.ids, source: "fiche" } : null;
}
