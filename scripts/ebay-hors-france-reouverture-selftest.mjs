// ═══════════════════════════════════════════════════════════════════════════
// eBAY : UN COMPTE DEVENU « FRANCE » ROUVRE, UNE FOIS, CE QUE L'ANCIEN A FERMÉ (26/10 nuit, point 7)
// `npm run selftest:ebay-hors-france-reouverture`
// ═══════════════════════════════════════════════════════════════════════════
// Elodie82 (25/10) : cinq publications closes « ton compte eBay est sur eBay États-Unis » (@echa_5), puis @aelevy.-86
// relié à 18:23, sur eBay France — rien ne les rouvrait, et deux messages se contredisaient faute de nommer le compte.
// Vérifie la règle pure (_shared/ebay-hors-france.js), puis son branchement (ebay-reouverture.ts, ebay-oauth-callback,
// handler-watch, ebay-api-worker).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const E = await import(pathToFileURL(join(RACINE, "supabase/functions/_shared/ebay-hors-france.js")).href);
let verts = 0, rouges = 0;
const ok = (c, msg, d = "") => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}${d ? `  ← ${d}` : ""}`); } };
const t = (iso) => Date.parse(iso);

console.log("1. La clôture nomme le compte");
const job0 = { id: "5dde0511", action: "publish", status: "pending", platform_fields: { titre: "Tote bag" } };
const cl = E.clotureEbayHorsFrance(job0, { par: "ebay-api-worker", site: "US", compte: "echa_5", maintenant: t("2026-10-25T13:24:00Z") });
ok(cl.status === "cancelled" && cl.error === "FillSell publie seulement sur eBay France : ton compte eBay « echa_5 » est sur eBay États-Unis. Rien n'a été publié.", "« ton compte eBay « echa_5 » est sur eBay États-Unis »", cl.error);
ok(cl.platform_fields.ebay_hors_france.compte === "echa_5" && cl.platform_fields.ebay_hors_france.preuve === "US" && cl.platform_fields.hors_quota === true, "le marqueur garde le compte et le site ; hors quota");
ok(E.messageClotureEbayHorsFrance("UK") === "FillSell publie seulement sur eBay France : ton compte eBay est sur eBay Royaume-Uni. Rien n'a été publié.", "sans pseudo : la phrase d'avant, inchangée");
ok(E.texteEbayHorsFrance("US", "fr", "echa_5") === "eBay : FillSell publie seulement sur eBay France — ton compte eBay « echa_5 » est sur eBay États-Unis.", "la phrase de l'app nomme le compte");
ok(E.texteEbayHorsFrance("US", "en", "echa_5").includes("your eBay account “echa_5” is on eBay the US"), "en anglais aussi");

console.log("\n2. La réouverture : une fois, et seulement si tout tient");
const close = { ...job0, ...cl, published_at: null, platform_listing_id: null, listing_url: null };
const ctx = { siteActuel: "France", siteLuLe: "2026-10-25T17:23:16Z", fiche: { statut: "stock", quantite: 1, fusionne_dans: null }, maintenant: t("2026-10-25T23:30:00Z") };
ok(E.reouvertureEbayHorsFrance(close, ctx).rouvrir === true, "Elodie : compte sur eBay France, site relu après la clôture, fiche en stock → rouverte");
ok(E.reouvertureEbayHorsFrance(close, { ...ctx, siteActuel: "US" }).motif === "site_pas_france", "le compte est toujours hors de France → rien");
ok(E.reouvertureEbayHorsFrance(close, { ...ctx, siteLuLe: "2026-10-25T13:00:00Z" }).motif === "site_pas_relu_depuis", "site France lu AVANT la clôture → rien (rien de prouvé)");
ok(E.reouvertureEbayHorsFrance(close, { ...ctx, fiche: { statut: "vendu", quantite: 0 } }).motif === "fiche_pas_en_stock", "fiche vendue → rien");
ok(E.reouvertureEbayHorsFrance(close, { ...ctx, fiche: { statut: "stock", quantite: 1, fusionne_dans: 123 } }).motif === "fiche_pas_en_stock", "fiche fusionnée → rien");
ok(E.reouvertureEbayHorsFrance(close, { ...ctx, fiche: { statut: "stock", quantite: 0 } }).motif === "fiche_pas_en_stock", "quantité 0 → rien");
ok(E.reouvertureEbayHorsFrance(close, { ...ctx, autresEbayVivants: 1 }).motif === "autre_publication_ebay", "une autre publication eBay vivante → rien (jamais un doublon)");
ok(E.reouvertureEbayHorsFrance(close, { ...ctx, annonceEbayLiee: true }).motif === "annonce_ebay_en_ligne", "une annonce eBay en ligne pour la fiche → rien");
ok(E.reouvertureEbayHorsFrance(close, { ...ctx, maintenant: t("2026-12-01T00:00:00Z") }).motif === "trop_ancienne", "close depuis plus de 30 jours → rien");
ok(E.reouvertureEbayHorsFrance({ ...close, action: "republish" }, ctx).motif === "pas_une_publication", "une republication ne se rouvre jamais");
ok(E.reouvertureEbayHorsFrance({ ...close, published_at: "2026-10-25T13:00:00Z" }, ctx).motif === "deja_publiee", "déjà publiée → rien");
ok(E.reouvertureEbayHorsFrance({ ...close, status: "pending" }, ctx).motif === "pas_close_hors_france", "pas close par cette règle → rien");
const w = E.ecritureReouvertureEbayHorsFrance(close, { compte: "aelevy.-86", message: "Ton compte eBay est bien relié…", par: "ebay-oauth-callback", maintenant: t("2026-10-25T23:30:00Z"), archiver: (a, e) => [...(a ?? []), { erreur: e }] });
ok(w.status === "needs_user" && w.platform_fields.needs_user_source === "ebay_compte_a_finir" && w.error.startsWith("Ton compte eBay est bien relié"), "rouverte en « compte à finir » (le ré-armement la publie dès que le compte est prêt)");
const m = w.platform_fields.ebay_hors_france_rouverte;
ok(m.compte_avant === "echa_5" && m.compte_apres === "aelevy.-86" && m.site_avant === "US" && m.site_apres === "France", "le marqueur dit l'ancien et le nouveau compte");
ok(w.platform_fields.hors_quota === true && w.platform_fields.erreurs_archivees?.[0]?.erreur?.includes("echa_5"), "hors quota gardé, la clôture archivée");
ok(E.reouvertureEbayHorsFrance({ ...close, ...w, status: "cancelled" }, ctx).motif === "deja_rouverte", "une seule fois : refermée, elle ne se rouvre plus");

console.log("\n3. Branchements");
const reo = lire("supabase/functions/_shared/ebay-reouverture.ts");
ok(/\.eq\("id", j\.id\)\.eq\("status", "cancelled"\)\.select\("id"\)/.test(reo), "écriture conditionnée au statut lu (cancelled)");
ok(/rearmerJobsEbayConnexionSiUtilisable\(admin, userId\)/.test(reo), "le ré-armement existant publie dès que le compte est prêt");
ok(/dejaRouverte\.has\(k\)/.test(reo), "une fiche : une seule publication rouverte");
const cb = lire("supabase/functions/ebay-oauth-callback/index.ts");
ok(/rouvrirPublicationsEbayHorsFrance\(admin, userId, \{ par: "ebay-oauth-callback" \}\)/.test(cb), "ebay-oauth-callback rouvre à la connexion");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(/\.eq\("ebay_site", "France"\)\.is\("revoked_at", null\)/.test(hw) && /rouvrirPublicationsEbayHorsFrance\(supabase, String\(c\.user_id\), \{ par: "handler-watch" \}\)/.test(hw), "handler-watch : le filet borné");
const wk = lire("supabase/functions/ebay-api-worker/index.ts");
ok(/clotureEbayHorsFrance\(job, \{ par: "ebay-api-worker", site: s\.site, compte: s\.pseudo, archiver: archiverErreur \}\)/.test(wk), "ebay-api-worker : la clôture nomme le compte");
const st = lire("src/tabs/StockTab.jsx");
ok(/if \(siteEbay\?\.site && !siteEbay\.horsFrance\) return null;/.test(st) && /texteEbayHorsFrance\(m\.preuve \?\? siteEbay\?\.site, lang, m\.compte \?\? null\)/.test(st),
  "Stock : une publication close dit SON compte et SON site ; compte d'aujourd'hui en France → la relance est permise");

console.log(`\n${rouges ? `✗ ${rouges} RATÉ(S)` : "✓ tout est vert"} — ${verts} vérifications`);
process.exit(rouges ? 1 : 0);
