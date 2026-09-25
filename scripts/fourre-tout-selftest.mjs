// ═══════════════════════════════════════════════════════════════════════════
// Selftest « LE FOURRE-TOUT D'UN CATALOGUE N'EST PAS UN RAYON » (2026-09-25)
//   npm run selftest:fourre-tout
//
// Prouve la règle de src/utils/fourreTout.js — lue par l'app (descente de
// l'arbre, relance d'un dépôt refusé) ET par get-pending-jobs (filet avant
// tout essai) :
//   1. « Divers > Autres » (le pichet de Jocabroc) et les « Autres… » à un ou
//      deux niveaux sont visés, sur les CINQ arbres relevés ;
//   2. un « Autres … » plus profond est le « autres » d'une branche (« Robes >
//      Autres robes ») : un vrai rayon, jamais visé ;
//   3. aucun vrai rayon du relevé n'est pris pour un fourre-tout ;
//   4. le choix de la personne (categorie_source « choix_humain ») part tel
//      quel ; le reste est re-cherché à la relance.
// ═══════════════════════════════════════════════════════════════════════════
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (p) => pathToFileURL(join(ROOT, "src", p)).href;
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

const { estFourreToutCatalogue } = await import(src("utils/fourreTout.js"));

console.log("1. Les fourre-tout visés");
for (const c of [
  ["Divers", "Autres"],
  ["Divers"],
  ["Services", "Autres services"],
  ["Maison", "Autres"],
  ["Enfants", "Autres articles pour bébé et enfant"],
  ["DVD, cinéma", "Autres formats"],
  ["Collections", "Other"],
  ["Autres"],
]) ok(c.join(" > "), estFourreToutCatalogue(c) === true, "devrait être un fourre-tout");

console.log("2. Jamais visés");
for (const c of [
  ["Maison & Jardin", "Arts de la table"],
  ["Maison & Jardin", "Électroménager"],
  ["Femmes", "Vêtements", "Robes", "Autres robes"],
  ["Hommes", "Chaussures", "Autres chaussures"],
  ["Loisirs", "Collection"],
  ["Divers", "Autres", "Encore"],
  [],
  null,
  "Divers > Autres",
]) ok(JSON.stringify(c), estFourreToutCatalogue(c) === false, "ne devrait pas être visé");

console.log("3. Les arbres relevés : seuls les « Autres » de 1-2 niveaux");
const arbres = { leboncoin: "leboncoinFeuilles.js", beebs: "beebsFeuilles.js", opla: "oplaFeuilles.js", vinted: "vintedFeuilles.js", ebay: "ebayFeuilles.js" };
for (const [pf, fichier] of Object.entries(arbres)) {
  const { FEUILLES } = await import(src(`utils/arbres/${fichier}`));
  const vises = FEUILLES.filter((f) => estFourreToutCatalogue(f.chemin));
  const intrus = vises.filter((f) => !/^(autres?|divers|other|others|miscellaneous)(\s|$)/i.test(String(f.chemin[f.chemin.length - 1]).normalize("NFD").replace(/[̀-ͯ]/g, "")));
  ok(`${pf} : ${vises.length} fourre-tout sur ${FEUILLES.length} feuilles, aucun intrus`, intrus.length === 0, intrus.map((f) => f.chemin.join(" > ")).join(" | "));
  if (pf === "leboncoin") {
    ok("leboncoin : « Divers > Autres » en fait partie", vises.some((f) => f.chemin.join(" > ") === "Divers > Autres"), "absent");
    ok("leboncoin : les 77 autres feuilles restent des rayons", FEUILLES.length - vises.length === 77, `${FEUILLES.length - vises.length}`);
  }
}

console.log("4. Qui est re-cherché à la relance (rayonFourreToutARevoir)");
// Le VRAI module (le client Supabase qu'il importe se charge sans réseau).
const { rayonFourreToutARevoir: aRevoir } = await import(src("utils/rayonFourreToutRelance.js"));
ok("pichet (defaut, Divers > Autres) → re-cherché", aRevoir("leboncoin", { lbcCategoryPath: ["Divers", "Autres"], categorie_source: "defaut" }) === true);
ok("descente de l'arbre (ia_descente_arbre) → re-cherché", aRevoir("leboncoin", { lbcCategoryPath: ["Divers", "Autres"], categorie_source: "ia_descente_arbre" }) === true);
ok("choisi par la personne → part tel quel", aRevoir("leboncoin", { lbcCategoryPath: ["Divers", "Autres"], categorie_source: "choix_humain" }) === false);
ok("vrai rayon → rien à revoir", aRevoir("leboncoin", { lbcCategoryPath: ["Maison & Jardin", "Arts de la table"], categorie_source: "defaut" }) === false);
ok("eBay n'est pas concerné par la relance", aRevoir("ebay", { ebayCategoryPath: ["Maison", "Autres"] }) === false);

console.log(ko ? `\n${ko} KO` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
