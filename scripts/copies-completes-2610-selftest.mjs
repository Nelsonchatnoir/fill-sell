// ═══════════════════════════════════════════════════════════════════════════
// LA COPIE D'UNE REPUBLICATION GARDE CE QUE L'ANNONCE PORTE (26/10 nuit) — `npm run selftest:copies-completes-2610`
// ═══════════════════════════════════════════════════════════════════════════
// Point 3 (boncoin59300) : une annonce Beebs rattachée par le relevé n'avait aucun chemin capturé, la copie partait
// sans rayon ; l'index public le disait (categorie_id) → table des paires observées, univoques, feuilles de l'arbre.
// Point 12 (chaouidz) : une correction TRACÉE de la copie passe devant la valeur que l'annonce affiche encore.
// Point 10 (Thibault, Depop) : voir copie-republication-depop (cas 6 bis) — ici, le branchement seulement.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const imp = (p) => import(pathToFileURL(join(RACINE, p)).href);
const IX = await imp("supabase/functions/_shared/beebs-rayon-de-l-index.js");
const CT = await imp("supabase/functions/_shared/correction-tracee.js");
const { FEUILLES } = await imp("src/utils/arbres/beebsFeuilles.js");
let verts = 0, rouges = 0;
const ok = (c, msg, d = "") => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}${d ? `  ← ${d}` : ""}`); } };

console.log("Point 3 — le rayon Beebs que l'index public dit de l'annonce");
ok(IX.rayonBeebsDeLIndex("5f73MnZ3kyhs0kWunLMcYd") === "Mode > Homme > Vêtements (homme) > Manteaux et vestes (homme) > Manteaux (homme)", "boncoin59300, annonce 12003122 : « Manteaux (homme) »");
ok(IX.rayonBeebsDeLIndex("6RW2B9Q4bZczOUK36mmmT8") === null, "l'identifiant AMBIGU (deux chemins observés) ne donne rien");
ok(IX.rayonBeebsDeLIndex("inconnu") === null && IX.rayonBeebsDeLIndex(null) === null && IX.rayonBeebsDeLIndex("") === null, "inconnu, nul, vide → rien");
const feuilles = new Set(FEUILLES.map((f) => f.chemin.join(" > ")));
const tous = Object.values(IX.BEEBS_RAYON_PAR_ID_INDEX);
ok(tous.length >= 200 && tous.every((c) => feuilles.has(c)), `les ${tous.length} chemins de la table sont tous des feuilles de l'arbre Beebs`);
ok(Object.isFrozen(IX.BEEBS_RAYON_PAR_ID_INDEX), "table figée");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/\.select\("inventaire_id, listing_id, capture, vu_le, donnees_index"\)/.test(gpj), "get-pending-jobs lit donnees_index avec la capture");
ok(/const capture = String\(\(cap as \{ categorie\?: unknown \} \| null \?\? \{\}\)\?\.categorie \?\? ""\)\.trim\(\);\s*const brut = capture \|\| String\(rayonBeebsDeLIndex\(/.test(gpj), "le chemin capturé d'abord, l'index seulement s'il manque");
ok(/\(numeroR && cheminParAnnonce\.get\(numeroR\)\) \|\| cheminDe\.get\(Number\(j\.inventaire_id\)\)/.test(gpj), "le rayon de SON annonce d'abord (deux annonces = deux exemplaires)");
ok(/repris\["beebsCategoryPath"\] = chemin\.join\(" > "\)\s*\+ \(cheminsDeLIndex\.has/.test(gpj), "la source « index public » est tracée");

console.log("\nPoint 12 — la correction tracée passe devant la valeur affichée, tant que l'annonce affiche l'ancienne");
const pf = { taille: "31", correction_tracee: { cle: "taille", avant: "16", apres: "31", source: "correction" } };
ok(CT.correctionTient(pf, "taille", "16") === true, "chaouidz : l'annonce affiche encore « 16 », la copie garde « 31 »");
ok(CT.correctionTient(pf, "taille", "32") === false, "la personne a changé la pointure sur Beebs depuis (« 32 ») : l'annonce l'emporte");
ok(CT.correctionTient({ ...pf, taille: "33" }, "taille", "16") === false, "la copie ne porte plus la valeur corrigée : rien ne tient");
ok(CT.correctionTient(pf, "age", "16") === false && CT.correctionTient({ taille: "31" }, "taille", "16") === false, "une autre clé, ou pas de trace : rien");
ok(/const correctionTientIci = correctionTient\(pf, "taille", tCap\);/.test(gpj) && /&& !correctionTientIci\) \{/.test(gpj), "branchée dans la reprise de la taille affichée (get-pending-jobs)");

console.log("\nPoint 10 — « Pour » d'un article enfant Depop : branché dans la copie complétée");
const dep = lire("supabase/functions/_shared/copie-republication-depop.js");
ok(/pf\.depopCategoryPath\[0\] === "kidswear" && !GENRES_DEPOP\.has/.test(dep) && /"depopGenre",\n\]\);/.test(dep), "le genre enfant manque compte, et le dépôt FillSell le donne (CLES_DU_DEPOT)");

console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
