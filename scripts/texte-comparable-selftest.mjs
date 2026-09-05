// Auto-test de la forme COMPARABLE (2026-09-05) — deux garanties :
//
//   1. Les SIX copies de texteComparable ont le MÊME corps, octet pour octet :
//      src/utils/texteComparable.js (app), supabase/functions/_shared/
//      texte-comparable.ts (serveur) et les 4 content scripts de l'extension
//      (scripts classiques sans module partagé — ADR-03). Une copie qui dérive
//      fait échouer ce test : c'est la seule chose qui empêche le bug de
//      revenir par un seul des trois runtimes.
//   2. La cascade RÉELLE de leboncoin.js (findOptionCascade, extraite du
//      source et exécutée telle quelle contre un DOM factice) rapproche
//      « Jouets d'éveil » (U+0027) de l'option « Jouets d’éveil » (U+2019) —
//      le cas qui a bloqué le job 2e4f88f1 — et l'ANCIEN normalizeFuzzy
//      (trim/lower/NFD) ne le faisait pas : preuve avant/après.
//
//   node scripts/texte-comparable-selftest.mjs
//
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let echecs = 0;
const check = (nom, ok, extra = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { echecs++; console.log(`  ✗ ${nom} ${extra}`); }
};

// ── 1. Identité des six copies ───────────────────────────────────────────────
const DEBUT = "// ⟦texte-comparable:début⟧", FIN = "// ⟦texte-comparable:fin⟧";
const COPIES = [
  "src/utils/texteComparable.js",
  "supabase/functions/_shared/texte-comparable.ts",
  "chrome-extension/content-scripts/vinted.js",
  "chrome-extension/content-scripts/leboncoin.js",
  "chrome-extension/content-scripts/ebay.js",
  "chrome-extension/content-scripts/beebs.js",
];
function corps(p) {
  const s = lire(p);
  const a = s.indexOf(DEBUT), b = s.indexOf(FIN);
  if (a < 0 || b < 0) return null;
  const bloc = s.slice(a + DEBUT.length, b);
  // Signature ramenée à une forme commune : `export ` et les annotations TS
  // sont les seules différences légitimes entre les trois runtimes.
  return bloc.replace(/export function texteComparable\(s: unknown\): string \{/, "function texteComparable(s) {")
    .replace(/export function texteComparable\(s\) \{/, "function texteComparable(s) {")
    .trim();
}
console.log("1. Six copies, un seul corps");
const ref = corps(COPIES[0]);
check("bloc marqué présent dans " + COPIES[0], !!ref);
for (const p of COPIES.slice(1)) {
  const c = corps(p);
  check(`identique : ${p}`, !!c && c === ref, c ? "(corps différent)" : "(bloc absent)");
}
check("aucun caractère à variante en clair dans le CODE du corps (échappements \\uXXXX seulement ; les commentaires peuvent les citer)",
  ref && !/[\u00a0\u00ad\u200b-\u200f\u2010-\u2015\u2018-\u201f\u2026\u202f\u2212\ufeff]/
    .test(ref.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n")));

// ── 2. Vecteurs sur la copie app (ESM) et la copie serveur (TS, Node ≥ 22) ──
console.log("2. Vecteurs — app (ESM) et serveur (TS)");
const app = await import(pathToFileURL(join(ROOT, "src/utils/texteComparable.js")).href);
const srv = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/texte-comparable.ts")).href);
const EGAUX = [
  ["Jouets d'éveil", "Jouets d’éveil", "apostrophe droite ↔ typographique (job 2e4f88f1)"],
  ["Jeux d'imitation et déguisements", "Jeux d’imitation et déguisements", "2e valeur toy_type"],
  ["Levi's", "Levi’s", "marque Beebs"],
  ["128 Go", "128 Go", "espace insécable Vinted (computer_ram)"],
  ["EU 38", "EU 38", "espace fine insécable"],
  ["30-38 mm", "30–38 mm", "tiret demi-cadratin (size Vinted)"],
  ["Trackpad Multi-Touch", "Trackpad Multi‑Touch", "trait d'union insécable (eBay)"],
  ["\"AF Corse #51\"", "“AF Corse #51”", "guillemets anglais"],
  ["« Slo Mo »", "\" Slo Mo \"", "guillemets français → droits (les espaces restent : comparaison stricte sur les mots)"],
  ["So...? Kiss Me", "So…? Kiss Me", "points de suspension"],
  ["TRES BON ETAT", "Très bon état", "casse + accents"],
  ["  Bon  état ", "Bon état", "espaces multiples + trim"],
  ["Tape à l'œil", "Tape à l’œil", "apostrophe devant œ"],
];
const DIFFERENTS = [
  ["S", "XS", "une taille ne matche pas une autre"],
  ["38", "38 - M", "un nombre nu ne vaut pas une grille"],
  ["Bon état", "Très bon état", "contenance ≠ égalité"],
  ["Jouets d'éveil", "Jouets en bois", "valeurs distinctes"],
];
for (const impl of [["app", app.texteComparable], ["serveur", srv.texteComparable]]) {
  const [nom, t] = impl;
  for (const [a, b, why] of EGAUX) check(`${nom} : ${JSON.stringify(a)} ≡ ${JSON.stringify(b)} — ${why}`, t(a) === t(b), `(${JSON.stringify(t(a))} vs ${JSON.stringify(t(b))})`);
  for (const [a, b, why] of DIFFERENTS) check(`${nom} : ${JSON.stringify(a)} ≠ ${JSON.stringify(b)} — ${why}`, t(a) !== t(b));
}
check("valeurDeListeCorrespondante rend la CHAÎNE DE LA LISTE (U+2019), pas la saisie",
  app.valeurDeListeCorrespondante("Jouets d'éveil", ["Jeux de société", "Jouets d’éveil"]) === "Jouets d’éveil"
  && srv.valeurDeListeCorrespondante("Jouets d'éveil", ["Jeux de société", "Jouets d’éveil"]) === "Jouets d’éveil");
check("valeurDeListeCorrespondante → null hors liste",
  app.valeurDeListeCorrespondante("Peluches", ["Jouets d’éveil"]) === null && srv.valeurDeListeCorrespondante("", ["x"]) === null);

// ── 3. La cascade réelle de leboncoin.js, avant / après ──────────────────────
console.log("3. Cascade Leboncoin (code extrait du content script)");
const lbc = lire("chrome-extension/content-scripts/leboncoin.js");
function extraire(src, debutRe, label) {
  const m = src.match(debutRe);
  if (!m) throw new Error("introuvable : " + label);
  // Jusqu'à la première ligne « } » en colonne 0 après le début (fin de fonction top-level).
  const from = m.index;
  const fin = src.indexOf("\n}\n", from);
  return src.slice(from, fin + 3);
}
const srcTexte = lbc.slice(lbc.indexOf(DEBUT), lbc.indexOf(FIN) + FIN.length);
const srcNormalize = lbc.match(/^const normalizeFuzzy = .*$/m)[0];
const srcContains = extraire(lbc, /^function containsAsWords\(/m, "containsAsWords");
const srcPure = lbc.match(/^const PURE_NUMBER_RE = .*$/m)[0];
const srcCascade = extraire(lbc, /^function findOptionCascade\(/m, "findOptionCascade");
check("normalizeFuzzy LBC délègue à texteComparable", /texteComparable\(s\)/.test(srcNormalize));
const fauxRoot = (libelles) => ({ querySelectorAll: () => libelles.map((t) => ({ textContent: t })) });
const OPTIONS_LBC = ["Cuisines et dinettes", "Jeux de société", "Jeux d’imitation et déguisements", "Jouets d’éveil", "Jouets en bois", "Autre"];
const construire = (defNormalize) => new Function(
  `${srcTexte}\n${defNormalize}\n${srcContains}\n${srcPure}\n${srcCascade}\nreturn findOptionCascade;`
)();
const apres = construire(srcNormalize);
const avant = construire(`const normalizeFuzzy = (s) => s.trim().toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");`);
const rApres = apres(fauxRoot(OPTIONS_LBC), "li", "Jouets d'éveil");
const rAvant = avant(fauxRoot(OPTIONS_LBC), "li", "Jouets d'éveil");
check("AVANT (trim/lower/NFD) : « Jouets d'éveil » ne trouvait AUCUNE option", rAvant === null, `(trouvé ${rAvant && rAvant.label})`);
check("APRÈS : « Jouets d'éveil » → option « Jouets d’éveil », stage exact",
  !!rApres && rApres.label === "Jouets d’éveil" && rApres.stage === "exact", `(${rApres && rApres.label} / ${rApres && rApres.stage})`);
const r2 = apres(fauxRoot(OPTIONS_LBC), "li", "Jeux d'imitation et déguisements");
check("APRÈS : « Jeux d'imitation et déguisements » → exact", !!r2 && r2.stage === "exact");
const r3 = apres(fauxRoot(["36 - S", "38 - M", "40 - L"]), "li", "38");
check("garde taille conservée : « 38 » → « 38 - M » par taille-num (pas par contenance)", !!r3 && r3.label === "38 - M", `(${r3 && r3.label}/${r3 && r3.stage})`);
const r4 = apres(fauxRoot(["3 ans / 98 cm", "36 mois / 98 cm"]), "li", "36");
check("garde anti-nombre-nu conservée : « 36 » ne matche pas « 36 mois / 98 cm » (sizeField)", apres(fauxRoot(["3 ans / 98 cm", "36 mois / 98 cm"]), "li", "36", { sizeField: true }) === null, `(${r4 && r4.label})`);
check("exact strict conservé : « Bon état » ne prend pas « Très bon état » (fuzzy attendu, pas exact)",
  (() => { const r = apres(fauxRoot(["Très bon état", "Bon état"]), "li", "Bon état"); return r && r.label === "Bon état" && r.stage === "exact"; })());

// ── 4. Les 3 autres content scripts délèguent aussi ─────────────────────────
console.log("4. Délégation dans vinted/ebay/beebs");
for (const [p, attendu] of [
  ["chrome-extension/content-scripts/vinted.js", /^const normalizeFuzzy = \(s\) => texteComparable\(s\);$/m],
  ["chrome-extension/content-scripts/ebay.js", /^const normalizeFuzzy = \(s\) => texteComparable\(s\);$/m],
  ["chrome-extension/content-scripts/beebs.js", /^const normalizeFuzzy = \(s\) => texteComparable\(s\)\.replace\(\/\[\.,\]\/g, ""\);$/m],
]) check(`${p} : normalizeFuzzy → texteComparable`, attendu.test(lire(p)));
check("vinted.js : findOptionMatches.normalize → texteComparable", /const normalize = \(s\) => texteComparable\(s\);/.test(lire("chrome-extension/content-scripts/vinted.js")));

console.log(echecs ? `\n${echecs} échec(s)` : "\nOK — tout passe");
process.exit(echecs ? 1 : 0);
