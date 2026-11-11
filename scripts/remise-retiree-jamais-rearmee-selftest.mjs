// ═══════════════════════════════════════════════════════════════════════════
// Selftest « une remise dont l'article ou l'annonce a été retiré ne se réarme jamais » (11/11, L1 — chemin résiduel 2)
//   node scripts/remise-retiree-jamais-rearmee-selftest.mjs
// DÉCISION DE NICO (11/11) : « aucun chemin ne remet en ligne un article retiré sans geste du client » — l'ancienne règle
// de remise en vente Leboncoin (règle A du 07/11, handler-watch) ne réarme jamais une remise après un retrait (traversée
// de L1, logo, suppression de la fiche).
// LE DÉFAUT (avant le 11/11) : decisionRearmementRemise (_shared/remise-en-vente-attente.js) ne refusait que
// `arret_utilisateur` / « à ta demande ». Une remise close par l'extension après un retrait ciblé (removed_by_user, « Annonce
// retirée par le vendeur… »), une remise « published » jamais vue dont le retrait est armé ou en file, une remise dont la
// fiche a été supprimée (inventaire_id NULL), une remise d'un article retiré « partout » depuis le compte relié : toutes
// repassaient « pending », puis get-pending-jobs les servait dès la disparition de la vendue — un dépôt neuf, en ligne.
// § 1 : la vraie fonction. § 2 : le VRAI bloc « règle A » de handler-watch, découpé dans index.ts, débarrassé de ses types
// et EXÉCUTÉ sur un faux serveur (modèle : § 12 de scripts/releves-de-veille-selftest.mjs).
// Contre-épreuve : SELFTEST_RACINE=<copie du dépôt> relit les sources de cette copie.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = process.env.SELFTEST_RACINE ? resolve(process.env.SELFTEST_RACINE) : ICI;
const lire = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const mod = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/remise-en-vente-attente.js")).href);
const { archiverErreur } = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/erreurs-archivees.js")).href);
const { decisionRearmementRemise } = mod;

let ko = 0, n = 0;
const ok = (nom, cond, detail = "") => { n++; if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

// Identifiants inventés (débuts d'identifiants et chiffres seulement, aucune donnée de client).
const U = "aaaa0000-0000-4000-8000-000000000001";
const FICHE = 1790000000000001;
const VENDUE = "3297400164";
const DEPOT = "3303702852";
const T0 = Date.parse("2026-11-11T15:01:00Z");      // minute 01 : la règle A passe (getUTCMinutes() % 15 < 3)
const iso = (minAvant) => new Date(T0 - minAvant * 60_000).toISOString();
const MSG_RETRAIT_CIBLE = "Annonce retirée par le vendeur (retrait ciblé depuis l'app) — pas une vente";

const remise = (o = {}) => ({
  id: "r0000001-0000-4000-8000-000000000001", user_id: U, inventaire_id: FICHE, platform: "leboncoin", action: "publish",
  status: "cancelled", error: "Ce dépôt n'a jamais été retrouvé … rien n'est vendu.", platform_listing_id: DEPOT, listing_url: null,
  created_at: iso(24 * 60), published_at: iso(5 * 60), vu_en_ligne_le: null, ...o,
  platform_fields: { remise_en_vente: { annonce_vendue: VENDUE }, lbc_depot: { adsubmit: { id: DEPOT } },
    depot_jamais_en_ligne: { issue: "article_en_ligne_ailleurs", identifiants: [DEPOT] }, ...(o.platform_fields ?? {}) },
});
const retrait = (o = {}) => ({ id: `d${Math.random().toString(16).slice(2, 9)}-0000-4000-8000-000000000000`, user_id: U, inventaire_id: FICHE,
  platform: "leboncoin", action: "delete", status: "pending", created_at: iso(30), platform_listing_id: DEPOT,
  listing_url: `https://www.leboncoin.fr/ad/vetements/${DEPOT}`, platform_fields: {}, ...o });
const bilanL1 = (o = {}) => ({ id: 1, user_id: U, feature: "retrait_partout_compte_relie", created_at: iso(40),
  metadata: { chemin: "suppression_article_compte_relie", article_id: String(FICHE), de_fiche: "1789000000000002", retraits: 1, taches_laissees: [] }, ...o });
const f = { vendueEncoreAffichee: true, depotVu: false, autreAnnonceVivante: false, maintenant: T0 };

// ═══════════════════════════════════════════════════════════════════════════
console.log("1. La vraie fonction : decisionRearmementRemise");
const d = (job, faits = {}) => decisionRearmementRemise(job, { ...f, ...faits });
ok("témoin (07/11) : une remise refusée, sans aucun retrait, revient en attente", d(remise()).rearmer === true, JSON.stringify(d(remise())));
ok("témoin : « published » jamais vu depuis 5 h, sans retrait, revient en attente", d(remise({ status: "published" })).rearmer === true);
// Les quatre retraits.
const logoFait = remise({ error: MSG_RETRAIT_CIBLE, platform_fields: { removed_by_user: true } });
const retraitDuDepotFait = retrait({ status: "deleted" });
ok("logo, retrait FAIT : la remise close par l'extension après le retrait de SON dépôt ne se réarme jamais",
  d(logoFait, { retraitsDeLaFiche: [retraitDuDepotFait] }).rearmer === false, JSON.stringify(d(logoFait, { retraitsDeLaFiche: [retraitDuDepotFait] })));
const PTR = "d0000001-0000-4000-8000-0000000000aa";
const armeL1 = remise({ status: "published", platform_fields: { pending_removal: false, retrait_arme: { job: PTR, chemin: "suppression_article_compte_relie" } } });
const retraitPointe = retrait({ id: PTR, platform_listing_id: null, listing_url: null, platform_fields: { removal_url_missing: true } });
ok("traversée L1 (ou vente) : un retrait ARMÉ sur la remise elle-même (pointeur vers un retrait vivant) → jamais réarmée",
  d(armeL1, { retraitsDeLaFiche: [retraitPointe] }).rearmer === false, JSON.stringify(d(armeL1, { retraitsDeLaFiche: [retraitPointe] })));
ok("fiche supprimée (inventaire_id NULL) → jamais réarmée", d(remise({ status: "published", inventaire_id: null })).rearmer === false);
ok("logo, retrait EN FILE sur la fiche (né après la remise) → jamais réarmée",
  d(remise({ status: "published" }), { retraitsDeLaFiche: [retrait()] }).rearmer === false);
ok("logo, retrait échoué sur la fiche (la personne l'a demandé) → jamais réarmée",
  d(remise({ status: "published" }), { retraitsDeLaFiche: [retrait({ status: "failed" })] }).rearmer === false);
ok("traversée L1 : l'article retiré « partout » depuis le compte relié (bilan) → jamais réarmée",
  d(remise(), { bilansRetraitPartout: [bilanL1()] }).rearmer === false);
ok("la marque de la traversée sur la remise (retrait_partout_compte_relie) → jamais réarmée",
  d(remise({ platform_fields: { retrait_partout_compte_relie: { chemin: "suppression_article_compte_relie" } } })).rearmer === false);
ok("retraits illisibles (lecture en panne) → jamais réarmée (le doute ne remet rien en ligne)",
  d(remise(), { retraitsDeLaFiche: null }).rearmer === false && d(remise(), { bilansRetraitPartout: null }).rearmer === false);
// Ce qui ne bloque PAS (sinon la règle A ne servirait plus).
ok("le retrait de la VENDUE (la personne la supprime, ou FillSell la retire) n'empêche pas la remise",
  d(remise(), { retraitsDeLaFiche: [retrait({ platform_listing_id: VENDUE, listing_url: `https://www.leboncoin.fr/ad/vetements/${VENDUE}` })] }).rearmer === true
  && d(remise(), { retraitsDeLaFiche: [retrait({ platform_listing_id: null, listing_url: `https://www.leboncoin.fr/ad/vetements/${VENDUE}`,
    platform_fields: { arme_par: { pose_par: "handler-watch (remise-en-vente-attente : vente close, l'annonce vendue est retirée avant la remise)" } } })] }).rearmer === true);
ok("un retrait ANNULÉ (la personne a changé d'avis) n'empêche pas la remise", d(remise(), { retraitsDeLaFiche: [retrait({ status: "cancelled" })] }).rearmer === true);
ok("un retrait plus ANCIEN que la remise n'empêche pas la remise", d(remise(), { retraitsDeLaFiche: [retrait({ created_at: iso(48 * 60) })] }).rearmer === true);
ok("un bilan d'un AUTRE article, ou d'avant la remise, n'empêche pas la remise",
  d(remise(), { bilansRetraitPartout: [bilanL1({ metadata: { article_id: "1790000000000099" } }), bilanL1({ created_at: iso(48 * 60) })] }).rearmer === true);
const motifs = () => [d(remise({ inventaire_id: null })), d(logoFait, { retraitsDeLaFiche: [retraitDuDepotFait] }), d(armeL1, { retraitsDeLaFiche: [retraitPointe] }),
  d(remise(), { retraitsDeLaFiche: [retrait()] }), d(remise(), { bilansRetraitPartout: [bilanL1()] })];
ok("les motifs sont nommés", ["fiche_supprimee", "annonce_retiree", "retrait_arme", "retrait_demande", "article_retire_partout"].every((m) =>
  motifs().some((r) => r.motif === m)), motifs().map((r) => r.motif).join(","));

console.log("\n1 bis. Relecture du 11/11 — deux annonces = deux exemplaires ; un pointeur se relit ; jamais un titre seul");
// (1) Série Leboncoin : la fiche porte DEUX remises — R1 (vendue V1, dépôt D1) et R2 (vendue V2, dépôt D2).
const V2 = "3297400999", D2 = "3303709999", AUTRE = "3299000123";
const vendues = [VENDUE, V2];
const retraitDe = (num, o = {}) => retrait({ platform_listing_id: num, listing_url: `https://www.leboncoin.fr/ad/vetements/${num}`, ...o });
ok("SÉRIE : la personne retire par le logo la vendue de R2 → R1 revient quand même en attente",
  d(remise(), { retraitsDeLaFiche: [retraitDe(V2, { status: "deleted" })], vendesDesRemises: vendues }).rearmer === true,
  JSON.stringify(d(remise(), { retraitsDeLaFiche: [retraitDe(V2, { status: "deleted" })], vendesDesRemises: vendues })));
ok("SÉRIE : le retrait d'un AUTRE exemplaire de la fiche (ni vendue, ni dépôt de R1) n'empêche pas R1",
  d(remise(), { retraitsDeLaFiche: [retraitDe(AUTRE), retraitDe(D2)], vendesDesRemises: vendues }).rearmer === true);
ok("SÉRIE : le retrait du dépôt de R1 elle-même → R1 jamais réarmée",
  d(remise(), { retraitsDeLaFiche: [retraitDe(DEPOT)], vendesDesRemises: vendues }).rearmer === false);
ok("SÉRIE : chacun des dépôts de R1 compte (adsubmit, sans_adsubmit, identifiants du dépôt jamais en ligne)",
  ["3303702001", "3303702002", "3303702003"].every((num) => d(remise({ platform_listing_id: null,
    platform_fields: { lbc_depot: { adsubmit: { id: "3303702001" }, sans_adsubmit: { id: "3303702002" } }, depot_jamais_en_ligne: { identifiants: ["3303702003"] } } }),
  { retraitsDeLaFiche: [retraitDe(num)], vendesDesRemises: vendues }).rearmer === false));
ok("SÉRIE : un numéro qui est la VENDUE d'une remise de la fiche ne bloque jamais, même s'il fut un dépôt de R1",
  d(remise({ platform_listing_id: V2 }), { retraitsDeLaFiche: [retraitDe(V2)], vendesDesRemises: vendues }).rearmer === true);
// (10) retrait_arme est un POINTEUR : la tâche pointée décide.
ok("POINTEUR : le retrait pointé par retrait_arme a été ANNULÉ → la remise revient en attente",
  d(armeL1, { retraitsDeLaFiche: [{ ...retraitPointe, status: "cancelled" }] }).rearmer === true,
  JSON.stringify(d(armeL1, { retraitsDeLaFiche: [{ ...retraitPointe, status: "cancelled" }] })));
ok("POINTEUR : le retrait pointé introuvable → jamais réarmée (le doute ne remet rien en ligne)",
  d(armeL1, { retraitsDeLaFiche: [] }).rearmer === false);
// (10) removed_by_user peut venir du repli par TITRE de cancelPublishAfterDelete : jamais une décision sur ce seul signal.
ok("TITRE : removed_by_user posé par un retrait SANS lien ni numéro (repli par titre) → la remise revient en attente",
  d(logoFait, { retraitsDeLaFiche: [retrait({ platform_listing_id: null, listing_url: null, status: "deleted", platform_fields: { removal_url_missing: true } })] }).rearmer === true,
  JSON.stringify(d(logoFait, { retraitsDeLaFiche: [retrait({ platform_listing_id: null, listing_url: null, status: "deleted", platform_fields: { removal_url_missing: true } })] })));
ok("pré-tri sans les faits lus : les signes qui demandent une lecture ne décident pas (handler-watch lit, puis décide)",
  d(logoFait).rearmer === true && d(armeL1).rearmer === true && d(remise({ inventaire_id: null })).rearmer === false);
ok("lecture des vendues de la fiche en panne → jamais réarmée", d(remise(), { retraitsDeLaFiche: [], vendesDesRemises: null }).rearmer === false);

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n2. Le VRAI bloc « règle A » de handler-watch, exécuté sur un faux serveur");
const ts = (await import("typescript")).default;
const hw = lire("supabase/functions/handler-watch/index.ts");
const iDebut = hw.indexOf("  let remisesRearmees = 0;");
const iTitreSuivant = hw.indexOf("UNE FOIS LA VENTE CLOSE, FILLSELL RETIRE L'ANNONCE VENDUE, PUIS LA REMISE PART ══");
const iFin = iTitreSuivant > 0 ? hw.lastIndexOf("\n", iTitreSuivant) + 1 : -1;   // le début de la ligne qui ouvre la section suivante
ok("le bloc de la règle A est découpé dans handler-watch", iDebut > 0 && iFin > iDebut, `${iDebut} / ${iFin}`);
const deps = { ...mod, archiverErreur };
const source = `export async function bloc(supabase, Date, console, deps) {
  const { ${Object.keys(deps).join(", ")} } = deps;
  ${hw.slice(iDebut, iFin)}
  return remisesRearmees;
}`;
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { bloc } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

// Le faux serveur : trois tables, les filtres que le bloc emploie (un filtre inconnu jette : le bloc l'attrape et le dit
// dans le journal d'erreurs, que chaque cas exige vide). Colonnes JSON « a->b » / « a->>b » lues dans l'objet.
function fauxServeur({ jobs = [], annonces = [], usage = [], panne = null }) {
  const tables = { cross_post_jobs: jobs, annonces_plateforme: annonces, usage_logs: usage };
  const val = (r, c) => {
    const m = /^([a-z_]+)->(>?)([a-z_]+)$/.exec(c);
    if (!m) return r[c];
    const v = r[m[1]]?.[m[3]];
    return m[2] ? (v == null ? null : String(v)) : v;
  };
  const cmp = (a, b) => { const ta = Date.parse(a), tb = Date.parse(b); return Number.isFinite(ta) && Number.isFinite(tb) ? ta - tb : String(a).localeCompare(String(b)); };
  return {
    lectures: [],
    from(table) {
      if (!(table in tables)) throw new Error(`faux serveur : table inattendue ${table}`);
      const srv = this;
      const q = { filtres: [], lim: null, colonnes: null, maj: null, table };
      const b = {
        select(cols = "*") { if (!q.maj) q.colonnes = cols === "*" ? null : String(cols).split(",").map((s) => s.trim()); return b; },
        eq(c, v) { q.filtres.push((r) => val(r, c) != null && String(val(r, c)) === String(v)); return b; },
        in(c, vs) { const s = new Set(vs.map(String)); q.filtres.push((r) => val(r, c) != null && s.has(String(val(r, c)))); return b; },
        gte(c, v) { q.filtres.push((r) => val(r, c) != null && cmp(val(r, c), v) >= 0); return b; },
        is(c, v) { if (v !== null) throw new Error(`is(${c}, ${v})`); q.filtres.push((r) => val(r, c) == null); return b; },
        not(c, op, v) { if (op !== "is" || v !== null) throw new Error(`not(${c}, ${op}, ${v})`); q.filtres.push((r) => val(r, c) != null); return b; },
        limit(k) { q.lim = k; return b; },
        update(patch) { q.maj = patch; return b; },
        then(res, rej) {
          return Promise.resolve().then(() => {
            srv.lectures.push(`${table}${q.maj ? " (écriture)" : ""}`);
            if (panne && panne(table, q)) return { data: null, error: { message: "lecture en panne" } };
            const rows = tables[table].filter((r) => q.filtres.every((fn) => fn(r)));
            if (q.maj) { for (const r of rows) Object.assign(r, q.maj); return { data: rows.map((r) => ({ id: r.id })), error: null }; }
            const out = rows.slice(0, q.lim ?? Infinity);
            return { data: out.map((r) => (q.colonnes ? Object.fromEntries(q.colonnes.map((c) => [c, r[c] ?? null])) : { ...r })), error: null };
          }).then(res, rej);
        },
      };
      return b;
    },
  };
}
const vendueAffichee = { user_id: U, platform: "leboncoin", listing_id: VENDUE, statut_plateforme: "en_ligne", disparu_le: null, retiree_le: null,
  ignoree_le: null, job_id: null, inventaire_id: FICHE, transaction_plateforme: "sold" };
async function passage({ jobs, annonces = [vendueAffichee], usage = [], panne = null }) {
  const s = fauxServeur({ jobs, annonces: annonces.map((a) => ({ ...a })), usage, panne });
  const journal = [], erreurs = [];
  const FauxDate = class extends Date { constructor(...a) { if (a.length) super(...a); else super(T0); } static now() { return T0; } };
  const n = await bloc(s, FauxDate, { log: (...a) => journal.push(a.join(" ")), warn: (...a) => journal.push(a.join(" ")), error: (...a) => erreurs.push(a.join(" ")) }, deps);
  return { n, journal, erreurs, lectures: s.lectures };
}
const cas = async (nom, { remiseRow, autres = [], usage = [], annonces, panne, attendu }) => {
  const r = { ...remiseRow, platform_fields: { ...remiseRow.platform_fields } };
  const avant = r.status;
  const p = await passage({ jobs: [r, ...autres.map((x) => ({ ...x }))], usage, annonces, panne });
  const rearmee = r.status === "pending";
  ok(nom, rearmee === attendu && p.erreurs.length === 0,
    `statut ${avant} → ${r.status}, réarmées ${p.n}, erreurs ${p.erreurs.join(" | ") || "aucune"}`);
  return p;
};
await cas("témoin : la remise refusée du 07/11, sans retrait → remise en attente (la règle A sert toujours)", { remiseRow: remise(), attendu: true });
await cas("témoin : le retrait de la VENDUE armé par FillSell (vente close) → la remise revient quand même en attente", {
  remiseRow: remise(), autres: [retrait({ platform_listing_id: VENDUE, listing_url: `https://www.leboncoin.fr/ad/vetements/${VENDUE}`,
    platform_fields: { arme_par: { pose_par: "handler-watch (remise-en-vente-attente : vente close, l'annonce vendue est retirée avant la remise)" } } })], attendu: true });
await cas("témoin : un retrait Vinted de la même fiche (logo, une seule plateforme) ne touche pas la remise Leboncoin", {
  remiseRow: remise(), autres: [retrait({ platform: "vinted", platform_listing_id: "10700000001", listing_url: "https://www.vinted.fr/items/10700000001" })], attendu: true });
await cas("LOGO, retrait fait : remise close par l'extension (removed_by_user) → JAMAIS réarmée", {
  remiseRow: logoFait, autres: [retrait({ status: "deleted" })], attendu: false });
await cas("LOGO, retrait en file : remise « published » jamais vue, retrait de son dépôt pending → JAMAIS réarmée", {
  remiseRow: remise({ status: "published" }), autres: [retrait()], attendu: false });
await cas("SUPPRESSION de la fiche : remise « published » jamais vue, inventaire_id NULL → JAMAIS réarmée", {
  remiseRow: remise({ status: "published", inventaire_id: null }), attendu: false });
await cas("TRAVERSÉE L1, retrait armé sur la remise (retrait_arme, retrait en file) → JAMAIS réarmée", {
  remiseRow: armeL1, autres: [retrait({ platform_fields: { arme_par: { chemin: "suppression_article_compte_relie", pose_par: "armer_retraits_fiche_liee (serveur)" } } })], attendu: false });
await cas("TRAVERSÉE L1, rien d'armé sur la remise mais l'article retiré « partout » (bilan du compte relié) → JAMAIS réarmée", {
  remiseRow: remise({ status: "published" }), usage: [bilanL1()], attendu: false });
const pPanne = await cas("lecture des retraits en panne → JAMAIS réarmée (et rien ne casse)", {
  remiseRow: remise(), panne: (t, q) => t === "cross_post_jobs" && q.filtres.length >= 4 && !q.maj && JSON.stringify(q.colonnes ?? []).includes("action") && !JSON.stringify(q.colonnes ?? []).includes("vu_en_ligne_le"), attendu: false });
// (Relecture du 11/11) Le vrai bloc, sur les cas de la relecture.
const R2 = { ...remise({ id: "r0000002-0000-4000-8000-000000000002", status: "pending", platform_listing_id: null, created_at: iso(60) }),
  platform_fields: { remise_en_vente: { annonce_vendue: V2 } } };
await cas("SÉRIE (vrai bloc) : la vendue de R2 retirée par le logo → R1 revient en attente (deux annonces = deux exemplaires)", {
  remiseRow: remise(), autres: [R2, retraitDe(V2, { status: "deleted" })], attendu: true });
await cas("SÉRIE (vrai bloc) : un numéro qui fut un dépôt de R1 puis la vendue de R2 → R1 revient en attente", {
  remiseRow: remise({ platform_listing_id: V2 }), autres: [R2, retraitDe(V2)], attendu: true });
await cas("POINTEUR (vrai bloc) : le retrait pointé par retrait_arme a été annulé → la remise revient en attente", {
  remiseRow: armeL1, autres: [{ ...retraitPointe, status: "cancelled" }], attendu: true });
await cas("POINTEUR (vrai bloc) : le retrait pointé est vivant, sans numéro → JAMAIS réarmée (relu par sa clé)", {
  remiseRow: armeL1, autres: [{ ...retraitPointe, created_at: iso(48 * 60) }], attendu: false });
await cas("POINTEUR (vrai bloc) : le retrait pointé, ANNULÉ, hors des retraits lus de la fiche (né avant la remise) → relu par sa clé, la remise revient en attente", {
  remiseRow: armeL1, autres: [{ ...retraitPointe, status: "cancelled", created_at: iso(48 * 60) }], attendu: true });
await cas("TITRE (vrai bloc) : removed_by_user venu d'un retrait sans lien ni numéro → la remise revient en attente", {
  remiseRow: logoFait, autres: [retrait({ platform_listing_id: null, listing_url: null, status: "deleted", platform_fields: { removal_url_missing: true } })], attendu: true });
{
  const p = await passage({ jobs: [remise({ status: "published", inventaire_id: null }),
    remise({ id: "r0000003-0000-4000-8000-000000000003" }), retrait({ status: "deleted" })] });
  const lignes = p.journal.filter((l) => /jamais réarmée/.test(l));
  ok("JOURNAL : une seule ligne agrégée par passage pour les remises gardées (2 ici, motifs comptés), jamais une ligne par remise",
    lignes.length === 1 && /2 remise/.test(lignes[0]) && /fiche_supprimee 1/.test(lignes[0]) && /retrait_demande 1/.test(lignes[0]), lignes.join(" | ") || "aucune ligne");
}
ok("une remise sans retrait lit, par clé, au plus trois fois cross_post_jobs avant de se réarmer (file, retraits de la fiche, remises de la fiche)",
  (await passage({ jobs: [remise()] })).lectures.filter((l) => l === "cross_post_jobs").length <= 3, "");
void pPanne;

console.log(`\n${ko ? "ROUGE" : "VERT"} — ${n - ko}/${n} contrôles`);
process.exit(ko ? 1 : 0);
