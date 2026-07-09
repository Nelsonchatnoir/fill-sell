// Auto-test du client Taxonomy SANS clés eBay : vérifie le décodage gzip, la
// normalisation des aspects, le filtrage par categoryId et le cache du token
// OAuth, contre un `fetch` simulé et un dump gzippé fabriqué au format exact
// documenté par eBay (categoryAspects[].category.categoryId + aspects[]).
//
//   node scripts/ebay-taxonomy-selftest.mjs
//
// ⚠️ Ce test valide NOTRE code de parsing, pas les données eBay. Il ne dit
// rien des aspects réels d'une catégorie : seul un fetch avec de vraies clés
// le fera.
import { gzipSync } from "zlib";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MOD = join(ROOT, "supabase/functions/fetch-ebay-aspects/ebay-taxonomy.ts");

// Le module cible est en TypeScript (il tourne sous Deno). Node ≥ 22 dépouille
// les annotations de type nativement : on l'importe tel quel, sans build.
const mod = await import(pathToFileURL(MOD).href);

let failures = 0;
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name} ${extra}`); }
};

// ── Dump d'exemple, au format documenté ────────────────────────────────────
const dump = {
  categoryTreeId: "71",
  categoryTreeVersion: "132",
  categoryAspects: [
    {
      category: { categoryId: "31387", categoryName: "Montres classiques" },
      aspects: [
        {
          localizedAspectName: "Marque",
          aspectConstraint: {
            aspectDataType: "STRING",
            aspectRequired: true,
            aspectMode: "SELECTION_ONLY",
            itemToAspectCardinality: "SINGLE",
          },
          aspectValues: [{ localizedValue: "Casio" }, { localizedValue: "Seiko" }],
        },
        {
          localizedAspectName: "Année",
          // aspectRequired ABSENT : eBay omet le champ quand il vaut false.
          aspectConstraint: { aspectDataType: "DATE", aspectFormat: "YYYY", aspectMode: "FREE_TEXT" },
        },
      ],
    },
    { category: { categoryId: "617", categoryName: "DVD, Blu-ray" }, aspects: [] },
    { category: { categoryId: "999999", categoryName: "Hors mapping" }, aspects: [{ localizedAspectName: "X" }] },
  ],
};

console.log("gunzipJson + indexDumpByCategory");
const gz = gzipSync(Buffer.from(JSON.stringify(dump)));
const parsed = await mod.gunzipJson(new Response(gz));
check("dézippe et parse le dump", parsed.categoryAspects?.length === 3);
check("categoryTreeId préservé", parsed.categoryTreeId === "71");

// Flux NON gzippé (proxy qui décompresse) : doit passer aussi.
const parsedPlain = await mod.gunzipJson(new Response(JSON.stringify(dump)));
check("accepte un flux déjà décompressé", parsedPlain.categoryAspects?.length === 3);

const wanted = new Set(["31387", "617", "42424"]); // 42424 = absent du dump
const idx = mod.indexDumpByCategory(parsed, wanted);
check("ne garde que les catégories demandées", idx.size === 2 && !idx.has("999999"));
check("catégorie absente du dump non inventée", !idx.has("42424"));
check("catégorie sans aspect → tableau vide (≠ absente)", idx.get("617")?.length === 0);

console.log("\nnormalizeAspect");
const [marque, annee] = idx.get("31387");
check("nom d'aspect lu depuis localizedAspectName", marque.name === "Marque");
check("required=true remonté", marque.required === true);
check("allowedValues extraites", JSON.stringify(marque.allowedValues) === '["Casio","Seiko"]');
check("cardinality/mode/dataType lus", marque.dataType === "STRING" && marque.mode === "SELECTION_ONLY" && marque.cardinality === "SINGLE");
check("aspectRequired absent ⇒ required=false", annee.required === false);
check("format lu", annee.format === "YYYY");
check("aspectValues absent ⇒ allowedValues=[]", Array.isArray(annee.allowedValues) && annee.allowedValues.length === 0);

console.log("\ngetAppToken (fetch simulé)");
mod._resetTokenCache();
let tokenCalls = 0;
let clock = 1_000_000;
const fakeFetch = async (url, init) => {
  tokenCalls++;
  const auth = init.headers.Authorization ?? "";
  const body = String(init.body);
  if (!url.endsWith("/identity/v1/oauth2/token")) throw new Error("mauvaise URL : " + url);
  if (!auth.startsWith("Basic ")) throw new Error("Basic auth manquante");
  if (!body.includes("grant_type=client_credentials")) throw new Error("grant_type manquant");
  if (!body.includes(encodeURIComponent(mod.OAUTH_SCOPE))) throw new Error("scope manquant");
  return new Response(JSON.stringify({ access_token: `tok${tokenCalls}`, expires_in: 7200 }), { status: 200 });
};
const opts = { env: "sandbox", clientId: "cid", clientSecret: "sec", fetchImpl: fakeFetch, now: () => clock };
const t1 = await mod.getAppToken(opts);
const t2 = await mod.getAppToken(opts);
check("token obtenu", t1 === "tok1");
check("2e appel servi par le cache (1 seule requête)", t2 === "tok1" && tokenCalls === 1);
clock += 7200_000; // au-delà de l'expiration (ttl - marge 60 s)
const t3 = await mod.getAppToken(opts);
check("token renouvelé après expiration", t3 === "tok2" && tokenCalls === 2);
check("hôte sandbox distinct de la prod", mod.EBAY_HOSTS.sandbox === "https://api.sandbox.ebay.com" && mod.EBAY_HOSTS.production === "https://api.ebay.com");

console.log("\nOAuth : erreur HTTP");
mod._resetTokenCache();
const failFetch = async () => new Response("invalid_client", { status: 401 });
let threw = false;
try { await mod.getAppToken({ ...opts, fetchImpl: failFetch }); } catch (e) { threw = /HTTP 401/.test(e.message); }
check("HTTP non-200 → exception explicite", threw);

console.log(failures ? `\n${failures} échec(s)` : "\nTous les tests passent ✅");
process.exit(failures ? 1 : 0);
