// ═══════════════════════════════════════════════════════════════════════════
// Selftest « une tâche déjà prise quand son article est retiré : ce qu'elle publie repart aussitôt » (11/11, L1 — chemin
// résiduel 1, filet SERVEUR ; relecture du 11/11)
//   node scripts/publication-apres-retrait-selftest.mjs
// DÉCISION DE NICO (11/11) : « aucun chemin ne remet en ligne un article retiré sans geste du client » — une tâche déjà prise
// par un ordinateur (ou le Cloud) au moment du retrait doit revérifier avant d'agir.
// LE DÉFAUT (avant le 11/11) : l'extension ne relit rien avant son clic final (seule sa borne de temps l'arrête :
// FILLSELL_ABANDON_REMPLISSAGE, 0.6.178). Une tâche « processing » va donc au bout ; son « publié » est ÉCRIT par
// update-job-status même si la tâche a été annulée entre-temps par la suppression de sa fiche (controler_job_extension ne
// refuse qu'une annulation « à ta demande » ; ecrire_statut_job_extension écrit sur p_avant = « cancelled »), même si
// la traversée L1 l'a laissée finir, même si l'annonce de sa republication a reçu un retrait pendant son vol.
// LE FILET (serveur, toutes les versions d'extension, le Cloud compris) : le « publié » s'écrit comme avant, puis le retrait
// de l'annonce qui vient de partir est armé par la voie ordinaire (une tâche « delete » par son lien ou son numéro).
// (Relecture du 11/11) LA RACINE : toute autre écriture qu'un « publié » sur une tâche annulée par la suppression de sa
// fiche est refusée (409) — elle ne ressuscite plus ; A suit le CHOIX de la personne (marque posée à l'annulation par
// 20261111180000) ; B ne vaut que pour une tâche EN COURS laissée par L1 et un essai commencé avant le bilan ; C se borne
// au début de l'essai ; lectures par clé ; idempotence ; un retrait né clos n'est pas un retrait armé.
// § 1 : les vraies fonctions (_shared/publication-apres-retrait.js). § 2 : deux VRAIS segments d'update-job-status,
// découpés dans index.ts, débarrassés de leurs types et EXÉCUTÉS sur un faux serveur qui écrit comme
// ecrire_statut_job_extension en prod : (a) la garde juste après controler_job_extension ; (b) du filet « needs_user
// muet » jusqu'à la VRAIE réponse de la fonction. § 3 : la base jetable du déclencheur (lecteur du lien tardif, marque
// d'annulation) : scripts/essais/20261111180000_banc.mjs.
// Contre-épreuve : SELFTEST_RACINE=<copie du dépôt> relit les sources de cette copie.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ICI = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = process.env.SELFTEST_RACINE ? resolve(process.env.SELFTEST_RACINE) : ICI;
const lire = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let ko = 0, n = 0;
const ok = (nom, cond, detail = "") => { n++; if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

const cheminModule = join(ROOT, "supabase/functions/_shared/publication-apres-retrait.js");
let mod = {};
if (existsSync(cheminModule)) mod = await import(pathToFileURL(cheminModule).href);
const fn = (nom) => (typeof mod[nom] === "function" ? mod[nom] : () => { throw new Error(`${nom} absente`); });
const essai = (f) => { try { return f(); } catch (e) { return { erreur: String(e?.message ?? e) }; } };

// Identifiants inventés (débuts d'identifiants et chiffres seulement).
const U = "bbbb0000-0000-4000-8000-000000000001";
const JOB = "c0000001-0000-4000-8000-000000000001";
const FICHE = 1790000000000007;
const T0 = Date.parse("2026-11-11T16:00:00Z");
const iso = (minAvant) => new Date(T0 - minAvant * 60_000).toISOString();
const MSG_SUPPRESSION = "Annulé : l'article a été supprimé du stock";
const MSG_SANS_RETRAIT = "Fiche supprimée du stock, annonce laissée en ligne — aucun retrait demandé";
const job = (o = {}) => ({ id: JOB, user_id: U, inventaire_id: FICHE, platform: "leboncoin", action: "publish", status: "processing", error: null,
  title: "Article de test", created_at: iso(30), listing_url: null, platform_listing_id: null, published_at: null, ...o,
  platform_fields: { processing_since: iso(8), ...(o.platform_fields ?? {}) } });
const bilan = (taches, m = 5) => ({ created_at: iso(m), metadata: { chemin: "suppression_article_compte_relie", article_id: String(FICHE),
  de_fiche: "1789000000000003", taches_laissees: taches } });
const enCours = { job: JOB, platform: "leboncoin", action: "publish", statut: "processing", motif: "en_cours" };
// La marque que pose le déclencheur de 20261111180000 au moment où la suppression annule la tâche (le choix de la personne).
const marque = (avecRetrait, par = "app") => ({ annulee_par_suppression: { le: iso(4), fiche: String(FICHE), avec_retrait: avecRetrait, par, statut_avant: "processing" } });

// ═══════════════════════════════════════════════════════════════════════════
console.log("1. Les vraies fonctions (_shared/publication-apres-retrait.js)");
ok("le module existe", existsSync(cheminModule), cheminModule);
const motif = (j, faits) => essai(() => fn("retraitPendantLaTache")(j, faits));
const supprimee = job({ status: "cancelled", inventaire_id: null, error: MSG_SUPPRESSION, platform_fields: marque(true) });
ok("A — fiche supprimée « avec retrait » pendant la tâche (marque de l'annulation : avec_retrait) → retrait",
  typeof motif(supprimee) === "string", JSON.stringify(motif(supprimee)));
ok("A — … aussi avec le texte anglais de l'app",
  typeof motif(job({ status: "cancelled", inventaire_id: null, error: "Cancelled: the item was deleted from stock", platform_fields: marque(true) })) === "string");
ok("A (14) — suppression SANS retrait choisie (« aucune annonce ne sera retirée », publication annulée sans annonce) → jamais",
  motif(job({ status: "cancelled", inventaire_id: null, error: MSG_SUPPRESSION, platform_fields: marque(false) })) === null);
ok("A (14) — annulation sans la marque (choix inconnu : déclencheur pas encore posé) → jamais (le doute ne retire rien)",
  motif(job({ status: "cancelled", inventaire_id: null, error: MSG_SUPPRESSION })) === null);
ok("A — « Supprimer la fiche, laisser les annonces en ligne » → jamais : c'est le choix de la personne",
  motif(job({ status: "cancelled", inventaire_id: null, error: MSG_SANS_RETRAIT, platform_fields: { annonces_laissees_en_ligne: true } })) === null);
ok("A — annulée pour une autre raison (ligne suivie par la fiche actuelle) → jamais",
  motif(job({ status: "cancelled", inventaire_id: null, error: "Ligne close : cette annonce est suivie par ta fiche actuelle", platform_fields: marque(true) })) === null);
ok("tâche ordinaire, rien de retiré → rien", motif(job()) === null && motif(job({ action: "republish" }), { bilans: [], retraits: [] }) === null);
ok("B — tâche EN COURS laissée par la traversée L1, essai commencé AVANT le bilan → retrait",
  typeof motif(job(), { bilans: [bilan([enCours])] }) === "string", JSON.stringify(motif(job(), { bilans: [bilan([enCours])] })));
ok("B (2) — entrée qui n'est pas « en_cours » (republication engagée, dépôt avec numéro) → jamais",
  motif(job(), { bilans: [bilan([{ ...enCours, motif: "republication_engagee", statut: "needs_user" }])] }) === null
  && motif(job(), { bilans: [bilan([{ ...enCours, motif: "depot_avec_numero", statut: "pending" }])] }) === null);
ok("B (2) — relance par la personne APRÈS le bilan (essai commencé après lui) → jamais",
  motif(job({ platform_fields: { processing_since: iso(2), relance: { le: iso(3) } } }), { bilans: [bilan([enCours])] }) === null);
ok("B (2) — début d'essai inconnu → jamais", motif(job({ platform_fields: { processing_since: null } }), { bilans: [bilan([enCours])] }) === null);
ok("B — le bilan d'une AUTRE tâche → rien", motif(job(), { bilans: [bilan([{ ...enCours, job: "c0000009-0000-4000-8000-000000000009" }])] }) === null);
const repub = job({ action: "republish", platform: "vinted", listing_url: "https://www.vinted.fr/items/10700000001",
  platform_listing_id: "10700000001", platform_fields: { old_listing_url: "https://www.vinted.fr/items/10700000001", republish_step: "deleted" } });
const retraitDe = (num, o = {}) => ({ id: `d${num}`, user_id: U, inventaire_id: FICHE, platform: "vinted", action: "delete", status: "pending",
  created_at: iso(4), platform_listing_id: num, listing_url: `https://www.vinted.fr/items/${num}`, platform_fields: {}, ...o });
ok("C — republication en vol, son annonce retirée (logo) PENDANT l'essai → retrait de l'annonce recréée",
  typeof motif(repub, { retraits: [retraitDe("10700000001")] }) === "string", JSON.stringify(motif(repub, { retraits: [retraitDe("10700000001")] })));
ok("C (2) — retrait né APRÈS la création de la tâche mais AVANT le début de l'essai → jamais",
  motif(repub, { retraits: [retraitDe("10700000001", { created_at: iso(20) })] }) === null);
ok("C (11) — retrait d'une AUTRE fiche, même numéro → jamais", motif(repub, { retraits: [retraitDe("10700000001", { inventaire_id: 1790000000000099 })] }) === null);
ok("C — retrait d'avant la tâche, annulé, ou d'une autre annonce → rien",
  motif(repub, { retraits: [retraitDe("10700000001", { created_at: iso(90) })] }) === null
  && motif(repub, { retraits: [retraitDe("10700000001", { status: "cancelled" })] }) === null
  && motif(repub, { retraits: [retraitDe("10700000002")] }) === null);
ok("C — le retrait d'un doublon armé par CETTE republication → rien (lu aussi dans la colonne arme_par seule)",
  motif(repub, { retraits: [retraitDe("10700000001", { platform_fields: { arme_par: { chemin: "doublon_de_republication", republication: JOB } } })] }) === null
  && motif(repub, { retraits: [{ ...retraitDe("10700000001"), platform_fields: undefined, arme_par: { chemin: "doublon_de_republication", republication: JOB } }] }) === null);
ok("une PUBLICATION (pas une republication) et un retrait de la même fiche → rien (la remise suit le retrait de la vendue)",
  motif(job(), { retraits: [{ ...retraitDe("3297400164"), platform: "leboncoin" }] }) === null);
ok("(7) idempotence — la tâche porte déjà retrait_apres_publication ou retrait_apres_publication_attendu → rien",
  motif(job({ ...supprimee, platform_fields: { ...supprimee.platform_fields, retrait_apres_publication: { retrait: "d77" } } })) === null
  && motif(job(), { bilans: [bilan([enCours])], ...{} }) !== null
  && motif(job({ platform_fields: { retrait_apres_publication_attendu: { motif: "x" } } }), { bilans: [bilan([enCours])] }) === null);
const annulee = (j) => essai(() => fn("tacheAnnuleeParSuppression")(j));
ok("(3) tacheAnnuleeParSuppression : avec ou sans retrait, fiche partie → oui ; autre annulation ou tâche vivante → non",
  annulee(supprimee) === true && annulee(job({ status: "cancelled", inventaire_id: null, error: MSG_SANS_RETRAIT, platform_fields: { annonces_laissees_en_ligne: true } })) === true
  && annulee(job({ status: "cancelled", inventaire_id: null, error: "Ligne close : cette annonce est suivie par ta fiche actuelle" })) === false
  && annulee(job({ status: "processing", inventaire_id: null, error: MSG_SUPPRESSION })) === false
  && annulee(job({ status: "cancelled", error: MSG_SUPPRESSION })) === false, JSON.stringify(annulee(supprimee)));
const ligne = (j, m, o = {}) => essai(() => fn("ligneRetraitApresPublication")(j, { motif: m, maintenantIso: new Date(T0).toISOString(), ...o }));
const publieUrl = { ...supprimee, status: "published", listing_url: "https://www.leboncoin.fr/ad/vetements/3310000001", platform_listing_id: "3310000001" };
const l1 = ligne(publieUrl, "fiche_supprimee_pendant_la_tache");
ok("la ligne de retrait : la voie ordinaire (delete, pending, lien et numéro de l'annonce qui vient de partir)",
  l1 && l1.action === "delete" && l1.status === "pending" && l1.user_id === U && l1.platform === "leboncoin"
  && l1.listing_url === publieUrl.listing_url && l1.platform_listing_id === "3310000001" && l1.inventaire_id === null, JSON.stringify(l1));
const ap = l1?.platform_fields?.arme_par ?? {};
ok("… nommée : chemin publication_apres_retrait, pose_par sans « armer_retrait_job », chemin sans « vente_ », jamais par titre",
  ap.chemin === "publication_apres_retrait" && ap.depot === JOB && !/armer_retrait_job/.test(String(ap.pose_par)) && !/^vente_/.test(String(ap.chemin))
  && !("removal_url_missing" in (l1?.platform_fields ?? {})), JSON.stringify(ap));
ok("le numéro du LIEN qui vient de partir prime sur une colonne qui en porte un autre (jamais une autre annonce)",
  ligne({ ...publieUrl, platform_listing_id: "3310000777" }, "x")?.platform_listing_id === "3310000001",
  JSON.stringify(ligne({ ...publieUrl, platform_listing_id: "3310000777" }, "x")?.platform_listing_id));
ok("Leboncoin publié sans lien mais avec le numéro rendu par Leboncoin au dépôt → retrait par ce numéro",
  ligne({ ...publieUrl, listing_url: null, platform_listing_id: null, platform_fields: { lbc_depot: { adsubmit: { id: "3310000002" } } } }, "x")?.platform_listing_id === "3310000002");
ok("ni lien ni numéro → AUCUN retrait (jamais par titre) : la ligne n'existe pas",
  ligne({ ...publieUrl, listing_url: null, platform_listing_id: null, platform_fields: {} }, "x") === null);
ok("Vinted : la boutique de la tâche suit le retrait (garde boutique d'un retrait sans fiche)",
  ligne({ ...publieUrl, platform: "vinted", listing_url: "https://www.vinted.fr/items/10700000005", platform_listing_id: null,
    platform_fields: { vinted_account_id: "123456" } }, "x")?.platform_fields?.vinted_account_id === "123456");
const avant = essai(() => fn("identifiantsAvantPublication")(repub));
const repubPubliee = { ...repub, status: "published", platform_fields: { republish_step: "recreated" } };
ok("(9) republication publiée SANS lien neuf, colonnes restées sur l'ANCIENNE annonce → « sans lien » (jamais l'ancienne)",
  Array.isArray(avant) && ligne(repubPubliee, "x", { identifiantsAvant: avant }) === null, JSON.stringify(ligne(repubPubliee, "x", { identifiantsAvant: avant })));
ok("(9) … une colonne égale à old_listing_url compte aussi comme « sans lien », même sans l'état d'avant",
  ligne({ ...repubPubliee, platform_fields: { old_listing_url: "https://www.vinted.fr/items/10700000001" } }, "x") === null);
ok("(9) … le lien NEUF de la republication → retrait par ce lien",
  ligne({ ...repubPubliee, listing_url: "https://www.vinted.fr/items/10700000009" }, "x", { identifiantsAvant: avant })?.platform_listing_id === "10700000009");
ok("(8) numerosVises : la lecture C par clé (numéros de l'ancienne annonce, jamais une URL entière)",
  JSON.stringify(essai(() => fn("numerosVises")(repub))) === JSON.stringify(["10700000001"]), JSON.stringify(essai(() => fn("numerosVises")(repub))));

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n2. Les VRAIS segments d'update-job-status, exécutés sur un faux serveur");
const ts = (await import("typescript")).default;
const ujs = lire("supabase/functions/update-job-status/index.ts");
const transpiler = async (source) => {
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
};
const noms = Object.keys(mod);

// Le faux serveur : cross_post_jobs et usage_logs (RLS : les lignes du compte), la RPC d'écriture qui fait ce que fait
// ecrire_statut_job_extension en prod (statut relu, refus s'il a changé, colonnes de la liste fermée). Chaque requête est
// notée (filtres, tri, borne, colonnes) ; un filtre inconnu jette.
function fauxServeur({ jobs, usage = [], panneInsert = false, refuserEcriture = false, statutInsert = null, panneLecture = null }) {
  const tables = { cross_post_jobs: jobs, usage_logs: usage };
  const inseres = [], requetes = [];
  const val = (r, c) => { const m = /^([a-z_]+)->(>?)([a-z_]+)$/.exec(c); if (!m) return r[c]; const v = r[m[1]]?.[m[3]]; return m[2] ? (v == null ? null : String(v)) : v; };
  const cmp = (a, b) => { const ta = Date.parse(a), tb = Date.parse(b); return Number.isFinite(ta) && Number.isFinite(tb) ? ta - tb : String(a).localeCompare(String(b)); };
  const colonne = (r, spec) => { const m = /^([a-z_]+):(.+)$/.exec(spec); return m ? [m[1], val(r, m[2]) ?? null] : [spec, r[spec] ?? null]; };
  const client = {
    from(table) {
      if (!(table in tables)) throw new Error(`faux serveur : table inattendue ${table}`);
      const q = { table, filtres: [(r) => r.user_id == null || r.user_id === U], desc: [], ordre: null, lim: null, colonnes: null, maj: null, ins: null };
      const note = (d) => { q.desc.push(d); return b; };
      const b = {
        select(cols = "*") { if (!q.maj && !q.ins) q.colonnes = cols === "*" ? null : String(cols).split(",").map((s) => s.trim()); return b; },
        eq(c, v) { q.filtres.push((r) => val(r, c) != null && String(val(r, c)) === String(v)); return note(`eq:${c}`); },
        neq(c, v) { q.filtres.push((r) => String(val(r, c)) !== String(v)); return note(`neq:${c}`); },
        in(c, vs) { const s = new Set(vs.map(String)); q.filtres.push((r) => val(r, c) != null && s.has(String(val(r, c)))); return note(`in:${c}`); },
        gte(c, v) { q.filtres.push((r) => val(r, c) != null && cmp(val(r, c), v) >= 0); return note(`gte:${c}`); },
        is(c, v) { if (v !== null) throw new Error(`is(${c}, ${v})`); q.filtres.push((r) => val(r, c) == null); return note(`is:${c}`); },
        order(c, { ascending = true } = {}) { q.ordre = [c, ascending]; return note(`order:${c}:${ascending ? "asc" : "desc"}`); },
        limit(k) { q.lim = k; return b; },
        update(p) { q.maj = p; return b; },
        insert(l) { q.ins = l; return b; },
        maybeSingle() { return b.then((r) => ({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error })); },
        single() { return b.maybeSingle(); },
        then(res, rej) {
          return Promise.resolve().then(() => {
            requetes.push(q);
            if (q.ins) {
              if (panneInsert) return { data: null, error: { message: "insertion refusée" } };
              const l = { id: `d0000${inseres.length + 1}-0000-4000-8000-000000000000`, created_at: new Date(T0).toISOString(), ...q.ins,
                ...(table === "cross_post_jobs" && statutInsert ? { status: statutInsert } : {}) };
              tables[table].push(l); if (table === "cross_post_jobs") inseres.push(l);
              return { data: [{ id: l.id, status: l.status ?? null }], error: null };
            }
            if (!q.maj && panneLecture && panneLecture(q)) return { data: null, error: { message: "lecture en panne" } };
            let rows = tables[table].filter((r) => q.filtres.every((f) => f(r)));
            if (q.maj) { for (const r of rows) Object.assign(r, structuredClone(q.maj)); return { data: rows.map((r) => ({ id: r.id })), error: null }; }
            if (q.ordre) { const [c, asc] = q.ordre; rows = [...rows].sort((x, y) => (asc ? 1 : -1) * cmp(x[c], y[c])); }
            const out = rows.slice(0, q.lim ?? Infinity);
            return { data: out.map((r) => (q.colonnes ? Object.fromEntries(q.colonnes.map((c) => colonne(r, c))) : structuredClone(r))), error: null };
          }).then(res, rej);
        },
      };
      return b;
    },
    async rpc() { throw new Error("rpc inattendue sur le client de la personne"); },
  };
  const admin = {
    from: client.from,
    async rpc(nom, a) {
      if (nom !== "ecrire_statut_job_extension") throw new Error(`rpc inattendue ${nom}`);
      const j = jobs.find((x) => x.id === a.p_job && x.user_id === a.p_user);
      if (!j) return { data: { ok: false, reason: "Job introuvable." }, error: null };
      if (refuserEcriture || j.status !== a.p_avant) return { data: { ok: false, reason: "Le job a changé entre-temps. Actualise la file." }, error: null };
      for (const c of ["status", "error", "platform_fields", "handler_build", "listing_url", "platform_listing_id", "published_at"]) if (c in a.p_patch) j[c] = structuredClone(a.p_patch[c]);
      return { data: { ok: true, job: { id: j.id, status: j.status } }, error: null };
    },
  };
  return { client, admin, inseres, tables, requetes };
}
const json = (b, st = 200) => ({ corps: b, statut: st });
const journaux = () => { const journal = [], erreurs = []; return { journal, erreurs, console: { log: (...a) => journal.push(a.join(" ")), warn: (...a) => journal.push(a.join(" ")), error: (...a) => erreurs.push(a.join(" ")) } }; };

// ── (a) La garde juste après controler_job_extension (point 3 : la racine de la résurrection) ──
const iG = ujs.indexOf("    if (!reservation?.ok) return json({ error: reservation?.reason");
const iGfin = ujs.indexOf("    // ══ (30/10, lot D) L'EXÉCUTANT CLOUD PREND SES JOBS");
ok("(a) la garde qui suit controler_job_extension est découpée dans update-job-status", iG > 0 && iGfin > iG, `${iG} / ${iGfin}`);
const { garde } = await transpiler(`export async function garde(ctx, deps) {
  const { userClient, user, jobId, status, json, console, reservation } = ctx;
  const { ${noms.join(", ")} } = deps;
  ${ujs.slice(iG, iGfin)}
  return null;
}`);
const passeLaGarde = async (enBase, status) => {
  const s = fauxServeur({ jobs: [structuredClone(enBase)] }); const j = journaux();
  const r = await garde({ userClient: s.client, user: { id: U }, jobId: enBase.id, status, json, console: j.console,
    reservation: { ok: true, reservation: null, statut: enBase.status } }, mod).catch((e) => ({ exception: String(e?.message ?? e) }));
  return { r, ...j };
};
for (const st of ["pending", "failed", "needs_user", "cancelled"]) {
  const { r } = await passeLaGarde(supprimee, st);
  ok(`(3) RACINE — « ${st} » sur une tâche annulée par la suppression de sa fiche → 409, rien n'est écrit (plus de résurrection)`,
    r?.statut === 409 && typeof r?.corps?.error === "string" && r.corps.error.length > 0, JSON.stringify(r));
}
{
  const { r } = await passeLaGarde(job({ status: "cancelled", inventaire_id: null, error: MSG_SANS_RETRAIT, platform_fields: { annonces_laissees_en_ligne: true } }), "pending");
  ok("(3) … aussi après « Supprimer la fiche, laisser les annonces en ligne » (fiche partie : rien à relancer)", r?.statut === 409, JSON.stringify(r));
}
ok("(3) … le « publié » passe (le filet A le rattrape), une autre annulation aussi, une tâche vivante aussi",
  (await passeLaGarde(supprimee, "published")).r === null
  && (await passeLaGarde(job({ status: "cancelled", error: "Annulée à cause d'autre chose" }), "pending")).r === null
  && (await passeLaGarde(job(), "pending")).r === null);
{
  // L'extension traite ce 409 (même forme que « Arrêtée à ta demande ») : erreur portant son statut, écritures en .catch,
  // ACK de démarrage « skipped », jamais de re-tentative (get-pending-jobs ne sert que « pending »). Lecture seule de l'extension.
  const bg = readFileSync(join(ICI, "chrome-extension/background.js"), "utf8").replace(/\r\n/g, "\n");
  ok("(3) l'extension lit ce 409 comme une erreur à statut, sans boucle (callEdgeFunction : err.status ; ACK refusé = skipped)",
    /if \(!res\.ok\) \{\n\s+const err = new Error\(data\?\.error \|\| `\$\{name\} → HTTP \$\{res\.status\}`\);[\s\S]{0,200}err\.status = res\.status;\n\s+throw err;/.test(bg)
    && /if \(e\?\.status === 409\) \{\n\s+console\.log\(`\[background\] Job \$\{job\.id\} : démarrage refusé par la base/.test(bg), "motif introuvable dans background.js");
}

// ── (b) Du filet « needs_user muet » jusqu'à la VRAIE réponse de la fonction ──
const iDebut = ujs.indexOf("    // ══ PLUS JAMAIS DE needs_user MUET");
const iRep = ujs.indexOf("    return json({ success: true, job: updated");
const iFin = iRep > 0 ? ujs.indexOf("\n", iRep) + 1 : -1;
ok("(b) le segment (filet needs_user muet → réponse finale) est découpé dans update-job-status", iDebut > 0 && iFin > iDebut, `${iDebut} / ${iFin}`);
const stubs = ["pfVendeurDepop", "pfIn", "controleVendeurPasse", "SOURCE_VENDEUR_DEPOP", "MOTIF_VENDEUR_DEPOP", "attentesVendeurDepop",
  "champsRepriseVendeurDepop", "archiverErreur", "attentesVendeurEbay", "champsRepriseVendeurEbay", "SOURCE_VENDEUR_EBAY",
  "inventaireVintedAEstampiller", "boutiqueVintedProuvee", "ficheVintedAMettreAJour", "raisonRequalif", "status"];
const { segment } = await transpiler(`export async function segment(ctx, deps) {
  const { userClient, adminReservation, user, jobId, posteReservation, reservation, body, json, console } = ctx;
  let { patch, statutEffectif, messageEffectif } = ctx;
  const { ${stubs.join(", ")} } = ctx.stubs;
  const { ${noms.join(", ")} } = deps;
  ${ujs.slice(iDebut, iFin)}
  return { pasDeReponse: true };
}`);
async function recu({ enBase, corps, usage = [], autres = [], opts = {}, statutEffectif = "published" }) {
  const row = structuredClone(enBase);
  const s = fauxServeur({ jobs: [row, ...autres.map((x) => structuredClone(x))], usage: usage.map((x) => ({ user_id: U, feature: "retrait_partout_compte_relie", ...x })), ...opts });
  const j = journaux();
  const patch = { status: statutEffectif, published_at: new Date(T0).toISOString(), error: null, listing_url: corps.listing_url ?? null,
    ...(corps.platform_listing_id ? { platform_listing_id: corps.platform_listing_id } : {}),
    platform_fields: corps.platform_fields ?? { processing_since: enBase.platform_fields?.processing_since ?? iso(8) }, handler_build: "test · v0.6.190" };
  const r = await segment({ userClient: s.client, adminReservation: s.admin, user: { id: U }, jobId: row.id, posteReservation: "poste-1",
    reservation: { ok: true, reservation: null, statut: enBase.status }, body: { status: "published", ...corps }, json, console: j.console,
    patch, statutEffectif, messageEffectif: null,
    stubs: { pfVendeurDepop: null, pfIn: null, controleVendeurPasse: () => false, SOURCE_VENDEUR_DEPOP: "x", MOTIF_VENDEUR_DEPOP: "x",
      attentesVendeurDepop: () => [], champsRepriseVendeurDepop: (p) => p, archiverErreur: (a) => a, attentesVendeurEbay: () => [],
      champsRepriseVendeurEbay: (p) => p, SOURCE_VENDEUR_EBAY: "x", inventaireVintedAEstampiller: null, boutiqueVintedProuvee: null,
      ficheVintedAMettreAJour: null, raisonRequalif: null, status: statutEffectif } }, mod).catch((e) => ({ exception: String(e?.message ?? e) }));
  return { r, row, s, ...j };
}
const URL1 = "https://www.leboncoin.fr/ad/vetements/3310000001";
{
  const { row, s, r, erreurs } = await recu({ enBase: supprimee, corps: { listing_url: URL1 } });
  ok("A — FICHE SUPPRIMÉE avec retrait pendant la tâche : le « publié » est écrit ET son retrait est armé aussitôt",
    row.status === "published" && s.inseres.length === 1 && s.inseres[0].action === "delete" && s.inseres[0].listing_url === URL1 && erreurs.length === 0,
    `statut ${row.status}, retraits armés ${s.inseres.length}, ${JSON.stringify(r).slice(0, 160)} ${erreurs.join(" | ")}`);
  ok("A — le serveur le dit : marque sur la tâche, journal retrait_annonces, ET la VRAIE réponse de la fonction (12)",
    row.platform_fields?.retrait_apres_publication?.retrait === s.inseres[0]?.id && row.platform_fields?.retrait_arme?.job === s.inseres[0]?.id
    && s.tables.usage_logs.some((l) => l.feature === "retrait_annonces" && l.metadata?.chemin === "publication_apres_retrait")
    && r?.statut === 200 && r?.corps?.success === true && r?.corps?.retrait_apres_publication?.retrait === s.inseres[0]?.id,
    JSON.stringify(r).slice(0, 240));
}
for (const [nom, pf] of [["suppression SANS retrait choisie (avec_retrait false)", marque(false)], ["annulation sans la marque", {}]]) {
  const { row, s, r } = await recu({ enBase: job({ status: "cancelled", inventaire_id: null, error: MSG_SUPPRESSION, platform_fields: pf }), corps: { listing_url: URL1 } });
  ok(`A (14) — ${nom} : publiée, AUCUN retrait armé, réponse sans retrait`, row.status === "published" && s.inseres.length === 0 && !r?.corps?.retrait_apres_publication,
    `retraits ${s.inseres.length}`);
}
{
  const { row, s } = await recu({ enBase: job(), corps: { listing_url: URL1 }, usage: [bilan([enCours])] });
  ok("B — la tâche EN COURS que la traversée a laissée finir publie → son retrait est armé aussitôt",
    row.status === "published" && s.inseres.length === 1 && s.inseres[0].platform_fields?.arme_par?.motif === "article_retire_partout_compte_relie",
    `statut ${row.status}, retraits armés ${s.inseres.length}`);
}
{
  const { s } = await recu({ enBase: job({ platform_fields: { processing_since: iso(2) } }), corps: { listing_url: URL1 }, usage: [bilan([enCours])] });
  ok("B (2) — relancée par la personne après le bilan (essai commencé après) → AUCUN retrait", s.inseres.length === 0, `retraits ${s.inseres.length}`);
}
{
  const URL2 = "https://www.vinted.fr/items/10700000009";
  // La colonne platform_listing_id porte encore l'ANCIEN numéro (republication) : le lien qui vient de partir prime.
  const { row, s } = await recu({ enBase: repub, corps: { listing_url: URL2 }, autres: [retraitDe("10700000001")] });
  ok("C — REPUBLICATION en vol, son annonce retirée pendant l'essai → l'annonce RECRÉÉE reçoit son retrait (son numéro, pas l'ancien)",
    row.status === "published" && s.inseres.length === 1 && s.inseres[0].listing_url === URL2 && s.inseres[0].platform_listing_id === "10700000009",
    `statut ${row.status}, retraits armés ${s.inseres.length} ${s.inseres.map((x) => `${x.listing_url} ${x.platform_listing_id}`).join(",")}`);
  const lectC = s.requetes.find((q) => q.table === "cross_post_jobs" && !q.maj && !q.ins && q.desc.includes("eq:action") && q.desc.includes("gte:created_at"));
  ok("C (8) — la lecture des retraits se fait PAR CLÉ (numéros de l'ancienne annonce), triée par date décroissante, bornée, colonnes minimales",
    !!lectC && lectC.desc.includes("in:platform_listing_id") && lectC.desc.includes("order:created_at:desc") && (lectC.lim ?? 999) <= 50
    && !(lectC.colonnes ?? ["*"]).includes("platform_fields") && !(lectC.colonnes ?? ["*"]).includes("*"),
    JSON.stringify(lectC ? { desc: lectC.desc, lim: lectC.lim, colonnes: lectC.colonnes } : null));
}
{
  // (9) La recréation n'a pas rendu de lien : les colonnes portent encore l'ANCIENNE annonce (retirée par la personne).
  const { row, s } = await recu({ enBase: repub, corps: { listing_url: "https://www.vinted.fr/items/10700000001" },
    autres: [retraitDe("10700000001", { status: "deleted" })] });
  ok("C (9) — republication publiée SANS lien neuf : jamais un retrait de l'ANCIENNE annonce ; « sans lien », la tâche le porte",
    s.inseres.length === 0 && !!row.platform_fields?.retrait_apres_publication_attendu, `${s.inseres.length} / ${JSON.stringify(row.platform_fields).slice(0, 160)}`);
}
{
  const { row, s } = await recu({ enBase: job(), corps: { listing_url: URL1 } });
  ok("témoin : une publication ordinaire → publiée, AUCUN retrait", row.status === "published" && s.inseres.length === 0, `retraits ${s.inseres.length}`);
}
{
  const { row, s } = await recu({ enBase: job({ status: "cancelled", inventaire_id: null, error: MSG_SANS_RETRAIT, platform_fields: { annonces_laissees_en_ligne: true } }), corps: { listing_url: URL1 } });
  ok("témoin : « laisser les annonces en ligne » → publiée, AUCUN retrait (le choix de la personne)", row.status === "published" && s.inseres.length === 0);
}
{
  const { row, s, journal } = await recu({ enBase: supprimee, corps: { listing_url: null, platform_fields: { processing_since: iso(8) } } });
  ok("sans lien ni numéro → aucun retrait (jamais par titre), la tâche est marquée (marque relue par 20261111180000) et le journal le dit",
    s.inseres.length === 0 && row.platform_fields?.retrait_apres_publication_attendu?.motif === "fiche_supprimee_pendant_la_tache"
    && journal.some((l) => /sans lien ni numéro/.test(l)), `${s.inseres.length} / ${JSON.stringify(row.platform_fields)}`);
}
{
  const { row, s, r } = await recu({ enBase: supprimee, corps: { listing_url: URL1 }, opts: { panneInsert: true } });
  ok("retrait refusé par la base → le « publié » reste écrit, la réponse est celle d'un succès (jamais un point de panne)",
    row.status === "published" && s.inseres.length === 0 && !r?.exception && r?.statut === 200 && !r?.corps?.retrait_apres_publication, JSON.stringify(r).slice(0, 160));
}
{
  const { row, s, r, journal } = await recu({ enBase: supprimee, corps: { listing_url: URL1 }, opts: { statutInsert: "cancelled" } });
  ok("(5) retrait NÉ CLOS (garde d'insertion) → pas de retrait_arme, pas de journal retrait_annonces, pas dans la réponse ; le journal le dit",
    !row.platform_fields?.retrait_arme && !row.platform_fields?.retrait_apres_publication
    && !s.tables.usage_logs.some((l) => l.feature === "retrait_annonces") && !r?.corps?.retrait_apres_publication && journal.some((l) => /né clos/.test(l)),
    JSON.stringify({ pf: row.platform_fields, rep: r?.corps }).slice(0, 240));
}
{
  const { s, r } = await recu({ enBase: supprimee, corps: { listing_url: URL1 }, opts: { refuserEcriture: true } });
  ok("écriture refusée (la tâche a changé) → 409 comme avant, aucun retrait armé", r?.statut === 409 && s.inseres.length === 0, JSON.stringify(r).slice(0, 160));
}
{
  const autres = Array.from({ length: 120 }, (_, k) => ({ id: `dz${k}`, user_id: U, inventaire_id: 1790000000000500 + k, platform: "leboncoin", action: "delete",
    status: "pending", created_at: iso(200 + k), listing_url: `https://www.leboncoin.fr/ad/vetements/${3320000000 + k}`, platform_listing_id: String(3320000000 + k), platform_fields: {} }));
  autres.push({ id: "d9", user_id: U, inventaire_id: null, platform: "leboncoin", action: "delete", status: "pending", created_at: iso(1),
    listing_url: URL1, platform_listing_id: "3310000001", platform_fields: {} });
  const { s } = await recu({ enBase: supprimee, corps: { listing_url: URL1 }, autres });
  ok("(6) un retrait déjà ouvert sur cette annonce, même derrière 120 autres retraits ouverts → pas de second (lecture par clé)", s.inseres.length === 0, `${s.inseres.length}`);
}
{
  const pf = { ...supprimee.platform_fields, retrait_apres_publication: { le: iso(2), motif: "fiche_supprimee_pendant_la_tache", retrait: "d77" }, retrait_arme: { job: "d77" } };
  const { s } = await recu({ enBase: { ...supprimee, status: "published", listing_url: URL1, platform_fields: pf }, corps: { listing_url: URL1 },
    usage: [bilan([enCours])], autres: [{ id: "d77", user_id: U, inventaire_id: null, platform: "leboncoin", action: "delete", status: "deleted", created_at: iso(2),
      listing_url: URL1, platform_listing_id: "3310000001", platform_fields: {} }] });
  ok("(7) idempotence — un second « publié » de la même tâche, retrait déjà fait → aucun retrait de plus", s.inseres.length === 0, `${s.inseres.length}`);
}
{
  const { s, journal, erreurs } = await recu({ enBase: supprimee, corps: { listing_url: URL1 },
    opts: { panneLecture: (q) => q.table === "cross_post_jobs" && (q.colonnes ?? []).includes("title") } });
  ok("(12) la relecture de la tâche après l'écriture échoue → aucun retrait, et le journal le dit", s.inseres.length === 0
    && [...journal, ...erreurs].some((l) => /relecture/.test(l) && /retrait/.test(l)), [...journal, ...erreurs].join(" | ").slice(0, 200));
}
{
  const { row, r } = await recu({ enBase: supprimee, corps: { listing_url: URL1 }, statutEffectif: "pending" });
  ok("(3) RACINE — une écriture REQUALIFIÉE (« publié » devenu « pending ») sur une tâche annulée par la suppression → 409, rien n'est écrit",
    r?.statut === 409 && row.status === "cancelled", `${JSON.stringify(r).slice(0, 160)} / ${row.status}`);
}
ok("(12) l'en-tête d'update-job-status dit la vérité sur verify_jwt (false, --no-verify-jwt, v188 lue le 11/11)",
  !/verify_jwt reste à true/.test(ujs) && /deploy update-job-status --no-verify-jwt[\s\S]{0,120}verify_jwt FALSE/.test(ujs.slice(0, 12000)),
  "en-tête : « verify_jwt reste à true » encore là, ou « --no-verify-jwt … verify_jwt FALSE » absent");

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n3. La base jetable : la marque d'annulation (14) et le lecteur du lien tardif (4) — migration 20261111180000");
{
  const banc = join(ICI, "scripts/essais/20261111180000_banc.mjs");
  if (!existsSync(join(ROOT, "scripts/essais/20261111180000_banc.mjs"))) ok("le banc de la migration existe", false, "scripts/essais/20261111180000_banc.mjs");
  else {
    const r = spawnSync(process.execPath, [banc], { env: { ...process.env, SELFTEST_RACINE: ROOT }, encoding: "utf8", timeout: 300_000 });
    const lignes = String(r.stdout ?? "").split("\n");
    const bilanBanc = lignes.filter((l) => /^BANC /.test(l)).slice(-1)[0] ?? "";
    for (const l of lignes.filter((x) => /^\s+✗/.test(x)).slice(0, 8)) console.log(`      ${l.trim()}`);
    ok(`le banc sur Postgres jetable est VERT (${bilanBanc || "aucun bilan"})`, r.status === 0 && /VERT/.test(bilanBanc),
      `exit ${r.status} ${String(r.stderr ?? "").split("\n").slice(0, 3).join(" | ")}`);
  }
}

console.log(`\n${ko ? "ROUGE" : "VERT"} — ${n - ko}/${n} contrôles`);
process.exit(ko ? 1 : 0);
