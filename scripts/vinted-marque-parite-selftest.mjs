// Autotest — PARITÉ DE LA MARQUE ENTRE vinted.js, LE SERVEUR ET L'APP
// (05/10, point 5) — `npm run selftest:vinted-marque-parite`
//
// Louis (Business) : « Marque générique » recopiée de ses annonces Opla ; le
// serveur la traduit en « Sans marque » (get-pending-jobs,
// _shared/marque-absente.js, 04/10) et l'app trie les suggestions de la
// question « Marque » (suggestionsProches, src/utils/questionMarque.js :
// « U Collection », « Z Kids » écartées). vinted.js n'est pas un module : il
// porte des COPIES (estAbsenceDeMarque, suggestionsMarqueProches). Ce test
// compare, cas par cas, la copie et l'original — un écart = une marque
// traitée différemment selon le chemin du job.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(join(ROOT, "chrome-extension/content-scripts/vinted.js"), "utf8").split("\r\n").join("\n");
const { estSansMarque, marqueComparable } = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/marque-absente.js")).href);
const { suggestionsProches } = await import(pathToFileURL(join(ROOT, "src/utils/questionMarque.js")).href);

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

// ── Les copies, extraites telles que livrées ────────────────────────────────
const blocAbsences = src.match(/const MARQUE_ABSENCES = new Set\(\[[\s\S]*?\]\);/)?.[0];
if (!blocAbsences) { console.error("✗ MARQUE_ABSENCES introuvable dans vinted.js"); process.exit(1); }
const ext = new Function(
  `${blocAbsences}
   ${extraireFonctionJs(src, "marqueAbsenceComparable")}
   ${extraireFonctionJs(src, "estAbsenceDeMarque")}
   ${extraireFonctionJs(src, "marqueQuestionComparable")}
   ${extraireFonctionJs(src, "motsDeMarque")}
   ${extraireFonctionJs(src, "distanceDeMarques")}
   ${extraireFonctionJs(src, "suggestionsMarqueProches")}
   const SANS_MARQUE_RE = Object.freeze({ test: (v) => estAbsenceDeMarque(v) });
   return { MARQUE_ABSENCES, marqueAbsenceComparable, estAbsenceDeMarque, suggestionsMarqueProches, SANS_MARQUE_RE };`,
)();
ok(/const SANS_MARQUE_RE = Object\.freeze\(\{ test: \(v\) => estAbsenceDeMarque\(v\) \}\);/.test(src),
  "SANS_MARQUE_RE de vinted.js EST la liste fermée (plus l'ancienne regex à quatre termes)");

// ── 1. L'ABSENCE DE MARQUE : liste fermée, égalité exacte ──────────────────
console.log("\n1. ABSENCE DE MARQUE — vinted.js face à _shared/marque-absente.js");
const ABSENCES = [
  "Sans marque", "sans marque", "SANS MARQUE", "  Sans   marque  ", "Sans marque.", "« Sans marque »",
  "Marque générique", "Marque generique", "MARQUE GÉNÉRIQUE", "Générique", "generique", "Generique.",
  "Aucune", "aucune marque", "Aucune Marque", "Pas de marque", "pas de marque", "Non marqué", "Non marquée",
  "No brand", "NO BRAND", "No Brand", "Nobrand", "Unbranded", "Unbranded Generic", "Unbranded / Generic",
  "Generic", "Generic brand", "Sans marque / Générique", "- Sans marque/Générique -", "Sans marque générique",
  "(Sans marque)", "Générique / No brand",
];
const VRAIES = [
  "Nike", "Zara", "Seb", "Tefal", "Kiabi", "Levi's", "Generic Surplus", "Générique & Co", "Sans Marque Paris",
  "Marque Générique Pro", "Aucune Idée", "No Brand Shop", "Brandy Melville", "Unbranded Supply Co", "Autre",
  "Vintage", "Fait main", "Divers", "Inconnue", "Generico", "Nobrandy", "Sans", "Marque", "Pas de marque connue",
  "", "   ", null, undefined, "Sans marque / Nike", "Nike / Adidas",
];
const CORPUS_ABSENCE = [...ABSENCES, ...VRAIES];
let ecartsAbsence = 0;
for (const v of CORPUS_ABSENCE) {
  const serveur = estSansMarque(v);
  const extension = ext.estAbsenceDeMarque(v);
  const re = ext.SANS_MARQUE_RE.test(v);
  if (serveur !== extension || extension !== re || ext.marqueAbsenceComparable(v) !== marqueComparable(v)) {
    ecartsAbsence++;
    console.error(`      écart sur ${JSON.stringify(v)} : serveur ${serveur}, vinted.js ${extension}, SANS_MARQUE_RE ${re}`);
  }
}
ok(CORPUS_ABSENCE.length >= 40, `corpus d'au moins 40 cas (${CORPUS_ABSENCE.length})`);
ok(ecartsAbsence === 0, `même verdict ET même forme comparable sur les ${CORPUS_ABSENCE.length} cas`);
ok(ABSENCES.every((v) => ext.estAbsenceDeMarque(v)), "chaque absence connue → « Sans marque » natif",
  ABSENCES.filter((v) => !ext.estAbsenceDeMarque(v)).join(" · "));
ok(VRAIES.every((v) => !ext.estAbsenceDeMarque(v)), "aucune vraie marque (ni sous-chaîne) n'est prise pour une absence",
  VRAIES.filter((v) => ext.estAbsenceDeMarque(v)).join(" · "));
ok(ext.SANS_MARQUE_RE.test("Sans marque"), "la valeur canonique VINTED_SANS_MARQUE satisfait toujours SANS_MARQUE_RE (capture ↔ remplissage)");
// La liste elle-même : mêmes entrées que le serveur (lues dans son source).
const srvSrc = fs.readFileSync(join(ROOT, "supabase/functions/_shared/marque-absente.js"), "utf8");
const listeSrv = new Function(`${srvSrc.match(/const ABSENCES = new Set\(\[[\s\S]*?\]\);/)[0]}; return ABSENCES;`)();
ok(JSON.stringify([...listeSrv].sort()) === JSON.stringify([...ext.MARQUE_ABSENCES].sort()), "liste fermée identique, entrée pour entrée");

// ── 2. LES SUGGESTIONS : même tri que l'app ────────────────────────────────
console.log("\n2. SUGGESTIONS DE MARQUE — vinted.js face à suggestionsProches (app)");
// Ce que la liste du menu Marque et /api/v2/brands rendent sur le nom brut,
// son premier mot et ses quatre premières lettres (cas Louis du 04/10 : des
// marques sans rapport, « U Collection », « Z Kids », en tête).
const BRUIT = ["U Collection", "Z Kids", "Zara Home", "H&M", "Kiabi", "Tex", "Primark", "Vertbaudet"];
const CAS_SUGGESTIONS = [
  ["Seb", ["SEB", "Seb Pro", "Sebago", "Sébastien Moreau", ...BRUIT]],
  ["Tefal", ["Tefal", "T-fal", "Tefal Ingenio", "Tefa", "Teddy Smith", "Moulinex", ...BRUIT]],
  ["Moulinex", ["Moulinex", "Moulinex Pro", "Moulinez", "Mouli", ...BRUIT]],
  ["Levi's", ["Levi's", "Levis", "Levi Strauss & Co.", "Levi’s Vintage Clothing", "Lee", ...BRUIT]],
  ["Nike", ["Nike", "Nike ACG", "Nikes", "Mike", "Nikon", ...BRUIT]],
  ["Petit Bateau", ["Petit Bateau", "Petit Béguin", "Bateau Lavoir", "Le Petit Prince", ...BRUIT]],
  ["Adidas Originals", ["adidas", "Adidas Originals", "Adidass", "Originals by Zara", ...BRUIT]],
  ["Gérard Darel", ["Gerard Darel", "Gérard Pasquier", "Darel", ...BRUIT]],
  ["Zorglubia", [...BRUIT]],
  ["Mela & Adorna", ["Mela", "Adorna Paris", "Melanie", ...BRUIT]],
  ["Ikea", ["IKEA", "Ikéa Kids", "Ika", ...BRUIT]],
  ["", ["Nike"]],
];
let ecartsSugg = 0;
for (const [demandee, valeurs] of CAS_SUGGESTIONS) {
  for (const max of [12, 29]) {
    const app = suggestionsProches(demandee, valeurs, max);
    const extn = ext.suggestionsMarqueProches(demandee, valeurs, max);
    if (JSON.stringify(app) !== JSON.stringify(extn)) {
      ecartsSugg++;
      console.error(`      écart « ${demandee} » (max ${max}) : app ${JSON.stringify(app)} · vinted.js ${JSON.stringify(extn)}`);
    }
  }
}
ok(ecartsSugg === 0, `même liste, même ordre que l'app sur ${CAS_SUGGESTIONS.length} cas (× 2 plafonds)`);
const seb = ext.suggestionsMarqueProches("Seb", CAS_SUGGESTIONS[0][1], 29);
ok(seb[0] === "SEB" && !seb.includes("U Collection") && !seb.includes("Z Kids"), "Seb (Louis) : « SEB » d'abord, « U Collection » et « Z Kids » écartées", seb.join(" · "));
ok(ext.suggestionsMarqueProches("Zorglubia", BRUIT, 29).length === 0, "rien de proche → aucune suggestion (jamais une liste au hasard)");
const nike = ext.suggestionsMarqueProches("Nike", ["Nike ACG", "Nikes"], 29);
ok(JSON.stringify(nike) === JSON.stringify(["Nike ACG", "Nikes"]), "les lignes proches que Vinted affiche restent proposées (Nike ACG, Nikes)");

// ── 3. LE CÂBLAGE dans la question « Marque » ──────────────────────────────
console.log("\n3. LA QUESTION « MARQUE » DE vinted.js");
const corps = extraireFonctionJs(src, "selectVintedBrand");
ok(/const proches = suggestionsMarqueProches\(demandee, \[\.\.\.\(choix\.suggestions \?\? \[\]\), \.\.\.catalogue\], 29\);/.test(corps),
  "les suggestions de la question sont triées/filtrées à la source (liste du menu + catalogue)");
ok(/const proposees = \[\.\.\.new Set\(\["Sans marque", \.\.\.proches\]\)\]\.slice\(0, 30\);/.test(corps), "« Sans marque » reste en tête, 30 au plus");
ok(corps.includes("if (SANS_MARQUE_RE.test(marque))"), "l'absence de marque passe par la liste fermée avant toute recherche au catalogue");
ok(/= absence de marque \(liste fermée\)/.test(corps), "une absence dite autrement est tracée (warning), jamais une question");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log(`\n✓ marque : vinted.js suit la liste fermée du serveur et le tri de l'app (${CORPUS_ABSENCE.length} + ${CAS_SUGGESTIONS.length} cas)`);
