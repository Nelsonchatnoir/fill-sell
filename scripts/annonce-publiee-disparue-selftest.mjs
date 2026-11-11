// Autotest — une annonce publiée confirmée disparue n'est plus jamais revisitée (05/11, règle de Nico) —
// `npm run selftest:annonce-publiee-disparue` (_shared/annonce-publiee-disparue.js, handler-watch).
// Cas du 05/11 : Beebs 34283901 (« TEST FillSell 30/10 — T-shirt femme Picture »), publiée le 02/11 17:20, jamais vue dans
// les annonces du compte, page publique 404, republiée encore le 05/11 10:29 ; et 33640171 (Medik8, « en vérification »
// chez Beebs depuis le 26/10) relue sans fin, page 404 par construction.
// (05/11 16:33, INCIDENT) Section 4 : 24 republications Vinted VIVANTES closes, jugées sur l'ANCIENNE annonce
// (platform_fields.vinted_item_id) au lieu de l'annonce en ligne (platform_listing_id) — rejouées avec le VRAI code de
// jugerAnnoncesPublieesDisparues (handler-watch, extrait et transpilé), sur un client en mémoire qui n'écrit rien.
import fs from "node:fs";
import ts from "typescript";
import * as moduleAnnonce from "../supabase/functions/_shared/annonce-publiee-disparue.js";
import * as moduleIntrouvable from "../supabase/functions/_shared/introuvable-a-confirmer.js";
import { decisionAnnoncePubliee, identifiantAnnoncePubliee, patchAnnoncePublieeDisparue, lectureRateeAnnoncePubliee, pfAnnonceEnVerification, PLATEFORMES_RELEVEES, POSES_PAR_DISPARUE } from "../supabase/functions/_shared/annonce-publiee-disparue.js";
import { identifiantAnnonceJob } from "../supabase/functions/_shared/introuvable-a-confirmer.js";

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
  // (05/11, garde-fou de Nico) La clôture s'annule : l'état d'avant est gardé, l'INVERSE le rend.
  const avecErreur = job({ error: "Impossible de vérifier cette annonce sur Beebs" });
  const p2 = patchAnnoncePublieeDisparue(avecErreur, d);
  ok(p2.platform_fields.annonce_disparue.avant?.status === "published" && p2.platform_fields.annonce_disparue.avant?.error === "Impossible de vérifier cette annonce sur Beebs"
    && POSES_PAR_DISPARUE.includes(p2.platform_fields.annonce_disparue.pose_par), "l'état d'avant (statut, message) est gardé dans la marque");
  const inverse = lire("scripts/reparations/20261105_regle_annonces_publiees_disparues_INVERSE.sql");
  ok(POSES_PAR_DISPARUE.every((m) => inverse.includes(`'${m}'`)) && inverse.includes("SET status = COALESCE(j.platform_fields->'annonce_disparue'->'avant'->>'status', 'published')")
    && inverse.includes("platform_fields = j.platform_fields - 'annonce_disparue'") && inverse.includes("_backup_annonces_disparues_inverse"),
    "INVERSE : seulement les marques de cette règle, état d'avant rendu, sauvegarde avant d'écrire");
}

console.log("\n1 bis. (05/11) « EN VÉRIFICATION » : L'APP DIT « BEEBS VÉRIFIE TON ANNONCE », PAS « EN LIGNE »");
{
  const pf = pfAnnonceEnVerification(job({ platform_listing_id: "33640171" }), { vu_le: "2026-11-05T10:59:27Z" }, { at: "2026-11-05T14:00:00Z" });
  ok(pf?.pas_encore_visible?.regle === "releve_en_verification_0511" && pf.pas_encore_visible.depuis === "2026-11-05T10:59:27Z" && pf.check_unresolved === true,
    "marqueur pas_encore_visible posé (lu par l'app : logo désaturé, « Beebs vérifie ton annonce »)");
  ok(pfAnnonceEnVerification(job({ platform_fields: { pas_encore_visible: { regle: "jamais_vue_en_ligne_2010" } } }), { vu_le: "x" }) === null,
    "déjà marquée : rien n'est réécrit (aucune ligne inchangée réécrite)");
  const app = lire("src/tabs/StockTab.jsx");
  ok(app.includes("const enVerificationPlateforme = (job) => !!job && (!job.listing_url || !!job.platform_fields?.pas_encore_visible);")
    && app.includes('"Beebs vérifie ton annonce avant de la mettre en ligne."'), "l'app lit ce marqueur (StockTab : enVerificationPlateforme, phrase « Beebs vérifie »)");
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
  ok(hw.includes('import { decisionAnnoncePubliee, identifiantAnnoncePubliee, patchAnnoncePublieeDisparue, pfAnnonceEnVerification, PLATEFORMES_RELEVEES, POSES_PAR_DISPARUE } from "../_shared/annonce-publiee-disparue.js";'), "module importé");
  ok(hw.includes("new Date().getUTCMinutes() >= 33 && new Date().getUTCMinutes() < 36") && hw.includes("jugerAnnoncesPublieesDisparues(supabase, new Date().getUTCHours() % 16)"),
    "une fois par heure, un seizième des annonces (chaque annonce jugée ~1 fois par jour)");
  ok(hw.includes('.eq("platform_fields->>check_unresolved", "true").not("listing_url", "is", null).gte("id", de);') && hw.includes(".order(\"id\").limit(400)"),
    "candidates : seulement les annonces publiées non vérifiables, lot borné à 400");
  ok((hw.match(/\.eq\("id", (?:j|p)\.id\)\.eq\("status", "published"\)\.select\("id"\)/g) ?? []).length === 3,
    "clôture et marqueur « en vérification » en compare-and-set sur « published » (jamais une ligne qui a bougé)");
  ok(hw.includes("if (maj?.length) await fermerDepotsPubliesDeLAnnonce(supabase, userId, j,"),
    "une republication en pause confirmée disparue clôt aussi les dépôts publiés de la MÊME annonce (34283901 : republiée le 05/11 malgré la clôture du 02/11)");
  ok(hw.includes("async function lirePagesDisparues(") && hw.includes(".range(de, de + 999)"), "lectures par pages (PostgREST coupe à 1 000)");
}

console.log("\n4. (05/11 16:33, INCIDENT) UNE REPUBLICATION PUBLIÉE EST JUGÉE SUR SON ANNONCE EN LIGNE, JAMAIS SUR L'ANCIENNE");
// Le cas réel, lu en prod (lecture seule) : republication fbe12f96 du compte 2189c4d8, boutique Vinted 295151754 (@narema75) ;
// l'ancienne annonce 10534381485 retirée le 28/10 23:59:13 par la republication elle-même, la nouvelle 10577905434 publiée à
// 23:59:34 ; lecture ratée (check_unresolved) depuis le 02/11 17:18 ; relevés complets de la boutique le 29/10 20:41 (255/255)
// et le 04/11 23:23 (276/276, 05/11 00:23 à Paris) : 10577905434 vue « active » aux deux, 10534381485 à aucun. Close à
// 16:33 (Paris) « absente de 2 relevés complets depuis sa dernière vue, dont 1 après la lecture » — sur les vues de l'ANCIENNE.
const U = "2189c4d8-d31f-4f79-ae04-0bef8dded385", BOUTIQUE = "295151754", ANCIENNE = "10534381485", EN_LIGNE = "10577905434";
const INCIDENT = "2026-11-05T15:33:06.703Z";
const republication = (o = {}) => ({
  id: "fbe12f96-2adf-41e3-8244-91b3916d84af", user_id: U, platform: "vinted", action: "republish", status: "published", error: null,
  inventaire_id: 1793179861950004, platform_listing_id: EN_LIGNE, listing_url: `https://www.vinted.fr/items/${EN_LIGNE}-jean-zara-42-bleu`,
  created_at: "2026-10-28T11:11:29.934Z", published_at: "2026-10-28T23:59:34.840Z", ...o,
  platform_fields: { vinted_item_id: ANCIENNE, old_vinted_item_id: ANCIENNE, new_vinted_item_id: EN_LIGNE, vinted_account_id: BOUTIQUE,
    republish_step: "recreated", check_unresolved: true, check_unresolved_since: "2026-11-02T17:18:50.456Z", ...(o.platform_fields ?? {}) },
});
const dressing = (debut, fin, vus, boutique, erreur = null) => ({ user_id: U, platform: "vinted", kind: "dressing", status: "done",
  started_at: debut, finished_at: fin, items_vus: vus, total_entries: vus, vinted_user_id: boutique, erreur });
const relevesReels = [ // les relevés Vinted du compte (quatre boutiques), tels qu'en base
  dressing("2026-10-29T20:41:11.892Z", "2026-10-29T20:41:31.028Z", 255, BOUTIQUE, "[note] cadence cron : 1 sync 'cron' refusée(s) depuis ce run (fenêtre de 20 h), dernière le 2026-10-29T21:45:06.167Z"),
  dressing("2026-10-30T11:17:09.240Z", "2026-10-30T11:17:30.933Z", 222, "32977976", "[note] disparitions non marquées — changement de compte Vinted (@boutique-essai-3 → @boutique-essai-5) : sync normale, aucune disparition marquée"),
  dressing("2026-11-01T00:43:09.975Z", "2026-11-01T00:43:30.074Z", 222, "32977976"),
  dressing("2026-11-01T16:52:18.832Z", "2026-11-01T16:52:27.934Z", 15, "36916243", "[note] disparitions non marquées — changement de compte Vinted (@boutique-essai-5 → @boutique-2189c4d8) : sync normale, aucune disparition marquée"),
  dressing("2026-11-02T23:28:42.403Z", "2026-11-02T23:29:12.719Z", 307, "36325065", "[note] disparitions non marquées — changement de compte Vinted (@boutique-2189c4d8 → @boutique-essai-1) : sync normale, aucune disparition marquée"),
  dressing("2026-11-03T23:28:43.772Z", "2026-11-03T23:29:09.856Z", 306, "36325065"),
  dressing("2026-11-04T23:23:21.883Z", "2026-11-04T23:23:44.298Z", 276, BOUTIQUE, "[note] disparitions non marquées — changement de compte Vinted (@boutique-essai-1 → @boutique-essai-3) : sync normale, aucune disparition marquée"),
];
const vueEnLigne = { vu_le: "2026-11-04T23:23:33.022Z", statut: "active" };
const vueAncienne = { vu_le: "2026-10-28T11:01:00.010Z", statut: "active" };
{
  ok(identifiantAnnoncePubliee(republication()) === EN_LIGNE && identifiantAnnonceJob(republication()) === ANCIENNE,
    "le juge des annonces publiées lit l'annonce EN LIGNE (platform_listing_id 10577905434) ; identifiantAnnonceJob inchangé (10534381485 : la cible d'une republication en pause)");
  const d = decisionAnnoncePubliee({ job: republication(), vu: vueEnLigne, runs: relevesReels, boutique: BOUTIQUE, creeLe: republication().published_at });
  ok(d.decision !== "disparue" && /relevée en ligne après la lecture/.test(d.raison), `vue « active » au relevé complet du 04/11 23:23, après la lecture ratée : jamais « disparue » (${d.decision} — ${d.raison})`);
  ok(identifiantAnnoncePubliee(republication({ platform_listing_id: null, listing_url: `https://www.vinted.fr/items/${EN_LIGNE}-jean-zara-42-bleu` })) === EN_LIGNE,
    "sans platform_listing_id : le numéro du lien de l'annonce en ligne");
  const sansNumero = republication({ platform_listing_id: null, listing_url: `https://www.vinted.fr/member/${BOUTIQUE}` });
  ok(identifiantAnnoncePubliee(sansNumero) === null && decisionAnnoncePubliee({ job: sansNumero, runs: relevesReels, boutique: BOUTIQUE }).decision === "attendre",
    "republication sans numéro en ligne : jamais l'ancien vinted_item_id — identifiant inconnu, on attend");
  const depot = republication({ action: "publish", platform_listing_id: null, listing_url: `https://www.vinted.fr/member/${BOUTIQUE}`, platform_fields: { vinted_item_id: EN_LIGNE, old_vinted_item_id: undefined } });
  ok(identifiantAnnoncePubliee(depot) === EN_LIGNE, "dépôt « publish » sans les deux : son vinted_item_id (il n'a pas d'ancienne annonce)");
  ok(identifiantAnnoncePubliee({ platform: "beebs", platform_listing_id: "34283901", listing_url: "https://www.beebs.app/fr/p/34283901" }) === "34283901",
    "autres plateformes : platform_listing_id (inchangé)");
  // (05/11 soir, décision de Nico) Hors Vinted, sans numéro : « identifiant inconnu », jamais le lien entier, aucune clôture.
  const lbcSansNumero = { ...republication(), platform: "leboncoin", platform_listing_id: null, listing_url: "https://www.leboncoin.fr/ad/collection/3289178478",
    platform_fields: { check_unresolved: true, check_unresolved_since: "2026-11-01T10:00:00Z" } };
  ok(identifiantAnnoncePubliee(lbcSansNumero) === null, "Leboncoin sans platform_listing_id : identifiant inconnu (null), jamais le lien entier");
  const dSans = decisionAnnoncePubliee({ job: lbcSansNumero, runs: [], creeLe: "2026-10-20T10:00:00Z" });
  ok(dSans.decision === "attendre" && /identifiant exact/.test(dSans.raison), "… et le juge attend, aucune clôture", JSON.stringify(dSans));
  ok(identifiantAnnoncePubliee({ platform: "beebs", platform_listing_id: null, listing_url: "https://www.beebs.app/fr/p/34283901" }) === null,
    "Beebs sans numéro : identifiant inconnu");
  // (05/11 soir) Jamais vue en ligne (pas_encore_visible) : jamais « disparue » par ce juge (3 TEST Beebs de f44b5917).
  const jamaisVue = { platform: "beebs", action: "publish", status: "published", platform_listing_id: "34270410", listing_url: null,
    platform_fields: { check_unresolved: true, check_unresolved_since: "2026-11-01T10:00:00Z",
      pas_encore_visible: { regle: "jamais_vue_en_ligne_2010", depuis: "2026-10-31T14:50:02Z" } } };
  const dJ = decisionAnnoncePubliee({ job: jamaisVue, runs: [], creeLe: "2026-10-31T10:46:00Z" });
  ok(dJ.decision === "attendre" && /jamais vue en ligne/.test(dJ.raison), "Beebs jamais vue en ligne (pas_encore_visible) : on attend, jamais « disparue »", JSON.stringify(dJ));
}

// Le VRAI jugerAnnoncesPublieesDisparues (handler-watch), extrait, transpilé et rejoué sur un client EN MÉMOIRE : aucune
// écriture ne part (les mises à jour sont seulement notées), l'heure est figée à l'instant de l'incident.
function clientMemoire(tables) {
  const ecritures = [];
  const val = (r, c) => { const m = /^(\w+)->>(\w+)$/.exec(c); return m ? r?.[m[1]]?.[m[2]] : r?.[c]; };
  const cmp = (a, b) => {
    if (typeof a === "number") return a - Number(b);
    if (/^\d{4}-\d\d-\d\d/.test(String(a)) && /^\d{4}-\d\d-\d\d/.test(String(b))) return Date.parse(String(a)) - Date.parse(String(b));
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  };
  const from = (table) => {
    const f = []; let ordre = null, lim = null, plage = null, maj = null;
    const q = {
      select() { return q; },
      update(p) { maj = p; return q; },
      eq(c, v) { f.push((r) => val(r, c) != null && String(val(r, c)) === String(v)); return q; },
      in(c, l) { const s = new Set(l.map(String)); f.push((r) => s.has(String(val(r, c)))); return q; },
      not(c, op, v) { if (op !== "is" || v !== null) throw new Error(`not(${c}, ${op}) non géré`); f.push((r) => val(r, c) != null); return q; },
      gt(c, v) { f.push((r) => val(r, c) != null && cmp(val(r, c), v) > 0); return q; },
      gte(c, v) { f.push((r) => val(r, c) != null && cmp(val(r, c), v) >= 0); return q; },
      lt(c, v) { f.push((r) => val(r, c) != null && cmp(val(r, c), v) < 0); return q; },
      order(c, o = {}) { ordre = [c, o.ascending !== false]; return q; },
      limit(n) { lim = n; return q; },
      range(a, b) { plage = [a, b]; return q; },
      then(res, rej) {
        let rows = (tables[table] ?? []).filter((r) => f.every((g) => g(r)));
        if (maj) { for (const r of rows) ecritures.push({ table, id: r.id, patch: maj }); return Promise.resolve({ data: rows.map((r) => ({ id: r.id })), error: null }).then(res, rej); }
        if (ordre) rows = [...rows].sort((x, y) => (ordre[1] ? 1 : -1) * cmp(val(x, ordre[0]), val(y, ordre[0])));
        const de = plage ? plage[0] : 0;
        return Promise.resolve({ data: rows.slice(de, de + Math.min(plage ? plage[1] - plage[0] + 1 : lim ?? 1000, 1000)), error: null }).then(res, rej);
      },
    };
    return q;
  };
  return { from, ecritures };
}
function chargerJuge(remplacer = {}) {
  const src = lire("supabase/functions/handler-watch/index.ts");
  const debut = src.indexOf("async function lirePagesDisparues(");
  const tete = src.indexOf("async function jugerAnnoncesPublieesDisparues(");
  const fin = tete < 0 ? -1 : src.indexOf("\n}\n", tete);
  if (debut < 0 || tete < debut || fin < 0) return null;
  const js = ts.transpileModule(src.slice(debut, fin + 3), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps = { ...moduleIntrouvable, ...moduleAnnonce, ...remplacer };
  class DateFigee extends Date { constructor(...a) { if (a.length) super(...a); else super(INCIDENT); } static now() { return Date.parse(INCIDENT); } }
  const noms = Object.keys(deps);
  return new Function(...noms, "Date", "console", `${js}\nreturn jugerAnnoncesPublieesDisparues;`)(...noms.map((k) => deps[k]), DateFigee, { log() {}, warn() {}, error() {} });
}
const tablesReelles = (o = {}) => ({
  cross_post_jobs: [republication()],
  vinted_sync_runs: relevesReels,
  inventaire: [{ id: 1793179861950004, user_id: U, statut: "stock", vinted_account_id: BOUTIQUE, vinted_item_id: EN_LIGNE, last_synced_at: vueEnLigne.vu_le, vinted_status: "active" }],
  vinted_listing_snapshots: [
    { user_id: U, vinted_item_id: ANCIENNE, captured_at: vueAncienne.vu_le, captured_on: "2026-10-28", status: "active" },
    { user_id: U, vinted_item_id: EN_LIGNE, captured_at: "2026-10-29T20:41:23.439Z", captured_on: "2026-10-29", status: "active" },
    { user_id: U, vinted_item_id: EN_LIGNE, captured_at: vueEnLigne.vu_le, captured_on: "2026-11-04", status: "active" },
  ],
  annonces_plateforme: [],
  ...o,
});
{
  const juge = chargerJuge();
  ok(typeof juge === "function", "jugerAnnoncesPublieesDisparues extrait de handler-watch et transpilé");
  if (juge) {
    const c = clientMemoire(tablesReelles());
    const r = await juge(c, 15);
    ok(r.jugees === 1 && r.closes === 0 && c.ecritures.length === 0,
      `le cas réel (fbe12f96, 10577905434) rejoué dans le VRAI juge corrigé : jugée, JAMAIS close (${JSON.stringify(r)}, ${c.ecritures.length} écriture)`);

    // L'ANCIEN juge rejoué : son identifiant était identifiantAnnonceJob → il close, avec le motif exact de 16:33.
    const journal = [];
    const ancien = chargerJuge({
      identifiantAnnoncePubliee: identifiantAnnonceJob,
      decisionAnnoncePubliee: (a) => { const d = decisionAnnoncePubliee(a); journal.push(d); return d; },
    });
    const c2 = clientMemoire(tablesReelles());
    const r2 = await ancien(c2, 15);
    ok(r2.closes === 1 && journal[0]?.raison === "absente de 2 relevés complets depuis sa dernière vue, dont 1 après la lecture",
      `témoin : avec l'identifiant d'avant (l'ancienne 10534381485), le même juge la close — « ${journal[0]?.raison} » (le motif exact de l'incident)`);

    // La VRAIE annonce en ligne absente de deux relevés complets de sa boutique (dont un après la lecture) → disparue, close.
    const c3 = clientMemoire(tablesReelles({
      vinted_sync_runs: [...relevesReels, dressing("2026-11-05T10:02:00.000Z", "2026-11-05T10:02:30.000Z", 275, BOUTIQUE)],
      inventaire: [{ id: 1793179861950004, user_id: U, statut: "stock", vinted_account_id: BOUTIQUE, vinted_item_id: EN_LIGNE, last_synced_at: "2026-10-29T20:41:23.439Z", vinted_status: "active" }],
      vinted_listing_snapshots: [
        { user_id: U, vinted_item_id: ANCIENNE, captured_at: vueAncienne.vu_le, captured_on: "2026-10-28", status: "active" },
        { user_id: U, vinted_item_id: EN_LIGNE, captured_at: "2026-10-29T20:41:23.439Z", captured_on: "2026-10-29", status: "active" },
      ],
    }));
    const r3 = await juge(c3, 15);
    const e3 = c3.ecritures[0];
    ok(r3.closes === 1 && e3?.id === republication().id && e3?.patch?.status === "cancelled"
      && e3?.patch?.platform_fields?.annonce_disparue?.motif === "absente de 2 relevés complets depuis sa dernière vue, dont 2 après la lecture",
      `l'annonce EN LIGNE absente de 2 relevés complets de sa boutique : disparue, close (« ${e3?.patch?.platform_fields?.annonce_disparue?.motif} »)`);

    // Un seul relevé complet sans elle après sa dernière vue : on attend (inchangé).
    const c4 = clientMemoire(tablesReelles({
      inventaire: [{ id: 1793179861950004, user_id: U, statut: "stock", vinted_account_id: BOUTIQUE, vinted_item_id: EN_LIGNE, last_synced_at: "2026-10-29T20:41:23.439Z", vinted_status: "active" }],
      vinted_listing_snapshots: [{ user_id: U, vinted_item_id: EN_LIGNE, captured_at: "2026-10-29T20:41:23.439Z", captured_on: "2026-10-29", status: "active" }],
    }));
    const r4 = await juge(c4, 15);
    ok(r4.closes === 0 && c4.ecritures.length === 0, "l'annonce en ligne absente d'UN seul relevé complet de sa boutique : on attend le suivant");
    // Hors tranche : rien n'est lu ni jugé.
    const c5 = clientMemoire(tablesReelles());
    ok((await juge(c5, 14)).jugees === 0, "un seizième par passage : une republication de la tranche « f » n'est pas jugée à la tranche 14");
  }
  const hw = lire("supabase/functions/handler-watch/index.ts");
  const corps = hw.slice(hw.indexOf("async function jugerAnnoncesPublieesDisparues("), hw.indexOf("\n}\n", hw.indexOf("async function jugerAnnoncesPublieesDisparues(")));
  ok(corps.includes('const ident = (j: unknown) => String(identifiantAnnoncePubliee(j) ?? "").trim();') && !corps.includes("identifiantAnnonceJob("),
    "handler-watch : traces, relevés et décision du juge lisent identifiantAnnoncePubliee, jamais identifiantAnnonceJob");
  ok(hw.includes("const JUGER_ANNONCES_PUBLIEES_DISPARUES = true;"), "la règle est RALLUMÉE (06/11, condition de Nico « zéro faux » remplie) : JUGER_ANNONCES_PUBLIEES_DISPARUES = true");
}
console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(ko ? 1 : 0);
