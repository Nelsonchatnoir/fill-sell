// ═══════════════════════════════════════════════════════════════════════════
// Selftest « Leboncoin : jamais published sur une annonce que Leboncoin n'a pas mise en ligne » (06/11, Nico, règle B)
//   node scripts/depot-lbc-jamais-en-ligne-selftest.mjs
// Les cas réels du 06/11 : les 7 remises de Louis (refusées, 410), inandup33 et jocabroc8 (refusées depuis octobre), et
// le FAUX qu'il faut éviter — 3 dépôts de jocabroc8 jamais vus par ses relevés mais EN LIGNE (200).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { estDepotLbcAJuger, jugerDepotLbcJamaisEnLigne, patchDepotLbcJamaisEnLigne, MESSAGE_JAMAIS_EN_LIGNE_LBC } from "../supabase/functions/_shared/depot-lbc-jamais-en-ligne.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const run = (started_at, vus = 402, tot = 401) => ({ platform: "leboncoin", kind: "annonces", status: "done", started_at, items_vus: vus, total_entries: tot, erreur: "[défilement] 5 page(s)" });
const depot = (o = {}) => ({ id: "cc247496-0000", platform: "leboncoin", action: "publish", status: "published", platform_listing_id: "3303254205",
  listing_url: "https://www.leboncoin.fr/ad/jeux_societe/3303254205", published_at: "2026-11-06T06:28:55Z",
  platform_fields: { lbc_depot: { preuve: "confirmation" }, sale_signal: "unavailable", unavailable_since: "2026-11-06T11:20:00Z", ...(o.pf ?? {}) }, ...o });
const maintenant = Date.parse("2026-11-06T11:30:00Z");
const relevesLouis = [run("2026-11-06T09:13:00Z"), run("2026-11-06T09:19:00Z")];

console.log("1. Les trois preuves ensemble → jamais en ligne");
const v = jugerDepotLbcJamaisEnLigne(depot(), { vue: null, releves: relevesLouis, maintenant });
ok("Louis, « Rangement Noir » 3303254205 : jamais vue, 2 relevés complets à 10:13/10:19, page absente → jamais_en_ligne", v.decision === "jamais_en_ligne", JSON.stringify(v));

console.log("2. Une seule preuve manque → on attend (jamais un faux)");
ok("vue par un relevé après le dépôt → en ligne", jugerDepotLbcJamaisEnLigne(depot(), { vue: { vu_le: "2026-11-06T09:13:00Z" }, releves: relevesLouis, maintenant }).decision === "en_ligne");
ok("client-53efea05 (EN LIGNE, jamais relevée) : la page n'a rien vu manquer → attendre",
  jugerDepotLbcJamaisEnLigne(depot({ pf: { sale_signal: undefined, unavailable_since: undefined } }), { releves: relevesLouis, maintenant }).raison === "page_pas_relue_absente");
ok("un seul relevé complet → attendre", jugerDepotLbcJamaisEnLigne(depot(), { releves: [relevesLouis[0]], maintenant }).raison === "moins_de_deux_releves_complets");
ok("un relevé incomplet ne compte pas", jugerDepotLbcJamaisEnLigne(depot(), { releves: [relevesLouis[0], run("2026-11-06T09:19:00Z", 200, 401)], maintenant }).decision === "attendre");
ok("premier relevé complet plus de 24 h après le dépôt (l'annonce a pu vivre et partir) → attendre",
  jugerDepotLbcJamaisEnLigne(depot(), { releves: [run("2026-11-08T09:00:00Z"), run("2026-11-08T10:00:00Z")], maintenant: Date.parse("2026-11-08T12:00:00Z") }).raison === "premier_releve_trop_tardif");
ok("dans la fenêtre de modération (2 h) → attendre", jugerDepotLbcJamaisEnLigne(depot(), { releves: relevesLouis, maintenant: Date.parse("2026-11-06T07:30:00Z") }).raison === "moderation");
ok("page lue absente PENDANT la modération : ne prouve rien → attendre",
  jugerDepotLbcJamaisEnLigne(depot({ pf: { unavailable_since: "2026-11-06T07:00:00Z" } }), { releves: relevesLouis, maintenant }).raison === "page_pas_relue_absente");
ok("relevés d'avant la fin de la modération ne comptent pas", jugerDepotLbcJamaisEnLigne(depot(), { releves: [run("2026-11-06T07:00:00Z"), run("2026-11-06T08:00:00Z")], maintenant }).decision === "attendre");

console.log("3. Hors règle");
ok("annonce importée du relevé : jamais", !estDepotLbcAJuger(depot({ pf: { source: "releve" } })));
ok("sans numéro : jamais (son propre juge)", !estDepotLbcAJuger(depot({ platform_listing_id: null })));
ok("une autre plateforme : jamais", !estDepotLbcAJuger(depot({ platform: "beebs" })));

console.log("4. L'effet");
const remise = depot({ pf: { remise_en_vente: { annonce_vendue: "3297440551" } } });
const pr = patchDepotLbcJamaisEnLigne(remise, jugerDepotLbcJamaisEnLigne(remise, { releves: relevesLouis, maintenant }), { maintenant });
ok("remise en vente : repart (pending), sans message, numéro/lien/date du dépôt refusé vidés",
  pr.status === "pending" && pr.error === null && pr.platform_listing_id === null && pr.listing_url === null && pr.published_at === null);
ok("remise : le dépôt refusé gardé (depots_refuses_lbc), le signal « Vendue ? » retiré, la remise intacte",
  pr.platform_fields.depots_refuses_lbc?.[0]?.numero === "3303254205" && !("sale_signal" in pr.platform_fields) && pr.platform_fields.remise_en_vente?.annonce_vendue === "3297440551");
const pn = patchDepotLbcJamaisEnLigne(depot(), v, { maintenant });
ok("publication ordinaire : « failed », message vrai, trace jamais_en_ligne, plus de « Vendue ? »",
  pn.status === "failed" && pn.error === MESSAGE_JAMAIS_EN_LIGNE_LBC && pn.platform_fields.jamais_en_ligne?.numero === "3303254205" && !("unavailable_since" in pn.platform_fields));

console.log("5. Branchement (handler-watch)");
const hw = readFileSync(join(ROOT, "supabase/functions/handler-watch/index.ts"), "utf8");
ok("handler-watch appelle le juge, compare-and-set sur « published » et le numéro", /jugerDepotLbcJamaisEnLigne\(j, \{/.test(hw)
  && /\.eq\("status", "published"\)\.eq\("platform_listing_id", String\(j\.platform_listing_id\)\)/.test(hw));
ok("la publication ordinaire est rendue (refund_publish_unconfirmed)", /depot Leboncoin jamais en ligne[\s\S]{0,400}refund_publish_unconfirmed|refund_publish_unconfirmed[\s\S]{0,600}jamais mis en ligne par Leboncoin/.test(hw));
// Premier passage en prod (06/11 12:48) : 200 jugés, rien fermé — 171 imports du relevé remplissaient la page, et les
// dépôts prouvés (30/09-05/10) étaient hors de la fenêtre de 30 jours.
const corps = hw.slice(hw.indexOf("async function jugerDepotsLbcJamaisEnLigne("), hw.indexOf("const BEEBS_SANS_NUMERO_PAGE"));
ok("candidats : imports du relevé écartés dans la requête (handler « releve-annonces », source « releve »)",
  corps.includes('.or("handler_build.is.null,handler_build.neq.releve-annonces")') && corps.includes('.or("platform_fields->>source.is.null,platform_fields->>source.neq.releve")'));
ok("candidats : 120 jours, page tournante ordonnée (plus de .limit(200) sans ordre)",
  /LBC_JAMAIS_EN_LIGNE_JOURS = 120/.test(hw) && /\.order\("published_at", \{ ascending: true \}\)\.order\("id"/.test(corps) && !/\.limit\(200\)/.test(corps));
ok("relevés lus du plus ancien au plus récent, par pages, depuis le plus ancien dépôt du lot",
  /vinted_sync_runs[\s\S]{0,300}\.gte\("started_at", new Date\(plusAncien\)[\s\S]{0,80}\.order\("started_at", \{ ascending: true \}\)/.test(corps) && /lirePagesDisparues\(\(\) => supabase\.from\("vinted_sync_runs"\)/.test(corps));

console.log(ko ? `\n${ko} KO` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
