// ═══════════════════════════════════════════════════════════════════════════
// AUCUNE IMPORTATION DISTANTE FLOTTANTE — `npm run selftest:imports-epingles`
// ═══════════════════════════════════════════════════════════════════════════
// CE QUE CE CONTRÔLE A COÛTÉ. Le 23/09/2026, le spécificateur flottant
// `https://esm.sh/@supabase/supabase-js@2` a résolu vers la version 2.117.1,
// dont la dépendance `@supabase/functions-js@2.117.1` rend 404 sur esm.sh (le
// paquet n'y a jamais été publié). Mesuré en direct ce jour-là :
//     2.117.1 → 404      2.117.0 → 200
// Effet : PLUS AUCUNE fonction edge important supabase-js ne pouvait être
// déployée — 48 fichiers, c'est-à-dire à peu près tout le serveur. Découvert
// par hasard, en déployant autre chose.
//
// LA RÈGLE : une dépendance flottante, c'est une panne de déploiement décidée
// par quelqu'un d'autre, un jour qu'on ne choisit pas. On épingle TOUT.
//
// ⛔ POURQUOI PAS UN IMPORT MAP PARTAGÉ (question posée le 23/09) : parce
//    qu'on ne peut pas le PROUVER sans déployer. `deno check` résout les
//    imports côté client, mais c'est le bundler du serveur qui tranche à la
//    livraison, et la CLI n'offre aucun `--dry-run`. Un import map non
//    éprouvé, c'est le même risque qu'on vient de payer, déplacé d'un cran :
//    la panne n'apparaîtrait qu'au premier déploiement d'urgence. On épingle
//    donc EXPLICITEMENT, et c'est CE test qui tient lieu de source unique —
//    il échoue à la première dérive, y compris dans un fichier neuf.
//
// POUR CHANGER DE VERSION un jour : bouger VERSIONS_ATTENDUES ci-dessous, puis
//   sed -i 's|supabase-js@<ancienne>|supabase-js@<neuve>|g' supabase/functions/**/*.ts
// et relancer ce test. Une ligne, pas quarante-six.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RACINE = join(ROOT, "supabase", "functions");

// Les versions qu'on a ÉPROUVÉES. Une importation distante d'un paquet listé
// ici doit porter exactement cette version.
const VERSIONS_ATTENDUES = {
  "@supabase/supabase-js": "2.117.0",
};

/** Tout ce qui ressemble à une importation distante versionnable. */
const IMPORT_DISTANT = /https:\/\/(?:esm\.sh|deno\.land\/x|cdn\.skypack\.dev|unpkg\.com)\/([^"'\s?]+)/g;

function fichiersTs(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...fichiersTs(p));
    else if (/\.(ts|js|mjs)$/.test(e)) out.push(p);
  }
  return out;
}

const fichiers = fichiersTs(RACINE);
let ko = 0;
const flottants = [];
const mauvaiseVersion = [];

for (const f of fichiers) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(IMPORT_DISTANT)) {
    const spec = m[1];                       // ex: @supabase/supabase-js@2.117.0
    const rel = relative(ROOT, f).split("\\").join("/");
    // Nom du paquet = tout avant le dernier @ qui introduit une version.
    const sep = spec.lastIndexOf("@");
    const nom = sep > 0 ? spec.slice(0, sep) : spec;
    const version = sep > 0 ? spec.slice(sep + 1).split("/")[0] : "";

    // (a) aucune version du tout → flottant
    if (!version || !/^\d/.test(version)) {
      flottants.push(`${rel} → ${spec} (aucune version)`);
      continue;
    }
    // (b) version MAJEURE seule (« @2 ») → flottant : c'est exactement le cas
    //     du 23/09. `@2` suit toutes les 2.x publiées, y compris la cassée.
    if (!version.includes(".")) {
      flottants.push(`${rel} → ${spec} (majeure seule : « @${version} » suit toutes les ${version}.x)`);
      continue;
    }
    // (c) version épinglée mais pas celle qu'on a éprouvée
    const attendue = VERSIONS_ATTENDUES[nom];
    if (attendue && version !== attendue) {
      mauvaiseVersion.push(`${rel} → ${nom}@${version} (attendu ${attendue})`);
    }
  }
}

console.log(`\n${fichiers.length} fichiers lus dans supabase/functions/\n`);

console.log("── 1. Aucune importation distante flottante ────────────────────");
if (flottants.length) {
  ko++;
  console.log(`  ✗ ${flottants.length} importation(s) sans version épinglée :`);
  for (const l of flottants) console.log(`      ${l}`);
  console.log("\n    Une dépendance flottante = une panne de déploiement décidée");
  console.log("    par quelqu'un d'autre. Épingle la version (cf. l'en-tête).");
} else {
  console.log("  ✓ toutes les importations distantes portent une version complète");
}

console.log("\n── 2. Les versions éprouvées sont celles qui tournent ──────────");
if (mauvaiseVersion.length) {
  ko++;
  console.log(`  ✗ ${mauvaiseVersion.length} écart(s) :`);
  for (const l of mauvaiseVersion) console.log(`      ${l}`);
} else {
  for (const [nom, v] of Object.entries(VERSIONS_ATTENDUES)) {
    const n = fichiers.filter((f) => readFileSync(f, "utf8").includes(`${nom}@${v}`)).length;
    console.log(`  ✓ ${nom}@${v} — ${n} fichier(s), aucun écart`);
  }
}

console.log(ko === 0 ? "\n✅ IMPORTS ÉPINGLÉS : tout est vert.\n" : `\n❌ ${ko} contrôle(s) en échec.\n`);
process.exit(ko === 0 ? 0 : 1);
