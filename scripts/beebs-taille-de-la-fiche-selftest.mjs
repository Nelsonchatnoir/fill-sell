// Selftest — supabase/functions/_shared/beebs-taille-de-la-fiche.js (01/10).
// Listes réelles relevées (platform_category_aspects, beebs) le 01/10.
import assert from "node:assert/strict";
import { tailleBeebsDeLaFiche } from "../supabase/functions/_shared/beebs-taille-de-la-fiche.js";

let n = 0;
const ok = (m) => { n++; console.log(`  ✓ ${m}`); };

// « Mode > Femme > Chaussures (femme) > Bottes (femme) » — Pointure.
const BOTTES = [{ field_key: "Pointure", allowed_values: ["34", "34.5", "35", "35.5", "36", "36.5", "37", "37.5", "38", "38.5", "39", "39.5",
  "40", "40.5", "41", "41.5", "42", "42.5", "43", "43.5", "44", "44.5", "45", "45.5", "46", "Taille unique", "Autre"] }];

assert.deepEqual(tailleBeebsDeLaFiche("40", BOTTES), { valeur: "40", champ: "Pointure" });
ok("misscat801, bottines : fiche « 40 » → Pointure « 40 »");
assert.equal(tailleBeebsDeLaFiche("40 - XL", BOTTES), null);
assert.equal(tailleBeebsDeLaFiche("EU 40", BOTTES), null);
assert.equal(tailleBeebsDeLaFiche("39,5", BOTTES), null, "pas de conversion virgule → point");
ok("jamais approchée : « 40 - XL », « EU 40 », « 39,5 » → rien");
assert.equal(tailleBeebsDeLaFiche("", BOTTES), null);
assert.equal(tailleBeebsDeLaFiche(null, BOTTES), null);
assert.equal(tailleBeebsDeLaFiche("40", []), null);
assert.equal(tailleBeebsDeLaFiche("40", null), null);
ok("sans valeur ou sans liste relevée → rien (la question reste)");
assert.equal(tailleBeebsDeLaFiche("40", [{ field_key: "Couleur", allowed_values: ["40"] }]), null);
ok("seules les listes Taille / Pointure comptent");
assert.deepEqual(tailleBeebsDeLaFiche("taille unique", BOTTES), { valeur: "Taille unique", champ: "Pointure" });
ok("casse gommée, l'entrée de la liste est servie telle quelle");

console.log(`beebs-taille-de-la-fiche : ${n} contrôles verts`);
