// ═══════════════════════════════════════════════════════════════════════════
// LE PRÉ-REMPLI LEBONCOIN CONTRE NOTRE VALEUR DE L'IA (26/10, étape 4) — `npm run selftest:lbc-prerempli-ia`
// ═══════════════════════════════════════════════════════════════════════════
// Règle de Nico : « la valeur qui colle à l'article gagne ; jamais une valeur qui mène à un blocage quand l'autre aurait
// passé ». Exécute le bloc LIVRÉ ⟦prerempli-ia⟧ de chrome-extension/content-scripts/leboncoin.js (extrait, vm) sur les
// cas réels relevés depuis le 25/10 (cross_post_jobs.platform_fields.warnings « CONSERVÉ — … venait de l'IA »), puis
// vérifie son branchement dans fillCriterionSafe (canal générique et Produit dédié).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const bloc = (txt, debut, fin) => { const d = txt.indexOf(debut), f = txt.indexOf(fin); if (d < 0 || f < 0) throw new Error(`bloc introuvable : ${debut}`); return txt.slice(d, f + fin.length); };
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };

const LBC = lire("chrome-extension/content-scripts/leboncoin.js");
const texteComparable = bloc(LBC, "// ⟦texte-comparable:début⟧", "// ⟦texte-comparable:fin⟧");
const regle = bloc(LBC, "// ⟦prerempli-ia:début⟧", "// ⟦prerempli-ia:fin⟧");
const i = LBC.indexOf("\nfunction containsAsWords(");
const containsAsWords = LBC.slice(i + 1, LBC.indexOf("\n}\n", i) + 2);
const ctx = vm.createContext({ console, String, Array, RegExp, Object, Map, Set, Number, Boolean });
vm.runInContext(`${texteComparable}\nconst normalizeFuzzy = (s) => texteComparable(s);\n${containsAsWords}\n${regle}\n;globalThis.__t = { departagerPreRempliIa, LBC_PAIRES_TYPE_PRODUIT, normalizeFuzzy };`, ctx);
const { departagerPreRempliIa: D, LBC_PAIRES_TYPE_PRODUIT: PAIRES, normalizeFuzzy: N } = ctx.__t;
const texte = (titre, desc = "") => N(`${titre} ${desc}`);
// La liste Produit de « Vaisselle de table » (relevée 33 fois, lbc_grilles_relevees) : ni sucrier ni « Autre ».
const VAISSELLE = ["Assiette", "Bol", "Carafe et pichet", "Coquetier", "Coupe et coupelle", "Couvert", "Flûte", "Mazagran", "Plat apéritif", "Plat de service", "Ramequin", "Saladier", "Saucière", "Service à café ou à thé", "Service de vaisselle", "Soucoupe", "Soupière", "Tasse et mug", "Théière, tisanière", "Verre", "Verrine"];

console.log("1. Jamais un blocage");
{
  const pot = D({ prefilled: "Vaisselle de table", notre: "Accessoire de table", texte: texte("Pot à sucre Sarreguemines bleu marine à pois blancs", "Pot à sucre ancien en faïence de Sarreguemines."), optionsProduit: VAISSELLE, produitNotre: "Salière, poivrière et sucrier" });
  ok(pot.garder === false && /blocage/.test(pot.motif), "Jocabroc, pot à sucre : « Vaisselle de table » n'a ni sucrier ni « Autre » → NOTRE paire (Accessoire de table › Salière, poivrière et sucrier)", JSON.stringify(pot));
  const avecAutre = D({ prefilled: "Vaisselle de table", notre: "Accessoire de table", texte: texte("Pot à sucre"), optionsProduit: [...VAISSELLE, "Autre"], produitNotre: "Salière, poivrière et sucrier" });
  ok(avecAutre.garder === true, "la même liste AVEC « Autre » : rien ne bloque, le pré-rempli reste (aucun des deux nommé)");
  const dedans = D({ prefilled: "Vaisselle de table", notre: "Accessoire de table", texte: texte("Grand plat"), optionsProduit: VAISSELLE, produitNotre: "Plat de service" });
  ok(dedans.garder === true, "notre Produit existe aussi sous le Type pré-rempli : pas de blocage, pré-rempli gardé");
  const prodPre = D({ prefilled: "Vaisselle de table", notre: "Accessoire de table", texte: texte("Pot à sucre"), optionsProduit: VAISSELLE, produitNotre: "Salière, poivrière et sucrier", produitPreRempli: "Bol" });
  ok(prodPre.garder === true, "Leboncoin a pré-rempli Type ET Produit : sa paire est cohérente, elle reste");
  ok(D({ prefilled: "Vaisselle de table", notre: "Accessoire de table", texte: texte("Pot à sucre"), optionsProduit: null, produitNotre: "Salière, poivrière et sucrier" }).garder === true, "liste Produit illisible : on ne conclut rien (le pré-rempli reste, comme avant)");
}

console.log("2. La valeur que l'article nomme gagne");
{
  const sandra = D({ prefilled: "Ensembles & Combinaisons", notre: "Robes & Jupes", texte: texte("Combinaison pilote bébé Absorba", "ensemble complet") });
  ok(sandra.garder === true, "Sandra (54da4bab) : « Combinaison » est dans le titre → Leboncoin gardé", JSON.stringify(sandra));
  const lot = D({ prefilled: "Ensembles & Combinaisons", notre: "T-shirt & brassières", texte: texte("Lot tenue fille 3 ans", "un ensemble complet") });
  ok(lot.garder === true, "Sandra (a1e43f7b) : « ensemble » dans le texte → Leboncoin gardé");
  const tableau = D({ prefilled: "Sculpture et statue", notre: "Tableau et toile", texte: texte("Aquarelle Bois pittoresque encadrée", "Tableau aquarelle signé, sous verre") });
  ok(tableau.garder === false, "un tableau que le texte appelle « tableau » : notre « Tableau et toile » gagne", JSON.stringify(tableau));
  const huitres = D({ prefilled: "Plat de service", notre: "Plat apéritif", texte: texte("Grand plat à huîtres Longwy France vert d'eau", "Céramique ancienne") });
  ok(huitres.garder === true, "Jocabroc, plat à huîtres : le texte ne nomme ni « service » ni « apéritif » → la valeur précise de Leboncoin reste (règle du 24/10)", JSON.stringify(huitres));
  const zombi = D({ prefilled: "Jeux de société", notre: "Loisirs créatifs", texte: texte("Insert Rangement Zombicide", "rangement pour boîte de jeu") });
  ok(zombi.garder === true, "Zombicide (louis, origine de la règle) : rien de nommé → « Jeux de société » reste");
  ok(D({ prefilled: "Jeux de société", notre: "Loisirs créatifs", texte: texte("Jeux de société Zombicide", "loisirs créatifs") }).garder === true, "les deux nommés : la valeur précise de Leboncoin reste");
  ok(D({ prefilled: "Objet décoratif", notre: "Décoration murale", texte: texte("Miroir mural doré") }).garder === false, "« murale » ↔ « mural » : le mot propre se reconnaît au singulier");
}

console.log("3. Les paires Type → Produit et le branchement");
{
  ok(PAIRES.table_art_type === "table_art_product" && PAIRES.house_and_garden_type === "decoration_type" && PAIRES.furniture_category === "furniture_type" && Object.keys(PAIRES).length === 7,
    "les 7 paires Type → Produit de Maison & Jardin (src/utils/lbcMaisonJardin.js)");
  const app = lire("src/utils/lbcMaisonJardin.js");
  for (const [t, p] of Object.entries(PAIRES)) ok(new RegExp(`typeKey: "${t}",\\s*produitKey: "${p}"`).test(app), `même paire que l'app : ${t} → ${p}`);
  ok(LBC.includes("const verdict = departagerPreRempliIa({ prefilled, notre: rawValue, texte: TEXTE_ARTICLE_LBC, optionsProduit,"), "fillCriterionSafe départage avec le texte de l'article et la liste Produit dépendante");
  ok(/if \(!produitPreRempli\) optionsProduit = await releverOptionsCritere\(produitDependant\.labelSelector\);/.test(LBC), "la liste Produit est relue sans rien poser (menu ouvert puis refermé)");
  ok(/REMPLACÉ par notre valeur/.test(LBC) && /CONSERVÉ — notre valeur "\$\{rawValue\}" venait de l'IA \(\$\{verdict\.motif\}\)/.test(LBC), "les deux issues laissent un avertissement qui dit pourquoi");
  ok(/const cleProduitDep = LBC_PAIRES_TYPE_PRODUIT\[forKey\] \?\? null;/.test(LBC) && /const cleProduitDep = LBC_PAIRES_TYPE_PRODUIT\[clePremierType\] \?\? null;/.test(LBC), "canal générique ET Produit dédié passent le Produit dépendant");
  ok(LBC.includes('fieldName !== "marque") {') && LBC.includes("!REJOUE_ANNONCE_D_ORIGINE"), "marque et republication à l'identique : règles inchangées");
}

console.log(`\n${rouges === 0 ? "✓" : "✗"} lbc-prerempli-ia : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges === 0 ? 0 : 1);
