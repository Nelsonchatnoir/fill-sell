// ═══════════════════════════════════════════════════════════════════════════
// Selftest du MOT-OBJET AU PLURIEL (2026-09-07)
//   node scripts/mot-objet-pluriel-selftest.mjs
//
// Cause racine du job d'ornellaracano (« Lot de 4 taies d'oreiller coton beige
// et rose », 16h34) : la règle mot-objet du linge de lit s'écrivait
// « taie.?d.?oreiller ». Le `.?` tolère UN caractère entre deux mots — assez
// pour un tiret ou une apostrophe, JAMAIS pour un pluriel, qui en insère DEUX
// (le « s » ET le séparateur). « taies d'oreiller » ne matchait donc pas, et un
// lot de taies est toujours écrit au pluriel.
//
// L'audit du 07/09 a trouvé 104 règles portant exactement ce défaut (87 en
// « motA.?motB », 17 en « motA.?lien.?motB »). Toutes ont reçu `[sx]?` après le
// premier mot — le « s » des pluriels réguliers, le « x » de jeux / eaux.
//
// Ce que ce test garantit :
//   · les composés fonctionnent au SINGULIER comme au PLURIEL ;
//   · les pluriels dont le « s » se pose sur le PREMIER mot (soutiens-gorge,
//     taies d'oreiller, sacs à dos, boucles d'oreilles) sont reconnus ;
//   · les pièges déjà documentés ne rouvrent pas : « drapé » n'est pas un drap,
//     « élégant » n'est pas un gant, « Mascarade » n'est pas un mascara.
// ═══════════════════════════════════════════════════════════════════════════
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { detectObjectIconKeyword } = await import(
  pathToFileURL(join(ROOT, "src/utils/shared.js")).href
);

let echecs = 0;
const check = (nom, ok, extra = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { echecs++; console.log(`  ✗ ${nom} ${extra}`); }
};

// [titre, icône attendue]. `null` = aucun mot-objet ne DOIT être trouvé.
const CAS = [
  // ── Le cas fondateur, et sa famille ──────────────────────────────────────
  ["Lot de 4 taies d'oreiller coton beige et rose", "🛌"],
  ["Taie d'oreiller Turkish Airlines rouge", "🛌"],
  ["2 housses de couette 240x220", "🛌"],
  ["Housse de couette bleue", "🛌"],
  ["Parures de lit enfant", "🛌"],
  ["Parure de lit enfant", "🛌"],
  // ── Les composés dont le pluriel se pose sur le PREMIER mot ──────────────
  ["Boucles d'oreilles argent", "💍"],   // 116 articles du parc, mesuré le 07/09
  ["Boucle d'oreille argent", "💍"],
  ["Soutiens-gorge lot de 3", "🩲"],     // 11 articles
  ["Soutien-gorge Etam 90B", "🩲"],
  ["Sacs à dos Eastpak", "🎒"],
  ["Sac à dos Eastpak", "🎒"],
  ["Maillots de bain femme", "👙"],
  ["Maillot de bain femme", "👙"],
  ["Rouges à lèvres Dior", "💄"],
  ["Fers à repasser Calor", "🧼"],
  ["Machines à laver Bosch", "🧺"],
  ["Machine à laver Bosch", "🧺"],
  ["Micro-ondes Samsung", "♨️"],
  // ── NON-RÉGRESSION : les pièges déjà payés une fois ──────────────────────
  // « drapé » n'est pas un drap (robe Shein Carla, 5 jobs, 42 unités brûlées).
  ["Robe Shein drapée", "👗"],
  ["Robe drapé fluide", "👗"],
  // « élégant » n'est pas un gant.
  ["Gant de toilette élégant", "🧤"],
  ["Manteau élégant taille M", "🧥"],
  // « Mascarade » n'est pas un mascara (108 titres de cartes Pokémon).
  ["Carte Pokémon Mascarade Crépusculaire", "🃏"],
  // ── ACCENTS : ils ne doivent JAMAIS décider (07/09 soir) ────────────────
  // Mesuré : « débardeur » était reconnu, « debardeur » non — et les vendeurs
  // écrivent sans accents en permanence. La détection compare désormais dans
  // un alphabet normalisé, des deux côtés.
  ["Debardeur noir", "👕"],
  ["Débardeur noir", "👕"],
  ["Mariniere rayee", "👕"],
  ["Marinière rayée", "👕"],
  // ── PLURIEL SIMPLE : « robe\b » échouait sur « robes » (19 titres) ───────
  ["Lot de robes fleuries", "👗"],
  ["Robe fleurie", "👗"],
  ["Jupes plissées", "👗"],
  // ── MOTS AJOUTÉS le 07/09 au soir, mesurés sur 12 000 articles ──────────
  ["Chemisier Jennyfer S", "👔"],          // 82 articles — chemis-IER ≠ chemise
  ["Chemisiers en lot", "👔"],
  ["Caraco Season bleu marine taille M", "👕"],  // 12
  ["Pantacourt Kiabi 40", "👖"],           // 17
  ["Jegging noir taille 38", "👖"],        // 8
  ["Combishort taille M noir", "👖"],      // 21
  ["Poncho laine gris", "🧥"],             // 8
  // ── « BOLÉRO » N'EST PAS UN BOL (effet de bord du même correctif) ───────
  // `\bbol\b` matchait dans « boléro » : « é » n'est pas un caractère de mot
  // ASCII, la borne tombait juste après « bol ». Une veste courte partait donc
  // en Arts de la table. Sur le texte normalisé, « bolero » ne matche plus.
  ["Bolero en dentelle", null],
  ["Boléro en dentelle", null],
  ["Bol à soupe en grès", "🍽️"],          // le vrai bol, lui, reste un bol
];

console.log("Mot-objet au pluriel :");
for (const [titre, attendu] of CAS) {
  const r = detectObjectIconKeyword(titre, "");
  check(`« ${titre} » → ${attendu ?? "aucun mot-objet"}`, r === attendu, `(rendu ${r})`);
}

// Le défaut structurel lui-même : plus AUCUNE règle « motA.?motB » ne doit
// subsister sans tolérance de pluriel. Le test lit la source — c'est la seule
// façon d'attraper une règle AJOUTÉE plus tard avec l'ancienne forme.
console.log("\nAucune règle ne rouvre le défaut :");
const fs = await import("node:fs");
const src = fs.readFileSync(join(ROOT, "src/utils/shared.js"), "utf8");
const bloc = src.slice(src.indexOf("const OBJECT_ICON_RULES"),
                       src.indexOf("// Icône par défaut si aucun mot-clé"));
const rechutes = [...bloc.matchAll(/([\p{L}]{3,})\.\?([\p{L}]{2,})/gu)].map(m => m[0]);
check(`0 règle « motA.?motB » sans [sx]? (trouvé ${rechutes.length})`,
  rechutes.length === 0, rechutes.slice(0, 8).join(", "));
const rechutesLien = [...bloc.matchAll(/([\p{L}]{3,})\.\?([\p{L}])\.\?([\p{L}]{2,})/gu)].map(m => m[0]);
check(`0 règle « motA.?lien.?motB » sans [sx]? (trouvé ${rechutesLien.length})`,
  rechutesLien.length === 0, rechutesLien.slice(0, 8).join(", "));

console.log(echecs ? `\n${echecs} ÉCHEC(S)` : "\nTout est vert.");
process.exit(echecs ? 1 : 0);
