// ═══════════════════════════════════════════════════════════════════════════
// Selftest de LA CATÉGORIE PAR LE MOT (2026-09-07)
//   node scripts/categorie-par-mot-selftest.mjs
//
// Étape 2 du chantier « sortir de l'emoji » : le nom rendu par l'IA est résolu
// contre nos ARBRES RELEVÉS, sans IA. La règle testée ici est celle qui compte :
// EXACT, OU RIEN — jamais une catégorie approchée.
//
// Ce que le test garantit :
//   · les quatre index de feuilles se chargent et ont la taille du relevé ;
//   · les cas réels du 07/09 se résolvent (taie d'oreiller) ou remontent
//     honnêtement en candidats (chapka) ;
//   · le GENRE tranche entre deux branches portant la même feuille ;
//   · « Mixte » ne tranche rien (une non-réponse ne décide jamais) ;
//   · un mot inconnu ne rend AUCUNE catégorie.
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

// Les sources de l'app importent sans extension (style Vite) : copie temporaire
// importable par Node, sans toucher aux fichiers du dépôt.
const tmps = [];
function copieImportable(rel, nomTmp, remplacements = []) {
  let src = fs.readFileSync(join(ROOT, rel), "utf8");
  for (const [de, vers] of remplacements) src = src.split(de).join(vers);
  const p = join(ROOT, "src/utils", nomTmp);
  fs.writeFileSync(p, src);
  tmps.push(p);
  return p;
}
// Depuis le 10/09, categorieParMot lit la FAMILLE des feuilles (familleCategorie),
// qui s'appuie sur le catalogue Vinted, l'arbre Leboncoin et le garde-fou.
copieImportable("src/utils/vintedCatalogMode.js", ".vintedCatalogMode.selftest.tmp.mjs");
copieImportable("src/utils/lbcCategories.js", ".lbcCategories.selftest.tmp.mjs");
copieImportable("src/utils/categorieGardeFou.js", ".categorieGardeFou.selftest.tmp.mjs", [
  ['from "./vintedCatalogMode"', 'from "./.vintedCatalogMode.selftest.tmp.mjs"'],
  ['from "./lbcCategories"', 'from "./.lbcCategories.selftest.tmp.mjs"'],
]);
copieImportable("src/utils/familleCategorie.js", ".familleCategorie.selftest.tmp.mjs", [
  ['from "./vintedCatalogMode"', 'from "./.vintedCatalogMode.selftest.tmp.mjs"'],
  ['from "./lbcCategories"', 'from "./.lbcCategories.selftest.tmp.mjs"'],
  ['from "./categorieGardeFou"', 'from "./.categorieGardeFou.selftest.tmp.mjs"'],
]);
const pMot = copieImportable("src/utils/categorieParMot.js", ".categorieParMot.selftest.tmp.mjs", [
  ['from "./texteComparable"', 'from "./texteComparable.js"'],
  ['from "./familleCategorie"', 'from "./.familleCategorie.selftest.tmp.mjs"'],
]);
const mot = await import(pathToFileURL(pMot).href);

console.log("1. Les quatre index de feuilles (générés depuis les relevés) :");
const tailles = { vinted: 2489, ebay: 3906, beebs: 579, leboncoin: 83 };
for (const [pf, attendu] of Object.entries(tailles)) {
  const f = await mot.feuillesDe(pf);
  check(`${pf} : ${attendu} feuilles`, f.length === attendu, `(${f.length})`);
}
const ebayF = await mot.feuillesDe("ebay");
check("eBay porte des identifiants numériques", ebayF.every((f) => /^\d+$/.test(f.id ?? "")));
const vintedF = await mot.feuillesDe("vinted");
// 09/09 : le relevé live (/api/v2/item_upload/catalogs) porte l'id de chaque feuille — la
// navigation de l'extension reste par libellés, l'id sert aux grilles (tailles) par catalogue.
check("Vinted porte l'identifiant numérique de chaque feuille (relevé du 09/09)", vintedF.every((f) => /^[0-9]+$/.test(f.id ?? "")));

console.log("\n2. Les cas réels du 07/09 :");
const taie = await mot.resoudreParMot("taie d'oreiller", "ebay", {});
check("« taie d'oreiller » → une feuille eBay EXACTE",
  taie.certitude === "exact" && /taie/i.test(taie.chemin.join(" ")),
  `(${taie.certitude}, ${taie.chemin?.join(" > ") ?? "aucune"} — ${taie.motif})`);
for (const pf of ["vinted", "beebs", "leboncoin"]) {
  const r = await mot.resoudreParMot("taie d'oreiller", pf, {});
  check(`« taie d'oreiller » sur ${pf} : exact ou candidats, JAMAIS approché`,
    r.certitude === "exact" || (r.certitude === null && r.chemin === null),
    `(${r.certitude}, ${r.motif})`);
}

console.log("\n3. Le genre tranche entre deux branches portant la même feuille :");
const bonnetSansGenre = await mot.resoudreParMot("bonnet", "vinted", {});
const bonnetFemme = await mot.resoudreParMot("bonnet", "vinted", { genre: "Femme" });
check("« bonnet » sans genre ne tranche PAS", bonnetSansGenre.certitude === null,
  `(${bonnetSansGenre.motif})`);
check("« bonnet » + genre Femme reste dans la branche Femmes",
  bonnetFemme.certitude === null || /femme/i.test(bonnetFemme.chemin.join(" ")),
  `(${bonnetFemme.chemin?.join(" > ") ?? bonnetFemme.motif})`);
const bonnetMixte = await mot.resoudreParMot("bonnet", "vinted", { genre: "Mixte" });
check("« Mixte » est une NON-RÉPONSE : elle ne tranche rien",
  bonnetMixte.certitude === bonnetSansGenre.certitude);

console.log("\n4. On n'invente jamais :");
for (const [m, pf] of [["zzzblurp", "ebay"], ["", "vinted"], ["   ", "beebs"]]) {
  const r = await mot.resoudreParMot(m, pf, {});
  check(`« ${m || "(vide)"} » sur ${pf} → aucune catégorie`,
    r.chemin === null && r.certitude === null);
}
const chapka = await mot.resoudreParMot("chapka", "ebay", { genre: "Bébé" });
check("« chapka » : aucune feuille eBay ne porte ce mot → aucune catégorie posée",
  chapka.chemin === null, `(${chapka.motif})`);

console.log("\n5. Jetons : pluriels ramenés au singulier, mots vides écartés :");
check("« Taies d'oreiller » et « taie d'oreiller » donnent les mêmes jetons",
  JSON.stringify(mot.jetons("Taies d'oreiller")) === JSON.stringify(mot.jetons("taie d'oreiller")),
  `(${JSON.stringify(mot.jetons("Taies d'oreiller"))} vs ${JSON.stringify(mot.jetons("taie d'oreiller"))})`);
check("« de / des / autres » ne comptent pas",
  mot.jetons("Autres accessoires de la maison").join(" ") === "maison",
  `(${JSON.stringify(mot.jetons("Autres accessoires de la maison"))})`);

console.log("\n6. La FAMILLE filtre comme le genre (cas dddc7f2a du 10/09, salopette de mode) :");
// Sans famille : la seule feuille eBay contenant « salopette » est celle des
// vêtements de mécanicien (Auto, moto) — elle devenait l'unique candidate, donc
// le choix de l'IA, pour une salopette d'homme.
const salopetteSansFamille = await mot.candidatsParMot("salopette", "ebay", { genre: "Homme" });
check("sans famille : « Combinaisons, salopettes » (Auto, moto) est candidate",
  salopetteSansFamille.some((c) => /auto, moto/i.test(c.chemin[0]) && /salopette/i.test(c.chemin.at(-1))),
  `(${salopetteSansFamille.map((c) => c.chemin.join(" > ")).join(" | ") || "aucune"})`);
const salopetteMode = await mot.candidatsParMot("salopette", "ebay", { genre: "Homme", famille: "mode" });
check("famille mode : plus AUCUNE candidate Auto, moto",
  !salopetteMode.some((c) => /auto, moto/i.test(c.chemin[0])),
  `(${salopetteMode.map((c) => c.chemin.join(" > ")).join(" | ") || "aucune"})`);
const salopetteResolue = await mot.resoudreParMot("salopette", "ebay", { genre: "Homme", famille: "mode" });
check("resoudreParMot : rien de posé, et le motif dit qu'une feuille d'une autre famille a été écartée",
  salopetteResolue.chemin === null && /autre famille/.test(salopetteResolue.motif), `(${salopetteResolue.motif})`);
// Une feuille de la BONNE famille n'est jamais écartée par le filtre.
const taieMaison = await mot.resoudreParMot("taie d'oreiller", "ebay", { famille: "maison" });
check("« taie d'oreiller » + famille maison → toujours la feuille eBay exacte",
  taieMaison.certitude === "exact", `(${taieMaison.motif})`);
// Une famille inconnue (null) ne filtre rien : comportement d'avant.
const salopetteNull = await mot.candidatsParMot("salopette", "ebay", { genre: "Homme", famille: null });
check("famille inconnue → liste identique à « sans famille »",
  JSON.stringify(salopetteNull) === JSON.stringify(salopetteSansFamille));

for (const p of tmps) fs.unlinkSync(p);
console.log(echecs ? `\n${echecs} ÉCHEC(S)` : "\nTout est vert.");
process.exit(echecs ? 1 : 0);
