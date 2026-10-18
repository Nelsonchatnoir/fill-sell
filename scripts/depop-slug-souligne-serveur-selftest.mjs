// Autotest : DEPOP — LE PSEUDO DU VENDEUR PEUT PORTER UN « _ » (18/10, retrait 81188384).
//
//     npm run selftest:depop-slug-souligne-serveur
//
// Retrait Depop 81188384 (compte a3002ab6) : « aucun identifiant d'annonce sur ce job », 16 essais,
// l'annonce en ligne alors que l'article est vendu sur Vinted. Le lien portait le slug
// (thard_733-jean-bonobo-taille-40-coupe-aceb), le dépôt 1661efb0 le numéro (depop_product_id
// 958393360) : c'est la lecture du slug qui refusait le « _ ». Ce qu'il prouve, sans réseau ni base :
//   A. toutes les lectures serveur du slug Depop lisent le lien réel, et seulement un slug ;
//   B. aucune lecture d'avant ne change (un slug sans « _ » est lu à l'identique) ;
//   C. le retrait retrouve son slug et son numéro (lien, puis dépôt prouvé, même annonce) —
//      jamais une autre annonce, jamais le titre ;
//   D. get-pending-jobs pose l'identifiant au service (compare-and-swap sur pending) ;
//   E. la migration 20261018180000 (fichier), son inverse, son essai et la réparation des 34 dépôts.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0;
const ok = (c, m, detail) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); } };

const LIEN = "https://www.depop.com/products/thard_733-jean-bonobo-taille-40-coupe-aceb/";
const SLUG = "thard_733-jean-bonobo-taille-40-coupe-aceb";
const SANS_SOULIGNE = "https://www.depop.com/products/nicofillsell-pull-laine-bleu-3f2a/";

// ── A. Les lectures serveur ─────────────────────────────────────────────────
console.log("A. Toutes les lectures serveur du slug Depop");
const ujs = lire("supabase/functions/update-job-status/index.ts");
const ligneUjs = ujs.match(/\n\s*depop: (\/\\\/products.*\/),\n\};/);
ok(!!ligneUjs, "update-job-status : LISTING_ID_PATTERNS.depop trouvé");
const reUjs = ligneUjs ? new Function(`return ${ligneUjs[1]};`)() : /$^/;
const L = await charger("supabase/functions/_shared/annonce-lien.ts");
const P = await charger("supabase/functions/_shared/annonce-partagee.js");
const R = await charger("supabase/functions/_shared/retrait-introuvable.js");
const D = await charger("supabase/functions/_shared/depop-identifiant-retrait.js");
const lecteurs = {
  "update-job-status (seule source de platform_listing_id)": (u) => u.match(reUjs)?.[1] ?? null,
  "annonce-lien.idDepuisLien": (u) => L.idDepuisLien("depop", u),
  "annonce-partagee.idDuLien": (u) => P.idDuLien("depop", u),
  "retrait-introuvable.numeroDepuisLien": (u) => R.numeroDepuisLien("depop", u),
  "depop-identifiant-retrait.slugDepop": (u) => D.slugDepop(u),
};
for (const [nom, f] of Object.entries(lecteurs)) {
  ok(f(LIEN) === SLUG, `${nom} : lit « thard_733-… »`, f(LIEN));
  ok(f("https://www.depop.com/fr/products/thard_733-jean-bonobo-taille-40-coupe-aceb/manage/") === SLUG, `${nom} : /fr/…/manage/ aussi`);
  ok(f("https://www.depop.com/products/create/") === null && f("https://www.depop.com/products/edit/") === null, `${nom} : /products/create/ et /edit/ ne sont pas des annonces`);
}
ok(L.lienDepuisId("depop", SLUG) === LIEN, "annonce-lien.lienDepuisId : le lien canonique se reconstruit depuis le slug à « _ »");
ok(L.lienDepuisId("depop", "958393360") === null, "annonce-lien.lienDepuisId : un numéro seul ne fabrique jamais un lien");
const ancien = /A-Za-z0-9\]\+-\[A-Za-z0-9-\]/;
const fichiers = ["supabase/functions/update-job-status/index.ts", "supabase/functions/get-pending-jobs/index.ts", "supabase/functions/handler-watch/index.ts",
  "supabase/functions/_shared/annonce-lien.ts", "supabase/functions/_shared/annonce-partagee.js", "supabase/functions/_shared/retrait-introuvable.js"];
for (const f of fichiers) ok(!ancien.test(lire(f).replace(/A-Za-z0-9_\]\+-/g, "")), `plus aucune lecture sans « _ » : ${f.split("/").slice(-2).join("/")}`);

// ── B. Aucune lecture d'avant ne change ─────────────────────────────────────
console.log("B. Un slug sans « _ » est lu à l'identique");
const ANCIEN_RE = /\/products\/([A-Za-z0-9]+-[A-Za-z0-9-]*[A-Za-z0-9])(?:[/?#]|$)/;
for (const u of [SANS_SOULIGNE, "https://www.depop.com/products/abc-1/", "https://www.depop.com/products/x9-sac-a-main-cuir-noir-77aa/?ref=x",
  "https://www.depop.com/fr/products/jeanne92-robe-ete-1b2c/manage/"]) {
  const avant = u.match(ANCIEN_RE)?.[1] ?? null;
  for (const [nom, f] of Object.entries(lecteurs)) ok(f(u) === avant, `${nom} : « ${u.split("/products/")[1]} » inchangé`);
}

// ── C. Le retrait retrouve son identifiant ──────────────────────────────────
console.log("C. Retrait 81188384 : slug du lien, numéro du dépôt prouvé — jamais une autre annonce");
const retrait = {
  id: "81188384-85a2-455e-a11a-99e3608419c8", platform: "depop", action: "delete", status: "pending", title: "Jean Bonobo taille 40",
  inventaire_id: 1792064440336001, platform_listing_id: null, listing_url: LIEN,
  platform_fields: { arme_par: { depot: "1661efb0-f893-4056-903e-f8a64e6bae78", chemin: "vente_article_serveur" } },
};
const depot = {
  id: "1661efb0-f893-4056-903e-f8a64e6bae78", platform: "depop", action: "publish", status: "published", title: "Jean Bonobo taille 40",
  inventaire_id: 1792064440336001, platform_listing_id: null, listing_url: LIEN, platform_fields: { depop_product_id: 958393360 },
};
const MAINTENANT = "2026-10-18T16:00:00.000Z";
ok(D.retraitDepopSansIdentifiant(retrait), "le retrait réel est reconnu « sans identifiant »");
const r = D.identifiantRetraitDepop(retrait, depot, MAINTENANT);
ok(r?.platform_listing_id === SLUG && r?.depop_product_id === 958393360, "slug du lien + numéro du dépôt (type d'origine gardé)", r);
ok(r?.trace?.source_slug === "lien_du_retrait" && r?.trace?.source_produit === "depot" && r?.trace?.depot === depot.id && r?.trace?.le === MAINTENANT, "trace identifiant_retrouve : sources, dépôt, heure");
ok(D.identifiantRetraitDepop({ ...retrait, platform_listing_id: SLUG, platform_fields: { ...retrait.platform_fields, depop_product_id: 958393360 } }, depot) === null, "rien ne change → rien n'est écrit");
ok(!D.retraitDepopSansIdentifiant({ ...retrait, platform_listing_id: SLUG }), "un slug posé suffit (l'extension relit le numéro par le slug) : une seule passe, plus de lecture du dépôt");
ok(D.identifiantRetraitDepop({ ...retrait, platform_fields: { ...retrait.platform_fields, depop_product_id: 1 } }, depot)?.depop_product_id == null, "un numéro déjà sur le retrait n'est jamais remplacé");
ok(D.identifiantRetraitDepop(retrait, null)?.platform_listing_id === SLUG && D.identifiantRetraitDepop(retrait, null)?.depop_product_id == null, "sans dépôt : le slug du lien seulement");
ok(D.identifiantRetraitDepop(retrait, { ...depot, inventaire_id: 999 })?.depop_product_id == null, "dépôt d'une AUTRE fiche : son numéro n'est jamais pris");
ok(D.identifiantRetraitDepop(retrait, { ...depot, listing_url: SANS_SOULIGNE })?.depop_product_id == null, "dépôt d'une AUTRE annonce (autre slug) : son numéro n'est jamais pris");
ok(D.identifiantRetraitDepop(retrait, { ...depot, platform: "vinted" })?.depop_product_id == null, "dépôt d'une autre plateforme : ignoré");
ok(D.identifiantRetraitDepop(retrait, { ...depot, action: "delete" })?.depop_product_id == null, "un retrait n'est jamais un dépôt");
const sansLien = { ...retrait, listing_url: null };
const rs = D.identifiantRetraitDepop(sansLien, depot);
ok(rs?.platform_listing_id === SLUG && rs?.trace?.source_slug === "depot" && rs?.depop_product_id === 958393360, "retrait sans lien : le slug et le numéro du dépôt prouvé");
ok(D.identifiantRetraitDepop({ ...sansLien, inventaire_id: null }, depot) === null, "retrait sans fiche : le dépôt ne prouve rien");
ok(D.identifiantRetraitDepop({ ...retrait, platform: "vinted" }, depot) === null && D.identifiantRetraitDepop({ ...retrait, action: "publish" }, depot) === null, "Depop, retraits seulement");
const rIll = D.identifiantRetraitDepop({ ...retrait, listing_url: "https://www.depop.com/fr/" }, { ...depot, title: "Un tout autre titre" });
ok(rIll?.platform_listing_id === SLUG && rIll?.trace?.source_slug === "depot", "lien illisible : seul le dépôt prouvé parle — son titre différent n'y change rien", rIll);
ok(D.identifiantRetraitDepop({ ...retrait, title: "x" }, { ...depot, title: "y" })?.depop_product_id === 958393360, "titres différents, même annonce : le numéro suit (le titre ne compte pas)");
const src = lire("supabase/functions/_shared/depop-identifiant-retrait.js");
ok(!/\.title\b/.test(src), "le titre n'est lu nulle part dans la règle");

// ── D. get-pending-jobs ─────────────────────────────────────────────────────
console.log("D. get-pending-jobs pose l'identifiant au service");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const iBloc = gpj.indexOf("DEPOP : UN RETRAIT RETROUVE SON IDENTIFIANT");
const iSansLien = gpj.indexOf("── RETRAIT BEEBS SANS LIEN = ATTENTE");
ok(iBloc > 0 && iSansLien > iBloc, "le bloc passe AVANT les retraits sans lien");
const bloc = gpj.slice(iBloc, iSansLien);
ok(/import \{ identifiantRetraitDepop, retraitDepopSansIdentifiant \} from "\.\.\/_shared\/depop-identifiant-retrait\.js";/.test(gpj), "import de la règle");
ok(/\.eq\("id", depotId\)\.eq\("user_id", user\.id\)\.eq\("platform", "depop"\)/.test(bloc), "le dépôt est lu sur le même compte, la même plateforme");
ok(/\.eq\("id", String\(d\.id\)\)\.eq\("status", "pending"\)\.select\("id"\)/.test(bloc), "écriture en compare-and-swap sur pending");
ok(/identifiant_retrouve: r\.trace/.test(bloc) && /if \(!r\) continue;/.test(bloc), "trace identifiant_retrouve ; rien d'écrit si rien ne change");
ok(/if \(!includeProcessing && !includeNeedsUser\)/.test(bloc), "poll d'exécution seulement");

// ── E. Migration, inverse, essai, réparation ────────────────────────────────
console.log("E. Migration 20261018180000 (fichier), inverse, essai, réparation");
const mig = lire("supabase/migrations/20261018180000_depop_slug_souligne.sql");
const inv = lire("supabase/rollbacks/20261018180000_depop_slug_souligne_INVERSE.sql");
const NEUF_SQL = "'/products/([A-Za-z0-9_]+-[A-Za-z0-9-]*[A-Za-z0-9])')";
const ANCIEN_SQL = "'/products/([A-Za-z0-9]+-[A-Za-z0-9-]*[A-Za-z0-9])')";
ok(mig.split(NEUF_SQL).length - 1 === 2 && !mig.includes(ANCIEN_SQL), "migration : les deux fonctions SQL lisent le « _ »");
ok(/CREATE OR REPLACE FUNCTION public\.annonce_id_depuis_url\(p_platform text, p_url text\)/.test(mig) && /CREATE OR REPLACE FUNCTION public\.identifiant_annonce_depuis_lien\(p_platform text, p_url text\)/.test(mig), "migration : annonce_id_depuis_url et identifiant_annonce_depuis_lien");
ok(/if j\.platform = 'depop' and coalesce\(j\.platform_fields ->> 'depop_product_id', ''\) ~ '\^\[0-9\]\+\$' then\n\s*v_pf := v_pf \|\| jsonb_build_object\('depop_product_id', j\.platform_fields -> 'depop_product_id'\);/.test(mig), "migration : armer_retrait_job_pour recopie depop_product_id du dépôt");
ok(/md5 avant/.test(mig) && /1672b24414ea625d5af1e843961acaa2/.test(mig) && /9eedc07f8bc2e4bea972d0b57d0c6cdc/.test(mig), "migration : réécrite depuis la prod (md5 cités)");
ok(!/db push|BEGIN;|COMMIT;/.test(mig.replace(/^--.*$/gm, "")), "migration : rien d'autre que les trois fonctions");
ok(inv.split(ANCIEN_SQL).length - 1 === 2 && !inv.includes(NEUF_SQL) && !/depop_product_id/.test(inv.replace(/^--.*$/gm, "")), "inverse : la définition prod d'avant, telle quelle");
const essai = lire("scripts/essais/20261018180000_essai.sql");
ok(/^begin;/m.test(essai) && /\nrollback;\n?$/.test(essai) && /select \* from _r;/.test(essai) && essai.includes("81188384-85a2-455e-a11a-99e3608419c8"), "essai : BEGIN … _r … ROLLBACK, sur le retrait réel");
ok(essai.includes(mig.slice(mig.indexOf("CREATE OR REPLACE FUNCTION"))), "essai : la migration exacte, en entier");
const rep = lire("scripts/reparations/20261018_depop_identifiants_slug.sql");
const repInv = lire("scripts/reparations/20261018_depop_identifiants_slug_INVERSE.sql");
ok(/CREATE TABLE public\._backup_1810_depop_slug/.test(rep) && /RAISE EXCEPTION 'sauvegarde déjà présente/.test(rep) && /v_depots > 40 OR v_comptes > 1 OR v_conflits > 0/.test(rep), "réparation : sauvegarde, garde de périmètre (34 dépôts, 1 compte, 0 conflit)");
ok(/SET platform_listing_id = b\.slug/.test(rep) && !/title/i.test(rep.replace(/^--.*$/gm, "")), "réparation : le slug de SON PROPRE lien, jamais un titre");
ok(/SET platform_listing_id = b\.avant/.test(repInv) && /DROP TABLE public\._backup_1810_depop_slug/.test(repInv), "réparation : inverse depuis la sauvegarde");

console.log(ko ? `\n❌ selftest:depop-slug-souligne-serveur — ${ko} échec(s)` : "\n[selftest:depop-slug-souligne-serveur] OK — le « _ » du pseudo est lu partout ; un retrait Depop retrouve son identifiant, jamais par le titre.");
process.exit(ko ? 1 : 0);
