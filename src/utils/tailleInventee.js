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

// ═══════════════════════════════════════════════════════════════════════════
// (12/11, décision de Nico — point 1a) ET UNE TAILLE QUI CONTREDIT LA FICHE NE PART JAMAIS
// ═══════════════════════════════════════════════════════════════════════════
// Fiche 1793630721658 (compte c7c382b7) : l'étiquette lue par Lens dit « EU 140cm » (= 10 ans) ; la copie Vinted
// portait « 9 ans » (publiée « 9 ans / 134 cm », tâche e05bc4ae), la copie Beebs « Naissance » (publiée « Naissance -
// 0 mois (45-50 cm) », 8c447bfa). La règle 1 ci-dessus les a GARDÉES : « la fiche porte une taille » suffisait, même
// contraire. Désormais la copie est CONFRONTÉE à la fiche (attributs.taille) ET à l'étiquette lue
// (attributs_visibles.taille / pointure) par le vocabulaire commun (_shared/tailles.js, confronterTailles) :
//   · comparables et d'accord (même taille, ou une tranche qui la contient) → gardée, comme avant ;
//   · comparables et en désaccord → elle ne part pas : remplacée par la taille de la fiche écrite dans le vocabulaire
//     de l'app (« 10 ans », « M »), que chaque plateforme traduit ensuite dans SA grille ; si la fiche et l'étiquette
//     se contredisent entre elles, ou si la taille de la fiche ne s'écrit pas sans deviner : écartée — la question ;
//   · incomparables (« XL » face à « 42 », « 140 » nu face à « 140 cm ») → la règle d'avant, inchangée.
// LES RÉFÉRENCES, relues sur 5 333 publications réelles (30 jours au 12/11, scripts/tailles-par-site-rejeu.mjs) :
//   · la fiche et l'étiquette qui se contredisent entre elles ne tranchent pas : la question — même quand la fiche
//     est « manuel » (jusqu'au 22/10, « Compléter » écrivait la réponse d'une plateforme sous cette source : une fiche
//     « 10 ans (128-140 cm) » face à une étiquette « 11-12 yrs » n'est pas une preuve) ;
//   · une taille de fiche venue d'un RELEVÉ (source releve_<plateforme>) n'est jamais une référence : elle est écrite
//     dans le vocabulaire de cette plateforme (« 28 » de Depop est un tour de taille W28, pas un 28 français) et, sur
//     un dépôt FillSell, elle n'est que notre propre copie relue (« Naissance » sur la fiche 1793630721658) ;
//   · un NOMBRE NU lu sur une étiquette n'est pas une référence (système inconnu : « 27 » est-il un W27 ?) — ses
//     lettres, âges, centimètres et nombres préfixés (« EU 36,5 ») le sont.
import { texteComparable } from "./texteComparable";
import { confronterTailles } from "../../supabase/functions/_shared/tailles.js";

/**
 * Les tailles de RÉFÉRENCE d'une fiche, telles que la publication les lit : la taille de la fiche
 * (`attributs.taille.v` et sa source, sinon `taille`) et celle de l'étiquette lue
 * (`attributs.attributs_visibles.v.taille` / `pointure` en base, `attributs_visibles.taille` / `pointure` sur un
 * résultat Lens de la session).
 * @param {object|null|undefined} fiche
 * @returns {{tailleFiche: string, sourceFiche: string, tailleLue: string}}
 */
export function referencesTailleFiche(fiche) {
  const attrs = fiche?.attributs && typeof fiche.attributs === "object" && !Array.isArray(fiche.attributs) ? fiche.attributs : {};
  const objet = (x) => x && typeof x === "object" && !Array.isArray(x);
  const valeur = (x) => (objet(x) ? x.v : x);
  const tailleFiche = String(valeur(attrs.taille) ?? fiche?.taille ?? "").trim();
  const sourceFiche = objet(attrs.taille) && String(attrs.taille.v ?? "").trim() ? String(attrs.taille.source ?? "").trim() : "";
  const vis = [valeur(attrs.attributs_visibles), fiche?.attributs_visibles]
    .find((x) => x && typeof x === "object" && (x.taille != null || x.pointure != null));
  const tailleLue = String(vis?.taille ?? vis?.pointure ?? "").trim();
  return { tailleFiche, sourceFiche, tailleLue };
}

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
 * @param {string} [o.sourceFiche]  (12/11) la source de `attributs.taille` (manuel, capture, vinted_*, releve_*…)
 * @param {string} [o.tailleLue]    (12/11) la taille de l'étiquette lue (`attributs_visibles.taille` / `pointure`)
 * @param {string} [o.texte]        titre + description de l'article
 * @returns {{garder: boolean, motif: string, contredit?: boolean, reference?: string, remplacement?: string|null}}
 *   `contredit` : la copie contredit la fiche — `remplacement` est la taille de la fiche à poser à sa place (null :
 *   la question).
 */
export function tailleAGarder(taille, { tailleFiche = "", sourceFiche = "", tailleLue = "", texte = "" } = {}) {
  const t = String(taille ?? "").trim();
  if (!t) return { garder: true, motif: "aucune taille" };
  const fiche = String(tailleFiche ?? "").trim();
  const source = String(sourceFiche ?? "").trim();
  const lue = String(tailleLue ?? "").trim();
  // Les références d'une contradiction (cf. en tête) : la fiche, sauf relevée sur une plateforme ; l'étiquette lue.
  const references = [
    ...(fiche && !/^releve_/.test(source) ? [{ valeur: fiche, etiquette: false }] : []),
    ...(lue ? [{ valeur: lue, etiquette: true }] : []),
  ];
  const verdicts = references.map((r) => ({ reference: r.valeur, ...confronterTailles(t, r.valeur, { etiquette: r.etiquette }) }));
  const contre = verdicts.find((x) => x.verdict === "contredit");
  if (contre) {
    // La fiche et l'étiquette se contredisent entre elles : aucune des deux ne s'impose — la question.
    const referencesDaccord = references.length < 2
      || confronterTailles(references[0].valeur, references[1].valeur, { etiquette: true }).verdict !== "contredit";
    const remplacement = referencesDaccord
      ? (verdicts.find((x) => x.verdict === "contredit" && x.remplacement)?.remplacement ?? null) : null;
    return {
      garder: false, contredit: true, reference: contre.reference, remplacement,
      motif: referencesDaccord
        ? `contredit la fiche (« ${contre.reference} »)`
        : `contredit la fiche (« ${references[0].valeur} » et l'étiquette « ${references[1].valeur} » ne disent pas la même taille)`,
    };
  }
  if (fiche) return { garder: true, motif: "la fiche porte une taille" };
  if (verdicts.some((x) => x.verdict === "meme")) return { garder: true, motif: "l'étiquette lue dit la même taille" };
  if (tailleDiteParLeTexte(t, texte)) return { garder: true, motif: "le texte de l'article la dit" };
  if (estTailleNeutre(t)) return { garder: true, motif: "valeur neutre (l'objet n'a pas de taille)" };
  return { garder: false, motif: "ni la fiche ni le texte ne la disent — inventée" };
}
