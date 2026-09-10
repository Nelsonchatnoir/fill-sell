// ═══════════════════════════════════════════════════════════════════════════
// Non-régression FIGÉE des règles mot-objet (2026-09-10, borne à DROITE)
//   node scripts/mot-objet-borne-droite-selftest.mjs
//   node scripts/mot-objet-borne-droite-selftest.mjs --geler <fichier-titres.json>
//
// Corpus : scripts/corpus-mot-objet-2026-09-10.json — titres RÉELS de jobs
// publish des 60 derniers jours (hors comptes de test, hors sync-dressing),
// avec l'icône et le mot rendus par detectObjectKeywordDetail AU MOMENT DU
// GEL (HEAD avant la borne droite). Le test rejoue chaque titre et exige le
// MÊME résultat, à une exception près, nommée : « Sac Bottega Veneta » 👢 → 👜
// (le bug que la borne droite corrige). Tout autre écart = ARRÊT.
// Plus trois mots que la borne droite aurait perdus (dérivés soudés) et qui
// sont devenus des mots-clés à part entière : pullover 🧶, sweatshirt 🧶,
// sandalettes 🩴.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS = join(ROOT, "scripts/corpus-mot-objet-2026-09-10.json");
const shared = await import(pathToFileURL(join(ROOT, "src/utils/shared.js")).href);
const detail = (titre) => shared.detectObjectKeywordDetail(titre, "") ?? { icon: null, mot: null, passe: null };

// ── Mode gel : calcule et écrit le corpus depuis une liste de titres ─────────
const iGeler = process.argv.indexOf("--geler");
if (iGeler >= 0) {
  const src = process.argv[iGeler + 1];
  const titres = JSON.parse(fs.readFileSync(src, "utf8"));
  const lignes = titres.map((t) => { const d = detail(t); return { titre: t, icone: d.icon, mot: d.mot }; });
  fs.writeFileSync(CORPUS, JSON.stringify({ gele_le: new Date().toISOString(), n: lignes.length, lignes }, null, 1) + "\n");
  const avecIcone = lignes.filter((l) => l.icone).length;
  console.log(`corpus gelé : ${lignes.length} titres, ${avecIcone} avec icône → ${CORPUS}`);
  process.exit(0);
}

// ── Mode test ────────────────────────────────────────────────────────────────
const corpus = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
// Écarts ATTENDUS (le bug corrigé), par titre exact : ancienne → nouvelle icône.
const ECARTS_ATTENDUS = new Map([
  ["Sac Bottega Veneta", { avant: "👢", apres: "👜" }],
]);
let echecs = 0;
let identiques = 0;
const ecarts = [];
for (const l of corpus.lignes) {
  const d = detail(l.titre);
  if (d.icon === l.icone) { identiques++; continue; }
  const attendu = [...ECARTS_ATTENDUS.entries()].find(([t]) => l.titre.toLowerCase().includes(t.toLowerCase()));
  if (attendu && attendu[1].avant === l.icone && attendu[1].apres === d.icon) { ecarts.push(`  ✓ écart attendu : « ${l.titre} » ${l.icone} → ${d.icon}`); continue; }
  echecs++;
  ecarts.push(`  ✗ ÉCART NON ATTENDU : « ${l.titre} » ${l.icone ?? "∅"} (mot ${l.mot ?? "∅"}) → ${d.icon ?? "∅"} (mot ${d.mot ?? "∅"})`);
}
console.log(`1. Corpus figé (${corpus.n} titres, gelé le ${corpus.gele_le}) : ${identiques} identiques, ${corpus.n - identiques} écart(s)`);
for (const e of ecarts) console.log(e);

console.log("\n2. Les trois mots sauvés (mots-clés à part entière) :");
const sauves = [
  ["Pullover col rond gris", "🧶", "pullover"],
  ["Sweatshirt Nike noir", "🧶", "sweatshirt"],
  ["Sandalettes cuir camel 38", "🩴", "sandalettes"],
];
for (const [titre, icone, mot] of sauves) {
  const d = detail(titre);
  const ok = d.icon === icone && String(d.mot ?? "").startsWith(mot);
  if (ok) console.log(`  ✓ « ${titre} » → ${icone} (${d.mot})`);
  else { echecs++; console.log(`  ✗ « ${titre} » → ${d.icon ?? "∅"} (${d.mot ?? "∅"}), attendu ${icone} (${mot})`); }
}

console.log("\n3. La borne droite elle-même :");
const bornes = [
  ["Sac Bottega Veneta", "👜"],       // « botte » ne matche plus « Bottega »
  ["Bottes de pluie enfant", "👢"],   // pluriel toujours reconnu
  ["Pull marin rayé", "🧶"],
  ["Sweat à capuche", "🧶"],
  ["Sandales dorées", "🩴"],
];
for (const [titre, icone] of bornes) {
  const d = detail(titre);
  if (d.icon === icone) console.log(`  ✓ « ${titre} » → ${icone}`);
  else { echecs++; console.log(`  ✗ « ${titre} » → ${d.icon ?? "∅"}, attendu ${icone}`); }
}

console.log(echecs ? `\n${echecs} ÉCHEC(S)` : "\nOK — aucun écart hors de ceux attendus");
process.exit(echecs ? 1 : 0);
