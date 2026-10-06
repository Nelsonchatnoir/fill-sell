// Autotest de LA TAILLE SERVIE (06/10 soir) — `npm run selftest:taille-de-service`
// _shared/taille-de-service.js, _shared/taille-question-auto.js et leurs
// branchements (eBay API, Opla, Beebs, Leboncoin, handler-watch).
//
// Exigence de Nico (06/10) : plus JAMAIS un article bloqué parce qu'une taille
// ne trouve pas sa correspondance — la plus fidèle, par une règle explicite ;
// jamais une taille qui change le sens ; sinon la personne choisit (rare).
// Cas réel : patrick giry, « ASOS Design Jeans Mom … W28 L32 » — eBay
// b95ff146 (grille 11554, 58 valeurs) et Opla 3faa5b8d (W_HIGH_WAIST_JEANS).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tailleDeService, brancheDeTaille, tourDeTailleEnFrancais, FR_PAR_TOUR_DE_TAILLE, LETTRE_FEMME_PAR_FR } from "../supabase/functions/_shared/taille-de-service.js";
import { estQuestionTaille, reponseTailleAuto, champsApresReponseTaille } from "../supabase/functions/_shared/taille-question-auto.js";
import { tailleDansGrille } from "../supabase/functions/_shared/tailles.js";
import { tailleBeebsDeLaFiche } from "../supabase/functions/_shared/beebs-taille-de-la-fiche.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const v = (b, g, branche = null) => tailleDeService(b, g, { branche })?.valeur ?? null;

// Grilles RELEVÉES (base, 06/10).
const EBAY_11554 = ["3XS", "2XS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "32", "34", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "58", "60", "Taille unique", "IT 36", "IT 38", "IT 40", "IT 42", "IT 44", "IT 46", "IT 48", "IT 50", "IT 52", "IT 54", "UK 4", "UK 6", "UK 8", "UK 10", "UK 12", "UK 14", "UK 16", "UK 18", "UK 20", "UK 22", "US 0", "US 2", "US 4", "US 6", "US 8", "US 10", "US 12", "US 14", "US 16", "US 18"];
const OPLA_G1 = ["Taille unique", "XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL", "7XL", "8XL"];
const VINTED_JUPES = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "7XL", "8XL", "9XL"];
const VINTED_JEANS_HOMME = ["W28 | FR 38", "W29 | FR 38", "W30 | FR 40", "W31 | FR 40", "W32 | FR 42", "W33 | FR 42", "W34 | FR 44"];
const VINTED_FEMME_COMPOSITE = ["XS / 34 / 6", "S / 36 / 8", "M / 38 / 10", "L / 40 / 12"];
const LBC_VETEMENTS = ["32 - XXS", "34 - XS", "36 - S", "38 - M", "40 - L", "42 - XL", "44 - XXL"];
const OPLA_ENFANT = ["12M", "18M", "24M", "2Y", "3Y", "4Y", "10Y", "12Y"];
const POINTURES = ["38", "39", "40", "41", "42", "43", "44", "45"];

console.log("\n1. LE CAS RÉEL (patrick giry, W28 L32)");
ok(v("W28 L32", EBAY_11554, "femme") === "38", "eBay 11554 : W28 L32 → « 38 » (R1, table publiée par Vinted)");
ok(v("W28 L32", OPLA_G1, "femme") === "M", "Opla jeans femme : W28 L32 → « M » (R1 + R2)");
ok(tourDeTailleEnFrancais("W28 L32")?.valeur === "38", "Leboncoin : servi « 38 » (posé sur « 38 - M »)");
ok(v("26/30", OPLA_G1, "femme") === "S" && v("33/32", EBAY_11554, "femme") === "42", "Opla « 26/30 » → S ; eBay « 33/32 » → 42");

console.log("\n2. AUCUNE RÉGRESSION (R0 = tailles.js, inchangé)");
const cas0 = [["40", ["EU 40", "EU 42"]], ["2XL", ["XXL", "XL"]], ["XXL", EBAY_11554], ["12 ans", OPLA_ENFANT], ["86", OPLA_ENFANT],
  ["M / 38 / 10", OPLA_G1], ["W30", VINTED_JEANS_HOMME], ["Taille unique", OPLA_G1], ["42", POINTURES], ["38", VINTED_FEMME_COMPOSITE]];
for (const [b, g] of cas0) {
  const r0 = tailleDansGrille(b, g)?.valeur ?? null;
  ok(r0 !== null && v(b, g, "femme") === r0 && v(b, g, null) === r0, `« ${b} » → « ${r0} » comme avant (R0)`);
}
ok(v("EU 40", ["40", "42"], "femme") === tailleDansGrille("EU 40", ["40", "42"]), "« EU 40 » face à « 40 » : la même réponse que tailles.js (le « EU N ≡ N » de Vinted vit dans vinted-taille-republication.ts et l'extension, intacts)");
ok(v("W28 L32", VINTED_JEANS_HOMME, "homme") === "W28 | FR 38", "Vinted écrit des W : le W de la grille (R0), jamais le FR");
ok(v("", OPLA_G1) === null && v("M", []) === null, "livre sans taille / grille vide → rien (jamais inventé)");

console.log("\n3. JAMAIS UNE TAILLE QUI CHANGE LE SENS");
ok(v("EU 38", OPLA_G1, "femme") === null, "« EU 38 » ne devient jamais « M » (FR 40 = EU 38 chez Vinted)");
ok(v("UK 10", ["38", "40"], "femme") === null && v("US 8", ["38", "40"], "femme") === null && v("IT 42", ["38"], "femme") === null, "UK/US/IT ne se convertissent jamais");
ok(v("44.5", POINTURES) === null, "demi-pointure sur une grille d'entiers → question (jamais 44 ni 45)");
ok(v("38", OPLA_G1, "homme") === null && v("W30", OPLA_G1, "homme") === null, "homme : aucune table publiée → question");
ok(v("38", OPLA_G1, null) === null && v("38", OPLA_G1, "enfant") === null, "branche inconnue ou enfant → question");
ok(v("38", ["M", "L", "38"], "femme") === "38", "grille avec un nombre : le nombre, jamais la lettre");
ok(v("42", ["S", "M", "L", "40", "44"], "femme") === null, "grille chiffrée sans 42 : R2 ne joue pas (question)");
ok(v("34/36", EBAY_11554, "femme") === null, "« 34/36 » (fourchette possible) → question");
ok(v("17-1/2", EBAY_11554, "homme") === null, "col « 17-1/2 » → question");
ok(v("23 mois", OPLA_ENFANT, "enfant") === null && v("6 ans", OPLA_G1, "femme") === null, "« 23 mois », âge sur une grille adulte → question");

console.log("\n4. LES FAMILLES RECENSÉES");
ok(v("42", VINTED_JUPES, "femme") === "XL" && v("36", ["XS", "S", "M"], "femme") === "S", "Vinted jupes « 42 » → XL ; blazer femme « 36 » → S (R2)");
ok(v("46", OPLA_G1, "femme") === "3XL" && v("34", OPLA_G1, "femme") === "XS", "Opla « 46 » → 3XL ; « 34 » → XS");
ok(v("Ajustable", ["Taille unique", "S", "M"]) === "Taille unique", "Beebs « Ajustable » → Taille unique (R4)");
ok(v("12 ans (140-152 cm)", ["10 ans", "12 ans", "14 ans"], "enfant") === "12 ans", "« 12 ans (140-152 cm) » → 12 ans (R3)");
ok(v("W33 L32", LBC_VETEMENTS, "homme") === "42 - XL", "LBC grille connue : W33 → « 42 - XL » (R1)");
const tableW = Object.entries(FR_PAR_TOUR_DE_TAILLE);
ok(tableW.length === 23 && FR_PAR_TOUR_DE_TAILLE[28] === 38 && FR_PAR_TOUR_DE_TAILLE[34] === 44, "table W → FR : 23 lignes, W28 = 38, W34 = 44");
ok(LETTRE_FEMME_PAR_FR[38] === "M" && LETTRE_FEMME_PAR_FR[42] === "XL" && Object.keys(LETTRE_FEMME_PAR_FR).length === 15, "table femme FR → lettre : 15 lignes");
// Fixture des grilles publiées (18/09) : la table W → FR est EXACTEMENT celle de Vinted.
const fx = JSON.stringify(JSON.parse(lire("scripts/fixtures/tailles-publiees-2026-09-18.json")));
const publie = new Map();
for (const m of fx.matchAll(/W(\d{2})\s*\|\s*FR\s*(\d{2})/g)) publie.set(Number(m[1]), Number(m[2]));
ok(publie.size >= 20 && [...publie].every(([w, fr]) => FR_PAR_TOUR_DE_TAILLE[w] === fr), `table W → FR = grilles Vinted relevées (${publie.size} lignes)`);
const lettres = new Map();
for (const m of fx.matchAll(/"((?:XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|[4-9]XL)\s*\/\s*(\d{2}))/g)) lettres.set(Number(m[2]), m[1].split("/")[0].trim());
ok(lettres.size >= 10 && [...lettres].every(([n, l]) => LETTRE_FEMME_PAR_FR[n] === l), `table FR → lettre = grilles Vinted relevées (${lettres.size} lignes)`);
ok(brancheDeTaille(["Femmes", "Vêtements", "Jeans"]) === "femme" && brancheDeTaille("Homme") === "homme" && brancheDeTaille(["Enfants", "Filles"]) === "enfant" && brancheDeTaille("") === null, "branche lue sur le rayon / Département");

console.log("\n5. LA QUESTION DE TAILLE TRANCHÉE PAR LA RÈGLE (handler-watch)");
const ebayJob = { status: "needs_user", platform: "ebay", platform_fields: { taille: "W28 L32", ebayAspects: { "Département": "Femme", Style: "Jean mom" },
  needsUserField: { field_key: "Taille", field_label: "Taille", allowed_values: EBAY_11554, input_type: "selection_only", options_completes: true, target: { key: "Taille", root: "ebayAspects" } } } };
const oplaJob = { status: "needs_user", platform: "opla", platform_fields: { taille: "W28 L32", oplaCategoryCode: "W_HIGH_WAIST_JEANS", oplaCategoryPath: ["Femmes", "Vêtements", "Jeans", "Jeans taille haute"],
  needsUserField: { field_key: "oplaSizeChoice", field_label: "Taille Opla", allowed_values: OPLA_G1, target: { key: "oplaSizeChoice", root: null } } } };
const rE = reponseTailleAuto(ebayJob), rO = reponseTailleAuto(oplaJob);
ok(rE?.valeur === "38" && rE.cible.root === "ebayAspects" && rE.cible.key === "Taille", "eBay b95ff146 → ebayAspects.Taille = « 38 »");
ok(rO?.valeur === "M" && rO.cible.root === null && rO.cible.key === "oplaSizeChoice", "Opla 3faa5b8d → oplaSizeChoice = « M »");
const pfE = champsApresReponseTaille(ebayJob.platform_fields, rE, "2026-10-06T20:00:00Z");
ok(pfE.ebayAspects.Taille === "38" && pfE.ebayAspects.Style === "Jean mom" && pfE.needsUserResolved["ebayAspects.Taille"] === "38" && !pfE.needsUserField && pfE.taille === "W28 L32",
  "écrit comme « ✋ Compléter » : cible, needsUserResolved, question effacée — la taille de la copie reste celle de la personne");
ok(pfE.taille_convertie_serveur?.regle === "R1" && reponseTailleAuto({ ...ebayJob, platform_fields: pfE }) === null, "une fois seulement (marqueur taille_convertie_serveur)");
ok(!estQuestionTaille({ field_key: "package_size", field_label: "Format du colis", allowed_values: ["Petit"] }) && !estQuestionTaille({ field_key: "Marque", allowed_values: ["Nike"] }), "jamais une autre question (colis, marque)");
ok(!estQuestionTaille({ field_key: "Taille", allowed_values: [] }), "jamais sans grille");
ok(reponseTailleAuto({ ...oplaJob, platform_fields: { ...oplaJob.platform_fields, taille: "44.5" } }) === null, "sans correspondance honnête : la question reste");
ok(reponseTailleAuto({ ...ebayJob, status: "pending" }) === null, "seulement une question en attente (needs_user)");
ok(reponseTailleAuto({ ...ebayJob, platform_fields: { ...ebayJob.platform_fields, taille: "" } }, "W28 L32")?.valeur === "38", "taille vide sur la copie : celle de la fiche");

console.log("\n6. LES BRANCHEMENTS (code livré)");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(/reponseTailleAuto\(j as never, art\?\.taille \?\? null\)/.test(hw) && /\.eq\("status", "needs_user"\)\s*\.select\("id"\);\s*if \(\(maj \?\? \[\]\)\.length\) \{\s*taillesTranchees\+\+/.test(hw), "handler-watch : réponse puis compare-and-swap sur needs_user");
ok(/art\.statut !== "stock"/.test(hw.slice(hw.indexOf("taillesTranchees = 0"))), "handler-watch : article encore en stock seulement");
const ebp = lire("supabase/functions/_shared/ebay-publication.ts");
ok(/tailleSansPrefixeEuFr\(a\.name, brut, a\.allowedValues\) \?\? tailleServieEbay\(/.test(ebp), "eBay API : après le recalage d'avant, sur liste fermée seulement");
const opr = lire("supabase/functions/_shared/opla-resolution.ts");
ok(/const t = tailleDansGrille\(brut, grille\);\s*if \(t\) return t\.valeur;[\s\S]{0,900}tailleDeService\(brut, grille/.test(opr), "Opla : tailleDansGrille d'abord, la règle ensuite");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/j\.platform !== "leboncoin"[\s\S]{0,300}tourDeTailleEnFrancais\(pfT\.taille\)/.test(gpj), "Leboncoin : tour de taille servi en français (copie servie seulement)");
ok(tailleBeebsDeLaFiche("W28 L32", [{ field_key: "Taille", allowed_values: ["S / 36", "M / 38", "L / 40"] }], "femme")?.valeur === "M / 38"
  && tailleBeebsDeLaFiche("M", [{ field_key: "Taille", allowed_values: ["M"] }])?.valeur === "M", "Beebs : l'identique d'abord, la règle ensuite");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ taille servie : tout est vert");
process.exit(ko ? 1 : 0);
