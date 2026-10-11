// Autotest : UNE REPUBLICATION LEBONCOIN NE RETIRE JAMAIS SANS SES REQUIS PROUVÉS
// (11/10/2026, voirememe — peluche Squishmallow, job 66bbae2b).
//
//     npm run selftest:republication-requis-avant-retrait
//
// L'annonce a été RETIRÉE à 12:03, puis la recréation a buté sur « Produit »
// (toy_type, Jeux & Jouets) que l'annonce d'origine ne portait pas : article
// hors ligne. Leboncoin avait déjà refusé ce champ sur ce rayon (catalogue,
// source server_400). Ce qu'il prouve, sans réseau :
//   1. le cas rejoué : à l'étape 'captured' (annonce encore en ligne), le
//      requis prouvé manquant RETIENT la republication — question « Produit »,
//      liste fermée de Leboncoin, message « TOUJOURS EN LIGNE » ;
//   2. rien d'inventé : une valeur reprise de l'annonce (lbcAspects) ou le
//      miroir lbcProduit suffit ; un requis 'dom' ne compte pas (Leboncoin
//      pré-remplit) ; l'étape 'deleted' ne bloque jamais ; autres plateformes
//      et autres actions : intactes ; trois tours de question au plus ;
//   3. le câblage dans get-pending-jobs : le filet ne vaut que pour un poste
//      SANS pré-vol de recréation (capacité prevol_recreation_v1), avant le
//      service, needs_user AVANT tout retrait, compteur dans la réponse.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const R = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/requis-recreation-lbc.js")).href);
let ko = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

// Le catalogue réel (platform_category_aspects, leboncoin, required) — extrait du 11/10.
const PRODUITS = ["Cuisines et dinettes", "Doudous et peluches", "Figurines", "Jeux de construction", "Autre"];
const catalogue = [
  { category_key: "Loisirs > Jeux & Jouets", field_key: "toy_type", field_label: "Produit", allowed_values: PRODUITS },
  { category_key: "Maison & Jardin > Bricolage", field_key: "diy_product", field_label: "Produit", allowed_values: ["Outillage"] },
  { category_key: "Maison & Jardin > Bricolage", field_key: "diy_type", field_label: "Type", allowed_values: [] },
];
const parCle = R.requisParCategorie(catalogue);
// La republication de voirememe, telle qu'elle était à 12:03 (captured).
const job = (pf = {}, extra = {}) => ({
  platform: "leboncoin", action: "republish",
  platform_fields: {
    republish_step: "captured", lbcCategoryPath: ["Loisirs", "Jeux & Jouets"],
    lbcAspects: { condition: "État neuf", games_and_toys_material: "Tissu, textile", estimated_parcel_weight: "De 500 g à 1 kg" },
    ...pf,
  },
  ...extra,
});

console.log("1. le cas voirememe rejoué (66bbae2b, 11/10 12:03)");
const d = R.requisManquantsAvantRetrait(job(), parCle);
ok(d && d.manquants.length === 1 && d.manquants[0].key === "toy_type" && d.categorie === "Loisirs > Jeux & Jouets",
  "« Produit » (toy_type) manque à l'étape 'captured' → la republication est RETENUE avant le retrait");
const q = R.questionAvantRetraitLbc(d.manquants, 0);
ok(q.redemande && q.champ.field_key === "toy_type" && q.champ.target.root === "lbcAspects" && q.champ.target.key === "toy_type"
  && q.champ.input_type === "dropdown" && q.champ.allowed_values.length === PRODUITS.length && q.champ.platform === "leboncoin",
  "la question : « Produit », liste fermée de Leboncoin, réponse écrite dans lbcAspects.toy_type");
ok(/AVANT tout retrait/.test(q.message) && /TOUJOURS EN LIGNE/.test(q.message) && /rien n'est touché/.test(q.message), "le message dit : annonce toujours en ligne, rien n'est touché");
ok(!R.requisManquantsAvantRetrait(job({ lbcAspects: { toy_type: "Doudous et peluches" } }), parCle), "réponse donnée (lbcAspects.toy_type) : la republication repart");

console.log("2. rien d'inventé, rien de retenu à tort");
ok(!R.requisManquantsAvantRetrait(job({ lbcProduit: "Doudous et peluches" }), parCle), "le miroir lbcProduit vaut « Produit »");
ok(!R.requisManquantsAvantRetrait(job({ republish_step: "deleted" }), parCle), "étape 'deleted' : JAMAIS bloquée (l'annonce n'existe déjà plus)");
ok(!R.requisManquantsAvantRetrait(job({ republish_step: "a_capturer" }), parCle), "étape 'a_capturer' : rien à juger encore");
ok(!R.requisManquantsAvantRetrait(job({ deleted_at: "2026-10-11T10:03:36Z" }), parCle), "déjà retirée : jamais retenue");
ok(!R.requisManquantsAvantRetrait(job({ lbcCategoryPath: ["Loisirs", "Livres"] }), parCle), "un rayon sans requis prouvé : servie");
ok(!R.requisManquantsAvantRetrait(job({}, { action: "publish" }), parCle), "une publication : non concernée");
ok(!R.requisManquantsAvantRetrait({ ...job(), platform: "vinted" }, parCle), "une autre plateforme : non concernée");
const brico = R.requisManquantsAvantRetrait(job({ lbcCategoryPath: ["Maison & Jardin", "Bricolage"], lbcAspects: { diy_product: "Outillage" } }), parCle);
ok(brico && brico.manquants.map((m) => m.key).join() === "diy_type", "plusieurs requis : seul celui qui manque est demandé");
ok(R.requisParCategorie([...catalogue, catalogue[0]]).get("Loisirs > Jeux & Jouets").length === 1, "un champ déclaré deux fois : une seule question");
const q4 = R.questionAvantRetraitLbc(d.manquants, 3);
ok(!q4.redemande && q4.champ === null && /on ne te le redemande plus/.test(q4.message) && /TOUJOURS EN LIGNE/.test(q4.message),
  "au 4ᵉ tour : plus de question, l'annonce reste en ligne (jamais une boucle)");

console.log("3. câblage get-pending-jobs");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const i = gpj.indexOf("let heldRequisLbc = 0;");
const bloc = gpj.slice(i, gpj.indexOf("UNE PLATEFORME QUI FIGE NE CONFISQUE PLUS LE POSTE", i));
ok(i > 0 && /!capacites\.includes\("prevol_recreation_v1"\)/.test(bloc), "le filet ne vaut que pour un poste SANS pré-vol de recréation");
ok(/\.eq\("platform", "leboncoin"\)\.eq\("required", true\)\.eq\("source", "server_400"\)/.test(bloc), "seuls les requis PROUVÉS par Leboncoin (server_400), jamais 'dom'");
ok(/requisManquantsAvantRetrait\(j as never, parCle\)/.test(bloc) && /status: "needs_user"/.test(bloc) && /\.eq\("status", "pending"\)/.test(bloc),
  "needs_user AVANT le service (compare-and-swap sur pending)");
ok(/out = out\.filter\(\(j\) => !aRetenirL\.has\(String\(j\.id\)\)\)/.test(bloc), "la republication retenue n'est pas servie (aucun retrait)");
ok(/jobs_retenus_prevol_leboncoin: heldRequisLbc/.test(gpj), "le compteur part dans la réponse");
ok(gpj.indexOf("let heldRequisLbc = 0;") > gpj.indexOf("Geste 2 : le pré-vol des requis de la catégorie de DESTINATION"),
  "après la reprise des critères de l'annonce (lbcAspects complétés d'abord)");
ok(gpj.indexOf("const bruts = Array.isArray(cap[\"attributs_bruts\"])") < i, "la reprise des attributs de l'annonce précède le filet");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
