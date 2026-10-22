// ═══════════════════════════════════════════════════════════════════════════
// UNE ŒUVRE D'ART N'EST JAMAIS UN COSMÉTIQUE — preuve (22/10 soir, point 2 — paugues)
// ═══════════════════════════════════════════════════════════════════════════
// Cas réel : « Huile post impressionniste biblique sur carton » (paugues, André Thomas) classée Beauté par le mot
// « Huile », icône 🧴, et refusée sur Leboncoin comme « cosmétique ». Ce test prouve :
//   1. les œuvres sont reconnues (technique sur support, technique nommée, attribution, signature…) ;
//   2. les cosmétiques et fournitures restent ce qu'ils sont (huile visage, huile d'argan, pull pastel…) —
//      le rejeu symétrique de 48 832 fiches (22/10) : 15 types changés, tous Beauté → Maison sur des œuvres ;
//   3. le type, l'icône, le refus Leboncoin et le rayon Vinted suivent ;
//   4. le MIROIR de l'extension (lbcProduitInterdit) est identique à la source, au caractère près.
import fs from "node:fs";
import { oeuvreDArt, estOeuvreDArt, rayonVintedOeuvre } from "../src/utils/oeuvreDArt.js";
import { detectType, detectObjectKeywordDetail } from "../src/utils/shared.js";
import { estCosmetiqueInterditeLbc } from "../src/utils/lbcCategories.js";

let echecs = 0;
const ok = (cond, titre, detail = "") => {
  if (cond) { console.log(`  ✓ ${titre}`); return; }
  echecs++;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const PAUGUES = "Huile post impressionniste biblique sur carton";
const OEUVRES = [
  PAUGUES,
  "Pastel buste de femme - Pierre Almès - 1924",
  "Fusain de François Renoyer - A l eau - 1916",
  "Aquarelle de Montmartre signée",
  "Sanguine de Boucher",
  "Croquis original 1950",
  "Huile sur toile signée",
];
const PAS_DES_OEUVRES = [
  "Huile visage bio 30ml", "Huile essentielle de lavande", "Huile d argan 100ml", "Huile d'Olive Puget 1L",
  "Pull pastel rose taille M", "Fusain du Japon en pot", "Encre de chine noire 50ml", "Gouache Lefranc 10 tubes",
  "Encre Parker bleue", "Dessin d enfant",
];

console.log("1. LES ŒUVRES SONT RECONNUES");
for (const t of OEUVRES) ok(estOeuvreDArt(t), `œuvre : « ${t} » (${oeuvreDArt(t)?.famille})`);
ok(oeuvreDArt("Lithographie signée numérotée 12/50")?.famille === "estampe", "une lithographie est une estampe");

console.log("2. LE RESTE RESTE CE QU'IL EST");
for (const t of PAS_DES_OEUVRES) ok(!estOeuvreDArt(t), `pas une œuvre : « ${t} »`);

console.log("3. TYPE, ICÔNE, LEBONCOIN, VINTED");
ok(detectType(PAUGUES) !== "Beauté", `le type de l'œuvre de paugues n'est plus Beauté (${detectType(PAUGUES)})`);
ok(detectType("Huile visage bio 30ml") === "Beauté", "une huile visage reste Beauté");
ok(detectObjectKeywordDetail(PAUGUES)?.icon === "🖼️", `l'icône de l'œuvre : 🖼️ (${detectObjectKeywordDetail(PAUGUES)?.icon})`);
ok(detectObjectKeywordDetail("Huile visage bio 30ml")?.icon !== "🖼️", "une huile visage garde son icône");
ok(!estCosmetiqueInterditeLbc("🧴", { titre: PAUGUES, description: "" }), "Leboncoin : l'œuvre n'est JAMAIS refusée comme cosmétique (même icône 🧴 écrite avant la règle)");
ok(!estCosmetiqueInterditeLbc("🧴", { titre: "Toile", description: "Huile sur toile signée en bas à droite, 1952" }), "Leboncoin : la description suffit à reconnaître l'œuvre");
ok(estCosmetiqueInterditeLbc("🧴", { titre: "Huile visage bio 30ml" }) === estCosmetiqueInterditeLbc("🧴", { titre: "Huile visage bio 30ml", description: "" }), "Leboncoin : un cosmétique est jugé comme avant");
ok(rayonVintedOeuvre("peinture").id === 3847 && rayonVintedOeuvre("estampe").id === 3849, "Vinted : Peintures (3847) / Affiches et reproductions (3849) — relevés sur l'annonce de paugues");
const resol = lire("src/utils/resolutionPublication.js");
ok(resol.includes("rayonVintedOeuvre(oeuvre.famille)") && resol.includes(': parMot.regle?.startsWith("oeuvre_") ? "oeuvre_d_art"'),"la publication Vinted d'une œuvre prend ce rayon, et le dit (categorie_source)");

console.log("4. LE MIROIR DE L'EXTENSION EST IDENTIQUE");
{
  const src = lire("src/utils/oeuvreDArt.js");
  const debut = src.indexOf('const B = "(?<![\\\\p{L}\\\\p{N}])";');
  const fin = src.indexOf("/** Raccourci booléen. */");
  const bloc = src.slice(debut, fin).replace("export function oeuvreDArt(", "function oeuvreDArt(").trimEnd();
  const bg = lire("chrome-extension/background.js");
  const m = bg.match(/\/\/ <<< OEUVRE_D_ART_DEBUT\n([\s\S]*?)\n\/\/ >>> OEUVRE_D_ART_FIN/);
  ok(debut > 0 && fin > debut, "bornes du bloc source trouvées");
  ok(Boolean(m) && m[1] === bloc, "background.js porte le bloc EXACT de src/utils/oeuvreDArt.js (sinon : régénérer le miroir)",
    m ? `écart au caractère ${[...m[1]].findIndex((c, i) => c !== bloc[i])}` : "bornes absentes");
  ok(/if \(oeuvreDArtExtension\(job\.title, job\.description\)\) return false;/.test(bg), "lbcProduitInterdit : une œuvre n'est jamais un produit interdit");
}

console.log("");
if (echecs) { console.error(`✗ ${echecs} échec(s)`); process.exit(1); }
console.log("✓ une œuvre d'art n'est jamais un cosmétique");
