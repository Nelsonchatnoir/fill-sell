// ═══════════════════════════════════════════════════════════════════════════
// Selftest du GARDE-FOU DE CATÉGORIE (2026-09-07)
//   node scripts/categorie-garde-fou-selftest.mjs
//
// Protège la règle posée après le job c324b5ee (josephinecerni) : un vêtement
// parti en Maison & Jardin > Électroménager parce que l'icône venait de Haiku
// seul. Deux autorités : le catalog_id Vinted (table relevée en direct le
// 07/09), puis les signaux de la fiche contre une icône DEVINÉE par l'IA.
//
// Ce que le test garantit, et qu'aucun refactor ne doit casser :
//   · le cas fondateur est corrigé ;
//   · un mot-objet audité (« bouilloire ») n'est JAMAIS écarté ;
//   · le rayon Sport et les vêtements bébé ne bougent pas ;
//   · un nombre qui n'est pas une taille (500 W) ne fait pas passer un
//     électroménager pour un vêtement ;
//   · la table d'identifiants Vinted a exactement la taille du relevé.
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

// Les sources de l'app importent sans extension (style Vite) : on en fait une
// copie temporaire importable par Node, sans toucher aux fichiers du dépôt.
const tmps = [];
function copieImportable(rel, nomTmp) {
  const src = fs.readFileSync(join(ROOT, rel), "utf8")
    .replace(/from "\.\/vintedCatalogMode"/g, 'from "./.vintedCatalogMode.selftest.tmp.mjs"');
  const p = join(ROOT, "scripts", nomTmp);
  fs.writeFileSync(p, src);
  tmps.push(p);
  return p;
}
copieImportable("src/utils/vintedCatalogMode.js", ".vintedCatalogMode.selftest.tmp.mjs");
const pGarde = copieImportable("src/utils/categorieGardeFou.js", ".categorieGardeFou.selftest.tmp.mjs");
const mode = await import(pathToFileURL(join(ROOT, "scripts", ".vintedCatalogMode.selftest.tmp.mjs")).href);
const garde = await import(pathToFileURL(pGarde).href);
for (const p of tmps) fs.unlinkSync(p);

console.log("1. Table des catalogues Vinted (relevé live du 07/09) :");
const t = mode.tailleTablesMode();
check("511 identifiants « vêtements »", t.vetements === 511, `(${t.vetements})`);
check("71 identifiants « chaussures »", t.chaussures === 71, `(${t.chaussures})`);
check("86 identifiants « sacs et accessoires »", t.sacs_access === 86, `(${t.sacs_access})`);
// Racines des 9 branches mode, relevées une par une sur l'API du formulaire.
for (const [id, attendu] of [[4, "vetements"], [2050, "vetements"], [1195, "vetements"], [1194, "vetements"],
                             [16, "chaussures"], [1231, "chaussures"],
                             [19, "sacs_access"], [1187, "sacs_access"], [82, "sacs_access"]]) {
  check(`catalog ${id} → ${attendu}`, mode.brancheModeDuCatalogue(id) === attendu, `(${mode.brancheModeDuCatalogue(id)})`);
}
console.log("   Racines NON mode (ne doivent jamais forcer le rayon Mode) :");
for (const [id, nom] of [[1918, "Maison"], [2994, "Électronique"], [2309, "Livres et médias"], [4332, "Sport"]]) {
  check(`racine ${nom} (${id}) → null`, mode.brancheModeDuCatalogue(id) === null);
}
check("identifiant absurde → null", mode.brancheModeDuCatalogue("x") === null && mode.brancheModeDuCatalogue(0) === null);

console.log("2. Garde-fou :");
const cas = [
  ["cas fondateur c324b5ee (IA seule + genre Femme)",
   { cheminCalcule: ["Maison & Jardin", "Électroménager"], catalogId: null, genre: "Femme", taille: "", sourceIcone: "ia" },
   { corrige: true, chemin: "Mode > Vêtements", source: "signaux_fiche" }],
  ["même article, signal TAILLE seul",
   { cheminCalcule: ["Maison & Jardin", "Électroménager"], catalogId: null, genre: "", taille: "S", sourceIcone: "ia" },
   { corrige: true, chemin: "Mode > Vêtements", source: "signaux_fiche" }],
  ["bouilloire trouvée par MOT-OBJET — jamais écartée",
   { cheminCalcule: ["Maison & Jardin", "Électroménager"], catalogId: null, genre: "", taille: "", sourceIcone: "mot_cle" },
   { corrige: false, chemin: "Maison & Jardin > Électroménager", source: "mot_cle" }],
  ["électroménager deviné par l'IA, aucun signal mode",
   { cheminCalcule: ["Maison & Jardin", "Électroménager"], catalogId: null, genre: "", taille: "", sourceIcone: "ia" },
   { corrige: false, chemin: "Maison & Jardin > Électroménager", source: "ia" }],
  ["catalogue Vinted vêtement (2050) contre icône de chauffage",
   { cheminCalcule: ["Maison & Jardin", "Électroménager"], catalogId: 2050, genre: "", taille: "", sourceIcone: "ia" },
   { corrige: true, chemin: "Mode > Vêtements", source: "catalog_vinted" }],
  ["catalogue Vinted chaussures (1231) depuis Divers",
   { cheminCalcule: ["Divers", "Autres"], catalogId: 1231, genre: "", taille: "", sourceIcone: "ia" },
   { corrige: true, chemin: "Mode > Chaussures", source: "catalog_vinted" }],
  ["catalogue Vinted sacs (1187) depuis Divers",
   { cheminCalcule: ["Divers", "Autres"], catalogId: 1187, genre: "", taille: "", sourceIcone: "ia" },
   { corrige: true, chemin: "Mode > Accessoires & Bagagerie", source: "catalog_vinted" }],
  ["maillot de sport : le rayon Sport reste le rayon Sport",
   { cheminCalcule: ["Loisirs", "Sport & Plein air"], catalogId: null, genre: "Homme", taille: "L", sourceIcone: "ia" },
   { corrige: false, chemin: "Loisirs > Sport & Plein air", source: "ia" }],
  ["vêtements bébé : la feuille Famille reste",
   { cheminCalcule: ["Famille", "Vêtements bébé"], catalogId: null, genre: "Bébé", taille: "6 mois", sourceIcone: "ia" },
   { corrige: false, chemin: "Famille > Vêtements bébé", source: "ia" }],
  ["livre : famille souveraine intacte",
   { cheminCalcule: ["Loisirs", "Livres"], catalogId: null, genre: "", taille: "", sourceIcone: "famille_livres" },
   { corrige: false, chemin: "Loisirs > Livres", source: "famille_livres" }],
  ["« 500 » (watts) n'est pas une taille",
   { cheminCalcule: ["Maison & Jardin", "Électroménager"], catalogId: null, genre: "", taille: "500", sourceIcone: "ia" },
   { corrige: false, chemin: "Maison & Jardin > Électroménager", source: "ia" }],
  ["catalogue mode + rayon Mode déjà bon : rien ne bouge",
   { cheminCalcule: ["Mode", "Vêtements"], catalogId: 2050, genre: "Femme", taille: "M", sourceIcone: "mot_cle" },
   { corrige: false, chemin: "Mode > Vêtements", source: "catalog_vinted" }],
];
for (const [nom, entree, attendu] of cas) {
  const r = garde.gardeFouCategorieLbc(entree);
  const chemin = (r.chemin ?? []).join(" > ");
  check(`${nom} → ${attendu.chemin}`,
    r.corrige === attendu.corrige && chemin === attendu.chemin && r.source === attendu.source,
    `(corrigé=${r.corrige}, chemin=« ${chemin} », source=${r.source})`);
}

console.log("3. Tailles reconnues / refusées :");
for (const t2 of ["S", "M", "XL", "38", "44", "6 mois", "3 ans", "EU 42", "38 - M", "Taille unique"]) {
  check(`« ${t2} » est une taille`, garde._internes.estTailleMode(t2) === true);
}
for (const t2 of ["500", "2000", "", "noir", "1500 watts", "12 W"]) {
  check(`« ${t2} » n'est pas une taille`, garde._internes.estTailleMode(t2) === false);
}

console.log("4. Catégorie « incertaine » (l'extension 0.6.21 préfèrera la suggestion Leboncoin) :");
check("IA seule, sans catalogue → incertaine", garde.categorieIncertaine({ sourceFinale: "ia", catalogId: null }) === true);
check("IA mais catalogue mode → certaine", garde.categorieIncertaine({ sourceFinale: "ia", catalogId: 2050 }) === false);
check("mot-objet → certaine", garde.categorieIncertaine({ sourceFinale: "mot_cle", catalogId: null }) === false);

console.log(echecs ? `\n${echecs} ÉCHEC(S)` : "\nTout est vert.");
process.exit(echecs ? 1 : 0);
