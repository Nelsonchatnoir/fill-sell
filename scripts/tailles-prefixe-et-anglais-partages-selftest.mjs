// selftest:tailles-prefixe-et-anglais-partages — (12/11, décision de Nico, point 1a) LES TAILLES RANGÉES PAR SITE,
// PARTAGÉES PAR TOUTES LES PLATEFORMES — et une taille qui contredit la fiche ne part jamais.
//   node --import ./scripts/loader-ext.mjs scripts/tailles-prefixe-et-anglais-partages-selftest.mjs
// Cas réels (compte c7c382b7, 12/11, lus en base en lecture seule) :
//   · Depop baf800fe (pull, menswear/tops/jumpers, grille IT 56) : « EU M » refusé — la lettre est dans la grille ;
//   · Depop fe3af982 (leggings, kidswear/bottoms/leggings, grille IT 101) : « EU 140cm » refusé — « 10 years » y est ;
//   · fiche 1793630721658 (étiquette lue par Lens : « EU 140cm » = 10 ans) : Vinted e05bc4ae PUBLIÉE « 9 ans / 134 cm »,
//     Beebs 8c447bfa PUBLIÉE « Naissance - 0 mois (45-50 cm) » — des tailles de copie qui contredisent la fiche ;
//   · relevé Beebs du 12/11 21:10 : attributs.taille (« Naissance… ») et attributs.marque (« Autre ») de la fiche
//     réécrits depuis NOTRE dépôt (source releve_beebs, aucune ligne d'inventaire_journal : écrit par le relevé de
//     l'extension, arbitré par le déclencheur inventaire_attributs_avant_update).
// La règle d'eBay du 07/11 (taille-ebay.js E1/E2, « module PROPRE À eBay ») devient LA règle commune (tailles.js) :
//   « EU/EUR/FR/IT/INT + lettre » = la lettre ; « UK/US + lettre » = la lettre de XS à XXL seulement, jamais un
//   chiffre ; « EU 140cm » = 140 cm ; cm → âge par la table des étiquettes ; « months/mths/yrs/years » = mois/ans
//   (même unité, jamais mois ↔ ans) ; « Other »/« Autre »/« One size » ne cassent plus une grille d'âges.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as T from "../supabase/functions/_shared/tailles.js";
import * as E from "../supabase/functions/_shared/taille-ebay.js";
import { tailleDepop } from "../src/utils/depopPublication.js";
import * as G from "../src/utils/tailleInventee.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let ko = 0, n = 0;
const dit = (msg, cond, detail) => {
  n++;
  if (cond) console.log(`  ok   ${msg}`);
  else { ko++; console.log(`  KO   ${msg}${detail === undefined ? "" : `   ← ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`); }
};
const essai = (f) => { try { return f(); } catch (e) { return `EXCEPTION ${e?.message ?? e}`; } };
const v = (brut, grille) => essai(() => T.tailleDansGrille(brut, grille)?.valeur ?? null);
const meme = (a, b) => essai(() => T.memeTaille(a, b));

// Les grilles réelles de la région IT (compte en euros) — docs/plateformes/depop/tailles.json, relevé du 08/10.
const DEPOP = JSON.parse(lire("docs/plateformes/depop/tailles.json"));
const grille = (id) => DEPOP.grilles.find((g) => g.id === id && g.region === "IT").tailles.map((t) => t.libelle);
const G56 = grille(56);    // mens-top-sizes : One size, 3XS … 6XL, 36 … 48, Other (baf800fe)
const G101 = grille(101);  // kids-apparel-sizes : One size, 0-3 months … 16 years, Other (fe3af982)
// Vinted, grille enfant (dernier échec de f3ba2985, tailles-prefixe-age-selftest).
const VINTED_ENFANT = ["Prématuré, jusqu'à 44cm", "Naissance / 44 cm", "Jusqu'à 1 mois / 50 cm", "1-3 mois / 56 cm", "3-6 mois / 62 cm",
  "6-9 mois / 68 cm", "9-12 mois / 74 cm", "12-18 mois / 80 cm", "18-24 mois / 86 cm", "24-36 mois / 92 cm", "3 ans / 98 cm",
  "4 ans / 104 cm", "5 ans / 110 cm", "6 ans / 116 cm", "7 ans / 122 cm", "8 ans / 128 cm", "9 ans / 134 cm",
  "10 ans / 140 cm", "11 ans / 146 cm", "12 ans / 152 cm"];

console.log("A. LE VOCABULAIRE PAR SITE (_shared/tailles.js), PARTAGÉ PAR TOUTES LES PLATEFORMES");
dit("les systèmes de taille sont une TABLE par site (EU, EUR, FR, IT, INT, UK, US…), pas une liste de préfixes à retirer",
  !!T.SYSTEMES_DE_TAILLE && T.SYSTEMES_DE_TAILLE.eu?.systeme === "EU" && T.SYSTEMES_DE_TAILLE.eur?.systeme === "EU"
  && T.SYSTEMES_DE_TAILLE.uk?.lettres === "xs-xxl" && T.SYSTEMES_DE_TAILLE.fr?.lettres === "toutes", T.SYSTEMES_DE_TAILLE);
dit("Depop baf800fe : « EU M » → « M » (grille 56)", v("EU M", G56) === "M", v("EU M", G56));
for (const [brut, att] of [["EUR L", "L"], ["FR S", "S"], ["INT XL", "XL"], ["IT M", "M"], ["EU XXL", "XXL"], ["EU 2XL", "XXL"], ["EU 3XL", "3XL"]]) {
  dit(`« ${brut} » → « ${att} »`, v(brut, G56) === att, v(brut, G56));
}
for (const [brut, att] of [["UK M", "M"], ["US XL", "XL"], ["UK XS", "XS"], ["US XXL", "XXL"], ["US 2XL", "XXL"]]) {
  dit(`« ${brut} » → « ${att} » (UK/US + lettre, de XS à XXL)`, v(brut, G56) === att, v(brut, G56));
}
dit("« US 3XL », « UK XXS » : jamais repliés (UK/US + lettre hors XS→XXL), même si la grille porte 3XL et XXS",
  v("US 3XL", G56) === null && v("UK XXS", G56) === null, [v("US 3XL", G56), v("UK XXS", G56)]);
dit("« UK 10 », « US 8 » : jamais un chiffre d'un autre pays (≠ « 10 », ≠ « 38 »)",
  v("UK 10", ["10", "38", "M"]) === null && v("US 8", ["8", "38"]) === null && meme("UK 10", "10") === false && meme("US 8", "8") === false);
dit("point G inchangé : « EU 42 » ≢ « 42 » ; « EUR 38 » ≡ « EU 38 » ≢ « 38 »",
  meme("EU 42", "42") === false && meme("EUR 38", "EU 38") === true && meme("EUR 38", "38") === false);
dit("les lettres d'avant inchangées : « M » ≡ « m », « 2XL » ≡ « XXL », « S » ≢ « M »",
  meme("M", "m") && meme("2XL", "XXL") && !meme("S", "M"));
dit("une lettre COLLÉE au préfixe n'est pas lue (« ITS », « DES » ne sont pas des tailles)", v("ITS", ["S"]) === null && v("DES", ["S"]) === null);

console.log("\n   — la stature (cm) et l'âge");
dit("Depop fe3af982 : « EU 140cm » → « 10 years » (grille 101 : âges, « One size » et « Other »)", v("EU 140cm", G101) === "10 years", v("EU 140cm", G101));
dit("« 140 cm » → « 10 years » : « Other » ne casse plus la grille d'âges", v("140 cm", G101) === "10 years", v("140 cm", G101));
dit("« EUR 128 cm » → « 8 years »", v("EUR 128 cm", G101) === "8 years", v("EUR 128 cm", G101));
dit("« EU 140cm » → « 10 ans / 140 cm » (Vinted : la grille écrit la stature)", v("EU 140cm", VINTED_ENFANT) === "10 ans / 140 cm", v("EU 140cm", VINTED_ENFANT));
dit("« EU 140cm » ≡ « 140 cm » ≡ « 140cm »", meme("EU 140cm", "140 cm") === true && meme("EU 140cm", "140cm") === true);
dit("« 140 » nu n'est jamais lu comme des cm par un préfixe : « EU 140 » ≢ « 140 cm »", meme("EU 140", "140 cm") === false);
dit("« Autre » neutre aussi : « 140 cm » face à [0-3 months, 10 years, Autre] → « 10 years »",
  v("140 cm", ["0-3 months", "10 years", "Autre"]) === "10 years", v("140 cm", ["0-3 months", "10 years", "Autre"]));
dit("une grille sans aucun âge (« One size », « Other ») ne devient pas une grille d'âges", v("140 cm", ["One size", "Other"]) === null);
for (const [a, b] of [["3-6 mois", "3-6 months"], ["6 mois", "6 months"], ["12 mths", "12 mois"], ["11-12 yrs", "11-12 ans"],
  ["Age 11-12", "11-12 ans"], ["10 years old", "10 ans"], ["3-4 yrs", "3-4 ans"], ["18 month", "18 mois"]]) {
  dit(`« ${a} » ≡ « ${b} » (même unité)`, meme(a, b) === true);
}
dit("jamais mois ↔ ans : « 24 months » ≢ « 2 ans », « 12 months » ≢ « 1 an »", meme("24 months", "2 ans") === false && meme("12 months", "1 an") === false);
dit("« 3-6 mois » → « 3-6 months » (grille 101)", v("3-6 mois", G101) === "3-6 months", v("3-6 mois", G101));
dit("« 18-24 mois » → « 18-24 months » (grille 101)", v("18-24 mois", G101) === "18-24 months", v("18-24 mois", G101));
dit("« 10 yrs » → « 10 years » (grille 101)", v("10 yrs", G101) === "10 years", v("10 yrs", G101));
dit("une tranche n'est JAMAIS une de ses bornes : « 11/12 yrs » face à [11 ans, 12 ans] → rien ; « 6/9 mois » face à [6 mois, 9 mois] → rien",
  v("11/12 yrs", ["11 ans", "12 ans"]) === null && v("6/9 mois", ["6 mois", "9 mois"]) === null, [v("11/12 yrs", ["11 ans", "12 ans"]), v("6/9 mois", ["6 mois", "9 mois"])]);
dit("l'âge anglais vit dans le commun : ageEnFrancais exporté par tailles.js, et taille-ebay.js rend LA MÊME fonction",
  typeof T.ageEnFrancais === "function" && E.ageEnFrancais === T.ageEnFrancais);

console.log("\nB. L'EXTENSION (Depop) : LA MÊME RÈGLE, À L'OCTET");
{
  const regle = lire("supabase/functions/_shared/tailles.js").replace(/^export function /gm, "function ").replace(/^export const /gm, "const ");
  dit("depop-tailles.js est la copie à l'octet de _shared/tailles.js (npm run gen:tailles-depop)", lire("chrome-extension/content-scripts/depop-tailles.js").includes(regle));
  const ctx = vm.createContext({ console, URL, Math, Number, String, Array, Object, Set, Map, JSON, Date, Promise, RegExp, Error, globalThis: undefined });
  ctx.globalThis = ctx;
  vm.runInContext(lire("chrome-extension/content-scripts/depop-tailles.js"), ctx, { filename: "depop-tailles.js" });
  vm.runInContext(`${lire("chrome-extension/content-scripts/depop.js")}\n;globalThis.__t = { depopResoudreTaille };`, ctx, { filename: "depop.js" });
  const brut = JSON.parse(lire("docs/plateformes/depop/brut/attributes-categories-size-mapping.json"));
  const grilles = { feuilles: new Map(), grilles: new Map(brut.size_sets.map((s) => [s.id, s])) };
  for (const e of brut.category_size_mapping) grilles.feuilles.set(`${e.department}/${e.group}/${e.product_type}`, e);
  const lib = (chemin, t) => { const r = essai(() => ctx.__t.depopResoudreTaille({ depopTaille: t }, chemin.split("/"), "IT", grilles)); return r?.libelle ?? (r?.question ? "QUESTION" : JSON.stringify(r)); };
  dit("connecteur, baf800fe : menswear/tops/jumpers « EU M » → « M »", lib("menswear/tops/jumpers", "EU M") === "M", lib("menswear/tops/jumpers", "EU M"));
  dit("connecteur, fe3af982 : kidswear/bottoms/leggings « EU 140cm » → « 10 years »", lib("kidswear/bottoms/leggings", "EU 140cm") === "10 years", lib("kidswear/bottoms/leggings", "EU 140cm"));
  dit("connecteur : « 3-6 mois » → « 3-6 months »", lib("kidswear/bottoms/leggings", "3-6 mois") === "3-6 months", lib("kidswear/bottoms/leggings", "3-6 mois"));
  dit("connecteur : « UK 8 » sur des sandales homme reste une QUESTION (jamais converti)", lib("menswear/footwear/sandals", "UK 8") === "QUESTION");
}

console.log("\nC. L'APP (Depop) : tailleDepop lit la stature PARTAGÉE");
dit("tailleDepop(« EU 140cm », kidswear/bottoms/leggings) = « 10 years »", essai(() => tailleDepop("EU 140cm", ["kidswear", "bottoms", "leggings"])) === "10 years",
  essai(() => tailleDepop("EU 140cm", ["kidswear", "bottoms", "leggings"])));
dit("tailleDepop(« 128 cm ») = « 8 years » (inchangé)", tailleDepop("128 cm", ["kidswear", "bottoms", "leggings"]) === "8 years");
dit("tailleDepop(« 92 cm ») reste « 92 cm » (24 mois = 2 ans : deux tailles Depop, la question)", tailleDepop("92 cm", ["kidswear", "bottoms", "leggings"]) === "92 cm");
dit("depopPublication.js : plus de regex locale de stature (la stature vient de tailles.js)",
  !/\(\?:t\|taille\)\?\\s\*\(\\d\{2,3\}\)/.test(lire("src/utils/depopPublication.js")) && /statureEnfant/.test(lire("src/utils/depopPublication.js")));

console.log("\nD. eBay DÉLÈGUE AU COMMUN (une seule règle)");
{
  const src = lire("supabase/functions/_shared/taille-ebay.js");
  dit("taille-ebay.js ne porte plus sa propre lecture des préfixes de lettres ni sa propre lecture de l'âge anglais",
    !/eur\|eu\|fr\|int\)\\s\*\[:\.\]\?\\s\*\(\[a-z0-9\]\{1,6\}\)/.test(src) && !/const AGE_RE = new RegExp/.test(src) && !/Module PROPRE À eBay/.test(src));
  dit("eBay : « 11-12 yrs » → « 11-12 ans » (E1, désormais la règle commune)", E.tailleEbayComplement("Taille", "11-12 yrs", ["10 ans", "11-12 ans"])?.valeur === "11-12 ans"
    || T.tailleDansGrille("11-12 yrs", ["10 ans", "11-12 ans"])?.valeur === "11-12 ans");
  dit("eBay : « EU S » → « S » sur une liste fermée", T.tailleDansGrille("EU S", ["XS", "S", "M"])?.valeur === "S");
}

console.log("\nE. UNE TAILLE DE COPIE QUI CONTREDIT LA FICHE NE PART JAMAIS (utils/tailleInventee.js)");
{
  const g = (t, o) => essai(() => G.tailleAGarder(t, o));
  const beebs = g("Naissance", { tailleFiche: "", tailleLue: "EU 140cm" });
  dit("Beebs 8c447bfa : « Naissance » contre l'étiquette « EU 140cm » → écartée, remplacée par « 10 ans »",
    beebs?.garder === false && beebs?.remplacement === "10 ans", beebs);
  const vinted = g("9 ans", { tailleFiche: "", tailleLue: "EU 140cm" });
  dit("Vinted e05bc4ae : « 9 ans » contre « EU 140cm » → écartée, remplacée par « 10 ans »", vinted?.garder === false && vinted?.remplacement === "10 ans", vinted);
  dit("« 10 ans » face à « EU 140cm » : gardée (la même taille)", g("10 ans", { tailleLue: "EU 140cm" })?.garder === true, g("10 ans", { tailleLue: "EU 140cm" }));
  dit("« 9-10 ans » face à « EU 140cm » : gardée (la tranche la contient)", g("9-10 ans", { tailleLue: "EU 140cm" })?.garder === true);
  const lettre = g("L", { tailleFiche: "EU M" });
  dit("« L » contre la fiche « EU M » → écartée, remplacée par « M »", lettre?.garder === false && lettre?.remplacement === "M", lettre);
  dit("« M » face à « EU M » : gardée", g("M", { tailleFiche: "EU M" })?.garder === true);
  dit("« 6 mois » face à « 62 cm » : gardée (« N mois » = jusqu'à N mois : 62-68 cm)", g("6 mois", { tailleFiche: "62 cm" })?.garder === true, g("6 mois", { tailleFiche: "62 cm" }));
  dit("« 3-6 mois / 62 cm » face à « 6 mois » : gardée", g("3-6 mois / 62 cm", { tailleFiche: "6 mois" })?.garder === true);
  dit("« S / 36 / 8 » face à « 36 » : gardée (un morceau dit la même taille)", g("S / 36 / 8", { tailleFiche: "36" })?.garder === true);
  dit("« XL » face à « 42 » : gardée (deux systèmes que rien ne relie : jamais une contradiction inventée)", g("XL", { tailleFiche: "42" })?.garder === true);
  dit("« 140 » face à la fiche « EU 140cm » : gardée (un nombre nu n'est pas une stature : incomparables, la règle d'avant)", g("140", { tailleFiche: "EU 140cm" })?.garder === true);
  const doute = g("10 ans", { tailleFiche: "9 ans / 134 cm", tailleLue: "EU 140cm" });
  dit("la fiche et l'étiquette se contredisent : la copie qui en contredit une est écartée, SANS remplacement (la question)",
    doute?.garder === false && (doute?.remplacement ?? null) === null, doute);
  dit("inchangé : « Prématuré » sur des barrettes (aucune taille dite) → écartée, inventée",
    g("Prématuré", { tailleFiche: "", texte: "Lot de 2 barrettes Marie Les Aristochats Disney" })?.garder === false);
  dit("inchangé : « XXL » face à la fiche « XXL » → gardée", g("XXL", { tailleFiche: "XXL", texte: "Blazer tweed noir" })?.garder === true);
  // Les références de la fiche, lues comme la publication les lit.
  const ficheLegging = { titre: "girls green ribbed leggings, EU 140cm", attributs: {
    attributs_visibles: { source: "lens", v: { coupe: "legging", reference_fabricant: "451458", taille: "EU 140cm" } },
    taille: { v: "Naissance - 0 mois (45-50 cm)", source: "releve_beebs", at: "2026-11-12T20:10:40.921Z" } } };
  const refs = essai(() => G.referencesTailleFiche(ficheLegging));
  dit("referencesTailleFiche : la taille de la fiche, SA SOURCE, et celle de l'étiquette (attributs_visibles.taille)",
    refs?.tailleFiche === "Naissance - 0 mois (45-50 cm)" && refs?.sourceFiche === "releve_beebs" && refs?.tailleLue === "EU 140cm", refs);
  // La fiche telle que le relevé du 12/11 21:10 l'a laissée : sa taille relevée n'est pas une référence, l'étiquette si.
  const polluee = (t) => g(t, { ...refs, texte: ficheLegging.titre });
  dit("fiche polluée par le relevé : « 10 ans » gardée (l'étiquette fait foi, la taille relevée « Naissance » ne juge pas)", polluee("10 ans")?.garder === true, polluee("10 ans"));
  dit("fiche polluée par le relevé : « 9 ans » remplacée par « 10 ans »", polluee("9 ans")?.remplacement === "10 ans", polluee("9 ans"));
  dit("une taille RELEVÉE n'est jamais une référence (« 28 » relevé chez Depop = W28) : « 38 » gardée",
    g("38", { tailleFiche: "28", sourceFiche: "releve_depop", tailleLue: "W28 L32" })?.garder === true);
  dit("un NOMBRE NU d'étiquette n'est pas une référence (« 27 » : W27 ?) : « 42 » face à la fiche « EU 42 » gardée",
    g("42", { tailleFiche: "EU 42", sourceFiche: "manuel", tailleLue: "27" })?.garder === true);
  dit("un nombre PRÉFIXÉ d'étiquette l'est : « EU 36 » face à l'étiquette « EU 36,5 » → « EU 36.5 »",
    g("EU 36", { tailleFiche: "Autre", sourceFiche: "vinted_detail", tailleLue: "EU 36,5" })?.remplacement === "EU 36.5");
  const manuelContreEtiquette = g("XS", { tailleFiche: "XS", sourceFiche: "manuel", tailleLue: "M" });
  dit("fiche « XS » (manuel) et étiquette « M » se contredisent : la copie « XS » devient la question (le doute)",
    manuelContreEtiquette?.garder === false && (manuelContreEtiquette?.remplacement ?? null) === null, manuelContreEtiquette);
  const refsLens = essai(() => G.referencesTailleFiche({ attributs_visibles: { pointure: "EU 38" } }));
  dit("referencesTailleFiche : la lecture Lens de la session (attributs_visibles.pointure)", refsLens?.tailleLue === "EU 38", refsLens);
  const res = lire("src/utils/resolutionPublication.js");
  dit("resolutionPublication : la garde reçoit les références de la fiche (étiquette comprise) et pose le remplacement",
    /referencesTailleFiche\(initialListing\)/.test(res) && /verdict\.remplacement/.test(res) && /taille_corrigee_par_la_fiche/.test(res));
}

console.log("\nF. LA BASE : UN RELEVÉ NE COMPLÈTE JAMAIS UNE FICHE DEPUIS NOTRE PROPRE DÉPÔT (migration, NON appliquée)");
{
  const M = "supabase/migrations/20261112213000_releve_jamais_depuis_notre_depot.sql";
  const I = "supabase/rollbacks/20261112213000_releve_jamais_depuis_notre_depot_INVERSE.sql";
  const mig = essai(() => lire(M)), inv = essai(() => lire(I));
  dit("la migration existe et réécrit fiche_completer_depuis_annonce ET le déclencheur d'arbitrage des attributs",
    /CREATE OR REPLACE FUNCTION public\.fiche_completer_depuis_annonce\(p_annonce_id uuid\)/.test(mig)
    && /CREATE OR REPLACE FUNCTION public\.inventaire_attributs_avant_update\(\)/.test(mig), M);
  dit("gardes md5 sur les définitions de PROD (réécrites depuis pg_get_functiondef, jamais depuis le dépôt)",
    (mig.match(/md5\(replace\(pg_get_functiondef/g) ?? []).length >= 2);
  dit("attributs_visibles.taille / pointure comptent comme fiche renseignée", /attributs_visibles/.test(mig) && /pointure/.test(mig));
  dit("le dépôt FillSell se reconnaît par la tâche (job de l'annonce, ou listing désigné par un dépôt de CETTE fiche)",
    /CREATE OR REPLACE FUNCTION public\.annonce_vient_de_notre_depot/.test(mig) && /listing_designe/.test(mig) && /job_id/.test(mig));
  dit("l'inverse existe et remet les définitions de prod", /CREATE OR REPLACE FUNCTION public\.fiche_completer_depuis_annonce/.test(inv)
    && /CREATE OR REPLACE FUNCTION public\.inventaire_attributs_avant_update/.test(inv) && /DROP FUNCTION IF EXISTS public\.annonce_vient_de_notre_depot/.test(inv), I);
  dit("le banc sur base jetable existe", essai(() => lire("scripts/essais/20261112213000_banc.mjs")).includes("embedded-postgres"));
}

console.log("\nG. LA RÉPARATION DE LA FICHE (script NON exécuté) — aucune annonce en ligne touchée");
{
  const R = "scripts/reparations/20261112_c7c382b7_fiche_legging.sql";
  const rep = essai(() => lire(R)), inv = essai(() => lire(R.replace(".sql", "_INVERSE.sql"))), pr = essai(() => lire(R.replace(".sql", "_PREUVE.sql")));
  dit("le script vise la seule fiche 1793630721658 du compte c7c382b7, sauvegarde d'abord", /1793630721658/.test(rep) && /c7c382b7/.test(rep)
    && /_backup_1112_c7c382b7_fiche_legging/.test(rep), R);
  dit("il ne retire attributs.taille et attributs.marque que s'ils portent ENCORE les valeurs du relevé", /releve_beebs/.test(rep) && /Naissance - 0 mois \(45-50 cm\)/.test(rep) && /'Autre'/.test(rep));
  dit("aucune annonce ni tâche touchée (ni UPDATE ni DELETE sur annonces_plateforme / cross_post_jobs)",
    !/(UPDATE|DELETE FROM|INSERT INTO)\s+(public\.)?(annonces_plateforme|cross_post_jobs)/i.test(rep + inv));
  dit("inverse et preuve existent", /_backup_1112_c7c382b7_fiche_legging/.test(inv) && /1793630721658/.test(pr));
}

if (ko) { console.error(`\n[selftest:tailles-prefixe-et-anglais-partages] ${ko} ROUGE(S) sur ${n}`); process.exit(1); }
assert.ok(true);
console.log(`\n[selftest:tailles-prefixe-et-anglais-partages] OK — ${n} vérifications vertes`);
