// PREUVE DE BOUT EN BOUT, SUR UN POSTGRES JETABLE, de la migration 20261105190000_rattachement_regles (05/11, règles
// de Nico sur le rattachement, toutes plateformes) :
//   (a) une fiche unitaire ne porte jamais deux annonces de la même plateforme (cas UJ2 / Albator d'assopmfrance) ;
//   (b) le chemin AUTOMATIQUE du moteur v3 ne signe plus « utilisateur:… » et ne pose plus « manuel » ;
//   (c) un retrait de copie n'est jamais armé sur un rattachement automatique non confirmé : la copie devient la
//       question « Déjà vendu ? » (copie_non_prouvee), dont le « Oui » arme le retrait ;
//   (d) la question « photo proche » n'est plus posée sur un titre en série (≥ 3 annonces d'une plateforme).
// Décisions de Nico du 05/11 soir : (a) une PHOTO IDENTIQUE reste une preuve — rattachement ou fusion automatique par
// photo identique = confirmé, retrait armé comme avant ; seul l'automatique SANS photo identique devient la question ;
// (b) P16 gardée ; (c) « Annonce en double ? » → « Oui » refusé sur une fiche unitaire, sauf republication prouvée.
// Et les cas normaux inchangés : fusion légitime, retrait d'une copie confirmée, série à plusieurs exemplaires, P16.
//
//   PREUVE_PG=embarque node scripts/preuve-rattachement-regles.mjs                       (Postgres 17 jetable sur le PC)
//   PREUVE_PG=embarque node scripts/preuve-rattachement-regles.mjs --catalogue <f.json>  (catalogue déjà lu, hors ligne)
//
// Le schéma public DE PROD est chargé comme dans scripts/preuve-remise-en-vente-series.mjs : fonctions
// (pg_get_functiondef), tables, contraintes, index, déclencheurs (avec leur état), coin_config, platform_health — lus EN
// LECTURE SEULE (`npx supabase db query --linked --read-only`, catalogue système et configuration, aucune donnée client).
// AVANT = l'INVERSE (définitions de prod, md5 vérifiés) ; APRÈS = la migration telle quelle ; puis l'INVERSE (md5).
// ⛔ Jamais la prod : PREUVE_PG refuse toute adresse supabase.co ; rien n'est écrit ailleurs que dans la base jetable.
import pg from 'pg';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const lire = (p) => readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = lire('supabase/migrations/20261105190000_rattachement_regles.sql');
const INVERSE = lire('supabase/rollbacks/20261105190000_rattachement_regles_INVERSE.sql');
// md5 des définitions de prod du 05/11 (pg_get_functiondef, SANS les retours chariot) — l'INVERSE les porte mot pour mot.
const MD5_PROD = {
  'public.inventaire_fusionner_pour(uuid,bigint,bigint,text)': '9bcfcd661b1561731fe2ab33e7a5a136',
  'public.inventaire_doublon_decider(uuid,text,uuid)': '3a9d7674e6c14d8df66e65063a1fff51',
  'public.rapprochement_v3_appliquer(uuid,jsonb,text,boolean)': 'f417a5e0eead76135922c03d6c05b494',
  'public.armer_retrait_job_pour(uuid,text,interval,boolean)': '0985562bc7f9d611dbf5cf520816d3d9',
  'public.armer_retraits_copies(bigint,text,uuid,text,interval)': '15e05ec507246ffe51dbccc69b79b9c8',
  'public.poser_questions_copies_non_prouvees(bigint,uuid,text,text)': '3f69b70226669e19fb219574056bceb3',
  'public.releve_poser_question(uuid,bigint,bigint,text,jsonb)': 'f954fea62a0dccac94d011e41ded1290',
};
const SIGS = Object.keys(MD5_PROD);
const NEUVES = ['public.rattachement_confirme(uuid)', 'public.titre_en_serie(uuid,text)'];
const RETRAIT_JOB_PROUVE_PROD = 'aa37decdd369f3b7bb8438f62004b418';   // jamais réécrite : vérifiée intacte

let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.(co|com)|pooler/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
const iCat = process.argv.indexOf('--catalogue');
const FICHIER_CATALOGUE = iCat > 0 ? process.argv[iCat + 1] : null;
const bavard = process.argv.includes('--bavard');

// ── 1. LE CATALOGUE DE PROD, EN LECTURE SEULE (mêmes requêtes que preuve-remise-en-vente-series) ─────────────────────
const REQUETES = {
  fonctions: `SELECT p.proname AS nom, pg_get_function_identity_arguments(p.oid) AS args, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p') ORDER BY p.proname, p.oid;`,
  tables: `SELECT c.relname AS nom,
    (SELECT jsonb_agg(jsonb_build_object('n', a.attname, 't', format_type(a.atttypid, a.atttypmod), 'nn', a.attnotnull,
        'd', pg_get_expr(d.adbin, d.adrelid), 'id', a.attidentity, 'g', a.attgenerated) ORDER BY a.attnum)
       FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS cols,
    (SELECT jsonb_agg(jsonb_build_object('n', k.conname, 'type', k.contype, 'def', pg_get_constraintdef(k.oid),
        'ref', r.relname, 'refns', rn.nspname) ORDER BY k.contype, k.conname)
       FROM pg_constraint k LEFT JOIN pg_class r ON r.oid = k.confrelid LEFT JOIN pg_namespace rn ON rn.oid = r.relnamespace
      WHERE k.conrelid = c.oid) AS cons,
    (SELECT jsonb_agg(pg_get_indexdef(x.indexrelid) ORDER BY x.indexrelid) FROM pg_index x WHERE x.indrelid = c.oid
       AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = x.indexrelid AND k.conrelid = c.oid)) AS idx,
    (SELECT jsonb_agg(jsonb_build_object('n', t.tgname, 'def', pg_get_triggerdef(t.oid), 'fn', p.proname, 'on', t.tgenabled) ORDER BY t.tgname)
       FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid WHERE t.tgrelid = c.oid AND NOT t.tgisinternal) AS trig
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname !~ '^(_backup|sauvegarde)' ORDER BY 1;`,
  divers: `SELECT 'seq' AS k, c.relname AS nom, NULL::text AS def FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
  UNION ALL SELECT 'vue', c.relname, pg_get_viewdef(c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v' ORDER BY 1, 2;`,
  config: `SELECT 'coin_config' AS t, jsonb_agg(to_jsonb(c)) AS lignes FROM public.coin_config c
  UNION ALL SELECT 'platform_health', jsonb_agg(to_jsonb(h)) FROM public.platform_health h;`,
};
function lireProd(sql, dossier) {
  const f = join(dossier, `requete-${Object.keys(REQUETES).find((k) => REQUETES[k] === sql)}.sql`);
  writeFileSync(f, sql);
  const r = spawnSync(`npx supabase db query --linked --read-only -f "${f}" -o json`,
    { cwd: RACINE, encoding: 'utf8', shell: true, maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`lecture du catalogue de prod impossible : ${(r.stderr || '').slice(-400)}`);
  return JSON.parse(r.stdout).rows;
}
let catalogue;
if (FICHIER_CATALOGUE) {
  catalogue = JSON.parse(readFileSync(FICHIER_CATALOGUE, 'utf8'));
  console.log(`Catalogue relu : ${FICHIER_CATALOGUE} (lu en prod le ${catalogue.lu_le})`);
} else {
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-catalogue-prod-'));
  console.log('Catalogue de prod : lecture seule (--read-only), catalogue système + coin_config + platform_health…');
  catalogue = { lu_le: new Date().toISOString() };
  for (const k of Object.keys(REQUETES)) catalogue[k] = lireProd(REQUETES[k], dossier);
  const garde = join(dossier, 'catalogue.json');
  writeFileSync(garde, JSON.stringify(catalogue));
  console.log(`  gardé dans ${garde} (rejouer hors ligne : --catalogue <ce fichier>)`);
}

// ── 2. LA BASE JETABLE ──────────────────────────────────────────────────────────────────────────────────────────────
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-rattachement-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55452, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55452/postgres';
}
const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
c.on('notice', () => {});
let ko = 0, n = 0;
const ok = (cond, msg, detail) => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${detail !== undefined ? `\n      ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900)}` : ''}`); } };
const un = async (sql, p = []) => (await c.query(sql, p)).rows[0];
const tous = async (sql, p = []) => (await c.query(sql, p)).rows;
const md5De = async (sig) => (await un(`SELECT md5(replace(pg_get_functiondef($1::regprocedure), chr(13), '')) AS m`, [sig])).m;
const existe = async (sig) => (await un(`SELECT to_regprocedure($1) IS NOT NULL AS e`, [sig])).e;
const id = (s) => `"${String(s).replace(/"/g, '""')}"`;

const PRELUDE = String.raw`
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticator NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE supabase_admin NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS extensions; CREATE SCHEMA auth; CREATE SCHEMA net; CREATE SCHEMA vault; CREATE SCHEMA cron; CREATE SCHEMA storage;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, phone text, created_at timestamptz DEFAULT now(), updated_at timestamptz,
  last_sign_in_at timestamptz, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz,
  raw_user_meta_data jsonb DEFAULT '{}', raw_app_meta_data jsonb DEFAULT '{}', is_anonymous boolean DEFAULT false);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid $f$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claims', true)::json ->> 'role', '') $f$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '') $f$;
CREATE TABLE net._appels (id bigserial PRIMARY KEY, url text, body jsonb, headers jsonb, le timestamptz DEFAULT clock_timestamp());
CREATE TABLE net._http_response (id bigint, status_code integer, content_type text, headers jsonb, content text, timed_out boolean, error_msg text, created timestamptz DEFAULT now());
CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer DEFAULT 5000) RETURNS bigint
  LANGUAGE sql AS $f$ INSERT INTO net._appels (url, body, headers) VALUES (url, body, headers) RETURNING id $f$;
CREATE FUNCTION net.http_get(url text, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb,
  timeout_milliseconds integer DEFAULT 5000) RETURNS bigint
  LANGUAGE sql AS $f$ INSERT INTO net._appels (url, body, headers) VALUES (url, params, headers) RETURNING id $f$;
CREATE TABLE vault.secrets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, description text, secret text, key_id uuid,
  nonce bytea, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE VIEW vault.decrypted_secrets AS SELECT s.*, s.secret AS decrypted_secret FROM vault.secrets s;
CREATE FUNCTION vault.create_secret(new_secret text, new_name text DEFAULT NULL, new_description text DEFAULT '', new_key_id uuid DEFAULT NULL)
  RETURNS uuid LANGUAGE sql AS $f$ INSERT INTO vault.secrets (secret, name, description) VALUES (new_secret, new_name, new_description) RETURNING id $f$;
CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, schedule text, command text, jobname text, active boolean DEFAULT true,
  nodename text, nodeport integer, database text, username text);
CREATE TABLE cron.job_run_details (runid bigserial PRIMARY KEY, jobid bigint, job_pid integer, database text, username text, command text,
  status text, return_message text, start_time timestamptz, end_time timestamptz);
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint LANGUAGE sql
  AS $f$ INSERT INTO cron.job (jobname, schedule, command) VALUES (job_name, schedule, command) RETURNING jobid $f$;
CREATE FUNCTION cron.unschedule(job_name text) RETURNS boolean LANGUAGE sql AS $f$ DELETE FROM cron.job WHERE jobname = job_name RETURNING true $f$;
CREATE TABLE storage.objects (id uuid DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb,
  created_at timestamptz DEFAULT now(), updated_at timestamptz);
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE
  AS $f$ SELECT (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $f$;
`;

// Les fonctions et tables de LA CHAÎNE : leur absence casse la preuve (le reste du schéma est « au mieux »).
const CHAINE_FONCTIONS = ['inventaire_fusionner_pour', 'inventaire_fusionner', 'inventaire_doublon_decider', 'rapprochement_v3_appliquer',
  'armer_retrait_job_pour', 'armer_retrait_job', 'armer_retraits_copies', 'poser_questions_copies_non_prouvees', 'releve_poser_question',
  'retrait_job_prouve', 'fiche_annonces_vivantes', 'rapprochement_republication_prouvee', 'rapprochement_texte_norm',
  'rapprochement_description_cle', 'rapprochement_description_lot', 'rapprochement_v3_fiche_intacte', 'rapprochement_attacher',
  'rapprocher_job_de_suivi', 'annonce_rattacher_par_identifiant', 'inventaire_vendu_retire_ses_copies', 'annonce_importee',
  'vente_apres_mise_en_ligne', 'annonce_mise_en_ligne', 'vente_instant', 'vente_prouvee_fiche_liee', 'listing_designe',
  'opla_sortie_passee', 'vinted_remise_en_ligne', 'vinted_retraits_successifs'];
const CHAINE_TABLES = ['inventaire', 'annonces_plateforme', 'cross_post_jobs', 'inventaire_fusions', 'inventaire_doublons', 'ventes',
  'rapprochements', 'usage_logs'];

async function construire() {
  const echecs = [];
  const essayer = async (sql, quoi) => { try { await c.query(sql); return true; } catch (e) { echecs.push(`${quoi} : ${e.message}`); return false; } };
  await c.query(PRELUDE);
  await c.query('SET search_path = public, extensions');
  const tables = catalogue.tables;
  for (const s of catalogue.divers.filter((d) => d.k === 'seq')) await essayer(`CREATE SEQUENCE public.${id(s.nom)}`, `séquence ${s.nom}`);
  for (const t of tables) {
    const cols = t.cols.filter((k) => !k.g).map((k) => `${id(k.n)} ${k.t}${k.id === 'a' ? ' GENERATED ALWAYS AS IDENTITY' : k.id === 'd' ? ' GENERATED BY DEFAULT AS IDENTITY' : ''}${k.nn && !k.id ? ' NOT NULL' : ''}`);
    await essayer(`CREATE TABLE public.${id(t.nom)} (${cols.join(', ')})`, `table ${t.nom}`);
  }
  await c.query('SET check_function_bodies = off');
  let nf = 0;
  for (const f of catalogue.fonctions) if (await essayer(f.def, `fonction ${f.nom}(${f.args})`)) nf++;
  await c.query('SET check_function_bodies = on');
  for (const t of tables) {
    for (const k of t.cols.filter((x) => x.d && !x.id && !x.g)) await essayer(`ALTER TABLE public.${id(t.nom)} ALTER COLUMN ${id(k.n)} SET DEFAULT ${k.d}`, `défaut ${t.nom}.${k.n}`);
    for (const k of t.cols.filter((x) => x.g === 's')) await essayer(`ALTER TABLE public.${id(t.nom)} ADD COLUMN ${id(k.n)} ${k.t} GENERATED ALWAYS AS (${k.d}) STORED`, `colonne générée ${t.nom}.${k.n}`);
  }
  for (const pass of [['p', 'u', 'x', 'c'], ['f']]) {
    for (const t of tables) for (const k of (t.cons ?? []).filter((x) => pass.includes(x.type))) {
      await essayer(`ALTER TABLE public.${id(t.nom)} ADD CONSTRAINT ${id(k.n)} ${k.def}`, `contrainte ${t.nom}.${k.n}`);
    }
  }
  for (const t of tables) for (const x of (t.idx ?? [])) await essayer(x, `index ${t.nom}`);
  for (const v of catalogue.divers.filter((d) => d.k === 'vue')) await essayer(`CREATE VIEW public.${id(v.nom)} AS ${v.def}`, `vue ${v.nom}`);
  let nt = 0, ntChaine = 0, ntChaineOk = 0;
  for (const t of tables) for (const g of (t.trig ?? [])) {
    const fait = await essayer(g.def, `déclencheur ${t.nom}.${g.n}`);
    if (fait) { nt++; if (g.on === 'D') await essayer(`ALTER TABLE public.${id(t.nom)} DISABLE TRIGGER ${id(g.n)}`, `désactivation ${g.n}`); }
    if (CHAINE_TABLES.includes(t.nom)) { ntChaine++; if (fait) ntChaineOk++; }
  }
  for (const cfg of catalogue.config) {
    if (!cfg.lignes) continue;
    await c.query(`INSERT INTO public.${id(cfg.t)} SELECT * FROM jsonb_populate_recordset(NULL::public.${id(cfg.t)}, $1)`, [JSON.stringify(cfg.lignes)]);
  }
  return { echecs, nf, nt, ntChaine, ntChaineOk };
}

// ── 3. LE COMPTE ET SES ARTICLES D'ESSAI ────────────────────────────────────────────────────────────────────────────
const U = '0f5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5f';
let invSuivant = 7800000000000, lidSuivant = 3399500000;
const PHOTOS = JSON.stringify(['https://exemple.invalid/1.jpg']);
const commeLaPersonne = () => c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: U, role: 'authenticated' })]);
const commeLeServeur = () => c.query(`SELECT set_config('request.jwt.claims', '{}', false)`);
async function fiche({ titre, quantite = 1, statut = 'stock', vinted = null, origine = null }) {
  const inv = invSuivant++;
  await c.query(`INSERT INTO inventaire (id, user_id, titre, statut, quantite, prix_vente, description, photos, origine, vinted_item_id, vinted_status, created_at)
    VALUES ($1, $2, $3, $4, $5, 20, 'Très bon état.', $6, $7, $8, $9, now() - interval '5 days')`,
  [inv, U, titre, statut, quantite, PHOTOS, origine, vinted, vinted ? 'active' : null]);
  return inv;
}
// Une annonce relevée, et son dépôt de suivi : rattachement = l'objet `platform_fields.rattachement` (null = dépôt FillSell).
async function annonce(inv, { platform, titre, source = 'automatique', rattachement = null, releve = true, prix = 20, capture = null, sansJob = false }) {
  const lid = String(lidSuivant++);
  const url = `https://exemple.invalid/${platform}/${lid}`;
  let job = null;
  if (!sansJob) {
    const pf = releve ? { source: 'releve', ...(rattachement ? { rattachement } : {}) } : {};
    job = (await un(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, listing_url,
        published_at, created_at, handler_build, platform_fields, photo_option)
      VALUES ($1, $2, $3, 'published', 'publish', $4, $5, $6, $7, now() - interval '3 days', now() - interval '3 days', '0.6.174', $8, 'original') RETURNING id`,
    [U, inv, platform, titre, prix, lid, url, JSON.stringify(pf)])).id;
  }
  const a = (await un(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, prix, statut_plateforme, inventaire_id, job_id,
      source_rapprochement, vu_le, created_at, publiee_le, capture)
    VALUES ($1, $2, $3, $4, $5, $6, 'en_ligne', $7, $8, $9, now() - interval '1 hour', now() - interval '3 days', now() - interval '3 days', $10) RETURNING id`,
  [U, platform, lid, url, titre, prix, inv, job, source, capture ? JSON.stringify(capture) : null])).id;
  return { annonce: a, job, lid };
}
const question = async (garde, absorbe, motif, preuves = {}) => (await un(`INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
  VALUES ($1, $2, $3, 'probable', 'proposee', $4, $5, 'releve') RETURNING id`, [U, garde, absorbe, motif, JSON.stringify(preuves)])).id;
const decider = async (q, decision, montree = null) => { await commeLaPersonne(); const r = (await un(`SELECT public.inventaire_doublon_decider($1, $2, $3) AS r`, [q, decision, montree])).r; await commeLeServeur(); return r; };
const vivantes = async (inv, platform) => (await un(`SELECT count(*)::int AS n FROM annonces_plateforme WHERE inventaire_id = $1 AND platform = $2
  AND disparu_le IS NULL AND retiree_le IS NULL`, [inv, platform])).n;
// La vente Vinted d'une fiche (comme l'enregistrent les chemins de vente) : la vente, puis la fiche « vendu » —
// le déclencheur inventaire_vendu_retire_ses_copies arme les retraits et pose les questions.
async function vendreSur(inv, code, libelle) {
  await c.query(`INSERT INTO ventes (user_id, inventaire_id, titre, prix_vente, quantite, plateforme, plateforme_code, vendu_le, date, source)
    VALUES ($1, $2, 'vente', 20, 1, $3, $4, now(), current_date, 'preuve')`, [U, inv, libelle, code]);
  await c.query(`UPDATE inventaire SET statut = 'vendu', quantite = 0, plateforme = $2 WHERE id = $1`, [inv, libelle]);
}
const vendreSurVinted = (inv) => vendreSur(inv, 'vinted', 'Vinted');
// Limite voulue : le DÉPÔT Vinted de FillSell (aucune annonce relevée) déplacé par une fusion automatique (une remise
// en ligne Vinted) reste confirmé — sinon, à une vente ailleurs, il resterait en ligne sans retrait NI question.
async function casDepotFillSellApresFusionAuto(marque) {
  const g = await fiche({ titre: 'Manteau laine Sézane bleu nuit' });
  await annonce(g, { platform: 'leboncoin', titre: 'Manteau laine Sézane bleu nuit', rattachement: { par: 'rapprochement', import: true } });
  const item = String(lidSuivant++);
  const a = await fiche({ titre: 'Manteau Sézane laine bleu', vinted: item });
  const job = (await un(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, listing_url,
      published_at, created_at, handler_build, platform_fields, photo_option)
    VALUES ($1, $2, 'vinted', 'published', 'publish', 'Manteau Sézane laine bleu', 20, $3, $4, now() - interval '3 days', now() - interval '3 days', '0.6.174', '{}', 'original') RETURNING id`,
  [U, a, item, `https://www.vinted.fr/items/${item}`])).id;
  const r = (await un(`SELECT public.inventaire_fusionner_pour($1, $2, $3, $4) AS r`, [U, g, a, marque])).r;
  await vendreSur(g, 'leboncoin', 'Leboncoin');
  return { r, job, retrait: await retraitDe(job), fiche: (await un(`SELECT inventaire_id FROM cross_post_jobs WHERE id = $1`, [job])).inventaire_id, g };
}
const retraitDe = async (job) => un(`SELECT d.id, d.status, d.platform_fields -> 'arme_par' AS arme_par, d.platform_fields ->> 'preuve' AS preuve FROM cross_post_jobs d
  WHERE d.action = 'delete' AND d.platform_fields #>> '{arme_par,depot}' = $1::text`, [job]);
const questionCopie = async (job) => un(`SELECT id, statut, preuves FROM inventaire_doublons WHERE motif = 'copie_non_prouvee' AND preuves ->> 'job' = $1::text`, [job]);
const logs = async (feature) => (await un(`SELECT count(*)::int AS n FROM usage_logs WHERE user_id = $1 AND feature = $2`, [U, feature])).n;

// ── 4. LES SCÉNARIOS (joués AVANT, puis APRÈS) ──────────────────────────────────────────────────────────────────────
// (a) UJ2 / Albator : « Oui » à une photo PROCHE entre UJ2 (eBay + « Ecusson pm » Leboncoin) et l'Albator (« Ecusson pm »
//     Leboncoin, importé).
async function casUJ2() {
  const uj2 = await fiche({ titre: 'Police Municipale Écusson/Patch Aubagne UJ2/U12 rond « Protéger et Servir »' });
  await annonce(uj2, { platform: 'ebay', titre: 'Police Municipale Écusson/Patch Aubagne UJ2/U12 rond', rattachement: { par: 'auto', motif: 'photo_identique' } });
  await annonce(uj2, { platform: 'leboncoin', titre: 'Ecusson pm', source: 'manuel' });
  const alb = await fiche({ titre: 'Ecusson pm' });
  const l2 = await annonce(alb, { platform: 'leboncoin', titre: 'Ecusson pm', rattachement: { par: 'rapprochement', import: true } });
  const q = await question(uj2, alb, 'photo_proche', { photo: 9, photo_niveau: 'proche', titre: 0.03, regle: 'rapprochement_v3' });
  const r = await decider(q, 'oui');
  const e = await un(`SELECT (SELECT statut FROM inventaire_doublons WHERE id = $1) AS statut, (SELECT preuves FROM inventaire_doublons WHERE id = $1) AS preuves,
      (SELECT fusionne_dans FROM inventaire WHERE id = $3) AS fusionne_dans, (SELECT inventaire_id FROM annonces_plateforme WHERE id = $4) AS l2_fiche,
      (SELECT count(*)::int FROM inventaire_fusions WHERE garde = $2) AS fusions`, [q, uj2, alb, l2.annonce]);
  return { r, e, lbc: await vivantes(uj2, 'leboncoin'), uj2, alb, q };
}
// (b) le chemin AUTOMATIQUE : rapprochement_v3_appliquer « fusionner » (réparation) — l'import Leboncoin intact rejoint
//     la fiche Vinted.
async function casV3() {
  const vin = await fiche({ titre: 'Robe Zara fleurie taille 38', vinted: String(lidSuivant++) });
  await c.query(`SELECT set_config('fillsell.import_releve', 'on', false)`);
  const imp = await fiche({ titre: 'Robe Zara fleurie T38', origine: 'releve_leboncoin' });
  await c.query(`SELECT set_config('fillsell.import_releve', '', false)`);
  const a = await annonce(imp, { platform: 'leboncoin', titre: 'Robe Zara fleurie T38', rattachement: { par: 'rapprochement', import: true } });
  const r = (await un(`SELECT public.rapprochement_v3_appliquer($1, $2, 'reparation', false) AS r`,
    [U, JSON.stringify([{ type: 'fusionner', annonce: a.annonce, absorbe: imp, garde: vin, preuve: { regle: 'rapprochement_v3' } }])])).r;
  const e = await un(`SELECT (SELECT par FROM inventaire_fusions WHERE garde = $1 AND absorbe = $2) AS par,
      (SELECT source_rapprochement FROM annonces_plateforme WHERE id = $3) AS source, (SELECT inventaire_id FROM cross_post_jobs WHERE id = $4) AS job_fiche,
      public.retrait_job_prouve($4) AS prouve`, [vin, imp, a.annonce, a.job]);
  return { r, e, vin, imp, a };
}
// (c) le retrait : la fiche vendue sur Vinted porte une copie Leboncoin rattachée AUTOMATIQUEMENT (rapprochement_attacher,
//     photo identique) et une copie Beebs CONFIRMÉE (dépôt FillSell).
async function casRetrait() {
  const f = await fiche({ titre: 'Veste en jean Levis taille M', vinted: String(lidSuivant++) });
  const lid = String(lidSuivant++);
  const { id: ann } = await un(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, prix, statut_plateforme, vu_le, created_at, publiee_le, source_rapprochement)
    VALUES ($1, 'leboncoin', $2, $3, 'Veste jean Levis M', 20, 'en_ligne', now(), now() - interval '3 days', now() - interval '3 days', NULL) RETURNING id`,
  [U, lid, `https://exemple.invalid/leboncoin/${lid}`]);
  const job = (await un(`SELECT public.rapprochement_attacher($1, $2, 'photo_identique', '{"regle":"rapprochement_v3"}'::jsonb) AS j`, [ann, f])).j;
  await c.query(`UPDATE cross_post_jobs SET published_at = now() - interval '3 days', created_at = now() - interval '3 days' WHERE id = $1`, [job]);
  const beebs = await annonce(f, { platform: 'beebs', titre: 'Veste en jean Levis taille M', releve: false, source: 'job' });
  await vendreSurVinted(f);
  return { f, lbc: { annonce: ann, job }, beebs, pf: (await un(`SELECT platform_fields FROM cross_post_jobs WHERE id = $1`, [job])).platform_fields };
}
// (c bis) la copie Leboncoin déplacée par la fusion AUTOMATIQUE du moteur (casV3), puis la vente Vinted de la fiche.
async function casRetraitApresFusionAuto() {
  const v3 = await casV3();
  await vendreSurVinted(v3.vin);
  return { ...v3, retrait: await retraitDe(v3.a.job), q: await questionCopie(v3.a.job) };
}
// (c ter) la copie déplacée par le « Oui » de la PERSONNE : confirmée, retirée à la vente.
async function casRetraitApresOui() {
  const vin = await fiche({ titre: 'Sac Longchamp Pliage bleu', vinted: String(lidSuivant++) });
  const imp = await fiche({ titre: 'Sac Longchamp Pliage bleu marine' });
  const a = await annonce(imp, { platform: 'leboncoin', titre: 'Sac Longchamp Pliage bleu marine', rattachement: { par: 'rapprochement', import: true } });
  const q = await question(vin, imp, 'photo_quasi_titre_different', { photo: 1.6 });
  const r = await decider(q, 'oui');
  await vendreSurVinted(vin);
  return { r, a, source: (await un(`SELECT source_rapprochement AS s FROM annonces_plateforme WHERE id = $1`, [a.annonce])).s,
    par: (await un(`SELECT par FROM inventaire_fusions WHERE garde = $1`, [vin]))?.par, retrait: await retraitDe(a.job), q: await questionCopie(a.job) };
}
// (05/11 soir, a) une copie Leboncoin rattachée AUTOMATIQUEMENT SANS photo identique (rapprochement par le titre,
//     rattachement.motif = 'titre_exact'), puis la vente Vinted de la fiche.
async function casCopieTitre() {
  const f = await fiche({ titre: 'Gilet Petit Bateau marinière 4 ans', vinted: String(lidSuivant++) });
  const a = await annonce(f, { platform: 'leboncoin', titre: 'Gilet Petit Bateau marinière 4 ans', rattachement: { par: 'auto', motif: 'titre_exact' } });
  await vendreSurVinted(f);
  return { f, a, retrait: await retraitDe(a.job), q: await questionCopie(a.job) };
}
// (05/11 soir, a) une copie CONFIRMÉE par la personne (« Oui, la retirer » d'une vente passée : meme_article_confirme),
//     puis déplacée sur une AUTRE fiche par une fusion automatique SANS photo identique (verdict de l'IA) — la
//     confirmation portait sur l'ancienne fiche ; retrait_job_prouve la croit encore prouvée. Puis la vente Vinted.
async function casConfirmeePuisFusionIA() {
  const vin = await fiche({ titre: 'Bottines Minelli cuir camel 38', vinted: String(lidSuivant++) });
  const x = await fiche({ titre: 'Bottines cuir camel Minelli pointure 38' });
  const a = await annonce(x, { platform: 'leboncoin', titre: 'Bottines cuir camel Minelli pointure 38',
    rattachement: { par: 'utilisateur', motif: 'meme_article_confirme', confirme: { question: null, le: new Date(Date.now() - 3 * 864e5).toISOString() } } });
  const r = (await un(`SELECT public.inventaire_fusionner_pour($1, $2, $3, 'ia (doublon proposé)') AS r`, [U, vin, x])).r;
  await vendreSurVinted(vin);
  return { r, a, vin, retrait: await retraitDe(a.job), q: await questionCopie(a.job),
    fiche: (await un(`SELECT inventaire_id FROM cross_post_jobs WHERE id = $1`, [a.job])).inventaire_id };
}
// (05/11 soir, c) « Annonce en double ? » : deux fiches unitaires, chacune son annonce Leboncoin (même photo, même
//     titre) ; « Oui ». Avec `republication` : même titre, même prix, même description (P16, la même annonce publiée
//     deux fois) — la seule exception.
async function casAnnonceEnDouble({ republication = false } = {}) {
  const titre = republication ? 'Trottinette Micro Maxi bleue' : 'Draisienne bois Janod';
  const desc = (k) => ({ description: republication ? 'Trottinette Micro Maxi bleue, très bon état, roues neuves, envoi possible.' : `Draisienne en bois Janod, exemplaire ${k}, bon état général.` });
  const f1 = await fiche({ titre }); const a1 = await annonce(f1, { platform: 'leboncoin', titre, prix: 30, capture: desc(1) });
  const f2 = await fiche({ titre }); const a2 = await annonce(f2, { platform: 'leboncoin', titre, prix: 30, capture: desc(2) });
  const q = await question(f1, f2, 'annonce_en_double', { platform: 'leboncoin', regle: 'rapprochement_v3', avant_stock: true });
  const r = await decider(q, 'oui');
  const e = await un(`SELECT (SELECT statut FROM inventaire_doublons WHERE id = $1) AS statut, (SELECT preuves FROM inventaire_doublons WHERE id = $1) AS preuves,
      (SELECT fusionne_dans FROM inventaire WHERE id = $2) AS fusionne_dans, (SELECT inventaire_id FROM annonces_plateforme WHERE id = $3) AS a2_fiche`, [q, f2, a2.annonce]);
  return { r, e, q, f1, f2, a1, a2, lbc: await vivantes(f1, 'leboncoin') };
}
// (d) la question « photo proche » sur un titre en série (3 annonces Leboncoin « Ecusson pm »).
async function casPhotoProche(suffixe) {
  const serie = `Ecusson pm ${suffixe}`;
  for (let i = 0; i < 3; i++) { const x = await fiche({ titre: serie }); await annonce(x, { platform: 'leboncoin', titre: serie }); }
  const ebay = await fiche({ titre: `Écusson Patch Police Municipale Albator ${suffixe}` });
  const nouvelle = await fiche({ titre: serie });
  const posee = (await un(`SELECT public.releve_poser_question($1, $2, $3, 'photo_proche', '{"photo":9}'::jsonb) AS p`, [U, ebay, nouvelle])).p;
  const ebay2 = await fiche({ titre: `Écusson Patch Police Municipale Albator bis ${suffixe}` });
  const quasi = (await un(`SELECT public.releve_poser_question($1, $2, $3, 'photo_quasi_titre_different', '{"photo":1.6}'::jsonb) AS p`, [U, ebay2, nouvelle])).p;
  const p1 = await fiche({ titre: `Pull rouge Zara col roulé ${suffixe}` }); const p2 = await fiche({ titre: `Pull Zara rouge ${suffixe}` });
  const unique = (await un(`SELECT public.releve_poser_question($1, $2, $3, 'photo_proche', '{"photo":11}'::jsonb) AS p`, [U, p1, p2])).p;
  return { posee, quasi, unique, ebay, nouvelle };
}
// P16 : la republication PROUVÉE (même titre, prix, description) reste la seule exception de (a).
async function casRepublication() {
  const desc = { description: 'Robe fleurie Zara taille 38, portée deux fois, très bon état, envoi rapide.' };
  const f1 = await fiche({ titre: 'Robe fleurie Zara taille 38' }); await annonce(f1, { platform: 'leboncoin', titre: 'Robe fleurie Zara taille 38', prix: 15, capture: desc });
  const f2 = await fiche({ titre: 'Robe fleurie Zara taille 38' }); await annonce(f2, { platform: 'leboncoin', titre: 'Robe fleurie Zara taille 38', prix: 15, capture: desc });
  await commeLaPersonne();
  const r = (await un(`SELECT public.inventaire_fusionner($1, $2) AS r`, [f1, f2])).r;
  await commeLeServeur();
  return { r, lbc: await vivantes(f1, 'leboncoin') };
}
// Une fiche EN SÉRIE (quantité 5) peut porter deux annonces de la même plateforme.
async function casSerieQuantite() {
  const f1 = await fiche({ titre: 'Lot de 10 crayons', quantite: 5 }); await annonce(f1, { platform: 'beebs', titre: 'Lot de 10 crayons' });
  const f2 = await fiche({ titre: 'Lot de 10 crayons couleur' }); await annonce(f2, { platform: 'beebs', titre: 'Lot de 10 crayons couleur' });
  await commeLaPersonne();
  const r = (await un(`SELECT public.inventaire_fusionner($1, $2) AS r`, [f1, f2])).r;
  await commeLeServeur();
  return { r };
}
// La fusion à la main (app) entre deux fiches unitaires qui ont chacune leur annonce Beebs.
async function casFusionMainConflit() {
  const f1 = await fiche({ titre: 'Basket Nike Air Max 42' }); await annonce(f1, { platform: 'beebs', titre: 'Basket Nike Air Max 42', releve: false, source: 'job' });
  const f2 = await fiche({ titre: 'Nike Air Max 42 blanche' }); await annonce(f2, { platform: 'beebs', titre: 'Nike Air Max 42 blanche' });
  await commeLaPersonne();
  const r = (await un(`SELECT public.inventaire_fusionner($1, $2) AS r`, [f1, f2])).r;
  await commeLeServeur();
  return { r, beebs: await vivantes(f1, 'beebs') };
}

try {
  console.log(`\n0. La base jetable porte le schéma public de prod (lu le ${catalogue.lu_le})`);
  const b = await construire();
  if (bavard) for (const e of b.echecs) console.log(`    · ${e}`);
  ok(b.nf >= catalogue.fonctions.length - 5, `fonctions de prod créées : ${b.nf}/${catalogue.fonctions.length}`, b.echecs.filter((e) => e.startsWith('fonction')).join(' | '));
  const manquantes = (await tous(`SELECT f FROM unnest($1::text[]) f WHERE NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = f AND p.pronamespace = 'public'::regnamespace)`, [CHAINE_FONCTIONS])).map((r) => r.f);
  ok(manquantes.length === 0, `les ${CHAINE_FONCTIONS.length} fonctions de la chaîne sont là (définitions de prod)`, manquantes.join(', '));
  ok(b.ntChaine > 0 && b.ntChaineOk === b.ntChaine, `déclencheurs de prod des tables de la chaîne : ${b.ntChaineOk}/${b.ntChaine} (tous : ${b.nt})`,
    b.echecs.filter((e) => e.startsWith('déclencheur')).join(' | '));
  ok(await md5De('public.retrait_job_prouve(uuid)') === RETRAIT_JOB_PROUVE_PROD, `retrait_job_prouve = prod (md5 ${RETRAIT_JOB_PROUVE_PROD}), jamais réécrite`);
  await c.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'preuve-rattachement@exemple.invalid')`, [U]);
  await c.query(`INSERT INTO profiles (id, email, is_premium, is_pro, is_business, extension_last_seen_at, extension_version, extension_build, lang)
    VALUES ($1, 'preuve-rattachement@exemple.invalid', true, true, true, now(), '0.6.174', '0.6.174', 'fr')`, [U]);

  // ── 1. AVANT : les définitions de prod ──
  console.log('\n1. AVANT — les définitions de prod (INVERSE)');
  await c.query(INVERSE);
  for (const s of SIGS) ok(await md5De(s) === MD5_PROD[s], `${s.split('(')[0].slice(7)} = prod (md5 ${MD5_PROD[s]})`);
  for (const s of NEUVES) ok(!(await existe(s)), `${s.split('(')[0].slice(7)} n'existe pas encore`);
  const av = {};
  {
    const x = await casUJ2();
    ok(x.r?.ok === true && x.lbc === 2 && x.e.statut === 'fusionnee', `LE DÉFAUT (a) : « Oui » à la photo proche → fusion, UJ2 porte ${x.lbc} annonces Leboncoin vivantes`, { r: x.r, e: x.e });
  }
  {
    const x = await casV3();
    av.v3 = x.e;
    ok(x.r?.faits?.fusionner === 1 && x.e.par === 'utilisateur:photo_rapprochement_v3' && x.e.source === 'manuel',
      `LE DÉFAUT (b) : fusion AUTOMATIQUE signée « ${x.e.par} », annonce passée « ${x.e.source} »`, { r: x.r, e: x.e });
    ok(x.e.prouve === true, 'le dépôt déplacé vaut preuve pour retrait_job_prouve (ventes, relevés)');
  }
  {
    const x = await casRetrait();
    ok(x.pf?.rattachement?.par === 'auto' && x.pf?.rattachement?.motif === 'photo_identique', 'copie Leboncoin rattachée automatiquement (rapprochement_attacher, photo identique)', x.pf);
    const rl = await retraitDe(x.lbc.job); const rb = await retraitDe(x.beebs.job);
    ok(!!rl && rl.status === 'pending', 'prod : vente Vinted → retrait ARMÉ sur la copie rattachée automatiquement par PHOTO IDENTIQUE (gardé : décision a)', rl);
    ok(!!rb, 'témoin : retrait armé sur la copie Beebs confirmée (dépôt FillSell)', rb);
  }
  {
    const x = await casRetraitApresFusionAuto();
    ok(!!x.retrait && !x.q, 'prod : la copie amenée par la fusion automatique PHOTO IDENTIQUE du moteur est retirée à la vente (gardé : décision a)', { retrait: x.retrait, q: x.q });
  }
  {
    const x = await casCopieTitre(); av.titre = x;
    ok(!x.retrait && x.q?.statut === 'proposee', 'prod : copie rattachée automatiquement par le TITRE → aucun retrait, la question « Déjà vendu ? » (retrait_job_prouve)', { retrait: x.retrait, q: x.q });
  }
  {
    const x = await casConfirmeePuisFusionIA(); av.ia = x;
    ok(x.r?.ok === true && String(x.fiche) === String(x.vin) && !!x.retrait && !x.q,
      'LE DÉFAUT (c) qui reste : copie confirmée PUIS déplacée par une fusion automatique SANS photo identique (IA) → retrait armé sans question', { r: x.r?.ok, retrait: x.retrait, q: x.q });
  }
  {
    const x = await casAnnonceEnDouble(); av.double = x;
    ok(x.r?.ok === true && x.lbc === 2 && x.e.statut === 'fusionnee',
      `LE DÉFAUT (c, 05/11 soir) : « Annonce en double ? » → « Oui » → fusion, la fiche unitaire porte ${x.lbc} annonces Leboncoin`, { r: x.r, e: x.e });
  }
  {
    const x = await casAnnonceEnDouble({ republication: true }); av.doubleRep = x;
    ok(x.r?.ok === true && x.lbc === 2, 'P16 : « Annonce en double ? » sur une republication prouvée → fusion (voulue le 15/10)', { r: x.r, lbc: x.lbc });
  }
  {
    const x = await casDepotFillSellApresFusionAuto('utilisateur:photo_rapprochement_v3_remise');
    ok(x.r?.ok === true && String(x.fiche) === String(x.g) && !!x.retrait, 'témoin : dépôt Vinted de FillSell déplacé par une fusion automatique → retiré à la vente Leboncoin', x);
  }
  {
    const x = await casRetraitApresOui();
    av.oui = x;
    ok(x.r?.ok === true && x.source === 'manuel' && x.par === 'utilisateur (doublon proposé)' && !!x.retrait,
      'témoin : « Oui » de la personne → fusion, « manuel », retrait de la copie à la vente', { r: x.r, source: x.source, par: x.par, retrait: x.retrait });
  }
  {
    const x = await casPhotoProche('avant');
    ok(x.posee === true, 'LE DÉFAUT (d) : « photo proche » posée sur un titre en série (3 annonces « Ecusson pm »)', x);
    ok(x.quasi === true && x.unique === true, 'témoins : photo quasi identique posée ; titre unique posé', x);
  }
  {
    const x = await casRepublication(); av.rep = x;
    ok(x.r?.ok === true && x.lbc === 2, 'P16 (republication prouvée) : regroupée, deux annonces Leboncoin (voulu le 15/10)', x);
  }
  {
    const x = await casSerieQuantite(); av.serie = x;
    ok(x.r?.ok === true, 'fiche en série (quantité 5) : la fusion passe', x.r);
  }

  // ── 2. APRÈS : la migration ──
  console.log('\n2. APRÈS — la migration, appliquée en entier');
  await c.query(MIGRATION);
  const md5Neufs = {};
  for (const s of SIGS) { md5Neufs[s] = await md5De(s); ok(md5Neufs[s] !== MD5_PROD[s], `${s.split('(')[0].slice(7)} réécrite (md5 ${md5Neufs[s]})`); }
  for (const s of NEUVES) ok(await existe(s), `${s.split('(')[0].slice(7)} créée`);
  ok(await md5De('public.retrait_job_prouve(uuid)') === RETRAIT_JOB_PROUVE_PROD, 'retrait_job_prouve INTACTE (ventes, relevés, messagerie : inchangés)');
  const acl = await un(`SELECT has_function_privilege('authenticated', 'public.rattachement_confirme(uuid)', 'EXECUTE') AS a1,
    has_function_privilege('anon', 'public.titre_en_serie(uuid,text)', 'EXECUTE') AS a2,
    has_function_privilege('service_role', 'public.rattachement_confirme(uuid)', 'EXECUTE') AS s1`);
  ok(!acl.a1 && !acl.a2 && acl.s1, 'les deux neuves : ni anon ni authenticated, service_role oui', acl);

  console.log('\n   (a) une fiche unitaire ne porte jamais deux annonces de la même plateforme');
  {
    const x = await casUJ2();
    ok(x.r?.ok === false && x.r?.reason === 'deux_annonces_meme_plateforme' && JSON.stringify(x.r?.plateformes) === '["leboncoin"]',
      `UJ2 / Albator : « Oui » REFUSÉ, motif « ${x.r?.reason} », plateformes ${JSON.stringify(x.r?.plateformes)}`, x.r);
    ok(/Leboncoin/.test(x.r?.message ?? '') && /deux exemplaires/.test(x.r?.message ?? ''), `raison lisible : « ${x.r?.message} »`);
    ok(x.lbc === 1 && x.e.fusionne_dans === null && String(x.e.l2_fiche) === String(x.alb) && x.e.fusions === 0,
      'rien n\'est regroupé : UJ2 garde 1 annonce Leboncoin, l\'Albator reste une fiche avec la sienne, aucune fusion écrite', x.e);
    ok(x.e.statut === 'proposee' && x.e.preuves?.fusion_refusee?.motif === 'deux_annonces_meme_plateforme' && /Leboncoin/.test(x.e.preuves?.fusion_refusee?.message ?? ''),
      'la question RESTE OUVERTE et porte sa raison (preuves.fusion_refusee)', x.e.preuves?.fusion_refusee);
    const non = await decider(x.q, 'non');
    ok(non?.ok === true && (await un(`SELECT statut FROM inventaire_doublons WHERE id = $1`, [x.q])).statut === 'refusee', '« Non, deux exemplaires » reste possible ensuite', non);
  }
  {
    const x = await casFusionMainConflit();
    ok(x.r?.ok === false && x.r?.reason === 'deux_annonces_meme_plateforme' && x.beebs === 1, 'fusion à la main (app) de deux fiches unitaires à annonce Beebs : refusée', x);
  }
  {
    const x = await casRepublication();
    ok(x.r?.ok === av.rep.r?.ok && x.lbc === av.rep.lbc, 'P16 (republication prouvée) : INCHANGÉE (seule exception, voulue le 15/10)', x);
  }
  {
    const x = await casSerieQuantite();
    ok(x.r?.ok === true, 'fiche en série (quantité 5) : INCHANGÉE, la fusion passe', x.r);
  }

  console.log('\n   décision c (05/11 soir) : « Annonce en double ? » → « Oui » refusé sur une fiche unitaire, sauf republication prouvée');
  {
    const x = await casAnnonceEnDouble({ republication: true });
    ok(x.r?.ok === true && x.lbc === 2 && x.e.statut === 'fusionnee' && x.lbc === av.doubleRep.lbc,
      'décision b : la republication PROUVÉE (même titre, prix, description) se regroupe toujours — deux annonces Leboncoin sur la fiche', { r: x.r?.ok, lbc: x.lbc, e: x.e.statut });
  }
  {
    const x = await casAnnonceEnDouble();
    ok(x.r?.ok === false && x.r?.reason === 'deux_annonces_meme_plateforme' && JSON.stringify(x.r?.plateformes) === '["leboncoin"]' && x.r?.decision === 'oui',
      `« Oui » REFUSÉ, motif « ${x.r?.reason} »`, x.r);
    ok(/^Cette fiche a déjà une annonce Leboncoin en ligne/.test(x.r?.message ?? '') && /deux exemplaires/.test(x.r?.message ?? '') && /Rien n'a été regroupé/.test(x.r?.message ?? ''),
      `le retour de la RPC porte le motif lisible : « ${x.r?.message} »`);
    ok(x.lbc === 1 && x.e.fusionne_dans === null && String(x.e.a2_fiche) === String(x.f2), 'rien n\'est regroupé : chaque fiche garde son annonce Leboncoin', x.e);
    ok(x.e.statut === 'proposee' && x.e.preuves?.fusion_refusee?.motif === 'deux_annonces_meme_plateforme' && x.e.preuves?.fusion_refusee?.message === x.r?.message,
      'la question reste ouverte et garde le même motif (preuves.fusion_refusee)', x.e.preuves?.fusion_refusee);
    const non = await decider(x.q, 'non');
    ok(non?.ok === true && (await un(`SELECT statut FROM inventaire_doublons WHERE id = $1`, [x.q])).statut === 'refusee', '« Non, deux exemplaires » reste possible ensuite', non);
  }
  {
    // v23 (15/10, inchangée) : une personne qui a répondu « Non, deux exemplaires » à un « Annonce en double ? » n'a plus
    // jamais de republication déduite (rapprochement_republication_prouvee) — Louis duplique ses articles. Son « Oui »
    // est donc refusé, même sur une annonce publiée deux fois à l'identique.
    const x = await casAnnonceEnDouble({ republication: true });
    ok(x.r?.ok === false && x.r?.reason === 'deux_annonces_meme_plateforme' && x.lbc === 1 && x.e.statut === 'proposee',
      'après un « Non, deux exemplaires » du compte (règle v23) : plus de republication déduite → « Oui » refusé, motif lisible', { r: x.r, lbc: x.lbc });
  }

  console.log('\n   (b) le chemin automatique ne signe plus « utilisateur » ni « manuel »');
  {
    const x = await casV3();
    ok(x.r?.faits?.fusionner === 1 && x.e.par === 'auto:photo_rapprochement_v3 (photo_identique)', `fusion automatique signée « ${x.e.par} »`, { r: x.r, e: x.e });
    ok(x.e.source === 'automatique', `l'annonce déplacée garde sa source « ${x.e.source} » (jamais « manuel »)`);
    ok(x.e.prouve === av.v3.prouve && String(x.e.job_fiche) === String(x.vin), 'retrait_job_prouve : même réponse qu\'avant (ventes et relevés inchangés)', { avant: av.v3.prouve, apres: x.e.prouve });
    ok((await un(`SELECT public.rattachement_confirme($1) AS r`, [x.a.job])).r === true, 'rattachement_confirme : OUI (fusion automatique par photo identique = preuve, décision a)');
  }
  {
    const x = await casRetraitApresOui();
    ok(x.r?.ok === true && x.source === 'manuel' && x.par === 'utilisateur (doublon proposé)',
      'le « Oui » de la personne : fusion, « manuel », signée « utilisateur (doublon proposé) » — INCHANGÉ', { r: x.r, source: x.source, par: x.par });
  }

  console.log('\n   (c) + décision a (05/11 soir) : la photo identique reste une preuve ; jamais un retrait sur un rattachement automatique SANS photo identique non confirmé');
  {
    const n0 = await logs('retrait_refuse_rattachement_automatique');
    const x = await casRetrait();
    const rl = await retraitDe(x.lbc.job); const rb = await retraitDe(x.beebs.job);
    ok(!!rl && rl.status === 'pending' && rl.preuve === null, 'vente Vinted : retrait ARMÉ comme avant sur la copie Leboncoin rattachée automatiquement par PHOTO IDENTIQUE', rl);
    ok(!(await questionCopie(x.lbc.job)), 'aucune question « Déjà vendu ? » sur cette copie (son retrait est armé)');
    ok((await un(`SELECT public.rattachement_confirme($1) AS r`, [x.lbc.job])).r === true, 'rattachement_confirme : OUI (rattachement automatique « photo_identique »)');
    ok(!!rb && rb.status === 'pending', 'témoin : la copie Beebs CONFIRMÉE (dépôt FillSell) est retirée comme avant', rb);
    ok((await logs('retrait_refuse_rattachement_automatique')) === n0, 'aucune trace de refus');
  }
  {
    const x = await casRetraitApresFusionAuto();
    ok(!!x.retrait && x.retrait.status === 'pending' && !x.q, 'copie amenée par la fusion automatique PHOTO IDENTIQUE du moteur (« auto:… (photo_identique) ») : retirée comme avant, aucune question', { retrait: x.retrait, q: x.q });
  }
  {
    const n0 = await logs('retrait_refuse_rattachement_automatique');
    const x = await casCopieTitre();
    ok(!x.retrait && x.q?.statut === 'proposee' && x.q?.preuves?.rattachement_automatique === true && x.q?.preuves?.platform === 'leboncoin'
      && x.q?.preuves?.annonce_id === x.a.annonce && x.q?.preuves?.vendu_sur === 'vinted',
      'copie rattachée automatiquement par le TITRE : aucun retrait, la question « Déjà vendu ? » (comme avant), marquée rattachement_automatique', { retrait: x.retrait, q: x.q?.preuves });
    ok((await un(`SELECT public.rattachement_confirme($1) AS r`, [x.a.job])).r === false, 'rattachement_confirme : NON (automatique sans photo identique)');
    // Un appel direct (enregistrer_vente_atomique, cross_post_jobs_publie_sur_article_vendu…) : refusé.
    const d = (await un(`SELECT public.armer_retrait_job($1, 'preuve_appel_direct', '0') AS d`, [x.a.job])).d;
    ok(d === null && !(await retraitDe(x.a.job)), 'appel direct d\'armer_retrait_job : refusé (retrait_job_prouve l\'arrête déjà)', { d, n: (await logs('retrait_refuse_rattachement_automatique')) - n0 });
    // La personne confirme : « Oui, la retirer » sur l'annonce montrée → le retrait part.
    const r = await decider(x.q.id, 'oui', x.a.annonce);
    const rl2 = await retraitDe(x.a.job);
    const pf = (await un(`SELECT platform_fields FROM cross_post_jobs WHERE id = $1`, [x.a.job])).platform_fields;
    ok(r?.ok === true && r?.retraits === 1 && rl2?.status === 'pending' && rl2?.preuve === 'geste_deja_vendu'
      && pf?.rattachement?.par === 'utilisateur' && pf?.rattachement?.motif === 'meme_article_confirme',
      '« Oui, la retirer » : rattachement confirmé par la personne, retrait armé (preuve = son geste)', { r, rl2, ratt: pf?.rattachement });
    ok((await un(`SELECT public.rattachement_confirme($1) AS r`, [x.a.job])).r === true, 'rattachement_confirme : OUI après le geste');
  }
  {
    const n0 = await logs('retrait_refuse_rattachement_automatique');
    const x = await casConfirmeePuisFusionIA();
    ok(x.r?.ok === true && String(x.fiche) === String(x.vin) && !x.retrait && x.q?.statut === 'proposee' && x.q?.preuves?.rattachement_automatique === true,
      'copie confirmée PUIS déplacée par une fusion automatique SANS photo identique (IA) : plus de retrait, la question « Déjà vendu ? »', { r: x.r?.ok, retrait: x.retrait, q: x.q?.preuves });
    ok(av.ia.retrait && !x.retrait, 'le seul chemin qui change aujourd\'hui (0 en prod le 05/11 soir) : retrait avant → question après');
    ok((await un(`SELECT public.retrait_job_prouve($1) AS p, public.rattachement_confirme($1) AS c`, [x.a.job])).p === true
      && (await un(`SELECT public.rattachement_confirme($1) AS c`, [x.a.job])).c === false, 'retrait_job_prouve la croit prouvée (inchangée) ; rattachement_confirme : NON');
    const d = (await un(`SELECT public.armer_retrait_job($1, 'preuve_appel_direct', '0') AS d`, [x.a.job])).d;
    ok(d === null && (await logs('retrait_refuse_rattachement_automatique')) === n0 + 1, 'appel direct d\'armer_retrait_job : refusé, trace « retrait_refuse_rattachement_automatique »');
  }
  {
    const x = await casRetraitApresOui();
    ok(!!x.retrait && x.retrait.status === 'pending' && !x.q, 'témoin : copie amenée par le « Oui » de la personne → retrait armé comme avant, aucune question', { retrait: x.retrait, q: x.q });
  }
  {
    const x = await casDepotFillSellApresFusionAuto('auto:photo_rapprochement_v3_remise (photo_identique)');
    ok(x.r?.ok === true && String(x.fiche) === String(x.g) && !!x.retrait && x.retrait.status === 'pending',
      'limite voulue : dépôt Vinted de FillSell (aucune annonce relevée) déplacé par une fusion automatique → TOUJOURS retiré (jamais laissé en ligne sans question)', x);
  }

  console.log('\n   (d) plus de « photo proche » sur un titre en série');
  {
    const n0 = await logs('question_photo_proche_ecartee');
    const x = await casPhotoProche('apres');
    ok(x.posee === false, '« photo proche » + titre en série (3 annonces Leboncoin « Ecusson pm ») : question NON posée');
    ok((await logs('question_photo_proche_ecartee')) === n0 + 1, 'trace usage_logs « question_photo_proche_ecartee »');
    const again = (await un(`SELECT public.releve_poser_question($1, $2, $3, 'photo_proche', '{"photo":9}'::jsonb) AS p`, [U, x.ebay, x.nouvelle])).p;
    ok(again === false && (await logs('question_photo_proche_ecartee')) === n0 + 1, 'reposée le même jour : toujours non, une seule trace par paire et par jour');
    ok(x.quasi === true, 'témoin : photo QUASI identique sur le même titre en série → la question reste posée');
    ok(x.unique === true, 'témoin : « photo proche » sur des titres uniques → la question reste posée');
    const ser = await un(`SELECT public.titre_en_serie($1, 'Ecusson pm apres') AS a, public.titre_en_serie($1, 'ECUSSON  PM — apres') AS b,
      public.titre_en_serie($1, 'Veste en jean Levis taille M') AS c, public.titre_en_serie($1, '') AS d`, [U]);
    ok(ser.a && ser.b && !ser.c && !ser.d, 'titre_en_serie : normalisé comme le moteur, par plateforme, jamais sur un titre vide', ser);
  }

  // ── 3. L'INVERSE ──
  console.log("\n3. L'INVERSE : les définitions de prod, mot pour mot");
  await c.query(INVERSE);
  for (const s of SIGS) ok(await md5De(s) === MD5_PROD[s], `${s.split('(')[0].slice(7)} revenue à la prod`);
  for (const s of NEUVES) ok(!(await existe(s)), `${s.split('(')[0].slice(7)} retirée`);
  {
    const x = await casUJ2();
    ok(x.r?.ok === true && x.lbc === 2, 'avec l\'inverse, le défaut (a) revient (comportement de prod)', x.r);
  }
  await c.query(MIGRATION);
  for (const s of SIGS) ok(await md5De(s) === md5Neufs[s], `la migration se rejoue (CREATE OR REPLACE) : ${s.split('(')[0].slice(7)}`);
} catch (e) {
  ko++; console.log(`  ✗ ERREUR : ${e.message}\n${e.stack?.split('\n').slice(1, 4).join('\n')}`);
} finally {
  await c.end().catch(() => {});
  if (embarque) { await embarque.pg.stop().catch(() => {}); rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — migration prouvée de bout en bout sur un Postgres jetable`);
process.exit(ko ? 1 : 0);
