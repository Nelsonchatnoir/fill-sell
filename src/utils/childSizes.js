// Référentiel des tailles bébé / enfant / ado — chantier « trou tailles »
// (2026-07-15). Source : relevé DOM réel des 4 formulaires de vente + dump
// SQL prod ebay_item_aspects — docs/sizes-baby-child-raw.txt. AUCUNE valeur
// inventée : chaque libellé plateforme ci-dessous est une option réellement
// affichée (Vinted /items/new, Beebs /fr/listing, LBC /deposer-une-annonce)
// ou une allowedValue de l'API Taxonomy eBay.
//
// Principe : l'app et l'IA manipulent une valeur CANONIQUE courte et stable
// (« 6 mois », « 8 ans », « EU 31 ») ; la conversion vers le libellé EXACT
// de chaque plateforme (« 6-9 mois / 68 cm », « 8 ans (123-128 cm) »…) se
// fait à l'insert du job (handlePublish), pour que les cascades des content
// scripts matchent en EXACT — jamais en fuzzy (cf. garde anti-nombre-nu des
// content scripts, même chantier).
//
// Conventions d'équivalence (documentées, pas devinées) :
// - Les grilles mois/cm DIVERGENT entre plateformes (LBC « 6 mois / 68 cm »
//   vs Beebs « 6 mois (60-66 cm) ») : le libellé d'ÂGE de l'étiquette est
//   l'invariant vendeur, on mappe par âge, jamais par cm inter-plateformes.
// - Vinted n'a que des TRANCHES (« 3-6 mois ») : convention française
//   « taille N mois = jusqu'à N mois » → « 6 mois » ↦ « 3-6 mois / 62 cm ».
// - Beebs saute 11/13/15 ans : repli par CONTENANCE de la stature cm réelle
//   (11 ans = 146 cm ∈ « 12 ans (140-152 cm) ») — jamais un repli arbitraire.
// - null = la plateforme n'a PAS d'équivalent exact : on garde la valeur
//   canonique telle quelle (la cascade échouera visiblement plutôt que de
//   poser une taille fausse en silence).

// ── Vêtements : axe MOIS (bébé, Prématuré → 36 mois) ────────────────────────
// lbcCategory "bebe" : sur Leboncoin ces tailles vivent sur la grille de
// Famille > Vêtements bébé (plafonnée à « 36 mois / 98 cm »), pas sur la
// grille Univers-enfant de Mode > Vêtements (qui démarre à « 3 ans / 98 cm »).
export const CHILD_MONTH_SIZES = [
  { value: "Prématuré", vinted: "Prématuré, jusqu'à 44cm", lbc: "Prématuré / 44 cm", beebs: "Prématuré (- de 45 cm)",        ebay: "Bébé prématuré" },
  { value: "Naissance", vinted: "Naissance / 44 cm",       lbc: "0 mois / 50 cm",    beebs: "Naissance - 0 mois (45-50 cm)", ebay: "Naissance" },
  { value: "1 mois",    vinted: "Jusqu'à 1 mois / 50 cm",  lbc: "1 mois / 56 cm",    beebs: "1 mois (50-54 cm)",             ebay: "1 mois" },
  { value: "3 mois",    vinted: "1-3 mois / 56 cm",        lbc: "3 mois / 62 cm",    beebs: "3 mois (54-60 cm)",             ebay: "3 mois" },
  { value: "6 mois",    vinted: "3-6 mois / 62 cm",        lbc: "6 mois / 68 cm",    beebs: "6 mois (60-66 cm)",             ebay: "6 mois" },
  { value: "9 mois",    vinted: "6-9 mois / 68 cm",        lbc: "9 mois / 74 cm",    beebs: "9 mois (67-74 cm)",             ebay: "9 mois" },
  { value: "12 mois",   vinted: "9-12 mois / 74 cm",       lbc: "12 mois / 80 cm",   beebs: "12 mois (74-80 cm)",            ebay: "12 mois" },
  { value: "18 mois",   vinted: "12-18 mois / 80 cm",      lbc: "18 mois / 86 cm",   beebs: "18 mois (80-86 cm)",            ebay: "18 mois" },
  { value: "24 mois",   vinted: "18-24 mois / 86 cm",      lbc: "24 mois / 92 cm",   beebs: "24 mois (86-94 cm)",            ebay: "24 mois" },
  // eBay bébé n'a pas « 36 mois » (ses listes s'arrêtent à « 24 mois » ; le
  // cm nu « 98 » existe sur la plupart des feuilles bébé mais pas toutes —
  // Hauts bébé 260031 s'arrête à 92) : « 98 » est le meilleur équivalent, la
  // garde pré-publication eBay signalera visiblement les feuilles sans 98.
  { value: "36 mois",   vinted: "24-36 mois / 92 cm",      lbc: "36 mois / 98 cm",   beebs: "3 ans (94-102 cm)",             ebay: "98" },
];

// ── Vêtements : axe ANS (enfant/ado, 2 → 18 ans) ────────────────────────────
// « 2 ans » : Vinted et LBC n'ont pas de libellé 2 ans (2 ans = 92 cm =
// 24-36 mois / 24 mois) ; eBay enfant a « 2 ans » nommément.
// « 18 ans » n'existe QUE chez LBC (« 18 ans / 182 cm + »).
export const CHILD_YEAR_SIZES = [
  { value: "2 ans",  vinted: "24-36 mois / 92 cm", lbc: "24 mois / 92 cm",    lbcCategory: "bebe", beebs: "24 mois (86-94 cm)", ebay: "2 ans" },
  { value: "3 ans",  vinted: "3 ans / 98 cm",   lbc: "3 ans / 98 cm",   beebs: "3 ans (94-102 cm)",  ebay: "3 ans" },
  { value: "4 ans",  vinted: "4 ans / 104 cm",  lbc: "4 ans / 104 cm",  beebs: "4 ans (102-108 cm)", ebay: "4 ans" },
  { value: "5 ans",  vinted: "5 ans / 110 cm",  lbc: "5 ans / 110 cm",  beebs: "5 ans (108-116 cm)", ebay: "5 ans" },
  { value: "6 ans",  vinted: "6 ans / 116 cm",  lbc: "6 ans / 116 cm",  beebs: "6 ans (116-123 cm)", ebay: "6 ans" },
  { value: "7 ans",  vinted: "7 ans / 122 cm",  lbc: "7 ans / 122 cm",  beebs: "7 ans (123-128 cm)", ebay: "7 ans" },
  { value: "8 ans",  vinted: "8 ans / 128 cm",  lbc: "8 ans / 128 cm",  beebs: "8 ans (123-128 cm)", ebay: "8 ans" },
  { value: "9 ans",  vinted: "9 ans / 134 cm",  lbc: "9 ans / 134 cm",  beebs: "9 ans (128-132 cm)", ebay: "9 ans" },
  { value: "10 ans", vinted: "10 ans / 140 cm", lbc: "10 ans / 140 cm", beebs: "10 ans (128-140 cm)", ebay: "10 ans" },
  { value: "11 ans", vinted: "11 ans / 146 cm", lbc: "11 ans / 146 cm", beebs: "12 ans (140-152 cm)", ebay: "11 ans" }, // Beebs sans 11 ans : 146 cm ∈ 140-152
  { value: "12 ans", vinted: "12 ans / 152 cm", lbc: "12 ans / 152 cm", beebs: "12 ans (140-152 cm)", ebay: "12 ans" },
  { value: "13 ans", vinted: "13 ans / 158 cm", lbc: "13 ans / 158 cm", beebs: "14 ans (152-164 cm)", ebay: "13 ans" }, // Beebs sans 13 ans : 158 cm ∈ 152-164
  { value: "14 ans", vinted: "14 ans / 164 cm", lbc: "14 ans / 164 cm", beebs: "14 ans (152-164 cm)", ebay: "14 ans" },
  { value: "15 ans", vinted: "15 ans / 170 cm", lbc: "15 ans / 170 cm", beebs: "16 ans (164-176 cm)", ebay: "15 ans" }, // Beebs sans 15 ans : 170 cm ∈ 164-176
  { value: "16 ans", vinted: "16 ans / 176 cm", lbc: "16 ans / 176 cm", beebs: "16 ans (164-176 cm)", ebay: "16 ans" },
  { value: "18 ans", vinted: null,              lbc: "18 ans / 182 cm +", beebs: null,                ebay: null },
];

// ── Chaussures : axe POINTURES EU (15 → 41, nombres NUS partout) ────────────
// Bornes réelles : Vinted « 15 et moins » puis 16→40 ; Beebs 15→41 ; eBay
// « Pointure EU » 15→40 (+ demi-pointures et fractions « 27 1/3 », « 30 2/3 »
// — propres à eBay, la cascade de ebay.js les matche en exact quand la
// canonique les porte). eBay et Leboncoin ne passent PAS par un emitter :
// leurs scripts consomment la canonique « EU N » telle quelle (strip « EU »
// côté ebay.js, cascade « EU N » → « N » côté leboncoin.js — flux adulte
// existant, inchangé).
export const CHILD_SHOE_EU_MIN = 15;
export const CHILD_SHOE_EU_MAX = 41;

// ── Genres enfant ────────────────────────────────────────────────────────────
// Valeurs canoniques des schémas generate-listing / du stepper. « Enfant »
// (unisexe) n'a de rayon réel QUE chez eBay et LBC (Univers Enfant) —
// Vinted et Beebs exigent Fille/Garçon (Beebs a aussi Bébé).
export const CHILD_GENRES = ["Enfant", "Fille", "Garçon", "Bébé"];

export function isChildGenre(genre) {
  return CHILD_GENRES.includes(genre);
}

// ── Parsing d'une valeur canonique ───────────────────────────────────────────
const MONTH_BY_VALUE = new Map(CHILD_MONTH_SIZES.map((e) => [e.value.toLowerCase(), e]));
const YEAR_BY_VALUE = new Map(CHILD_YEAR_SIZES.map((e) => [e.value.toLowerCase(), e]));
// Pointure canonique : « EU 31 », « EU 30,5 » (virgule OU point acceptés en
// entrée, les fractions eBay « 27 1/3 » passent par la voie exacte d'ebay.js).
const SHOE_RE = /^eu\s*(\d{2})(?:[.,](5))?$/i;

/**
 * Reconnaît une taille canonique ENFANT. Un nombre nu (« 36 », « 3 ») n'est
 * JAMAIS reconnu — c'est précisément l'ambiguïté (taille adulte 34-52 vs
 * pointure vs mois) que ce référentiel élimine.
 * @param {string} value — platform_fields.taille
 * @returns {{ kind:"months"|"years", entry:object } |
 *           { kind:"shoe", eu:number, half:boolean } | null}
 */
export function parseChildSize(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return null;
  const m = MONTH_BY_VALUE.get(v);
  if (m) return { kind: "months", entry: m };
  const y = YEAR_BY_VALUE.get(v);
  if (y) return { kind: "years", entry: y };
  const shoe = v.match(SHOE_RE);
  if (shoe) return { kind: "shoe", eu: Number(shoe[1]), half: Boolean(shoe[2]) };
  return null;
}

/**
 * Convertit une taille canonique enfant vers le libellé EXACT d'une
 * plateforme (celui de son dropdown réel).
 *
 * @param {string} value — taille canonique (« 6 mois », « 8 ans », « EU 31 »)
 * @param {string} platform — "vinted" | "beebs" | "leboncoin" | "ebay"
 * @param {{ isChildGenre?: boolean }} [opts] — les POINTURES ne sont
 *   converties que si le genre est enfant : « EU 38 » existe aussi en adulte,
 *   convertir sans ce signal enverrait une pointure adulte sur une grille
 *   enfant (et réciproquement). Mois/ans sont intrinsèquement enfant : ils
 *   convertissent toujours.
 * @returns {string|null} libellé plateforme exact, ou null si la plateforme
 *   n'a pas d'équivalent (l'appelant GARDE alors la canonique : échec visible
 *   de cascade plutôt que taille fausse silencieuse).
 */
export function toPlatformChildSize(value, platform, opts = {}) {
  const parsed = parseChildSize(value);
  if (!parsed) return null;

  if (parsed.kind === "shoe") {
    if (!opts.isChildGenre) return null;
    const { eu, half } = parsed;
    if (eu < CHILD_SHOE_EU_MIN || eu > CHILD_SHOE_EU_MAX) return null;
    if (platform === "vinted") {
      // Grille relevée : « 15 et moins », puis 16→40 nus. Pas de demi-pointures.
      if (half || eu > 40) return null;
      return eu <= 15 ? "15 et moins" : String(eu);
    }
    if (platform === "beebs") {
      // Grille relevée : 15→41 nus, pas de demi-pointures.
      return half ? null : String(eu);
    }
    // ebay / leboncoin : la canonique « EU N » suit le flux adulte existant.
    return null;
  }

  const key = platform === "leboncoin" ? "lbc" : platform;
  return parsed.entry[key] ?? null;
}

/**
 * Routage catégorie Leboncoin d'une taille enfant (relevé 2026-07-15) :
 *   "bebe" — grille de Famille > Vêtements bébé (Prématuré → 36 mois, +
 *            « 2 ans » qui n'existe que là sous « 24 mois / 92 cm ») ;
 *   "mode" — grille Univers-enfant de Mode > Vêtements (3 ans → 18 ans).
 * @returns {"bebe"|"mode"|null} null si la valeur n'est pas une taille
 *   vêtement enfant (pointures et tailles adultes ne routent rien).
 */
export function lbcChildSizeCategory(value) {
  const parsed = parseChildSize(value);
  if (!parsed || parsed.kind === "shoe") return null;
  if (parsed.kind === "months") return "bebe";
  return parsed.entry.lbcCategory ?? "mode";
}
