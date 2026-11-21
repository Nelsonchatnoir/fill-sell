// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN, VÊTEMENT HOMME : LA TAILLE EST UNE LETTRE, SINON LA QUESTION (19/11/2026, compte 8ac5bbda)
// ═══════════════════════════════════════════════════════════════════════════
// Constat (publications du 18/11, relues sur Leboncoin) : deux jeans homme, fiche Vinted « W29 | FR 38 » et
// « W28 | FR 38 », servis « 38 » (règle du 06/10 : un tour de taille en taille française). Sur le formulaire, l'univers
// « Homme » de « Mode > Vêtements » n'a QUE des lettres (relevé lbc_grilles_relevees : 625 lectures « Jeans » homme, même
// grille pour hauts, pulls, manteaux, pantalons, chemises) ; la grille « 38 - M » n'est que celle de l'univers « Femme ».
// L'extension cherchait « 38 », « champ sauté », et l'annonce partait SANS taille, en silence (mesuré le 19/11 : 153
// publications homme en 30 jours servies avec une taille hors de cette grille, 29 comptes).
// RÈGLE (publication ; une republication remet l'annonce telle qu'elle est, règle du 22/10) :
//   · la valeur est déjà une option de la grille homme → rien ;
//   · la même taille autrement écrite → l'option : « m » → « M », « Unique »/« TU » → « Taille unique », « 2XL » → « XXL »,
//     « 3XL » → « XXXL », « 8XL » → « 8XL et plus », un composite qui porte UNE lettre (« 38 - M », « M / 38 / 10 ») ;
//   · la copie est un morceau de la taille composite de la FICHE (« 38 » de « M / 38 / 10 ») → la lettre que la fiche dit
//     (doctrine du 17/11, tailleDeLaFicheDansLaGrille) ;
//   · sinon : LA QUESTION, avec toute la grille homme. ⛔ Jamais un nombre converti en lettre (un 38 français n'est pas
//     forcément un M) ; jamais une réponse de la personne rejugée.
// Pur, sans écriture ; Deno + Node + Vite.

import { tailleDansGrille } from "./tailles.js";

/** La grille « Taille » de Leboncoin, univers Homme (lbc_grilles_relevees, clothing_st, relevée jusqu'au 19/11). */
export const GRILLE_LBC_HOMME = Object.freeze(["Taille unique", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "7XL", "8XL et plus"]);

const plier = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.\s]+/g, " ").trim();
const MEME_TAILLE = Object.freeze({
  "unique": "Taille unique", "taille unique": "Taille unique", "tu": "Taille unique", "t u": "Taille unique", "one size": "Taille unique",
  "2xl": "XXL", "3xl": "XXXL", "xxxxl": "4XL", "8xl": "8XL et plus",
});
const decouper = (v) => String(v ?? "").split(/\s*[/|·•]\s*|\s+[-–—]\s+/).map((s) => s.trim()).filter(Boolean);

/** L'option de la grille homme pour UNE écriture de taille, ou null. */
function optionHomme(v) {
  const p = plier(v);
  if (!p) return null;
  return GRILLE_LBC_HOMME.find((o) => plier(o) === p) ?? MEME_TAILLE[p] ?? null;
}
/** La lettre d'une taille composite (« 38 - M », « M / 38 / 10 ») : une seule option dans ses morceaux, sinon null. */
function lettreDuComposite(v) {
  const morceaux = decouper(v);
  if (morceaux.length < 2) return null;
  const lettres = [...new Set(morceaux.map(optionHomme).filter(Boolean))];
  return lettres.length === 1 ? lettres[0] : null;
}

export function messageTailleLbcHomme(valeur) {
  return `Leboncoin n'a que des tailles en lettres pour les vêtements homme (de XXS à 8XL, ou Taille unique) : « ${valeur} » `
    + "n'y est pas, et FillSell ne transforme jamais un nombre en lettre (un 38 français n'est pas forcément un M). "
    + "Choisis la taille de l'article ci-dessous (bouton « ✋ Compléter ») : la publication repart d'elle-même. "
    + "Rien n'a été envoyé à Leboncoin.";
}

/**
 * @param {{ taille?: unknown, tailleFiche?: unknown, univers?: unknown, chemin?: unknown, resolu?: unknown }} p
 * @returns {{ valeur: string, motif: string } | { question: true, options: string[], valeur: string, message: string } | null}
 *   null = rien à faire (pas un vêtement homme de Leboncoin, sans taille, déjà dans la grille, réponse de la personne).
 */
export function tailleLbcHomme({ taille, tailleFiche = null, univers, chemin, resolu = null } = {}) {
  const cle = Array.isArray(chemin) ? chemin.map((s) => String(s ?? "").trim()).join(" > ") : String(chemin ?? "").trim();
  if (cle !== "Mode > Vêtements" || String(univers ?? "").trim() !== "Homme") return null;
  if (resolu && typeof resolu === "object" && String(resolu.taille ?? "").trim()) return null;
  const brute = String(taille ?? "").trim();
  if (!brute || GRILLE_LBC_HOMME.includes(brute)) return null;
  // (21/11/2026, lot de Nico, point 1) Puis le vocabulaire commun des tailles (« LG » → « L », « 8XL » → « 8XL et plus ») :
  // la même taille autrement écrite — il ne change jamais un nombre en lettre (« 38 » reste la question).
  const meme = optionHomme(brute) ?? lettreDuComposite(brute) ?? tailleDansGrille(brute, GRILLE_LBC_HOMME)?.valeur ?? null;
  if (meme) return { valeur: meme, motif: `« ${brute} » s'écrit « ${meme} » dans la grille homme de Leboncoin` };
  const sansFr = (s) => plier(String(s).replace(/^(?:fr|eu|eur)\s*/i, ""));
  const morceauxFiche = decouper(tailleFiche);
  if (morceauxFiche.length >= 2 && morceauxFiche.some((m) => sansFr(m) === sansFr(brute))) {
    const l = lettreDuComposite(tailleFiche);
    if (l) return { valeur: l, motif: `« ${brute} » est un morceau de la taille de la fiche « ${String(tailleFiche).trim()} » : sa lettre « ${l} »` };
  }
  return { question: true, options: [...GRILLE_LBC_HOMME], valeur: brute, message: messageTailleLbcHomme(brute) };
}
