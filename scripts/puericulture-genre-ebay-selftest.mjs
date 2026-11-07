// ═══════════════════════════════════════════════════════════════════════════
// LA RACINE eBay « BÉBÉ, PUÉRICULTURE » N'EST PAS UN RAYON DE GENRE — SELFTEST (07/11, point 4)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : « Doudou Simba Le Roi Lion Disney Baby orange avec peluche » (nicolas.menar, 06/11 23:18), genre
// Fille. brancheGenre lisait « Bébé » dans la racine « Bébé, puériculture » et écartait sa seule feuille exacte (148373
// « Peluches, doudous ») ; l'icône 🧸 l'envoyait en « Jouets et jeux › Peluches, doudous › Modernes ». eBay le range en
// puériculture : la garde a retenu le dépôt. RÈGLE : le genre se lit sur le reste du chemin, jamais sur cette racine.
// Les vêtements restent filtrés par genre (une robe Fille ne descend jamais en rayon Bébé).
//
//   node --import ./scripts/loader-ext.mjs scripts/puericulture-genre-ebay-selftest.mjs

import { resoudreParMot, candidatsParMot, brancheGenre } from "../src/utils/categorieParMot.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };
const chemin = (r) => (r?.chemin ?? []).join(" > ");

console.log("1. La racine puériculture n'est pas un genre");
ok(brancheGenre(["Bébé, puériculture", "Peluches, doudous"]) === null, "« Bébé, puériculture › Peluches, doudous » : aucune branche de genre");
ok(brancheGenre(["Vêtements, accessoires", "Bébé : vêtements, accessoires"]) === "bebe", "« Vêtements › Bébé : vêtements » : reste la branche bébé");
ok(brancheGenre(["Vêtements, accessoires", "Fille : vêtements"]) === "fille", "« Fille : vêtements » : reste fille");

console.log("2. Le doudou garde sa feuille de puériculture, quel que soit le genre");
for (const genre of ["Fille", "Garçon", "Enfant", "Bébé", "Mixte", ""]) {
  const r = await resoudreParMot("doudou peluche", "ebay", { genre });
  ok(r?.certitude === "exact" && String(r?.id) === "148373", `« doudou peluche », genre « ${genre || "vide"} » : EXACT 148373 (${r?.certitude} ${r?.id ?? ""} ${chemin(r)})`);
}
const cands = await candidatsParMot("doudou", "ebay", { genre: "Fille" });
ok(Array.isArray(cands) && cands.some((c) => String(c.id) === "148373"), "« doudou », genre Fille : 148373 parmi les candidates");

console.log("3. Les vêtements restent filtrés par genre");
const robe = await resoudreParMot("robe", "ebay", { genre: "Fille" });
ok(!/^Bébé, puériculture/.test(chemin(robe)) && !/Bébé :/.test(chemin(robe)), `« robe », Fille : jamais en rayon Bébé (${chemin(robe) || "aucun"})`);

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
