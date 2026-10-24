// ══════════════════════════════════════════════════════════════════════════
// UN TOUR DE TAILLE N'EST JAMAIS REPOSTÉ COMME UNE TAILLE FRANÇAISE (24/10, décision 1 de Nico)
// ══════════════════════════════════════════════════════════════════════════
// CE QUI L'A PROVOQUÉ : avant le 23/10 (f081a28), l'app posait le W ou la longueur d'un jean comme taille française :
// « W34 L34 (44) » partait en « 34 » (un XS), la réponse « W34 | FR 44 » de Johan aussi. Les PUBLICATIONS sont justes
// depuis le 23/10 ; mais une REPUBLICATION recopie la taille de l'ancienne copie (spend_coins_and_republish) et la
// remettait en ligne : la grille Beebs des pantalons homme (« 32 » … « 64 ») a une case « 34 ».
//
// LA RÈGLE (tous les comptes, Beebs et Leboncoin) : pour un BAS (jean, pantalon, short…) dont la fiche donne un tour
// de taille CERTAIN — la réponse de la personne (« W34 | FR 44 ») d'abord, sinon un seul W lu dans le titre ou la
// description —, une taille de copie qui est un nombre nu égal à ce W, ou à la longueur L écrite avec lui, et qui
// n'est pas la taille française de ce W, est servie en taille française (table publiée par Vinted : W34 = FR 44).
// Rien d'autre ne change (null) : un autre nombre (le choix de la personne), une lettre, un W, une fiche sans W
// certain, deux W différents, « 32/34 » (ambigu), un W hors table, une chaussure.
// La fiche et la base ne sont jamais réécrites : seule la copie servie (get-pending-jobs), avec sa trace.
// Leboncoin homme : sa grille n'a que des lettres et aucune table homme n'est publiée (règle du 28/09) — « 44 » n'y
// trouve pas de case et la taille reste au choix de la personne, comme avant ; jamais « 34 ».
//
// ES module pur (Deno + Node) : testé par scripts/taille-corrigee-par-le-w-selftest.mjs.
import { FR_PAR_TOUR_DE_TAILLE, lireTourDeTaille } from "./taille-de-service.js";
import { contexteBas, lireTaillesDuTexte } from "./taille-du-texte.js";

const nfc = (v) => String(v ?? "").normalize("NFC");
// « W34 L34 », « W34/L34 », « w 34 x l 34 ».
const RE_W_PUIS_L = /(?<![\p{L}\p{N}])w\s?(\d{2})\s?[/x×-]?\s?l\s?(\d{2})(?![\p{L}\p{N}])/giu;
// « 33/34 », « 33x34 » : le second nombre est la longueur.
const RE_PAIRE = /(?<![\p{L}\p{N}.,/])(\d{2})\s?[/x×]\s?(\d{2})(?![\p{L}\p{N}.,/])/gu;

function valeurDeLaFiche(ficheTaille) {
  const v = ficheTaille && typeof ficheTaille === "object" ? (ficheTaille.v ?? ficheTaille.valeur ?? "") : ficheTaille;
  return String(v ?? "").trim();
}

/** Le tour de taille certain d'un bas : la réponse de la fiche d'abord, sinon un seul W lu dans les textes. */
export function tourDeTailleCertain({ ficheTaille = null, textes = [] } = {}) {
  // « W34 | FR 44 » (réponse de la personne) : le morceau avant « | ».
  const t = lireTourDeTaille(valeurDeLaFiche(ficheTaille).split("|")[0].trim());
  if (t?.ambigu) return null;
  if (t?.w) return FR_PAR_TOUR_DE_TAILLE[t.w] != null ? { w: t.w, l: t.l ?? null, source: "fiche" } : null;
  const lu = lireTaillesDuTexte(textes, { bas: true });
  if (lu.w.length !== 1 || lu.wHorsTable.length) return null;
  return { w: lu.w[0], l: null, source: "texte" };
}

function longueursEcrites(textes, w) {
  const ls = new Set();
  for (const brut of textes) {
    const s = nfc(brut);
    for (const m of s.matchAll(RE_W_PUIS_L)) if (Number(m[1]) === w) ls.add(Number(m[2]));
    for (const m of s.matchAll(RE_PAIRE)) ls.add(Number(m[2]));
  }
  return ls;
}

/**
 * @param {{ tailleCopie: unknown, ficheTaille?: unknown, textes?: unknown[], chemin?: string[]|null }} p
 * @returns {{ valeur: string, w: number, source: 'fiche'|'texte', motif: string } | null}
 */
export function tailleCorrigeeParLeW({ tailleCopie, ficheTaille = null, textes = [], chemin = null } = {}) {
  const copie = String(tailleCopie ?? "").trim();
  const m = /^(?:fr\s*)?(\d{2})$/i.exec(copie);
  if (!m) return null;
  const n = Number(m[1]);
  const tx = (Array.isArray(textes) ? textes : [textes]).filter((x) => String(x ?? "").trim());
  if (!contexteBas(chemin, tx)) return null;
  const tour = tourDeTailleCertain({ ficheTaille, textes: tx });
  if (!tour) return null;
  const fr = FR_PAR_TOUR_DE_TAILLE[tour.w];
  if (fr == null || fr === n) return null;
  const longueurs = longueursEcrites(tx, tour.w);
  if (tour.l) longueurs.add(tour.l);
  const estLeW = n === tour.w;
  if (!estLeW && !longueurs.has(n)) return null;
  return {
    valeur: String(fr),
    w: tour.w,
    source: tour.source,
    motif: `« ${copie} » est ${estLeW ? "le tour de taille" : "la longueur"} d'un W${tour.w}, pas une taille française : `
      + `W${tour.w} = FR ${fr} (table publiée par Vinted)`,
  };
}
