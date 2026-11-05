// Autotest — une annonce publiée confirmée disparue n'est plus jamais revisitée (05/11, règle de Nico) —
// `npm run selftest:annonce-publiee-disparue` (_shared/annonce-publiee-disparue.js, handler-watch).
// Cas du 05/11 : Beebs 34283901 (« TEST FillSell 30/10 — T-shirt femme Picture »), publiée le 02/11 17:20, jamais vue dans
// les annonces du compte, page publique 404, republiée encore le 05/11 10:29 ; et 33640171 (Medik8, « en vérification »
// chez Beebs depuis le 26/10) relue sans fin, page 404 par construction.
import fs from "node:fs";
import { decisionAnnoncePubliee, patchAnnoncePublieeDisparue, lectureRateeAnnoncePubliee, PLATEFORMES_RELEVEES } from "../supabase/functions/_shared/annonce-publiee-disparue.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const job = (o = {}) => ({
  id: "ee55be2d", user_id: "u", platform: "beebs", action: "publish", status: "published", platform_listing_id: "34283901",
  listing_url: "https://www.beebs.app/fr/p/34283901", published_at: "2026-11-02T16:20:00Z", created_at: "2026-11-02T16:02:00Z",
  ...o, platform_fields: { check_unresolved: true, check_unresolved_since: "2026-11-03T06:00:00Z", ...(o.platform_fields ?? {}) },
});
const releve = (debut, o = {}) => ({ platform: "beebs", kind: "annonces", status: "done", started_at: debut, finished_at: debut.replace(/:00Z$/, ":50Z"),
  items_vus: 14, total_entries: 14, erreur: "[défilement] page : 13 annonce(s)", ...o });
const relevesNico = [releve("2026-11-02T23:51:00Z"), releve("2026-11-03T23:43:00Z"), releve("2026-11-04T20:39:00Z")];

console.log("\n1. LE CAS DU 05/11 : CONFIRMÉE DISPARUE, CLOSE, PLUS JAMAIS REVISITÉE");
{
  const d = decisionAnnoncePubliee({ job: job(), runs: relevesNico, creeLe: "2026-11-02T16:20:00Z" });
  ok(d.decision === "disparue" && !d.vendue, `Beebs 34283901 : absente de 3 relevés complets depuis sa publication → disparue (${d.raison})`);
  const p = patchAnnoncePublieeDisparue(job(), d, { at: "2026-11-05T12:00:00Z" });
  ok(p.status === "cancelled" && /FillSell n'a rien retiré/.test(p.error) && /ne la vérifie plus et ne la republie plus/.test(p.error),
    "close « cancelled » : la détection de vente (jobs « published ») ne la relit plus, la republication ne la prend plus pour source");
  ok(p.platform_fields.annonce_disparue?.at === "2026-11-05T12:00:00Z" && p.platform_fields.check_unresolved === true, "preuve gardée (annonce_disparue), traces d'origine intactes");
}

console.log("\n2. GARDE-FOUS : JAMAIS SUR UNE SEULE LECTURE, UN 403, UNE ERREUR RÉSEAU OU UN 404 BEEBS « EN VÉRIFICATION »");
ok(decisionAnnoncePubliee({ job: job({ platform_fields: { check_unresolved: false } }), runs: relevesNico }).decision === "attendre"
  && lectureRateeAnnoncePubliee(job({ platform_fields: { check_unresolved: false } })) === null,
  "aucune lecture ratée à répétition (une page 404 ou un 403 isolés) : rien n'est jugé");
{
  const enVerif = { statut_plateforme: "en_verification", vu_le: "2026-11-05T10:59:27Z", disparu_le: null };
  const d = decisionAnnoncePubliee({ job: job({ platform_listing_id: "33640171", listing_url: "https://www.beebs.app/fr/p/33640171" }), annonce: enVerif, runs: relevesNico });
  ok(d.decision === "en_verification", `Beebs 33640171 relevée « en vérification » : jamais « disparue » (page publique 404 par construction) — ${d.raison}`);
}
ok(decisionAnnoncePubliee({ job: job(), runs: [relevesNico[2]], creeLe: "2026-11-02T16:20:00Z" }).decision === "attendre", "un seul relevé complet sans elle : on attend le suivant");
ok(decisionAnnoncePubliee({ job: job(), runs: relevesNico.map((r) => ({ ...r, erreur: "[incomplet] 6/14" })), creeLe: "2026-11-02T16:20:00Z" }).decision === "attendre",
  "relevés incomplets (réseau, refus) : jamais une preuve d'absence");
ok(decisionAnnoncePubliee({ job: job(), runs: relevesNico.map((r) => ({ ...r, items_vus: 6 })), creeLe: "2026-11-02T16:20:00Z" }).decision === "attendre",
  "relevés qui n'ont pas tout lu (6 sur 14) : jamais une preuve d'absence");
{
  const vue = { statut_plateforme: "en_ligne", vu_le: "2026-11-04T20:39:30Z", disparu_le: null };
  ok(decisionAnnoncePubliee({ job: job(), annonce: vue, runs: relevesNico }).decision === "attendre", "revue EN LIGNE par un relevé après la lecture ratée : jamais close");
}
{
  const vinted = job({ platform: "vinted", platform_listing_id: "9572685943", listing_url: "https://www.vinted.fr/items/9572685943", platform_fields: { vinted_account_id: "77" } });
  const runsV = [{ platform: "vinted", kind: "dressing", status: "done", started_at: "2026-11-04T10:00:00Z", finished_at: "2026-11-04T10:05:00Z", items_vus: 50, total_entries: 50, vinted_user_id: "77" }];
  const d = decisionAnnoncePubliee({ job: vinted, vu: { vu_le: "2026-11-04T10:01:00Z", statut: "hidden" }, runs: runsV, boutique: "77" });
  ok(d.decision === "attendre" && /masquée/.test(d.raison), "Vinted « masquée » (hidden) par la personne : pas disparue (31 annonces épargnées à la simulation du 05/11)");
  const v = decisionAnnoncePubliee({ job: vinted, vu: { vu_le: "2026-11-04T10:01:00Z", statut: "sold" }, runs: runsV, boutique: "77" });
  ok(v.decision === "disparue" && v.vendue && /vendue/.test(patchAnnoncePublieeDisparue(vinted, v).error), "relevée vendue : close « vendue » (la vente garde son propre circuit)");
}
ok(decisionAnnoncePubliee({ job: job({ platform: "ebay", platform_listing_id: "820319093620" }), runs: relevesNico }).decision === "attendre" && !PLATEFORMES_RELEVEES.includes("ebay"),
  "eBay (API) : hors de cette règle");
ok(decisionAnnoncePubliee({ job: job({ status: "cancelled" }), runs: relevesNico }).decision === "attendre", "un job déjà clos n'est jamais rejugé");
ok(decisionAnnoncePubliee({ job: job(), fiche: { statut: "vendu" }, runs: [] }).decision === "disparue", "fiche vendue : close (vendue)");

console.log("\n3. HANDLER-WATCH : LA RÈGLE BRANCHÉE, BORNÉE, EN COMPARE-AND-SET");
{
  const hw = lire("supabase/functions/handler-watch/index.ts");
  ok(hw.includes('import { decisionAnnoncePubliee, patchAnnoncePublieeDisparue, PLATEFORMES_RELEVEES } from "../_shared/annonce-publiee-disparue.js";'), "module importé");
  ok(hw.includes("new Date().getUTCMinutes() >= 33 && new Date().getUTCMinutes() < 36") && hw.includes("jugerAnnoncesPublieesDisparues(supabase, new Date().getUTCHours() % 16)"),
    "une fois par heure, un seizième des annonces (chaque annonce jugée ~1 fois par jour)");
  ok(hw.includes('.eq("platform_fields->>check_unresolved", "true").not("listing_url", "is", null).gte("id", de);') && hw.includes(".order(\"id\").limit(400)"),
    "candidates : seulement les annonces publiées non vérifiables, lot borné à 400");
  ok((hw.match(/\.eq\("id", (?:j|p)\.id\)\.eq\("status", "published"\)\.select\("id"\)/g) ?? []).length === 2, "clôture en compare-and-set sur « published » (jamais une ligne qui a bougé)");
  ok(hw.includes("if (maj?.length) await fermerDepotsPubliesDeLAnnonce(supabase, userId, j,"),
    "une republication en pause confirmée disparue clôt aussi les dépôts publiés de la MÊME annonce (34283901 : republiée le 05/11 malgré la clôture du 02/11)");
  ok(hw.includes("async function lirePagesDisparues(") && hw.includes(".range(de, de + 999)"), "lectures par pages (PostgREST coupe à 1 000)");
}
console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(ko ? 1 : 0);
