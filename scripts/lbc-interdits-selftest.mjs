// Autotest — Leboncoin interdit cosmétique, médicament, parapharmacie (05/11, point 6 — Dylan62) —
// `npm run selftest:lbc-interdits` (_shared/lbc-interdits.js ; app : lbcCategoryStatus ; serveur : get-pending-jobs).
// Cas : coffret beauté rangé par Vinted en « Soins du corps » (956), parti en « Maison & Jardin > Décoration ».
import fs from "node:fs";
import { CATEGORIES_INTERDITES_LBC, REGLE_LBC_URL, messageLbcInterdit, verdictLbcInterdit } from "../supabase/functions/_shared/lbc-interdits.js";
import { lbcCategoryStatus } from "../src/utils/lbcCategories.js";
import { getPlatformSupport } from "../src/utils/platformCompat.js";

let ko = 0, n = 0;
const ok = (c, nom, d = "") => { n++; if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

console.log("1. La règle, sur la catégorie Vinted (source certaine)");
const v = verdictLbcInterdit({ vinted_catalog_id: 956 });
ok(v?.motif === "cosmetique" && v.vinted_catalog_id === 956 && v.categorie[0] === "soins du corps", "le coffret de Compte-a6bbc6c3 (Soins du corps, 956) → interdit", JSON.stringify(v));
ok(verdictLbcInterdit({ vinted_catalog_id: "152" })?.motif === "cosmetique", "parfums (152, en texte) → interdit");
ok(verdictLbcInterdit({ vinted_catalog_id: 1863 })?.categorie[0] === "coffrets de soins", "Hommes > Soins > Coffrets (1863) → interdit");
for (const id of [1906, 1903, 958, 962, 950, 967, 2055, 1826, 1827, 971]) ok(verdictLbcInterdit({ vinted_catalog_id: id }) === null, `accessoire de beauté ${id} → jamais interdit (trousse, brosse, rasoir, appareil)`);
ok(verdictLbcInterdit({ vinted_catalog_id: 153 }) === null, "« Autres cosmétiques et accessoires » (153) → la règle du titre tranche, pas celle-ci");
ok(verdictLbcInterdit(null) === null && verdictLbcInterdit({}) === null && verdictLbcInterdit({ vinted_catalog_id: "abc" }) === null, "catégorie absente ou illisible → rien (doute = la règle du titre)");
ok(verdictLbcInterdit({ vinted_catalog_id: 1907 }) === null, "un manteau (1907) → rien");

console.log("\n2. La table suit le catalogue Vinted (docs/vinted-catalog-tree.json)");
const arbre = JSON.parse(lire("docs/vinted-catalog-tree.json"));
const index = new Map();
const marcher = (nd, parents) => { index.set(nd.id, { nd, parents }); for (const c of nd.c ?? []) marcher(c, [...parents, nd.id]); };
arbre.forEach((nd) => marcher(nd, []));
const ACCESSOIRES = new Set([1906, 2055]);
for (const id of Object.keys(CATEGORIES_INTERDITES_LBC).map(Number)) {
  const e = index.get(id);
  ok(e && !(e.nd.c ?? []).length && (e.parents.includes(146) || e.parents.includes(139)), `${id} (${e?.nd.t}) : feuille de Femmes > Beauté ou Hommes > Soins`);
}
for (const racine of [146, 139]) {
  for (const f of index.get(racine).nd.c ?? []) {
    if (ACCESSOIRES.has(f.id) || f.id === 153) continue;
    ok(Object.prototype.hasOwnProperty.call(CATEGORIES_INTERDITES_LBC, f.id), `${f.id} « ${f.t} » : feuille consommable couverte`);
  }
}

console.log("\n3. L'app : la case Leboncoin grisée, avec la raison");
ok(lbcCategoryStatus("🏠", { titre: "Coffret beauté Rituals", type: "Maison", vinted_catalog_id: 956 }) === "prohibited", "coffret à l'icône Maison (🏠), catégorie Vinted Soins du corps → prohibited (plus jamais « Décoration »)");
ok(lbcCategoryStatus("🏠", { titre: "Vase", type: "Maison", vinted_catalog_id: null }) !== "prohibited", "un vase sans catégorie Vinted → comme avant");
ok(lbcCategoryStatus("🏠") === lbcCategoryStatus("🏠", null), "sans article → comportement d'avant à l'identique");
const sup = getPlatformSupport("🏠", { titre: "Coffret beauté Rituals", type: "Maison", vinted_catalog_id: 956 });
ok(sup.leboncoin === "prohibited" && sup.vinted !== "prohibited", "getPlatformSupport : Leboncoin seul est grisé", JSON.stringify(sup));
const trad = lire("src/i18n/translations.js");
ok(/platformProhibited:"\{platform\} interdit la vente de cosmétiques/.test(trad), "le motif écrit sous la case dit la règle (platformProhibited)");

console.log("\n4. Le message et la source");
ok(/cosmétiques, médicaments et produits de parapharmacie \(règle de Leboncoin\) : cet article \(soins du corps\)/.test(messageLbcInterdit(v, "fr")), "message FR : la règle et la catégorie nommées", messageLbcInterdit(v, "fr"));
ok(/cosmetics, medicines or pharmacy products/.test(messageLbcInterdit(v, "en")), "message EN");
ok(REGLE_LBC_URL === "https://assistance.leboncoin.info/hc/fr/articles/360000030540", "la page d'aide de Leboncoin citée");

console.log("\n5. Le filet de get-pending-jobs (dépôts déjà en file, anciennes apps)");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const i = gpj.indexOf("let heldLbcInterdit = 0;");
const bloc = i > 0 ? gpj.slice(i, gpj.indexOf("ON N'ÉCRIT JAMAIS SUR LA BOUTIQUE D'UN AUTRE", i)) : "";
ok(/from "\.\.\/_shared\/lbc-interdits\.js"/.test(gpj), "même fichier de règles que l'app");
ok(/j\.platform === "leboncoin" && \(j\.action === "publish" \|\| j\.action === "republish"\)/.test(bloc), "dépôts Leboncoin seulement (publication, republication)");
ok(/select\("id, vinted_catalog_id"\)/.test(bloc), "lit la catégorie Vinted de la fiche, rien d'autre (jamais le titre, jamais l'IA)");
ok(/republicationIntacte\s*\?[\s\S]*status: "cancelled"[\s\S]*Ton annonce Leboncoin est intacte[\s\S]*: [\s\S]*status: "needs_user"/.test(bloc), "republication pas engagée → close, annonce intacte ; publication → needs_user, rien envoyé");
ok(/\.eq\("status", "pending"\)/.test(bloc) && /catch \(_e\)/.test(bloc), "compare-and-set sur pending, best-effort");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — Leboncoin interdit`);
process.exit(ko ? 1 : 0);
