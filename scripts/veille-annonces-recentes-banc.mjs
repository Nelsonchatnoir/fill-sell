// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// BANC — migration 20261114013000_veille_annonces_recentes (14/11, bloc C2) sur un VRAI Postgres JETABLE — JAMAIS la prod.
//   node scripts/veille-annonces-recentes-banc.mjs                 (un Postgres embarqué neuf, effacé à la fin)
//   PREUVE_PG=postgres://… node scripts/veille-annonces-recentes-banc.mjs   (un Postgres jetable déjà lancé)
// Les corps de PROD viennent de scripts/essais/fixtures/prod-1411-veille-recentes/fonctions.json (pg_get_functiondef relu
// en prod le 13/11, lecture seule ; aucune donnée de client) ; leurs md5 sont revérifiés ici.
// A. la PROD : une annonce apportée par un relevé « recentes » ne fait jamais de fiche (ni geste ni exception) ;
// B. la migration : la porte (tri des numéros, gardes, relevé d'une page), la clôture (« incomplete », jamais « done »),
//    le réveil du moteur, l'import permis au seul relevé « recentes » CLOS, l'attente du moteur pendant l'écriture ;
//    les corps de prod gardés ligne pour ligne ;
// C. l'inverse : les deux corps reviennent à l'octet (md5 de prod), le reste part ;
// D. la migration rejouée : idempotente.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const MIGRATION = lire("supabase/migrations/20261114013000_veille_annonces_recentes.sql");
const INVERSE = lire("supabase/rollbacks/20261114013000_veille_annonces_recentes_INVERSE.sql");
const PROD = JSON.parse(lire("scripts/essais/fixtures/prod-1411-veille-recentes/fonctions.json")).fonctions;

let pgsrv = null;
let dossier = null;
let url = process.env.PREUVE_PG;
if (url && /supabase\.(co|com)/.test(url)) { console.error("PREUVE_PG : un Postgres JETABLE (jamais la prod)."); process.exit(2); }
if (!url) {
  let EmbeddedPostgres;
  try { EmbeddedPostgres = (await import("embedded-postgres")).default; }
  catch { console.error("embedded-postgres absent (node_modules) : banc non joué."); process.exit(2); }
  const port = 55400 + Math.floor(Math.random() * 90);
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), "pg-veille-recentes-"));
  pgsrv = new EmbeddedPostgres({ databaseDir: dossier, user: "postgres", password: "banc", port, persistent: false,
    onLog: () => {}, initdbFlags: ["--encoding=UTF8", "--locale=C"] });
  await pgsrv.initialise();
  await pgsrv.start();
  url = `postgres://postgres:banc@127.0.0.1:${port}/postgres`;
}
const { Client } = require("pg");
const db = new Client({ connectionString: url });
await db.connect();
let verts = 0;
let rouges = 0;
const ok = (m, c, d) => { if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 300)}`}`); } };
const q = async (sql, params) => (await db.query(sql, params)).rows;
const v = async (sql, params) => Object.values((await q(sql, params))[0] ?? {})[0];
const md5 = (sig) => v(`SELECT md5(pg_get_functiondef('public.${sig}'::regprocedure))`);
const existe = (sig) => v(`SELECT to_regprocedure('public.${sig}') IS NOT NULL`);
const commeUser = (u) => q("SELECT set_config('request.jwt.claim.sub', $1, false)", [u]);

try {
  // ── Le socle : rôles, auth.uid(), les tables réduites aux colonnes lues, les dépendances en bouchons ──────────────
  await db.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;
    DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; SET search_path TO public;
    CREATE TABLE coin_config (key text PRIMARY KEY, value integer, updated_at timestamptz DEFAULT now());
    CREATE TABLE profiles (id uuid PRIMARY KEY, palier text, platform_settings jsonb, vinted_sync_pin jsonb);
    CREATE TABLE inventaire (id bigserial PRIMARY KEY, user_id uuid, titre text, origine text, statut text DEFAULT 'stock',
      vinted_item_id text, fusionne_dans bigint, created_at timestamptz DEFAULT now());
    CREATE TABLE cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, inventaire_id bigint, platform text,
      action text, status text, platform_listing_id text, platform_fields jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());
    CREATE TABLE sync_import_ecartes (id bigserial PRIMARY KEY, user_id uuid, vinted_item_id text, vinted_status text, titre text,
      motif text, created_at timestamptz DEFAULT now());
    CREATE TABLE vinted_sync_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, kind text NOT NULL DEFAULT 'dressing',
      status text NOT NULL DEFAULT 'running', declencheur text, page_suivante integer NOT NULL DEFAULT 1, total_pages integer,
      total_entries integer, items_vus integer, items_crees integer, items_maj integer, erreur text, extension_build text,
      started_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), finished_at timestamptz, queued_at timestamptz,
      claimed_at timestamptz, vinted_user_id text, vinted_login text, platform text NOT NULL DEFAULT 'vinted', progres_le timestamptz,
      compte_plateforme text);
    CREATE UNIQUE INDEX vinted_sync_runs_un_seul_actif ON vinted_sync_runs (user_id, kind, platform) WHERE status IN ('queued', 'running');
    CREATE TABLE annonces_plateforme (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, listing_id text,
      url text, titre text, prix numeric, photo_url text, statut_plateforme text, inventaire_id bigint, job_id uuid,
      source_rapprochement text, proposition jsonb, ignoree_le timestamptz, run_id uuid, vu_le timestamptz, disparu_le timestamptz,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), fiche_supprimee_le timestamptz, retiree_le timestamptz,
      publiee_le timestamptz, compte_plateforme text, UNIQUE (user_id, platform, listing_id));
    CREATE TABLE rapprochements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, annonce_id uuid, inventaire_id bigint,
      decision text, par text, created_at timestamptz DEFAULT now());
    CREATE TABLE pause_releves (user_id uuid, platforms text[], motif text, cree_le timestamptz DEFAULT now(), leve_le timestamptz);
    CREATE TABLE rapprochement_comptes (user_id uuid PRIMARY KEY, etat text, vinted_juge_le timestamptz);
    CREATE TABLE banc_journal (quoi text, user_id uuid, detail text, le timestamptz DEFAULT clock_timestamp());
    -- Bouchons des dépendances (leur logique n'est pas l'objet du banc)
    CREATE FUNCTION palier_de(p_user uuid) RETURNS text LANGUAGE sql STABLE AS $$ SELECT palier FROM profiles WHERE id = p_user $$;
    CREATE FUNCTION boutique_vinted_autre_compte(p_user uuid, p_boutique text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION _ts_ou_null(t text) RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN t ~ '^\\d{4}-' THEN t::timestamptz END $$;
    CREATE FUNCTION republication_retrait_engage(pf jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT pf ? 'deleted_at' $$;
    CREATE FUNCTION releve_run_hors_liste(p_run uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION releve_ebay_run_bloque(p_run uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION releve_dette_beebs_depuis(p_user uuid, p_t timestamptz) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION opla_sortie_passee() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION rapprochement_v3_vinted_depuis(p_user uuid) RETURNS timestamptz LANGUAGE sql STABLE AS $$ SELECT timestamptz '2026-10-07 23:30:00+00' $$;
    CREATE FUNCTION rapprochement_v3_fiches_main_depuis(p_user uuid) RETURNS timestamptz LANGUAGE sql STABLE AS $$ SELECT now() $$;
    CREATE FUNCTION rapprochement_demander(p_user uuid, p_motif text) RETURNS void LANGUAGE sql AS $$ INSERT INTO banc_journal VALUES ('demander', p_user, p_motif) $$;
    CREATE FUNCTION rapprochement_relancer(p_user uuid) RETURNS void LANGUAGE sql AS $$ INSERT INTO banc_journal VALUES ('relancer', p_user, null) $$;
    CREATE FUNCTION rapprocher_importer(p_user uuid, p_annonce uuid, p_par text) RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE v bigint; BEGIN
      INSERT INTO inventaire (user_id, titre, origine) SELECT p_user, a.titre, 'releve_' || a.platform FROM annonces_plateforme a WHERE a.id = p_annonce RETURNING id INTO v;
      UPDATE annonces_plateforme SET inventaire_id = v WHERE id = p_annonce;
      INSERT INTO banc_journal VALUES ('importer', p_user, p_annonce::text);
      RETURN jsonb_build_object('ok', true, 'inventaire_id', v);
    END $$;
  `);
  for (const [sig, f] of Object.entries(PROD)) await db.query(f.def);
  for (const [sig, f] of Object.entries(PROD)) {
    if (["rapprochement_v3_fiche_de(uuid,uuid,boolean)", "rapprochement_v3_releves_en_cours(uuid)", "rapprochement_fin_run()"].includes(sig)) {
      ok(`prod : ${sig} reproduit à l'octet (md5 ${f.md5.slice(0, 8)}…)`, (await md5(sig)) === f.md5, await md5(sig));
    }
  }
  // Le déclencheur de prod sur la fin des relevés complets (pour la comparaison)
  await db.query(`CREATE TRIGGER trg_rapprochement_fin_run AFTER UPDATE OF status ON vinted_sync_runs FOR EACH ROW
    WHEN (((old.status IS DISTINCT FROM new.status) AND (new.status <> ALL (ARRAY['queued'::text, 'running'::text])) AND (new.kind = ANY (ARRAY['annonces'::text, 'dressing'::text]))))
    EXECUTE FUNCTION rapprochement_fin_run()`);
  await db.query("INSERT INTO coin_config (key, value) VALUES ('import_auto_ouvert', 1)");

  const U = "c2c2c2c2-0000-4000-8000-000000000001";   // compte payant, boutique Vinted confirmée
  const G = "c2c2c2c2-0000-4000-8000-000000000002";   // compte gratuit
  const BOUT = "4400000001";
  await q(`INSERT INTO profiles (id, palier, platform_settings, vinted_sync_pin) VALUES
    ($1, 'pro', '{}'::jsonb, jsonb_build_object('v', '2', 'boutiques', jsonb_build_array(jsonb_build_object('user_id', $3::text)))),
    ($2, 'free', '{}'::jsonb, NULL)`, [U, G, BOUT]);

  // Une annonce Leboncoin apportée par un relevé « recentes » clos (forme qu'écrira la 0.6.187+) : la prod la refuse.
  const runR = await v(`INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur) VALUES ($1, 'recentes', 'leboncoin', 'incomplete', 'veille:recentes') RETURNING id`, [U]);
  const annR = await v(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, titre, statut_plateforme, run_id, vu_le) VALUES ($1, 'leboncoin', '3300000001', 'Lampe', 'en_ligne', $2, now()) RETURNING id`, [U, runR]);
  console.log("\nA. La PROD : l'annonce d'un relevé « recentes » ne fait jamais de fiche ; le moteur n'attend pas ce relevé");
  ok("prod : rapprochement_v3_fiche_de (hors geste) refuse l'annonce du relevé « recentes »", (await v("SELECT rapprochement_v3_fiche_de($1, $2, false)", [U, annR])) === null);
  await q("UPDATE vinted_sync_runs SET status = 'running' WHERE id = $1", [runR]);
  ok("prod : un relevé « recentes » en cours ne retient pas le moteur", (await v("SELECT rapprochement_v3_releves_en_cours($1)", [U])) === false);
  ok("prod : la porte n'existe pas", !(await existe("veille_recentes_ouvrir(text,text[],text,text)")));
  await q("DELETE FROM annonces_plateforme; DELETE FROM vinted_sync_runs; DELETE FROM banc_journal;");

  console.log("\nB. La migration");
  await db.query(MIGRATION);
  ok("appliquée (garde md5 passée), interrupteur posé FERMÉ", (await v("SELECT value FROM coin_config WHERE key = 'veille_recentes_ouverte'")) === 0);
  for (const sig of ["rapprochement_v3_fiche_de(uuid,uuid,boolean)", "rapprochement_v3_releves_en_cours(uuid)"]) {
    const neuf = await v(`SELECT pg_get_functiondef('public.${sig}'::regprocedure)`);
    // (releves_en_cours : la dernière ligne de prod perd son « ; », l'ajout la suit — comparée sans lui)
    const sansPv = (l) => l.replace(/;$/, "");
    const lignes = PROD[sig].def.split("\n").map(sansPv);
    let i = 0;
    for (const l of neuf.split("\n").map(sansPv)) if (i < lignes.length && l === lignes[i]) i++;
    ok(`${sig} : chaque ligne de prod gardée, dans l'ordre (ajouts seulement)`, i === lignes.length, `${i}/${lignes.length}`);
    const attendu = { "rapprochement_v3_fiche_de(uuid,uuid,boolean)": "@MD5_FICHE_DE@", "rapprochement_v3_releves_en_cours(uuid)": "@MD5_EN_COURS@" }[sig];
    const apres = await md5(sig);
    ok(`${sig} : md5 après migration = celui que la garde accepte au rejeu (${apres.slice(0, 8)}…)`, MIGRATION.includes(`'${apres}'`), apres);
    void attendu;
  }
  await commeUser(U);
  ok("fermée : la porte refuse (« fermee »), aucun relevé", (await v("SELECT veille_recentes_ouvrir('vinted', ARRAY['90000000001'], $1, 'banc') ->> 'motif'", [BOUT])) === "fermee"
    && (await v("SELECT count(*)::int FROM vinted_sync_runs")) === 0);
  ok("fermée : les droits le disent à l'extension", (await v("SELECT veille_recentes_droits() ->> 'ouverte'")) === "false");
  await q("UPDATE coin_config SET value = 1 WHERE key = 'veille_recentes_ouverte'");
  ok("ouverte : les droits le disent", (await v("SELECT veille_recentes_droits() ->> 'ouverte'")) === "true");

  // Le tri : ce qui fait connaître un numéro
  const inv = await v("INSERT INTO inventaire (user_id, vinted_item_id, origine) VALUES ($1, '90000000010', 'vinted_sync') RETURNING id", [U]);
  await q(`INSERT INTO cross_post_jobs (user_id, platform, action, status, platform_listing_id, platform_fields) VALUES
    ($1, 'vinted', 'publish', 'published', '90000000011', '{}'),
    ($1, 'vinted', 'publish', 'cancelled', '90000000012', '{}'),          -- tâche de suivi d'un import dont la fiche a été supprimée
    ($1, 'vinted', 'republish', 'published', '0', '{"copie_par_numero": {"id": "90000000013"}}'),
    ($1, 'leboncoin', 'publish', 'published', NULL, '{"lbc_depot": {"adsubmit": {"id": "3300000011"}}}')`, [U]);
  await q(`INSERT INTO sync_import_ecartes (user_id, vinted_item_id, motif) VALUES ($1, '90000000014', 'brouillon'),
    ($1, '3300000012', 'compte_relie:leboncoin'), ($1, '90000000015', 'autre_compte:leboncoin')`, [U]);
  const runCron = await v("INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur) VALUES ($1, 'annonces', 'leboncoin', 'done', 'cron') RETURNING id", [U]);
  await q(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, statut_plateforme, run_id, inventaire_id, ignoree_le, fiche_supprimee_le, proposition) VALUES
    ($1, 'leboncoin', '3300000013', 'en_ligne', $2, $3, NULL, NULL, NULL),
    ($1, 'leboncoin', '3300000014', 'en_ligne', $2, NULL, now(), NULL, NULL),
    ($1, 'leboncoin', '3300000015', 'en_ligne', $2, NULL, NULL, now(), NULL),
    ($1, 'leboncoin', '3300000016', 'en_ligne', $2, NULL, NULL, NULL, '{"motif": "doute"}'),
    ($1, 'leboncoin', '3300000017', 'en_ligne', $2, NULL, NULL, NULL, NULL),          -- orpheline d'un relevé de veille, jamais décidée
    ($1, 'leboncoin', '3300000018', 'en_ligne', $2, NULL, NULL, NULL, NULL)`, [U, runCron, inv]);
  await q("INSERT INTO rapprochements (user_id, annonce_id, decision, par) SELECT $1, id, 'ignore', 'utilisateur' FROM annonces_plateforme WHERE listing_id = '3300000018'", [U]);
  const tri = async (pf, ids) => Object.fromEntries((await q("SELECT listing_id, connu FROM veille_recentes_trier($1, $2, $3)", [U, pf, ids])).map((r) => [r.listing_id, r.connu]));
  const tV = await tri("vinted", ["90000000010", "90000000011", "90000000012", "90000000013", "90000000014", "90000000015", "90000000016", "12", "abc"]);
  ok("Vinted : fiche, tâche (publiée, close, copie rendue), écart → connus ; le neuf → inconnu ; l'illisible ignoré",
    tV["90000000010"] === "fiche" && tV["90000000011"] === "tache" && tV["90000000012"] === "tache" && tV["90000000013"] === "tache"
    && tV["90000000014"] === "ecartee" && tV["90000000016"] === null && !("12" in tV) && !("abc" in tV), tV);
  ok("Vinted : un écart d'une AUTRE plateforme ne fait pas connaître un numéro Vinted", tV["90000000015"] === null, tV);
  const tL = await tri("leboncoin", ["3300000011", "3300000012", "3300000013", "3300000014", "3300000015", "3300000016", "3300000017", "3300000018", "3300000019"]);
  ok("Leboncoin : dépôt (numéro rendu), écart, rattachée, ignorée, fiche supprimée, question, décision → connus",
    tL["3300000011"] === "tache" && tL["3300000012"] === "ecartee" && tL["3300000013"] === "annonce" && tL["3300000014"] === "annonce"
    && tL["3300000015"] === "annonce" && tL["3300000016"] === "annonce" && tL["3300000018"] === "annonce", tL);
  ok("Leboncoin : l'orpheline jamais décidée et le numéro neuf → inconnus", tL["3300000017"] === null && tL["3300000019"] === null, tL);

  // Les gardes de la porte
  const porte = async (pf, ids, compte = BOUT) => (await q("SELECT veille_recentes_ouvrir($1, $2, $3, 'banc') r", [pf, ids, compte]))[0].r;
  await commeUser(G);
  ok("compte gratuit : « palier »", (await porte("vinted", ["90000000016"]))?.motif === "palier");
  await commeUser(U);
  ok("boutique Vinted non confirmée : « boutique », rien d'ouvert", (await porte("vinted", ["90000000016"], "4400009999"))?.motif === "boutique");
  await q("UPDATE profiles SET platform_settings = '{\"plateformes_ecartees\": [\"leboncoin\"]}' WHERE id = $1", [U]);
  ok("plateforme écartée : « ecartee »", (await porte("leboncoin", ["3300000019"]))?.motif === "ecartee");
  await q("UPDATE profiles SET platform_settings = '{}' WHERE id = $1", [U]);
  await q("INSERT INTO pause_releves (user_id, platforms) VALUES ($1, ARRAY['leboncoin'])", [U]);
  ok("pause des relevés : « pause_releves »", (await porte("leboncoin", ["3300000019"]))?.motif === "pause_releves");
  await q("DELETE FROM pause_releves");
  const dress = await v("INSERT INTO vinted_sync_runs (user_id, kind, status, declencheur) VALUES ($1, 'dressing', 'running', 'bouton') RETURNING id", [U]);
  ok("relevé du dressing en cours : « releve_en_cours » (c'est lui qui lira)", (await porte("vinted", ["90000000016"]))?.motif === "releve_en_cours");
  await q("UPDATE vinted_sync_runs SET status = 'done' WHERE id = $1", [dress]);
  const rep = await v(`INSERT INTO cross_post_jobs (user_id, platform, action, status, platform_listing_id, platform_fields)
    VALUES ($1, 'vinted', 'republish', 'needs_user', '90000000020', '{"republish_step": "deleted", "deleted_at": "2026-11-13T10:00:00Z"}') RETURNING id`, [U]);
  ok("republication engagée (retrait fait) : « republication »", (await porte("vinted", ["90000000016"]))?.motif === "republication");
  await q("UPDATE cross_post_jobs SET status = 'published', platform_fields = '{\"republish_step\": \"recreated\"}' WHERE id = $1", [rep]);
  const enCours = await v("INSERT INTO cross_post_jobs (user_id, platform, action, status) VALUES ($1, 'vinted', 'publish', 'processing') RETURNING id", [U]);
  ok("dépôt en cours sur la plateforme : « tache_en_cours »", (await porte("vinted", ["90000000016"]))?.motif === "tache_en_cours");
  await q("UPDATE cross_post_jobs SET status = 'published', platform_listing_id = '90000000021' WHERE id = $1", [enCours]);

  // Rien d'inconnu : rien d'écrit
  const avantRuns = await v("SELECT count(*)::int FROM vinted_sync_runs");
  const r0 = await porte("vinted", ["90000000010", "90000000011", "90000000014"]);
  ok("tout est connu : ok, aucun inconnu, AUCUN relevé ouvert", r0?.ok === true && r0.inconnus.length === 0 && !r0.run_id
    && (await v("SELECT count(*)::int FROM vinted_sync_runs")) === avantRuns, r0);
  ok("les raisons sont comptées", r0?.connus?.fiche === 1 && r0?.connus?.tache === 1 && r0?.connus?.ecartee === 1, r0?.connus);

  // Des inconnus : le relevé d'une page
  const r1 = await porte("vinted", ["90000000016", "90000000010", "90000000017"]);
  ok("des inconnus : le relevé d'une page, genre « recentes », déclencheur « veille:recentes », en cours",
    r1?.ok === true && JSON.stringify(r1.inconnus) === JSON.stringify(["90000000016", "90000000017"]) && !!r1.run_id
    && (await v("SELECT kind || '/' || declencheur || '/' || status || '/' || platform FROM vinted_sync_runs WHERE id = $1", [r1.run_id])) === "recentes/veille:recentes/running/vinted", r1);
  ok("un second passage pendant celui-ci : « releve_en_cours » (un seul à la fois)", (await porte("vinted", ["90000000018"]))?.motif === "releve_en_cours");
  ok("le moteur attend ce relevé en cours", (await v("SELECT rapprochement_v3_releves_en_cours($1)", [U])) === true);
  await q("DELETE FROM banc_journal");
  await q("INSERT INTO inventaire (user_id, vinted_item_id, origine) VALUES ($1, '90000000016', 'vinted_sync')", [U]);   // l'import du dressing
  const c1 = (await q("SELECT veille_recentes_clore($1, $2) r", [r1.run_id, { ok: true, crees: 1, ecrites: 1, note: "Vinted : 2 inconnu(s), 1 fiche" }]))[0].r;
  const run1 = (await q("SELECT status, erreur, items_crees, finished_at FROM vinted_sync_runs WHERE id = $1", [r1.run_id]))[0];
  ok("la clôture : « incomplete », « [incomplet] [veille_recentes] … » — jamais « done »", c1?.ok === true && run1.status === "incomplete"
    && /^\[incomplet\] \[veille_recentes\] première page seulement — /.test(run1.erreur) && run1.items_crees === 1 && !!run1.finished_at, run1);
  ok("sa fin réveille le moteur (rapprochement_fin_run de prod : demander + relancer)",
    (await v("SELECT string_agg(quoi || ':' || coalesce(detail, ''), ',' ORDER BY le) FROM banc_journal")) === "demander:fin_run:vinted,relancer:");
  ok("le moteur n'attend plus", (await v("SELECT rapprochement_v3_releves_en_cours($1)", [U])) === false);
  ok("clore deux fois : rien (le relevé n'est plus en cours)", (await q("SELECT veille_recentes_clore($1, '{\"ok\": true}') r", [r1.run_id]))[0].r?.ok === false);
  await commeUser(G);
  const rAutre = await v("INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur) VALUES ($1, 'recentes', 'vinted', 'running', 'veille:recentes') RETURNING id", [U]);
  ok("un autre compte ne clôt jamais ce relevé", (await q("SELECT veille_recentes_clore($1, '{\"ok\": true}') r", [rAutre]))[0].r?.ok === false
    && (await v("SELECT status FROM vinted_sync_runs WHERE id = $1", [rAutre])) === "running");
  await commeUser(U);
  ok("raté : « failed », jamais un verdict", (await q("SELECT veille_recentes_clore($1, '{\"ok\": false, \"note\": \"base\"}') r", [rAutre]))[0].r?.statut === "failed");
  // Un passage figé : clos par le suivant
  const fige = await v("INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, started_at, updated_at, progres_le) VALUES ($1, 'recentes', 'vinted', 'running', 'veille:recentes', now() - interval '20 minutes', now() - interval '20 minutes', now() - interval '20 minutes') RETURNING id", [U]);
  await q("UPDATE vinted_sync_runs SET progres_le = now() - interval '20 minutes', updated_at = now() - interval '20 minutes' WHERE id = $1", [fige]);
  const r2 = await porte("vinted", ["90000000019"]);
  ok("un passage figé (> 10 min) ne retient jamais le suivant : clos « expired », un nouveau s'ouvre",
    (await v("SELECT status FROM vinted_sync_runs WHERE id = $1", [fige])) === "expired" && r2?.ok === true && !!r2.run_id, r2);
  await q("SELECT veille_recentes_clore($1, '{\"ok\": true}')", [r2.run_id]);

  // Leboncoin : deux comptes ne se mélangent jamais (règle du 08/11)
  await q("INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, compte_plateforme, started_at) VALUES ($1, 'annonces', 'leboncoin', 'done', 'cron', 'lbc-compte-1', now() - interval '3 hours')", [U]);
  ok("Leboncoin : compte de la page illisible → « compte_inconnu »", (await porte("leboncoin", ["3300000019"], null))?.motif === "compte_inconnu");
  ok("Leboncoin : un AUTRE compte que celui du dernier relevé complet → « compte_change », rien d'ouvert",
    (await porte("leboncoin", ["3300000019"], "lbc-autre-2"))?.motif === "compte_change");

  // Leboncoin : l'import permis au SEUL relevé « recentes » CLOS
  const r3 = await porte("leboncoin", ["3300000017", "3300000019", "3300000013"], "lbc-compte-1");
  ok("Leboncoin : l'orpheline et le neuf, pas la rattachée ; le compte de la page sur le relevé", r3?.ok === true
    && JSON.stringify(r3.inconnus) === JSON.stringify(["3300000017", "3300000019"])
    && (await v("SELECT compte_plateforme FROM vinted_sync_runs WHERE id = $1", [r3.run_id])) === "lbc-compte-1", r3);
  await q("UPDATE annonces_plateforme SET run_id = $2, vu_le = now() WHERE user_id = $1 AND listing_id = '3300000017'", [U, r3.run_id]);
  const a19 = await v("INSERT INTO annonces_plateforme (user_id, platform, listing_id, titre, statut_plateforme, run_id, vu_le) VALUES ($1, 'leboncoin', '3300000019', 'Vase', 'en_ligne', $2, now()) RETURNING id", [U, r3.run_id]);
  ok("relevé « recentes » encore en cours : aucune fiche (hors geste)", (await v("SELECT rapprochement_v3_fiche_de($1, $2, false)", [U, a19])) === null);
  await q("SELECT veille_recentes_clore($1, '{\"ok\": true, \"ecrites\": 2}')", [r3.run_id]);
  const f19 = await v("SELECT rapprochement_v3_fiche_de($1, $2, false)", [U, a19]);
  ok("relevé « recentes » CLOS : la fiche passe par rapprocher_importer (comme « Synchroniser »)", f19 !== null
    && (await v("SELECT count(*)::int FROM banc_journal WHERE quoi = 'importer'")) === 1, f19);
  const runEchec = await v("INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, erreur) VALUES ($1, 'recentes', 'leboncoin', 'failed', 'veille:recentes', '[veille_recentes] échec') RETURNING id", [U]);
  const aE = await v("INSERT INTO annonces_plateforme (user_id, platform, listing_id, statut_plateforme, run_id) VALUES ($1, 'leboncoin', '3300000020', 'en_ligne', $2) RETURNING id", [U, runEchec]);
  ok("relevé « recentes » RATÉ : aucune fiche", (await v("SELECT rapprochement_v3_fiche_de($1, $2, false)", [U, aE])) === null);
  const runCron2 = await v("INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, erreur) VALUES ($1, 'annonces', 'leboncoin', 'incomplete', 'veille:recentes', '[incomplet]') RETURNING id", [U]);
  const aC = await v("INSERT INTO annonces_plateforme (user_id, platform, listing_id, statut_plateforme, run_id) VALUES ($1, 'leboncoin', '3300000021', 'en_ligne', $2) RETURNING id", [U, runCron2]);
  ok("le déclencheur seul ne suffit pas : un relevé complet (« annonces ») qui le porterait n'importe pas", (await v("SELECT rapprochement_v3_fiche_de($1, $2, false)", [U, aC])) === null);
  const aCron = await v("SELECT id FROM annonces_plateforme WHERE listing_id = '3300000018'");
  await q("DELETE FROM rapprochements");
  ok("inchangé : l'annonce d'un relevé de veille (cron) ne fait pas de fiche hors geste", (await v("SELECT rapprochement_v3_fiche_de($1, $2, false)", [U, aCron])) === null);
  ok("inchangé : sur un geste, elle en fait une", (await v("SELECT rapprochement_v3_fiche_de($1, $2, true)", [U, aCron])) !== null);
  ok("aucune table de pièces ni de quota n'est nommée par la migration", !/coin_balance|spend_coins|coins_|quota|credits/i.test(MIGRATION.replace(/^--.*$/gm, "")));
  const misesAJour = [...MIGRATION.replace(/^\s*--.*$/gm, "").matchAll(/\bUPDATE\s+(?!OF\b)([a-z_.]+)/g)].map((m) => m[1]);
  ok("la migration ne réécrit aucune autre ligne que celles des relevés « recentes » (figé, clôture)",
    misesAJour.length === 2 && misesAJour.every((t) => t === "vinted_sync_runs"), misesAJour);

  console.log("\nC. L'inverse");
  await db.query(INVERSE);
  ok("rapprochement_v3_fiche_de revenu à l'octet (md5 de prod)", (await md5("rapprochement_v3_fiche_de(uuid,uuid,boolean)")) === PROD["rapprochement_v3_fiche_de(uuid,uuid,boolean)"].md5);
  ok("rapprochement_v3_releves_en_cours revenu à l'octet (md5 de prod)", (await md5("rapprochement_v3_releves_en_cours(uuid)")) === PROD["rapprochement_v3_releves_en_cours(uuid)"].md5);
  ok("porte, tri, droits, clôture retirés", !(await existe("veille_recentes_ouvrir(text,text[],text,text)")) && !(await existe("veille_recentes_trier(uuid,text,text[])"))
    && !(await existe("veille_recentes_droits()")) && !(await existe("veille_recentes_clore(uuid,jsonb)")));
  ok("déclencheur retiré, interrupteur effacé", (await v("SELECT count(*)::int FROM pg_trigger WHERE tgname = 'trg_rapprochement_fin_recentes'")) === 0
    && (await v("SELECT count(*)::int FROM coin_config WHERE key = 'veille_recentes_ouverte'")) === 0);

  console.log("\nD. La migration rejouée (deux fois)");
  await db.query(MIGRATION);
  await db.query(MIGRATION);
  ok("idempotente : un seul déclencheur, l'interrupteur fermé", (await v("SELECT count(*)::int FROM pg_trigger WHERE tgname = 'trg_rapprochement_fin_recentes'")) === 1
    && (await v("SELECT value FROM coin_config WHERE key = 'veille_recentes_ouverte'")) === 0);
} catch (e) {
  rouges++;
  console.log(`  ✗ exception : ${String(e?.message ?? e)}`);
} finally {
  await db.end().catch(() => {});
  if (pgsrv) { await pgsrv.stop().catch(() => {}); fs.rmSync(dossier, { recursive: true, force: true }); }
}
console.log(rouges ? `\n✗ banc : ${rouges} rouge(s), ${verts} vert(s)` : `\n✓ banc de la veille des annonces récentes : ${verts} verts`);
process.exit(rouges ? 1 : 0);
