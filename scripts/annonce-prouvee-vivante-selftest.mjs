// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// VERROU — « plus jamais de fiche recréée depuis une annonce non prouvée vivante » (14/11/2026, demande 2 de Nico ;
// compte 13e274de, Beebs, Cloud). Migration 20261114163000_annonce_prouvee_vivante, jouée sur un VRAI Postgres JETABLE
// (jamais la prod) avec les corps de PROD relus le 14/11 (scripts/essais/fixtures/prod-1411-preuve-de-vie/fonctions.json,
// md5 revérifiés), puis le vrai moteur (moteur.js, construireNoeuds) sur ce que rend rapprochement_v3_lire.
//   npm run selftest:annonce-prouvee-vivante                 (un Postgres embarqué neuf, dans .tmp-terminal/, effacé à la fin)
//   PREUVE_PG=postgres://… node scripts/annonce-prouvee-vivante-selftest.mjs   (un Postgres jetable déjà lancé)
//   VERROU_MIGRATION=<chemin absent> : juge la RÈGLE sur les seuls corps de prod (rouge : c'est le défaut du 14/11).
// Décor synthétique (identifiants inventés), rejoué sur le cas de 13e274de :
//   Beebs — G_1221 : vue en dernier par un relevé « index seul » (« Mes annonces » muette), déjà retirée par FillSell
//           (« déjà hors ligne »), retrait abouti AVANT cette vue — l'état de 12:21:02 ;
//         — G_1411 : la même, avec un retrait EN ATTENTE demandé APRÈS cette vue — l'état de 14:11:12 ;
//         — G_1105 : déjà retirée par FillSell, revue ensuite par un relevé « done » (extension d'avant 0.6.189) — 11:05 ;
//         — B_ok   : annonce Beebs normale, vue par un relevé qui a lu « Mes annonces », jamais retirée ;
//   Leboncoin — L_ok (relevé complet de « Synchroniser »), L_partiel (relevé incomplet qui a LU la liste : 108/111),
//         L_recentes (veille des annonces récentes, relevé d'une page clos « incomplete »), L_retrait (retrait demandé
//         depuis sa dernière vue). Vinted n'est pas concerné (CHECK de annonces_plateforme ; import par le dressing).
// A. LA PROD (corps relus) : le défaut est reproduit — G_1221 et G_1411 redeviennent des fiches.
// B. LA RÈGLE (après la migration) : aucun fantôme ne devient fiche ni n'entre au moteur ; B_ok, L_ok, L_partiel,
//    L_recentes s'importent comme avant ; la personne garde son geste sur une annonce revue par un relevé qui a lu sa
//    liste, jamais sur une annonce vue seulement dans l'index ; droits inchangés.
// C. L'INVERSE : les deux corps de prod reviennent à l'octet (md5), les fonctions neuves partent.
// D. La migration rejouée : idempotente.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const lire = (p) => fs.readFileSync(path.isAbsolute(p) ? p : path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const CHEMIN_MIGRATION = process.env.VERROU_MIGRATION ?? "supabase/migrations/20261114163000_annonce_prouvee_vivante.sql";
const CHEMIN_INVERSE = "supabase/rollbacks/20261114163000_annonce_prouvee_vivante_INVERSE.sql";
const existeFichier = (p) => fs.existsSync(path.isAbsolute(p) ? p : path.join(RACINE, p));
const MIGRATION = existeFichier(CHEMIN_MIGRATION) ? lire(CHEMIN_MIGRATION) : null;
const INVERSE = existeFichier(CHEMIN_INVERSE) ? lire(CHEMIN_INVERSE) : null;
const PROD = JSON.parse(lire("scripts/essais/fixtures/prod-1411-preuve-de-vie/fonctions.json")).fonctions;
const { construireNoeuds } = await import(pathToFileURL(path.join(RACINE, "supabase/functions/_shared/rapprochement/moteur.js")).href);

let pgsrv = null;
let dossier = null;
let url = process.env.PREUVE_PG;
if (url && /supabase\.(co|com)/.test(url)) { console.error("PREUVE_PG : un Postgres JETABLE (jamais la prod)."); process.exit(2); }
if (!url) {
  let EmbeddedPostgres;
  try { EmbeddedPostgres = (await import("embedded-postgres")).default; }
  catch { console.error("embedded-postgres absent (node_modules) : verrou non joué."); process.exit(2); }
  const port = 55300 + Math.floor(Math.random() * 90);
  // Les fichiers de travail restent dans le projet (.tmp-terminal/, consigne de Nico du 14/11), jamais dans le Temp système.
  dossier = path.join(RACINE, ".tmp-terminal", `banc-preuve-de-vie-${process.pid}`);
  fs.mkdirSync(dossier, { recursive: true });
  pgsrv = new EmbeddedPostgres({ databaseDir: path.join(dossier, "base"), user: "postgres", password: "banc", port, persistent: false,
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
const ok = (m, c, d) => { if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 400)}`}`); } };
const q = async (sql, params) => (await db.query(sql, params)).rows;
const v = async (sql, params) => Object.values((await q(sql, params))[0] ?? {})[0];
const md5 = (sig) => v(`SELECT md5(pg_get_functiondef('public.${sig}'::regprocedure))`);
const existe = (sig) => v(`SELECT to_regprocedure('public.${sig}') IS NOT NULL`);
const IMP = "rapprocher_importer(uuid,uuid,text)";
const LIRE = "rapprochement_v3_lire(uuid)";

const U1 = "00000000-0000-4000-8000-0000000000b1"; // compte Beebs (le cas de 13e274de)
const U2 = "00000000-0000-4000-8000-0000000000c2"; // compte Leboncoin (import normal)
const R = {
  beebsDone: "10000000-0000-4000-8000-000000000001", beebsMuet: "10000000-0000-4000-8000-000000000002",
  lbcDone: "10000000-0000-4000-8000-000000000003", lbcPartiel: "10000000-0000-4000-8000-000000000004",
  lbcRecentes: "10000000-0000-4000-8000-000000000005",
};
const A = {
  G_1221: "20000000-0000-4000-8000-000000000001", G_1411: "20000000-0000-4000-8000-000000000002",
  G_1105: "20000000-0000-4000-8000-000000000003", B_ok: "20000000-0000-4000-8000-000000000004",
  L_ok: "20000000-0000-4000-8000-000000000011", L_partiel: "20000000-0000-4000-8000-000000000012",
  L_recentes: "20000000-0000-4000-8000-000000000013", L_retrait: "20000000-0000-4000-8000-000000000014",
};
const NUM = { G_1221: "90000557", G_1411: "90000877", G_1105: "90000883", B_ok: "90355100",
  L_ok: "3900000001", L_partiel: "3900000002", L_recentes: "3900000003", L_retrait: "3900000004" };

const ETAT = `
  DELETE FROM rapprochements; DELETE FROM annonces_plateforme; DELETE FROM cross_post_jobs; DELETE FROM inventaire;
  DELETE FROM vinted_sync_runs; DELETE FROM releve_ebay_compte;
  INSERT INTO vinted_sync_runs (id, user_id, platform, kind, status, declencheur, started_at, finished_at, total_entries, items_vus, erreur) VALUES
    ('${R.beebsDone}', '${U1}', 'beebs', 'annonces', 'done', 'veilleur', now() - interval '195 minutes', now() - interval '194 minutes', 23, 28,
     '[défilement] page : 18 annonce(s) affichée(s) (1 défilement(s), la page n''en affichait pas plus) | index public Beebs : 23 annonce(s) en ligne, 24 lue(s) au total'),
    ('${R.beebsMuet}', '${U1}', 'beebs', 'annonces', 'incomplete', 'veilleur', now() - interval '180 minutes', now() - interval '179 minutes', 6, 6,
     '[incomplet] « Mes annonces » de Beebs n''a rien rendu alors que l''index public en montre 6 — rien n''est conclu disparu · [défilement] page : 0 annonce(s) affichée(s) | index public Beebs : 6 annonce(s) en ligne, 6 lue(s) au total | [flux] en ligne 0/0, en vérification 0, index 6 → rien n''est conclu'),
    ('${R.lbcDone}', '${U2}', 'leboncoin', 'annonces', 'done', 'app', now() - interval '60 minutes', now() - interval '59 minutes', 3, 3,
     '[défilement] [adresse] 1 page(s), 3 en ligne lues sur 3 annoncées'),
    ('${R.lbcPartiel}', '${U2}', 'leboncoin', 'annonces', 'incomplete', 'app', now() - interval '40 minutes', now() - interval '39 minutes', 111, 108,
     '[incomplet] couverture partielle : 108 annonce(s) vue(s) sur 111 « en ligne » — le reste n''est ni relevé ni conclu disparu'),
    ('${R.lbcRecentes}', '${U2}', 'leboncoin', 'recentes', 'incomplete', 'veille:recentes', now() - interval '20 minutes', now() - interval '19 minutes', NULL, 1,
     '[incomplet] [veille_recentes] 1 numéro inconnu');
  INSERT INTO annonces_plateforme (id, user_id, platform, listing_id, url, titre, prix, statut_plateforme, run_id, vu_le, created_at, retiree_le) VALUES
    ('${A.G_1221}', '${U1}', 'beebs', '${NUM.G_1221}', 'https://www.beebs.app/fr/p/${NUM.G_1221}', 'Bague anneau acier', 1, 'en_ligne', '${R.beebsMuet}', now() - interval '179 minutes', now() - interval '13 hours', now() - interval '12 hours'),
    ('${A.G_1411}', '${U1}', 'beebs', '${NUM.G_1411}', 'https://www.beebs.app/fr/p/${NUM.G_1411}', 'Bague coeur argenté', 3, 'en_ligne', '${R.beebsMuet}', now() - interval '179 minutes', now() - interval '13 hours', now() - interval '12 hours'),
    ('${A.G_1105}', '${U1}', 'beebs', '${NUM.G_1105}', 'https://www.beebs.app/fr/p/${NUM.G_1105}', 'Bague argenté', 2, 'en_ligne', '${R.beebsDone}', now() - interval '194 minutes', now() - interval '13 hours', now() - interval '12 hours'),
    ('${A.B_ok}', '${U1}', 'beebs', '${NUM.B_ok}', 'https://www.beebs.app/fr/p/${NUM.B_ok}', 'Collier fleur dorée', 3.9, 'en_ligne', '${R.beebsDone}', now() - interval '194 minutes', now() - interval '6 hours', NULL),
    ('${A.L_ok}', '${U2}', 'leboncoin', '${NUM.L_ok}', 'https://www.leboncoin.fr/ad/vetements/${NUM.L_ok}', 'Veste en jean', 15, 'en_ligne', '${R.lbcDone}', now() - interval '59 minutes', now() - interval '59 minutes', NULL),
    ('${A.L_partiel}', '${U2}', 'leboncoin', '${NUM.L_partiel}', 'https://www.leboncoin.fr/ad/vetements/${NUM.L_partiel}', 'Pull marin', 12, 'en_ligne', '${R.lbcPartiel}', now() - interval '39 minutes', now() - interval '39 minutes', NULL),
    ('${A.L_recentes}', '${U2}', 'leboncoin', '${NUM.L_recentes}', 'https://www.leboncoin.fr/ad/vetements/${NUM.L_recentes}', 'Robe longue', 20, 'en_ligne', '${R.lbcRecentes}', now() - interval '19 minutes', now() - interval '19 minutes', NULL),
    ('${A.L_retrait}', '${U2}', 'leboncoin', '${NUM.L_retrait}', 'https://www.leboncoin.fr/ad/vetements/${NUM.L_retrait}', 'Chemise lin', 9, 'en_ligne', '${R.lbcDone}', now() - interval '59 minutes', now() - interval '59 minutes', NULL);
  -- Les retraits : abouti « déjà hors ligne » AVANT la dernière vue (G_1221, G_1105) ; EN ATTENTE, demandé APRÈS (G_1411, L_retrait).
  INSERT INTO cross_post_jobs (user_id, platform, action, status, platform_listing_id, listing_url, created_at, platform_fields) VALUES
    ('${U1}', 'beebs', 'delete', 'deleted', '${NUM.G_1221}', 'https://www.beebs.app/fr/p/${NUM.G_1221}', now() - interval '200 minutes', '{"retrait_par": "annonce_deja_hors_ligne"}'),
    ('${U1}', 'beebs', 'delete', 'deleted', '${NUM.G_1411}', 'https://www.beebs.app/fr/p/${NUM.G_1411}', now() - interval '200 minutes', '{"retrait_par": "annonce_deja_hors_ligne"}'),
    ('${U1}', 'beebs', 'delete', 'pending', '${NUM.G_1411}', 'https://www.beebs.app/fr/p/${NUM.G_1411}', now() - interval '40 minutes', '{"attente_session": true}'),
    ('${U1}', 'beebs', 'delete', 'deleted', '${NUM.G_1105}', 'https://www.beebs.app/fr/p/${NUM.G_1105}', now() - interval '200 minutes', '{"retrait_par": "annonce_deja_hors_ligne"}'),
    ('${U2}', 'leboncoin', 'delete', 'pending', '${NUM.L_retrait}', 'https://www.leboncoin.fr/ad/vetements/${NUM.L_retrait}', now() - interval '10 minutes', '{}');
`;
const nbFiches = (u) => v(`SELECT count(*)::int FROM inventaire WHERE user_id = $1 AND origine LIKE 'releve\\_%'`, [u]);
const ficheDe = (u, a, geste) => v("SELECT rapprochement_v3_fiche_de($1, $2, $3)", [u, a, geste]);
const importer = async (u, a, par) => (await q("SELECT rapprocher_importer($1, $2, $3) AS r", [u, a, par]))[0].r;
const noeuds = async (u) => {
  const donnees = await v("SELECT rapprochement_v3_lire($1)", [u]);
  const N = construireNoeuds(donnees, () => [], { paresseux: true });
  return { ids: new Set(N.map((n) => n.id)), donnees };
};

try {
  // ── Le socle : rôles, auth, les tables réduites aux colonnes lues, les dépendances hors sujet en bouchons ────────────
  await db.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;
    DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; SET search_path TO public;
    CREATE TABLE coin_config (key text PRIMARY KEY, value integer);
    INSERT INTO coin_config VALUES ('import_auto_ouvert', 1), ('rapprochement_remise_en_ligne', 0);
    CREATE TABLE inventaire (id bigint PRIMARY KEY, user_id uuid, titre text, prix_vente numeric, statut text DEFAULT 'stock',
      plateforme text, origine text, quantite integer, photos jsonb, attributs jsonb, description text, marque text,
      first_seen_at timestamptz, last_synced_at timestamptz, photos_a_rapatrier boolean, fusionne_dans bigint, a_verifier jsonb,
      vinted_item_id text, vinted_status text, disparu_le timestamptz, vinted_account_id text, created_at timestamptz DEFAULT now());
    CREATE TABLE cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, inventaire_id bigint, platform text,
      action text, status text, photo_option text, title text, price numeric, listing_url text, platform_listing_id text,
      published_at timestamptz, handler_build text, platform_fields jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());
    CREATE TABLE vinted_sync_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, kind text NOT NULL DEFAULT 'dressing',
      status text NOT NULL DEFAULT 'running', declencheur text, total_entries integer, items_vus integer, erreur text,
      started_at timestamptz DEFAULT now(), finished_at timestamptz, queued_at timestamptz, vinted_user_id text,
      platform text NOT NULL DEFAULT 'vinted');
    CREATE TABLE annonces_plateforme (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
      platform text CHECK (platform IN ('leboncoin', 'beebs', 'ebay', 'opla', 'depop')), listing_id text,
      url text, titre text, prix numeric, photo_url text, statut_plateforme text, inventaire_id bigint REFERENCES inventaire (id) ON DELETE SET NULL,
      job_id uuid, source_rapprochement text, proposition jsonb, ignoree_le timestamptz, run_id uuid, vu_le timestamptz, disparu_le timestamptz,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), capture jsonb, fiche_supprimee_le timestamptz,
      retiree_le timestamptz, retrait_job_id uuid, quantite integer, publiee_le timestamptz, UNIQUE (user_id, platform, listing_id));
    CREATE TABLE rapprochements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, annonce_id uuid, inventaire_id bigint,
      decision text, par text, score numeric, detail jsonb, created_at timestamptz DEFAULT now());
    CREATE TABLE inventaire_fusions (garde bigint, absorbe bigint, par text, defait_le timestamptz, user_id uuid);
    CREATE TABLE inventaire_doublons (id uuid DEFAULT gen_random_uuid(), user_id uuid, garde bigint, absorbe bigint, statut text, motif text,
      decide_par text, source text);
    CREATE TABLE releve_ebay_compte (run_id uuid, verdict text);
    -- Bouchons (logique hors sujet du verrou)
    CREATE FUNCTION releve_ebay_run_bloque(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION releve_dette_beebs(p uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
    CREATE FUNCTION releve_dette_beebs_depuis(p uuid, t timestamptz) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION opla_sortie_passee() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION annonce_lien_notification(p text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT false $$;
    CREATE FUNCTION rapprochement_v3_vinted_depuis(p uuid) RETURNS timestamptz LANGUAGE sql STABLE AS $$ SELECT now() $$;
    CREATE FUNCTION rapprochement_v3_fiches_main_depuis(p uuid) RETURNS timestamptz LANGUAGE sql STABLE AS $$ SELECT now() $$;
    CREATE FUNCTION titre_norm(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(p) $$;
    CREATE FUNCTION titre_jetons(p text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(lower(p), ' ') $$;
    CREATE FUNCTION titres_variantes_incompatibles(a text, b text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT false $$;
    CREATE FUNCTION releve_poser_question(u uuid, a bigint, b bigint, m text, p jsonb) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION rapprochement_texte_norm(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(p) $$;
  `);
  for (const f of Object.values(PROD)) await db.query(f.def);
  await db.query(`CREATE TRIGGER inventaire_releve_par_decision BEFORE INSERT ON inventaire FOR EACH ROW
    WHEN ((new.origine ~~ 'releve\\_%'::text)) EXECUTE FUNCTION inventaire_releve_par_decision()`);
  await db.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.${IMP}, public.${LIRE} TO service_role`);
  for (const [sig, f] of Object.entries(PROD)) ok(`prod : ${sig} reproduit à l'octet (md5 ${f.md5.slice(0, 8)}…)`, (await md5(sig)) === f.md5, await md5(sig));

  // ── A. LA PROD : le défaut du 14/11 reproduit ────────────────────────────────────────────────────────────────────
  console.log("A. la prod (corps relus le 14/11) :");
  await db.query(ETAT);
  ok("A. G_1221 (vue par un relevé « index seul », déjà retirée) : la prod en refait une fiche (12:21:02)", (await ficheDe(U1, A.G_1221, true)) != null);
  ok("A. G_1411 (retrait EN ATTENTE depuis sa dernière vue) : la prod en refait une fiche (14:11:12)", (await ficheDe(U1, A.G_1411, true)) != null);
  await db.query(ETAT);
  const { ids: idsProd } = await noeuds(U1);
  ok("A. le moteur de prod voit les fantômes sans fiche comme des annonces à importer", idsProd.has("A" + A.G_1221) && idsProd.has("A" + A.G_1411), [...idsProd]);

  // ── B. LA RÈGLE ──────────────────────────────────────────────────────────────────────────────────────────────────
  if (MIGRATION) await db.query(MIGRATION);
  else console.log(`B. migration absente (${CHEMIN_MIGRATION}) : la règle est jugée sur les corps de prod.`);
  console.log("B. la règle (après la migration) :");
  await db.query(ETAT);
  const { ids, donnees } = await noeuds(U1);
  const parId = new Map((donnees.annonces ?? []).map((a) => [a.id, a]));
  ok("B. le moteur ne voit plus G_1221 (index seul) ni G_1411 (retrait en attente) ni G_1105 (déjà retirée par FillSell)",
    !ids.has("A" + A.G_1221) && !ids.has("A" + A.G_1411) && !ids.has("A" + A.G_1105), [...ids]);
  ok("B. … et le motif est lu : vue_seulement_dans_l_index / retrait_demande / retiree_par_fillsell",
    parId.get(A.G_1221)?.non_prouvee === "vue_seulement_dans_l_index" && parId.get(A.G_1411)?.non_prouvee === "vue_seulement_dans_l_index"
      && parId.get(A.G_1105)?.non_prouvee === "retiree_par_fillsell",
    [A.G_1221, A.G_1411, A.G_1105].map((k) => parId.get(k)?.non_prouvee));
  ok("B. le moteur voit toujours B_ok (Beebs normale, vue dans « Mes annonces »)", ids.has("A" + A.B_ok) && parId.get(A.B_ok)?.non_prouvee == null, parId.get(A.B_ok));
  ok("B. G_1221 : aucune fiche (passe « geste » comme à 12:21)", (await ficheDe(U1, A.G_1221, true)) == null);
  ok("B. G_1411 : aucune fiche (passe « geste » comme à 14:11)", (await ficheDe(U1, A.G_1411, true)) == null);
  ok("B. G_1105 : aucune fiche par le moteur (retirée par FillSell, revue par un relevé d'avant 0.6.189)", (await ficheDe(U1, A.G_1105, true)) == null);
  ok("B. aucune fiche « releve_beebs » ni tâche de suivi née d'un fantôme",
    (await nbFiches(U1)) === 0 && (await v(`SELECT count(*)::int FROM cross_post_jobs WHERE user_id = $1 AND action = 'publish'`, [U1])) === 0);
  const rImp = await importer(U1, A.G_1221, "rapprochement");
  ok("B. rapprocher_importer (la seule porte) refuse lui-même : reason annonce_non_prouvee_vivante",
    rImp?.ok === false && rImp?.reason === "annonce_non_prouvee_vivante" && rImp?.motif === "vue_seulement_dans_l_index", rImp);
  const fB = await ficheDe(U1, A.B_ok, true);
  ok("B. B_ok (Beebs normale) : sa fiche naît comme avant", fB != null && (await v("SELECT origine FROM inventaire WHERE id = $1", [fB])) === "releve_beebs", fB);
  // La personne
  const pIdx = await importer(U1, A.G_1411, "utilisateur");
  ok("B. la personne : jamais une fiche depuis une annonce vue seulement dans l'index (message en clair)",
    pIdx?.ok === false && pIdx?.motif === "vue_seulement_dans_l_index" && /index public/.test(pIdx?.message ?? ""), pIdx);
  const pRet = await importer(U1, A.G_1105, "utilisateur");
  ok("B. la personne garde son geste sur une annonce retirée puis revue par un relevé qui a LU sa liste",
    pRet?.ok === true && pRet?.decision === "import", pRet);
  // Leboncoin, l'import normal
  const { ids: idsL, donnees: dL } = await noeuds(U2);
  const parL = new Map((dL.annonces ?? []).map((a) => [a.id, a]));
  ok("B. Leboncoin : le moteur voit L_ok, L_partiel (relevé incomplet qui a lu la liste) et L_recentes",
    ["L_ok", "L_partiel", "L_recentes"].every((k) => idsL.has("A" + A[k]) && parL.get(A[k])?.non_prouvee == null), [...idsL]);
  ok("B. Leboncoin : L_retrait (retrait demandé depuis sa dernière vue) n'entre pas au moteur", !idsL.has("A" + A.L_retrait) && parL.get(A.L_retrait)?.non_prouvee === "retrait_demande", parL.get(A.L_retrait));
  ok("B. Leboncoin : L_ok (relevé de « Synchroniser ») devient une fiche", (await ficheDe(U2, A.L_ok, false)) != null);
  ok("B. Leboncoin : L_partiel (couverture partielle 108/111) devient une fiche", (await ficheDe(U2, A.L_partiel, false)) != null);
  ok("B. Leboncoin : L_recentes (veille des annonces récentes, relevé d'une page clos) devient une fiche", (await ficheDe(U2, A.L_recentes, false)) != null);
  ok("B. Leboncoin : L_retrait ne devient jamais une fiche", (await ficheDe(U2, A.L_retrait, true)) == null);
  ok("B. 3 fiches « releve_leboncoin », chacune avec sa tâche de suivi « published »",
    (await nbFiches(U2)) === 3 && (await v(`SELECT count(*)::int FROM cross_post_jobs WHERE user_id = $1 AND action = 'publish' AND status = 'published' AND platform_fields ->> 'source' = 'releve'`, [U2])) === 3);
  if (MIGRATION) {
    ok("B. droits : les fonctions neuves ne sont ni à anon ni à authenticated",
      !(await v(`SELECT has_function_privilege('authenticated', 'public.annonce_non_prouvee_vivante(uuid,boolean)', 'EXECUTE')`))
        && !(await v(`SELECT has_function_privilege('anon', 'public.releve_run_index_seul(uuid)', 'EXECUTE')`)));
    ok("B. droits : les corps modifiés gardent les leurs (service_role)",
      await v(`SELECT has_function_privilege('service_role', 'public.${IMP}', 'EXECUTE') AND NOT has_function_privilege('authenticated', 'public.${IMP}', 'EXECUTE')`));
    const mApres = { imp: await md5(IMP), lire: await md5(LIRE) };
    ok("B. la garde de la migration connaît le md5 « après » (rejouable)", MIGRATION.includes(mApres.imp) && MIGRATION.includes(mApres.lire), mApres);
    // ── D. rejouée ──
    await db.query(MIGRATION);
    ok("D. la migration rejouée : idempotente (mêmes corps)", (await md5(IMP)) === mApres.imp && (await md5(LIRE)) === mApres.lire);
    // ── C. l'inverse ──
    if (INVERSE) {
      await db.query(INVERSE);
      ok("C. l'inverse : rapprocher_importer revient à l'octet (md5 de prod)", (await md5(IMP)) === PROD[IMP].md5);
      ok("C. l'inverse : rapprochement_v3_lire revient à l'octet (md5 de prod)", (await md5(LIRE)) === PROD[LIRE].md5);
      ok("C. l'inverse : les fonctions neuves sont parties",
        !(await existe("annonce_non_prouvee_vivante(uuid,boolean)")) && !(await existe("releve_run_index_seul(uuid)")));
    } else ok("C. l'inverse est présent", false, CHEMIN_INVERSE);
  }
} catch (e) {
  rouges++;
  console.log(`  ✗ exception : ${e?.stack ?? e}`);
} finally {
  await db.end().catch(() => {});
  if (pgsrv) await pgsrv.stop().catch(() => {});
  if (dossier) fs.rmSync(dossier, { recursive: true, force: true });
}
console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
