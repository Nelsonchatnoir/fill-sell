// Extrait les categoryId de src/utils/ebayCategories.js et les écrit dans
// supabase/functions/fetch-ebay-aspects/category-ids.json.
//
// Pourquoi un fichier généré : l'edge function tourne sous Deno et ne peut pas
// importer le module ESM de l'app (qui vit dans le bundle Vite). La liste est
// DÉRIVÉE du mapping — jamais saisie à la main — et régénérée à chaque fois
// qu'on ajoute une catégorie eBay.
//
//   node scripts/gen-ebay-category-ids.mjs           # écrit le fichier
//   node scripts/gen-ebay-category-ids.mjs --check   # exit 1 si périmé (CI)
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src/utils/ebayCategories.js");
const OUT = join(ROOT, "supabase/functions/fetch-ebay-aspects/category-ids.json");
const CHECK = process.argv.includes("--check");

// Les ids sont écrits `id: 12345` dans les entrées MODE (par genre) et
// HORS_MODE. Un `null` explicite n'a pas d'id : il n'apparaît donc pas ici,
// ce qui est voulu (rien à demander à eBay pour une catégorie non vendable).
const src = readFileSync(SRC, "utf8");
const ids = [...new Set([...src.matchAll(/\bid:\s*(\d+)/g)].map((m) => m[1]))].sort(
  (a, b) => Number(a) - Number(b)
);

if (!ids.length) {
  console.error("Aucun categoryId trouvé dans ebayCategories.js — extraction cassée ?");
  process.exit(1);
}

const payload = {
  _comment:
    "GÉNÉRÉ par scripts/gen-ebay-category-ids.mjs depuis src/utils/ebayCategories.js. Ne pas éditer à la main.",
  generatedFrom: "src/utils/ebayCategories.js",
  count: ids.length,
  categoryIds: ids,
};
const json = JSON.stringify(payload, null, 2) + "\n";

if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== json) {
    console.error(
      `category-ids.json est périmé (${ids.length} ids attendus). Lancer : node scripts/gen-ebay-category-ids.mjs`
    );
    process.exit(1);
  }
  console.log(`category-ids.json à jour (${ids.length} ids).`);
} else {
  writeFileSync(OUT, json);
  console.log(`${ids.length} categoryId écrits dans ${OUT}`);
}
