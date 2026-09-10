// ═══════════════════════════════════════════════════════════════════════════
// Selftest de LA FAMILLE D'UN CHEMIN — contrôle de plausibilité (2026-09-10)
//   node scripts/famille-categorie-selftest.mjs
//
// Protège la règle posée après le job dddc7f2a (Victor) : une salopette de
// mode partie sur eBay en « Auto, moto > Vêtements mécanicien > Combinaisons,
// salopettes » parce que rien ne comparait la famille du chemin à celle de
// l'objet. Ce que le test garantit :
//   · la famille des racines de chaque arbre relevé est celle attendue ;
//   · une famille inconnue ne refuse JAMAIS rien ;
//   · « bebe » tolère les rayons voisins (vêtements, jouets, meubles, soins) ;
//   · la famille de l'objet ne vient QUE des sources certaines (catalogue
//     Vinted, icône d'autorité, taille) — jamais d'une icône « ia » ni d'un
//     mot-clé du titre ;
//   · les trois dérapages nommés par Nico sont refusés, les cas sains passent.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let echecs = 0;
const check = (nom, ok, extra = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { echecs++; console.log(`  ✗ ${nom} ${extra}`); }
};

const tmps = [];
function copieImportable(rel, nomTmp) {
  const src = fs.readFileSync(join(ROOT, rel), "utf8")
    .replace(/from "\.\/vintedCatalogMode"/g, 'from "./.vintedCatalogMode.selftest.tmp.mjs"')
    .replace(/from "\.\/lbcCategories"/g, 'from "./.lbcCategories.selftest.tmp.mjs"')
    .replace(/from "\.\/categorieGardeFou"/g, 'from "./.categorieGardeFou.selftest.tmp.mjs"');
  const p = join(ROOT, "scripts", nomTmp);
  fs.writeFileSync(p, src);
  tmps.push(p);
  return p;
}
copieImportable("src/utils/vintedCatalogMode.js", ".vintedCatalogMode.selftest.tmp.mjs");
copieImportable("src/utils/lbcCategories.js", ".lbcCategories.selftest.tmp.mjs");
copieImportable("src/utils/categorieGardeFou.js", ".categorieGardeFou.selftest.tmp.mjs");
const pFam = copieImportable("src/utils/familleCategorie.js", ".familleCategorie.selftest.tmp.mjs");
const fam = await import(pathToFileURL(pFam).href);
for (const p of tmps) fs.unlinkSync(p);

console.log("1. Famille des racines relevées :");
const racines = [
  ["ebay", ["Vêtements, accessoires", "Femme : vêtements, accessoires"], "mode"],
  ["ebay", ["Bijoux, montres", "Montres"], "mode"],
  ["ebay", ["Auto, moto - pièces, accessoires", "Casques, vêtements", "Vêtements mécanicien", "Combinaisons, salopettes"], "vehicules"],
  ["ebay", ["Maison", "Cuisine"], "maison"],
  ["ebay", ["Bricolage", "Outils"], "maison"],
  ["ebay", ["Informatique, réseaux", "Ordinateurs de bureau"], "electronique"],
  ["ebay", ["Jeux vidéo, consoles", "Jeux"], "loisirs"],
  ["ebay", ["Instruments de musique", "Claviers"], "loisirs"],
  ["ebay", ["Beauté, bien-être, parfums", "Soins"], "beaute"],
  ["ebay", ["Bébé, puériculture", "Vêtements"], "bebe"],
  ["leboncoin", ["Mode", "Vêtements"], "mode"],
  ["leboncoin", ["Maison & Jardin", "Bricolage"], "maison"],
  ["leboncoin", ["Électronique", "Ordinateurs"], "electronique"],
  ["leboncoin", ["Électronique", "Consoles"], "loisirs"],
  ["leboncoin", ["Loisirs", "Livres"], "loisirs"],
  ["leboncoin", ["Famille", "Vêtements bébé"], "bebe"],
  ["leboncoin", ["Divers", "Autres"], null],
  ["beebs", ["Mode", "Femme", "Vêtements (femme)"], "mode"],
  ["beebs", ["Hygiène et beauté", "Soins visage et corps"], "beaute"],
  ["beebs", ["Puériculture", "Repas"], "bebe"],
  ["vinted", ["Hommes", "Vêtements", "Autres"], "mode"],
  ["vinted", ["Femmes", "Beauté", "Soins du visage"], "beaute"],
  ["vinted", ["Enfants", "Jouets"], null],
  ["vinted", ["Maison", "Textile"], "maison"],
  ["vinted", ["Électronique", "Jeux vidéo", "Jeux"], "loisirs"],
  ["vinted", [], null],
];
for (const [pf, chemin, attendu] of racines) {
  const r = fam.familleDeChemin(pf, chemin);
  check(`${pf} « ${chemin.join(" > ") || "(vide)"} » → ${attendu}`, r === attendu, `(${r})`);
}

console.log("\n2. Compatibilités :");
check("mode ≠ vehicules", !fam.famillesCompatibles("mode", "vehicules"));
check("maison ≠ electronique (robot cuiseur → Ordinateurs)", !fam.famillesCompatibles("maison", "electronique"));
check("loisirs ≠ maison (miniature → Pinceaux)", !fam.famillesCompatibles("loisirs", "maison"));
check("maison ≠ beaute (taie d'oreiller → Soins du visage)", !fam.famillesCompatibles("maison", "beaute"));
check("mode ~ bebe (vêtements bébé)", fam.famillesCompatibles("mode", "bebe") && fam.famillesCompatibles("bebe", "mode"));
check("loisirs ~ bebe (jouets bébé)", fam.famillesCompatibles("loisirs", "bebe"));
check("inconnue tolère tout", fam.famillesCompatibles(null, "vehicules") && fam.famillesCompatibles("mode", null));
check("même famille", fam.famillesCompatibles("mode", "mode"));

console.log("\n3. Famille de l'OBJET — sources certaines seulement :");
const salopette = fam.familleDeLObjet({ catalogId: 83, icone: "👖", sourceIcone: "ia", taille: "M" });
check("catalogue Vinted 83 (Hommes > Vêtements) → mode, source catalog_vinted",
  salopette.famille === "mode" && salopette.source === "catalog_vinted", `(${JSON.stringify(salopette)})`);
const iconeIa = fam.familleDeLObjet({ catalogId: null, icone: "🎹", sourceIcone: "ia", taille: "" });
check("icône devinée par l'IA seule → aucune famille", iconeIa.famille === null, `(${JSON.stringify(iconeIa)})`);
const motCle = fam.familleDeLObjet({ catalogId: null, icone: "🏀", sourceIcone: "mot_cle", taille: "" });
check("icône par mot-clé du titre → aucune famille (même rang que le mot-objet)", motCle.famille === null, `(${JSON.stringify(motCle)})`);
const livres = fam.familleDeLObjet({ catalogId: null, icone: "📚", sourceIcone: "famille_livres", taille: "" });
check("famille livres (autorité) → loisirs", livres.famille === "loisirs", `(${JSON.stringify(livres)})`);
const taille = fam.familleDeLObjet({ catalogId: null, icone: "🌡️", sourceIcone: "ia", taille: "38" });
check("taille de vêtement « 38 » → mode, source taille", taille.famille === "mode" && taille.source === "taille", `(${JSON.stringify(taille)})`);
const watts = fam.familleDeLObjet({ catalogId: null, icone: "🌡️", sourceIcone: "ia", taille: "500" });
check("« 500 » (watts) n'est pas une taille → aucune famille", watts.famille === null, `(${JSON.stringify(watts)})`);
const pointure = fam.familleDeLObjet({ catalogId: null, icone: "👟", sourceIcone: "pointure", taille: "" });
check("icône par pointure (autorité) → mode", pointure.famille === "mode", `(${JSON.stringify(pointure)})`);

console.log("\n4. Plausibilité des chemins — les dérapages nommés sont refusés, le sain passe :");
const cas = [
  ["salopette de mode → Vêtements mécanicien (eBay)", "ebay", ["Auto, moto - pièces, accessoires", "Casques, vêtements", "Vêtements mécanicien", "Combinaisons, salopettes"], "mode", false],
  ["salopette de mode → Homme > Pantalons (eBay)", "ebay", ["Vêtements, accessoires", "Homme : vêtements, accessoires", "Homme : vêtements", "Pantalons"], "mode", true],
  ["robot cuiseur (maison) → Ordinateurs de bureau (eBay)", "ebay", ["Informatique, réseaux", "Ordinateurs de bureau"], "maison", false],
  ["miniature (loisirs) → Maison > Outils > Pinceaux (LBC)", "leboncoin", ["Maison & Jardin", "Bricolage", "Pinceaux"], "loisirs", false],
  ["taies d'oreiller (maison) → Beauté (eBay)", "ebay", ["Beauté", "Soins de la peau", "Hydratants"], "maison", true],
  ["taies d'oreiller (maison) → Beauté, bien-être, parfums (eBay)", "ebay", ["Beauté, bien-être, parfums", "Soins de la peau"], "maison", false],
  ["chapka bébé (mode) → Instruments de musique (eBay)", "ebay", ["Instruments de musique", "Claviers arrangeurs, synthés"], "mode", false],
  ["chapka bébé (mode) → Bébé, puériculture (eBay)", "ebay", ["Bébé, puériculture", "Vêtements"], "mode", true],
  ["vêtement (mode) → Divers > Autres (LBC, famille inconnue)", "leboncoin", ["Divers", "Autres"], "mode", true],
  ["objet sans famille connue → n'importe où", "ebay", ["Auto, moto - pièces, accessoires", "Casques"], null, true],
];
for (const [nom, pf, chemin, familleObjet, attendu] of cas) {
  const v = fam.plausibiliteDuChemin(pf, chemin, familleObjet);
  check(`${nom} → ${attendu ? "plausible" : "REFUSÉ"}`, v.ok === attendu, `(objet ${v.familleObjet}, chemin ${v.familleChemin})`);
}

console.log(echecs ? `\n${echecs} ÉCHEC(S)` : "\nTout est vert.");
process.exit(echecs ? 1 : 0);
