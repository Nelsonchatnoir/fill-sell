// Autotest de src/utils/sourceDuTexte.js — le texte du vendeur n'est jamais réécrit (29/10, lot B partie 2).
//   node scripts/source-du-texte-selftest.mjs
// Cas relevés en base le 29/10 : paugues.contact « Jazz man » 1793117541271 (fiche tapée au Stock, origine NULL,
// aucun marqueur → réécrite par l'IA le 27/10 à 17:12:36), un résultat Lens (notre brouillon), un relevé Beebs.
import {
  champDuVendeur, texteDuVendeurDeLaFiche, marqueursDeNaissance, estLigneDuStock, MARQUES_FILLSELL,
} from "../src/utils/sourceDuTexte.js";
import { texteDuVendeurDe } from "../src/publication/texteDeLaFiche.js";
import { readFileSync } from "node:fs";

let ko = 0;
const ok = (cond, nom) => { if (cond) console.log(`  ✓ ${nom}`); else { ko++; console.log(`  ✗ ${nom}`); } };

console.log("1. La fiche tapée au Stock est le texte du vendeur (Jazz man)");
const jazz = { titre: "Jazz man - Peinture acrylique", description: "Peinture acrylique, deux musiciens de jazz. Travail amateur. 41 x 33 cm.", origine: null, attributs: null };
ok(estLigneDuStock(jazz), "une ligne du stock porte la clé origine (même nulle)");
ok(champDuVendeur(jazz, "titre") && champDuVendeur(jazz, "description"), "aucun marqueur, origine NULL → titre et description du vendeur");
ok(texteDuVendeurDeLaFiche(jazz).description === jazz.description, "sa description revient telle quelle");
ok(texteDuVendeurDe(jazz).titre === jazz.titre, "texteDeLaFiche.js suit la même règle");

console.log("2. Notre brouillon reste notre brouillon");
for (const m of MARQUES_FILLSELL) {
  const f = { ...jazz, attributs: { titre_source: { v: m }, description_source: { v: m } } };
  ok(!champDuVendeur(f, "titre") && !champDuVendeur(f, "description"), `marque « ${m} » → l'IA garde la main`);
}
const lens = { titre: "Peinture acrylique jazz", description: "Peinture acrylique représentant deux joueurs de jazz.", verdict: "bon" };
ok(!estLigneDuStock(lens) && !champDuVendeur(lens, "description"), "un résultat Lens (pas une ligne du stock) n'est pas un texte du vendeur");
ok(champDuVendeur({ ...lens, attributs: { description_source: { v: "manuel" } } }, "description"), "… sauf s'il le dit par un marqueur « manuel »");
ok(!champDuVendeur(jazz, "titre", { ligneDuStock: false }), "item_data sans marqueur (ligneDuStock:false) → notre brouillon");

console.log("3. Les règles d'avant tiennent");
ok(champDuVendeur({ titre: "a b", origine: "releve_beebs", attributs: { titre_source: { v: "lens" } } }, "titre"), "origine d'un relevé : toujours le vendeur (même marqué lens)");
ok(champDuVendeur({ titre: "a b", origine: "vinted_sync", attributs: null }, "titre"), "dressing Vinted : le vendeur");
ok(champDuVendeur({ titre: "a b", attributs: { titre_source: { v: "vinted" } } }, "titre"), "marqueur vinted : le vendeur");
ok(texteDuVendeurDeLaFiche({ ...jazz, description: "Pull" }).description === "", "un seul mot ne dit rien : l'IA peut compléter (07/09)");
ok(texteDuVendeurDeLaFiche(null).titre === "", "pas de fiche → rien");

console.log("4. Les marqueurs de naissance");
const m = marqueursDeNaissance({ titre: "Jazz man", description: "" }, "manuel", "2026-10-29T18:00:00Z");
ok(m.titre_source?.v === "manuel" && !m.description_source, "seuls les champs non vides sont marqués");
ok(marqueursDeNaissance({ titre: "x", description: "y z" }, "lens").description_source?.v === "lens", "source lens");

console.log("5. Les chemins de création posent leur marqueur");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
ok((app.match(/marqueursDeNaissance\(/g) ?? []).length >= 3, "App.jsx : ajout manuel, ajout depuis la modale, Lens marquent leur texte à la naissance");
const fa = readFileSync(new URL("../supabase/functions/_shared/fiche-article.ts", import.meta.url), "utf8");
ok(/marqueursDeNaissance\(\{ titre: titreBrut, description: a\.description \}, a\.sourceTexte \?\? "lens"\)/.test(fa), "serveur : la fiche née d'un scan porte « lens »");
const gl = readFileSync(new URL("../supabase/functions/generate-listing/index.ts", import.meta.url), "utf8");
ok(/champDuVendeur\(/.test(gl) && /const ligneDuStock = !item_data;/.test(gl), "generate-listing : même règle que l'écran");

if (ko) { console.log(`\n${ko} échec(s)`); process.exit(1); }
console.log("\ntout passe");
