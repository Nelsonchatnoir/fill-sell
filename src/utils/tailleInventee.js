// ═══════════════════════════════════════════════════════════════════════════
// UNE TAILLE QUE PERSONNE N'A DITE N'EST PAS UNE TAILLE (2026-09-21)
// ═══════════════════════════════════════════════════════════════════════════
// CAS FONDATEUR — les barrettes de meminiandmove (jobs fd5c84be et 837d2c8a,
// 21/09) : deux lots de barrettes à cheveux, fiche SANS aucune taille
// (`attributs.taille` absent), titre « Lot de 2 barrettes Marie Les
// Aristochats Disney ». La rédaction a posé « Prématuré » sur les copies
// Leboncoin, Opla et Beebs — pas sur Vinted. Les deux barrettes sont parties
// EN LIGNE sur Leboncoin et Opla avec une taille de vêtement de nouveau-né,
// et sur Beebs le rayon exige une taille de sa propre liste : le job est mort
// dessus.
//
// Le prompt de rédaction dit pourtant, mot pour mot : « Pour "taille", ne
// devine JAMAIS : donne une taille SEULEMENT si elle est lisible ou déductible
// du contexte ; si aucune taille n'est déductible, null ». Il l'a fait quand
// même. Une consigne de prompt n'est pas une garde — celle-ci en est une.
//
// LA RÈGLE, dans l'ordre :
//   1. la FICHE porte une taille (`attributs.taille`) → elle fait foi, toujours.
//      C'est là qu'atterrit ce que le vendeur a saisi, ce que le relevé a lu et
//      ce que Lens a déchiffré sur une étiquette.
//   2. sinon, la taille rendue par l'IA n'est gardée que si le TEXTE de
//      l'article la porte (« …taille M », « …XL », « jean taille 36 »).
//   3. sinon, une valeur NEUTRE (« Unique », « Taille unique ») est gardée :
//      elle ne dit pas une taille, elle dit qu'il n'y en a pas — c'est la bonne
//      réponse pour un sac, un bonnet ou une montre.
//   4. sinon, on la JETTE. La plateforme la redemandera si elle y tient, et
//      c'est la personne qui tranchera — jamais nous.
//
// ⛔ POURQUOI « N'IMPORTE LEQUEL DES JETONS » ET PAS « TOUS » : Vinted écrit
//    ses tailles en composé (« S / 36 / 8 ») — une seule des trois notations
//    figure dans un titre. Exiger les trois jetterait une taille vraie.
// ⛔ ET POURQUOI LES TAILLES ENFANT SONT PLUS STRICTES : un nombre nu ne
//    corrobore JAMAIS « 2 ans » ni « 6 mois ». Sans ça, « Lot de 2 barrettes »
//    aurait corroboré « 2 ans » avec son propre compte d'articles.
// ═══════════════════════════════════════════════════════════════════════════

import { texteComparable } from "./texteComparable";

/** « Unique », « Taille unique » : la valeur qui dit « cet objet n'a pas de taille ». */
export function estTailleNeutre(taille) {
  const t = texteComparable(String(taille ?? ""));
  return /^(taille\s+)?(unique|universelle)$/.test(t);
}

/** Une taille du référentiel ENFANT (« Prématuré », « 6 mois », « 3 ans »). */
export function estTailleEnfant(taille) {
  const t = texteComparable(String(taille ?? ""));
  return /premature|naissance|\d+\s*(mois|ans)\b/.test(t);
}

/** Les jetons qui PORTENT la taille — le vocabulaire d'habillage est retiré. */
const HABILLAGE = new Set(["taille", "tailles", "eu", "fr", "uk", "us", "cm", "de", "du", "et", "ou", "ans", "mois"]);
function jetonsDeTaille(taille) {
  return texteComparable(String(taille ?? ""))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t && !HABILLAGE.has(t));
}

/**
 * Le TEXTE de l'article dit-il cette taille ?
 *
 * @param {string} taille  la taille rendue par la rédaction
 * @param {string} texte   titre + description de la fiche (et des copies)
 */
export function tailleDiteParLeTexte(taille, texte) {
  const jetonsTexte = new Set(
    texteComparable(String(texte ?? "")).replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter(Boolean),
  );
  if (!jetonsTexte.size) return false;
  const t = texteComparable(String(taille ?? ""));
  if (!t) return false;
  // ENFANT : l'expression entière, jamais le nombre seul.
  if (estTailleEnfant(taille)) {
    if (/premature/.test(t) && jetonsTexte.has("premature")) return true;
    if (/naissance/.test(t) && jetonsTexte.has("naissance")) return true;
    const m = t.match(/(\d+)\s*(mois|ans)\b/);
    if (!m) return false;
    const texteNet = texteComparable(String(texte ?? ""));
    return new RegExp(`\\b${m[1]}\\s*${m[2]}\\b`).test(texteNet);
  }
  // ADULTE : un seul jeton suffit — « S / 36 / 8 » n'a qu'une notation au titre.
  //   ⛔ un nombre d'un seul chiffre ne corrobore rien : « Lot de 2 … ».
  return jetonsDeTaille(taille).some((j) => (/^\d$/.test(j) ? false : jetonsTexte.has(j)));
}

/**
 * Faut-il GARDER cette taille ? Rend `{ garder, motif }` — le motif part dans
 * la trace du job, pour qu'un « pourquoi ma taille a disparu » ait une réponse.
 *
 * @param {string} taille        celle que la rédaction a posée sur la copie
 * @param {object} o
 * @param {string} [o.tailleFiche]  `attributs.taille.v` de l'article
 * @param {string} [o.texte]        titre + description de l'article
 */
export function tailleAGarder(taille, { tailleFiche = "", texte = "" } = {}) {
  const t = String(taille ?? "").trim();
  if (!t) return { garder: true, motif: "aucune taille" };
  if (String(tailleFiche ?? "").trim()) return { garder: true, motif: "la fiche porte une taille" };
  if (tailleDiteParLeTexte(t, texte)) return { garder: true, motif: "le texte de l'article la dit" };
  if (estTailleNeutre(t)) return { garder: true, motif: "valeur neutre (l'objet n'a pas de taille)" };
  return { garder: false, motif: "ni la fiche ni le texte ne la disent — inventée" };
}
