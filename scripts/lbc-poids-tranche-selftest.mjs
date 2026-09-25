// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN PRO — « POIDS DU COLIS » RELU DEPUIS LES GRAMMES DE L'ANNONCE (25/09)
// ═══════════════════════════════════════════════════════════════════════════
// Exécute le module LIVRÉ (supabase/functions/_shared/lbc-poids-tranche.js) sur
// les correspondances relevées en base le 25/09 (31 annonces publiées puis
// relevées) et sur le cas des Petites Fioles (500 g).
//
//   node scripts/lbc-poids-tranche-selftest.mjs

import { trancheLbcDepuisGrammes, LBC_TRANCHES_POIDS, LBC_TRANCHE_AU_DELA } from "../supabase/functions/_shared/lbc-poids-tranche.js";

let ko = 0;
const ok = (c, quoi, vu) => { if (!c) { ko++; console.log(`  ✗ ${quoi}${vu !== undefined ? ` — vu : ${JSON.stringify(vu)}` : ""}`); } else console.log(`  ✓ ${quoi}`); };

console.log("1. Les correspondances relevées en base (borne haute de la tranche)");
ok(trancheLbcDepuisGrammes(100) === "Jusqu’à 100 g", "100 → « Jusqu’à 100 g » (7 annonces)");
ok(trancheLbcDepuisGrammes(250) === "De 100 g à 250 g", "250 → « De 100 g à 250 g » (2 annonces)");
ok(trancheLbcDepuisGrammes(1000) === "De 500 g à 1 kg", "1000 → « De 500 g à 1 kg » (21 annonces)");

console.log("2. Le calendrier des Petites Fioles");
ok(trancheLbcDepuisGrammes(500) === "De 250 g à 500 g", "500 → « De 250 g à 500 g »", trancheLbcDepuisGrammes(500));

console.log("3. Bornes et cas limites");
ok(trancheLbcDepuisGrammes(101) === "De 100 g à 250 g" && trancheLbcDepuisGrammes(278) === "De 250 g à 500 g", "un poids estimé tombe dans sa tranche");
ok(trancheLbcDepuisGrammes(40000) === "De 30 kg à 40 kg" && trancheLbcDepuisGrammes(40001) === LBC_TRANCHE_AU_DELA, "au-delà de 40 kg");
ok(trancheLbcDepuisGrammes(0) === null && trancheLbcDepuisGrammes(null) === null && trancheLbcDepuisGrammes("abc") === null, "illisible → rien (jamais une valeur inventée)");
ok(LBC_TRANCHES_POIDS.length === 10, "les 11 libellés de Leboncoin (10 tranches + au-delà)");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout passe");
process.exit(ko ? 1 : 0);
