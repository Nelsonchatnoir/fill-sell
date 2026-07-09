// Vérifie la couverture de public.ebay_item_aspects par rapport aux
// categoryId de notre mapping (src/utils/ebayCategories.js).
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/ebay-aspects-verify.mjs
//   ... --strict     # exit 1 s'il manque une catégorie ou s'il reste des erreurs
//
// Rapporte, sans rien deviner :
//   - manquantes  : dans le mapping, ABSENTES de la table (fetch jamais passé)
//   - not_found   : présentes en table mais absentes du dump eBay
//   - error       : appel en échec
//   - empty       : catégorie sans aucun aspect (fait, pas une anomalie)
//   - orphelines  : en table mais plus dans le mapping (mapping rétréci)
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans l'environnement.");
  process.exit(2);
}

const src = readFileSync(join(ROOT, "src/utils/ebayCategories.js"), "utf8");
const mappingIds = [...new Set([...src.matchAll(/\bid:\s*(\d+)/g)].map((m) => m[1]))];

// PostgREST : pagination explicite, la table peut dépasser la limite par défaut.
async function fetchAll() {
  const rows = [];
  const PAGE = 500;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(
      `${url}/rest/v1/ebay_item_aspects?select=category_id,status,aspect_count,required_count,ebay_env,fetched_at`,
      { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + PAGE - 1}` } },
    );
    if (!res.ok) {
      console.error(`Lecture ebay_item_aspects → HTTP ${res.status} : ${await res.text()}`);
      process.exit(2);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

const rows = await fetchAll();
const byId = new Map(rows.map((r) => [r.category_id, r]));

const missing = mappingIds.filter((id) => !byId.has(id));
const notFound = rows.filter((r) => r.status === "not_found").map((r) => r.category_id);
const errored = rows.filter((r) => r.status === "error").map((r) => r.category_id);
const empty = rows.filter((r) => r.status === "empty").map((r) => r.category_id);
const orphans = rows.filter((r) => !mappingIds.includes(r.category_id)).map((r) => r.category_id);
const ok = rows.filter((r) => r.status === "ok");

const envs = [...new Set(rows.map((r) => r.ebay_env))];
const list = (a) => (a.length ? a.join(", ") : "(aucune)");

console.log("=== COUVERTURE ebay_item_aspects ===\n");
console.log(`Mapping (ebayCategories.js) : ${mappingIds.length} categoryId`);
console.log(`En base                     : ${rows.length} ligne(s)  env=${list(envs)}`);
console.log(`  ok        : ${ok.length}  (${ok.reduce((n, r) => n + r.required_count, 0)} aspects obligatoires au total)`);
console.log(`  empty     : ${empty.length}  — catégorie sans aucun aspect (fait constaté)`);
console.log(`  not_found : ${notFound.length}  — absente du dump eBay`);
console.log(`  error     : ${errored.length}  — appel en échec`);
console.log(`\nMANQUANTES (jamais fetchées) : ${missing.length}\n  ${list(missing)}`);
if (notFound.length) console.log(`\nNOT_FOUND :\n  ${list(notFound)}`);
if (errored.length) console.log(`\nERROR :\n  ${list(errored)}`);
if (empty.length) console.log(`\nEMPTY (aucun aspect retourné) :\n  ${list(empty)}`);
if (orphans.length) console.log(`\nORPHELINES (en base, hors mapping) :\n  ${list(orphans)}`);

if (envs.includes("sandbox")) {
  console.log(
    "\n⚠️  Des lignes viennent du SANDBOX eBay : ses aspects ne reflètent pas la production. " +
      "Re-lancer le fetch en EBAY_ENV=production avant toute exploitation produit.",
  );
}

if (STRICT && (missing.length || errored.length)) {
  console.error(`\n--strict : ÉCHEC (${missing.length} manquante(s), ${errored.length} en erreur)`);
  process.exit(1);
}
console.log("\nVérification terminée" + (STRICT ? " — strict OK ✅" : "."));
