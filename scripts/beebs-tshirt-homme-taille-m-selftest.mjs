// Selftest « verrou » du 17/11 — Beebs, T-shirt homme en M : la taille en lettres reste une lettre.
// Cas : thecloset72000 (lot 123e6fcb du 17/11 08:04), Levi's Batwing, fiche Vinted « M / 38 / 10 » ; rayon Beebs
// « Mode > Homme > Vêtements (homme) > T-shirts (homme) », grille en LETTRES (XS…8XL, Universel). Toutes les copies
// portaient « 38 » : le sélecteur de taille de l'app (optionTaillePlateforme → findMatchingOption) rapprochait la
// taille ENTIÈRE par mots avant de la lire morceau par morceau, et ce rapprochement écarte les options d'une seule
// lettre (« S », « M », « L ») — il gardait le nombre. « 38 » n'est pas dans la grille Beebs homme : question « Taille »
// bloquante, lot entier arrêté (usage_logs champ_requis_bloquant 08:04, lot_quitte_sans_envoyer 08:09).
// Rouge avant le correctif (« M / 38 / 10 » → « 38 »), vert après (→ « M »).
// Grilles RÉELLES relevées (platform_category_aspects, beebs) le 17/11 : toutes les grilles « Taille » des rayons
// vêtements adulte homme et femme.
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { texteComparable } from "../src/utils/texteComparable.js";
import { lireTourDeTaille } from "../supabase/functions/_shared/taille-de-service.js";
import { CHILD_MONTH_SIZES, CHILD_YEAR_SIZES, CHILD_SHOE_EU_MIN, CHILD_SHOE_EU_MAX } from "../src/utils/childSizes.js";
import { jugerValeurContreListe, tailleDuJob, tailleDeLaFicheDansLaGrille } from "../src/publication/moteur/listes.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let n = 0;
const ok = (m) => { n++; console.log(`  ✓ ${m}`); };

// ── Les grilles Beebs des vêtements adulte (relevé du 17/11) ──────────────────────────────────────────────────────
const H_LETTRES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "7XL", "8XL", "Universel"]; // 14 rayons (T-shirts, pulls, sweats, manteaux…)
const H_BAS = ["32", "34", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "58", "60", "62", "64",
  "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "7XL", "8XL"]; // 13 rayons (jeans, pantalons, shorts, joggings)
const H_COSTUMES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "7XL", "8XL", "22", "23", "24", "25", "26",
  "27", "28", "29", "30", "42", "44", "46", "48", "50", "52", "54", "56", "58", "60", "62", "64", "66", "68", "70", "72", "74",
  "76", "78", "90", "94", "98", "102", "106", "110", "112", "118"]; // 2 rayons
const H_CHEMISES_COL = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "7XL", "8XL", "35 cm", "36 cm", "37 cm",
  "38 cm", "39 cm", "40 cm", "41 cm", "42 cm", "43 cm", "44 cm", "45 cm", "46 cm", "47 cm", "48 cm", "49 cm", "50 cm", "51 cm", "52 cm"];
const F_STANDARD = ["XXXS / 30", "XXS / 32", "XS / 34", "S / 36", "M / 38", "L / 40", "XL / 42", "XXL / 44", "XXXL / 46",
  "4XL / 48", "5XL / 50", "6XL / 52", "7XL / 54", "8XL / 56", "9XL / 58", "Taille unique", "Autre"]; // 56 rayons
const F_MATERNITE = ["Taille unique", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"]; // 3 rayons
const TSHIRT_HOMME = ["Mode", "Homme", "Vêtements (homme)", "T-shirts (homme)"];
const TSHIRT_FEMME = ["Mode", "Femme", "Vêtements (femme)", "T-shirts et tops (femme)", "T-shirts (femme)"];

// ── 1. LA CAUSE : le sélecteur de taille de l'app (ListingPreviewScreen), exécuté sur la vraie liste `size` ─────────
function chargerSelecteur() {
  const src = lire("src/components/ListingPreviewScreen.jsx");
  const bloc = (debut, fin) => {
    const i = src.indexOf(debut);
    assert.ok(i >= 0, `introuvable dans ListingPreviewScreen.jsx : ${debut}`);
    const j = src.indexOf(fin, i);
    assert.ok(j > i, `fin introuvable après : ${debut}`);
    return src.slice(i, j + fin.length);
  };
  const js = [
    bloc("const FR_TO_EBAY_CONDITION = {", "\n};"),
    bloc("const PURE_NUMBER_RE =", ";"),
    bloc("const optionMatchesAsWords =", "\n};"),
    bloc("function findMatchingOption(", "\n}"),
    bloc("function optionTaillePlateforme(", "\n}"),
  ].join("\n");
  return new Function("texteComparable", "lireTourDeTaille", `${js}\nreturn { findMatchingOption, optionTaillePlateforme };`)(texteComparable, lireTourDeTaille);
}
// La liste `size` de getPlatformFieldsConfig, construite comme l'écran la construit.
const opt = (v) => ({ value: v, label: v });
const SIZE = [
  ...["XS", "S", "M", "L", "XL", "XXL", "Unique"].map(opt),
  ...Array.from({ length: 10 }, (_, i) => opt(String(34 + 2 * i))),
  ...Array.from({ length: 23 }, (_, i) => opt(`EU ${(70 + i) / 2}`)),
  ...CHILD_MONTH_SIZES.map((e) => opt(e.value)), ...CHILD_YEAR_SIZES.map((e) => opt(e.value)),
  ...Array.from({ length: CHILD_SHOE_EU_MAX - CHILD_SHOE_EU_MIN + 1 }, (_, i) => opt(`EU ${CHILD_SHOE_EU_MIN + i}`)),
];
const { optionTaillePlateforme } = chargerSelecteur();

assert.equal(optionTaillePlateforme("M / 38 / 10", SIZE), "M", "« M / 38 / 10 » (Vinted femme) doit rester « M », jamais « 38 »");
ok("Levi's de thecloset72000 : « M / 38 / 10 » → « M » dans la copie (avant : « 38 »)");
assert.equal(optionTaillePlateforme("S / 36 / 8", SIZE), "S");
assert.equal(optionTaillePlateforme("L / 40 / 12", SIZE), "L");
ok("même règle pour S et L (« S / 36 / 8 » → « S », « L / 40 / 12 » → « L »)");
assert.equal(optionTaillePlateforme("XS / 34 / 6", SIZE), "XS");
assert.equal(optionTaillePlateforme("XL / 42 / 14", SIZE), "XL");
assert.equal(optionTaillePlateforme("XXL / 44 / 16", SIZE), "XXL");
ok("inchangé : XS, XL, XXL gardaient déjà leur lettre");
assert.equal(optionTaillePlateforme("M", SIZE), "M");
assert.equal(optionTaillePlateforme("38", SIZE), "38");
assert.equal(optionTaillePlateforme("12 ans / 152 cm", SIZE), "12 ans");
assert.equal(optionTaillePlateforme("Taille unique", SIZE), "Unique");
ok("inchangé : une seule écriture (« M », « 38 », « Taille unique » → « Unique ») ; un âge composite (« 12 ans / 152 cm » → « 12 ans »)");
assert.equal(optionTaillePlateforme("33/34", SIZE), "34", "tour de taille : comportement d'avant, inchangé");
assert.equal(optionTaillePlateforme("W32 / L34", SIZE), "");
ok("inchangé : un tour de taille suit le chemin d'avant (aucune lecture nouvelle)");

// ── 2. LA LETTRE DANS LA GRILLE BEEBS : homme et femme, toutes les grilles vêtements adulte ──────────────────────
const jugeBeebs = (value, grille, chemin) => jugerValeurContreListe({ platform: "beebs", key: "Taille", value, allowedValues: grille, cheminCategorie: chemin });
for (const l of ["XS", "S", "M", "L", "XL", "XXL"]) {
  for (const [nom, grille] of [["lettres homme", H_LETTRES], ["bas homme", H_BAS], ["costumes homme", H_COSTUMES], ["maternité", F_MATERNITE]]) {
    const v = jugeBeebs(l, grille, TSHIRT_HOMME);
    assert.ok(v.dans && v.valeurListe === l, `${l} sur la grille ${nom} : ${JSON.stringify(v)}`);
  }
  const f = jugeBeebs(l, F_STANDARD, TSHIRT_FEMME);
  assert.ok(f.dans && f.valeurListe === F_STANDARD.find((x) => x.startsWith(`${l} /`)), `${l} sur la grille femme : ${JSON.stringify(f)}`);
}
for (const l of ["XS", "S", "M", "L", "XL", "XXL"]) {
  assert.equal(jugeBeebs(l, H_CHEMISES_COL, TSHIRT_HOMME).valeurListe, l, `${l} sur la grille chemises (col en cm)`);
}
assert.equal(jugeBeebs("38", H_CHEMISES_COL, TSHIRT_HOMME).dans, false, "« 38 » n'est jamais un col de 38 cm");
ok("XS…XXL → la valeur exacte de chaque grille Beebs adulte (homme : « M » ; femme : « M / 38 » ; chemises : la lettre, jamais un col)");
assert.equal(jugeBeebs("M / 38 / 10", H_LETTRES, TSHIRT_HOMME).valeurListe, "M");
assert.equal(jugeBeebs("M / 38 / 10", H_BAS, TSHIRT_HOMME).valeurListe, "M", "bas homme : la lettre, jamais le 38 homme");
assert.equal(jugeBeebs("M / 38 / 10", F_STANDARD, TSHIRT_FEMME).valeurListe, "M / 38");
assert.equal(jugeBeebs("M / 38 / 10", F_MATERNITE, TSHIRT_FEMME).valeurListe, "M");
ok("la fiche « M / 38 / 10 » telle quelle : « M » chez l'homme (même sur la grille mixte des bas), « M / 38 » chez la femme");
assert.equal(tailleDuJob({ platform: "beebs", taille: "M", lignes: [{ key: "Taille", allowedValues: H_LETTRES }], cheminCategorie: TSHIRT_HOMME }), null);
assert.equal(tailleDuJob({ platform: "beebs", taille: "M", lignes: [{ key: "Taille", allowedValues: F_STANDARD }], cheminCategorie: TSHIRT_FEMME }), "M / 38");
ok("le job Beebs part avec l'écriture exacte de la grille (« M », ou « M / 38 » chez la femme)");

// ── 3. JAMAIS UNE TAILLE IMPOSÉE : sans source sûre, la question, avec toute la grille ─────────────────────────────
const sans = jugeBeebs("38", H_LETTRES, TSHIRT_HOMME);
assert.equal(sans.dans, false);
assert.equal(sans.suggested, null, "aucune lettre choisie à la place de la personne pour un « 38 » seul");
ok("« 38 » seul sur la grille homme en lettres : hors grille, rien de suggéré → la question (un nombre ne devient jamais une lettre)");

// ── 4. UNE COPIE QUI N'A GARDÉ QUE « 38 » (brouillon d'avant le correctif) : la fiche dit la lettre ────────────────
const deLaFiche = (valeurCopie, tailleFiche, grille, chemin = TSHIRT_HOMME, key = "Taille") =>
  tailleDeLaFicheDansLaGrille({ platform: "beebs", key, valeurCopie, tailleFiche, allowedValues: grille, cheminCategorie: chemin });
assert.equal(deLaFiche("38", "M / 38 / 10", H_LETTRES), "M");
ok("copie « 38 », fiche « M / 38 / 10 », T-shirt homme → « M » (la fiche, traduite ; posée sur la copie Beebs, modifiable)");
assert.equal(deLaFiche("38", "M / 38 / 10", H_BAS), null, "« 38 » est dans la grille des bas : jamais retouché");
assert.equal(deLaFiche("38", "38", H_LETTRES), null, "fiche sans composite : la question");
assert.equal(deLaFiche("40", "M / 38 / 10", H_LETTRES), null, "copie qui n'est pas un morceau de la fiche : la question");
assert.equal(deLaFiche("", "M / 38 / 10", H_LETTRES), null);
assert.equal(deLaFiche("38", "M / 38 / 10", ["75A et AA", "75B", "80B"], TSHIRT_FEMME), null, "grille de bonnets : la question");
assert.equal(deLaFiche("38", "M / 38 / 10", H_LETTRES, TSHIRT_HOMME, "Couleur"), null, "seul un champ taille");
ok("rien de sûr → null, la question reste : valeur déjà dans la grille, fiche sans composite, autre taille, bonnets, autre champ");

// ── 5. Le câblage : l'écran se sert de la règle, la pose passe par la copie de CETTE plateforme ───────────────────
const ecran = lire("src/components/ListingPreviewScreen.jsx");
assert.ok(/tailleDeLaFicheDansLaGrille\(\{/.test(ecran), "ListingPreviewScreen appelle tailleDeLaFicheDansLaGrille");
assert.ok(/source: "taille_de_la_fiche_dans_la_grille"/.test(ecran), "la déduction est tracée (option_du_texte)");
assert.ok(/const CHAMP_REQUIS_VERS_COPIE = new Set\(\[[^\]]*"taille_de_la_fiche_dans_la_grille"/.test(ecran)
  && ecran.includes('else if (CHAMP_REQUIS_VERS_COPIE.has(d.source) && (a.dedicatedTarget === "taille" || a.dedicatedTarget === "matiere")) {'),
  "la pose écrit le champ dédié « taille » de la copie (CHAMP_REQUIS_VERS_COPIE)");
ok("l'écran pose la lettre de la fiche sur la copie Beebs (champ dédié, tracé), jamais dans le canal que beebs.js saute");

console.log(`beebs-tshirt-homme-taille-m : ${n} contrôles verts`);
