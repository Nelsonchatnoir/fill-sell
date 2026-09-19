// ── EN QUELLE LANGUE EST CE TEXTE ? (2026-09-19) ────────────────────────────
// Cas fondateur : roehrricky24, inscrit le 19/09 à 04:21, profil lang='fr'.
// La consigne de langue FRANÇAISE est bien partie dans le prompt Lens
// (lens-analysis, langueDirective) — le modèle l'a ignorée et a rendu
// « Lot of 10 Swisher Sweets Cigars » avec une description entièrement
// anglaise. RIEN, côté serveur, ne relisait la langue de ce qui revenait.
//
// Deux dégâts, et le second est invisible :
//   1. l'annonce part en anglais sur des plateformes françaises ;
//   2. la description anglaise est relue par des règles de mots FRANÇAISES
//      (detectObjectKeywordDetail, passe 2) : « blue and yellow PULL-tab
//      bands » a donné l'icône 🧶 « pull », donc la catégorie Leboncoin
//      « Mode > Vêtements », donc deux questions de vêtement posées à
//      quelqu'un qui vendait des cigares.
//
// ═══════════════════════════════════════════════════════════════════════════
// DEUX RÈGLES DE CONCEPTION, L'UNE ET L'AUTRE IMPOSÉES PAR LES NOMS DE PRODUITS
// ═══════════════════════════════════════════════════════════════════════════
// 1. ON JUGE LA DESCRIPTION, JAMAIS LE TITRE SEUL. Un titre est court et c'est
//    souvent un nom de produit ; une description fait 300 caractères de langue
//    ordinaire. MESURÉ sur les 754 fiches créées par l'app en 30 jours :
//      · verdict rendu sur la DESCRIPTION → 11 détections, ZÉRO faux positif
//        (les 11 relues une par une) ;
//      · verdict rendu sur le TITRE → 14 détections, dont 8 dont la
//        description est FRANÇAISE : « Grand Theft Auto The Trilogy »,
//        « Captain Tsubasa: Rise of New Champions », « Water Beauty and Air CC
//        Cream », « Air 1 Retro High Shattered Backboard », « Fleece
//        half-zip », « Star Player 76 OX », « Fit Me Matte + Poreless ».
//    Les noms de produits qu'il faut protéger sont EXACTEMENT ceux que le
//    verdict par la description écarte tout seul.
//
// 2. ON COMPTE DES MOTS-OUTILS, JAMAIS DES MOTS DE CONTENU. Une marque, un
//    modèle, une référence ne produisent JAMAIS d'article, de préposition ni
//    d'auxiliaire. C'est ce qui rend le compte insensible au vocabulaire du
//    produit — et donc au catalogue, qui change tous les jours.
//
// SEUIL : au moins 3 mots-outils anglais ET zéro mot-outil français. LES DEUX.
// MESURÉ : avec 3, 11 détections (marge confortable — le plus faible des 11
// compte 8 mots-outils anglais). Avec 1, on monterait à 50 : beaucoup trop.
// 4 descriptions MIXTES (anglais présent ET français présent) existent dans le
// corpus : elles ne sont PAS flaggées, et c'est voulu — une description
// française qui cite « The North Face » reste française.
//
// ES module SANS import : chargé tel quel par Vite (app) et par Deno
// (fonctions), même discipline que _shared/beebs-interdits.js.

// Longueur minimale pour qu'un verdict ait un sens. En dessous, on ne juge
// pas : « Neuf », « Taille 45 », « 101 » ne disent rien d'une langue, et un
// verdict rendu sur trois mots serait un tirage au sort.
const LONGUEUR_MINIMALE = 40;

// Seuil de mots-outils anglais. Ne pas descendre sans re-mesurer : cf. en-tête.
const SEUIL_ANGLAIS = 3;

// minuscules + accents retirés, pour que les bornes [a-z] suffisent.
function normaliser(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Mots-outils ANGLAIS. Volontairement limités à la grammaire : articles,
// prépositions, auxiliaires, démonstratifs — plus quatre participes qui
// reviennent dans toutes les descriptions d'objet produites par le modèle
// (« appears », « visible », « clean », « wear »). Aucun nom d'objet, aucune
// couleur, aucune marque : ce sont eux qui feraient des faux positifs.
const OUTILS_EN = [
  "the", "a", "an", "of", "and", "with", "without", "for", "in", "on", "is", "are",
  "very", "no", "this", "that", "its", "to", "from", "has", "have", "been",
  "appears", "visible", "clean", "wear",
];

// Mots-outils FRANÇAIS. Leur seule PRÉSENCE (un seul suffit) suffit à ne pas
// déclarer le texte anglais : on préfère de loin laisser passer une
// description anglaise qu'en traduire une française.
const OUTILS_FR = [
  "le", "la", "les", "un", "une", "des", "du", "de", "et", "avec", "sans", "pour",
  "dans", "sur", "est", "sont", "tres", "aucun", "aucune", "plus", "cette", "ce",
  "son", "sa", "ses", "au", "aux", "etat", "avec", "par", "qui", "que", "en",
];

const RE_EN = new RegExp(`(?<![a-z0-9])(?:${OUTILS_EN.join("|")})(?![a-z0-9])`, "g");
const RE_FR = new RegExp(`(?<![a-z0-9])(?:${OUTILS_FR.join("|")})(?![a-z0-9])`, "g");

/**
 * Compte les mots-outils de chaque langue dans un texte.
 * @param {string} texte
 * @returns {{en: number, fr: number, longueur: number}}
 */
export function compterMotsOutils(texte) {
  const t = normaliser(texte);
  return {
    en: (t.match(RE_EN) ?? []).length,
    fr: (t.match(RE_FR) ?? []).length,
    longueur: t.trim().length,
  };
}

/**
 * Verdict de langue sur un texte LONG (une description).
 * @param {string} texte
 * @returns {"en" | "fr" | null} "en" = anglais AVÉRÉ (aucun mot-outil
 *   français, au moins 3 anglais) ; "fr" = au moins un mot-outil français ;
 *   null = trop court ou indécidable. Le null est le cas PRUDENT : rien ne se
 *   déclenche dessus.
 */
export function verdictLangue(texte) {
  const { en, fr, longueur } = compterMotsOutils(texte);
  if (longueur < LONGUEUR_MINIMALE) return null;
  if (fr > 0) return "fr";
  if (en >= SEUIL_ANGLAIS) return "en";
  return null;
}

/**
 * Ce texte est-il de l'anglais AVÉRÉ ? Le seul prédicat que le code appelant
 * doit utiliser pour DÉCLENCHER quelque chose — il n'est vrai que sur une
 * certitude, jamais sur un doute.
 * @param {string} texte
 * @returns {boolean}
 */
export function estAnglaisAvere(texte) {
  return verdictLangue(texte) === "en";
}
