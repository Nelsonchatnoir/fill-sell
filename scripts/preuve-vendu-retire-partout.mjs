// PREUVE DE BOUT EN BOUT, SUR UN POSTGRES JETABLE, de la migration 20261105240000_vendu_retire_partout (05/11 soir,
// règle de Nico « VENDU QUELQUE PART = RETIRÉ PARTOUT », toutes plateformes ; séries et plusieurs exemplaires jamais
// concernés) :
//   · le Doudou de nicolas.menar tel qu'il est en prod (dépôt Leboncoin 13627ae2 portant le numéro du « Lot 2 doudous »
//     3267000921 et l'annonce déposée 3274924341 ; dépôt Beebs d23190b7 SANS numéro, lien …/p/34032772 ; rattachements
//     automatiques « titre_exact » hérités) : AVANT, une annonce Leboncoin sans retrait NI question, et le « Oui » de la
//     question Leboncoin retire le numéro du dépôt (l'annonce d'à côté) ; APRÈS, chaque annonce a sa question, et le
//     « Oui » retire L'ANNONCE MONTRÉE (Leboncoin 3274924341 par son numéro, Beebs sans numéro par son lien) ;
//   · le même Doudou aux dépôts PROUVÉS (dépôts de FillSell) : vente Vinted → retrait Leboncoin + retrait Beebs SANS
//     numéro (par le lien), d'office, comme avant ;
//   · une série (titre en série, deux ventes) : rien ;
//   · une pièce unique à rattachement NON prouvé (annonce relevée dont le dépôt est annulé, ou sans dépôt) : la question ;
//   · les exclusions (annonce Leboncoin sous transaction, mise en ligne après la vente, déclarée retirée, Opla, « Vendu,
//     encore en ligne — Retirer » déjà posé, plateforme de la vente) : rien ;
//   · le RATTRAPAGE : une vente PASSÉE dont une copie est encore vue en ligne — un relevé qui la revoit ne reprend RIEN
//     (avant comme après) ; la relance par le circuit normal : la question posée par la même fonction
//     (poser_questions_copies_non_prouvees), puis le « Oui » de la personne ; pour un dépôt prouvé, armer_retrait_job_pour ;
//   · l'INVERSE rend la prod mot pour mot.
//
//   PREUVE_PG=embarque node scripts/preuve-vendu-retire-partout.mjs                       (Postgres 17 jetable sur le PC)
//   PREUVE_PG=embarque node scripts/preuve-vendu-retire-partout.mjs --catalogue <f.json>  (catalogue déjà lu, hors ligne)
//
// Le schéma public DE PROD est relu à neuf (comme scripts/preuve-rattachement-regles.mjs) : fonctions
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
const MIGRATION = lire('supabase/migrations/20261105240000_vendu_retire_partout.sql');
const INVERSE = lire('supabase/rollbacks/20261105240000_vendu_retire_partout_INVERSE.sql');
// md5 des définitions de prod du 05/11 soir (pg_get_functiondef, SANS les retours chariot) — l'INVERSE les porte mot pour mot.
const MD5_PROD = {
  'public.poser_questions_copies_non_prouvees(bigint,uuid,text,text)': 'c045dd68dcf39340dfb65249ca0b969f',
  'public.inventaire_doublon_decider(uuid,text,uuid)': '5ada387c781c2767cc0019c9845811c3',
};
const SIGS = Object.keys(MD5_PROD);
const NEUVE = 'public.armer_retrait_annonce_pour(uuid,text,interval,boolean)';
// Jamais réécrites : vérifiées intactes (les règles du 05/11 et le retrait d'office des dépôts prouvés).
const INTACTES = {
  'public.armer_retraits_copies(bigint,text,uuid,text,interval)': 'e69108472d6e0db3664cd412e6ef73ae',
  'public.armer_retrait_job_pour(uuid,text,interval,boolean)': '6ae927733a30ed5f88c2d649f5ec0c5e',
  'public.retrait_job_prouve(uuid)': 'aa37decdd369f3b7bb8438f62004b418',
  'public.rattachement_confirme(uuid)': 'bc3605edbc26cd60a026452698d1d1e2',
};

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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-vendu-retire-partout-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55463, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55463/postgres';
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


// Les fonctions et tables de LA CHAÎNE vente → retrait : leur absence casse la preuve (le reste du schéma est « au mieux »).
const CHAINE_FONCTIONS = ['inventaire_doublon_decider', 'armer_retrait_job_pour', 'armer_retrait_job', 'armer_retraits_copies',
  'poser_questions_copies_non_prouvees', 'retrait_job_prouve', 'rattachement_confirme', 'fiche_annonces_vivantes', 'titre_en_serie',
  'listing_designe', 'retrait_meme_annonce', 'opla_sortie_passee', 'vente_instant', 'inventaire_vendu_retire_ses_copies', 'annonce_importee',
  'vente_apres_mise_en_ligne', 'annonce_mise_en_ligne', 'vente_prouvee_fiche_liee', 'retrait_garde_vendue_et_doublon',
  'retrait_identifiant_depuis_lien', 'retrait_redirige_annonce_remplacee', 'retrait_cible_vivante', 'rapprochement_texte_norm',
  'cross_post_jobs_retrait_ferme_annonce', 'cross_post_jobs_lien_suit_identifiant', 'identifiant_annonce_depuis_lien'];
const CHAINE_TABLES = ['inventaire', 'annonces_plateforme', 'cross_post_jobs', 'inventaire_fusions', 'inventaire_doublons', 'ventes',
  'usage_logs'];

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
const U = '0f5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e60';
let invSuivant = 7900000000000, lidSuivant = 3399600000;
const PHOTOS = JSON.stringify(['https://exemple.invalid/1.jpg']);
const commeLaPersonne = () => c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: U, role: 'authenticated' })]);
const commeLeServeur = () => c.query(`SELECT set_config('request.jwt.claims', '{}', false)`);
const nouveau = () => String(lidSuivant++);
let motSuivant = 0;
const mot = () => { let k = motSuivant++, m = ''; do { m = String.fromCharCode(97 + (k % 26)) + m; k = Math.floor(k / 26); } while (k > 0); return `essai${m}`; };
async function fiche({ titre, quantite = 1, statut = 'stock', vinted = null, origine = null, plateforme = null }) {
  const inv = invSuivant++;
  await c.query(`INSERT INTO inventaire (id, user_id, titre, statut, quantite, prix_vente, description, photos, origine, vinted_item_id, vinted_status, plateforme, created_at)
    VALUES ($1, $2, $3, $4, $5, 24, 'Très bon état.', $6, $7, $8, $9, $10, now() - interval '60 days')`,
  [inv, U, titre, statut, quantite, PHOTOS, origine, vinted, vinted ? 'active' : null, plateforme]);
  return inv;
}
// Un dépôt (cross_post_jobs). Une republication est créée « publish » puis passée « republish » (le garde-fou de
// maintenance des republications ne juge que la création ; ici, on décrit l'état de prod, on ne republie rien).
async function depot(inv, { platform, action = 'publish', status = 'published', listing = null, url = null, pf = {}, titre = 'Article', il = '45 days' }) {
  const id = (await un(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, listing_url,
      published_at, created_at, handler_build, platform_fields, photo_option)
    VALUES ($1, $2, $3, $4, 'publish', $5, 24, $6, $7, now() - $8::interval, now() - $8::interval, '0.6.174', $9, 'original') RETURNING id`,
  [U, inv, platform, status, titre, listing, url, il, JSON.stringify(pf)])).id;
  if (action !== 'publish') await c.query(`UPDATE cross_post_jobs SET action = $2 WHERE id = $1`, [id, action]);
  return id;
}
// Une annonce relevée (annonces_plateforme).
async function releve(inv, { platform, listing, url = null, titre, job = null, source = 'automatique', vu = '1 hour', cree = '45 days', publiee = null,
  statut = 'en_ligne', tx = null, quantite = null, prix = 24 }) {
  return (await un(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, prix, statut_plateforme, inventaire_id, job_id,
      source_rapprochement, vu_le, created_at, publiee_le, transaction_plateforme, quantite)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now() - $11::interval, now() - $12::interval, now() - $13::interval, $14, $15) RETURNING id`,
  [U, platform, listing, url ?? `https://exemple.invalid/${platform}/${listing}`, titre, prix, statut, inv, job, source, vu, cree, publiee ?? cree, tx, quantite])).id;
}
// La vente d'une fiche (comme l'enregistrent les chemins de vente) : la vente, puis la fiche « vendu » — le déclencheur
// inventaire_vendu_retire_ses_copies arme les retraits prouvés et pose les questions. `il` : une vente PASSÉE.
async function vendreSur(inv, code, libelle, { il = null } = {}) {
  await c.query(`INSERT INTO ventes (user_id, inventaire_id, titre, prix_vente, quantite, plateforme, plateforme_code, vendu_le, date, source)
    VALUES ($1, $2, 'vente', 24, 1, $3, $4, now() - COALESCE($5::interval, '0'), (now() - COALESCE($5::interval, '0'))::date, 'preuve')`, [U, inv, libelle, code, il]);
  await c.query(`UPDATE inventaire SET statut = 'vendu', quantite = 0, plateforme = $2 WHERE id = $1`, [inv, libelle]);
}
const questionsDe = async (inv) => tous(`SELECT id, statut, preuves FROM inventaire_doublons WHERE user_id = $1 AND garde = $2 AND motif = 'copie_non_prouvee'
  ORDER BY created_at, id`, [U, inv]);
const questionDeLAnnonce = async (inv, annonce) => (await questionsDe(inv)).find((q) => q.preuves?.annonce_id === annonce) ?? null;
const retraitsDe = async (inv) => tous(`SELECT id, platform, status, platform_listing_id AS pid, listing_url AS url, platform_fields AS pf
  FROM cross_post_jobs WHERE user_id = $1 AND inventaire_id = $2 AND action = 'delete' ORDER BY created_at, id`, [U, inv]);
const decider = async (q, decision, montree = null) => { await commeLaPersonne(); const r = (await un(`SELECT public.inventaire_doublon_decider($1, $2, $3) AS r`, [q, decision, montree])).r; await commeLeServeur(); return r; };
const TITRE_DOUDOU = () => `Doudou Marie les aristochats gris et blanc disney baby en très bon état ${mot()}`;

// Le Doudou de nicolas.menar, TEL QU'IL EST EN PROD (fiche 1790106697754007) — ou, `prouve`, aux dépôts PROUVÉS (dépôts de
// FillSell, aucun rattachement automatique ; le dépôt Leboncoin porte SON numéro, une seule annonce Leboncoin).
async function casDoudou({ prouve = false } = {}) {
  const t = TITRE_DOUDOU();
  const f = await fiche({ titre: t, vinted: nouveau() });
  const auto = prouve ? {} : { source: 'releve', rattachement: { par: 'auto', motif: 'titre_exact', score: 0.95 } };
  const lot = nouveau(), dep = nouveau(), bb = nouveau();
  const numLbc = prouve ? dep : lot;
  const jl = await depot(f, { platform: 'leboncoin', action: 'republish', listing: numLbc, url: `https://www.leboncoin.fr/ad/jeux_jouets/${numLbc}`, titre: t,
    pf: { ...auto, republish_step: 'recreated', old_platform_listing_id: nouveau(), lbc_depot: { adsubmit: { id: dep, statut: 'created' } } } });
  const aLot = prouve ? null : await releve(f, { platform: 'leboncoin', listing: lot, url: `https://www.leboncoin.fr/ad/jeux_jouets/${lot}`, job: jl, source: 'job',
    titre: `Lot 2 doudous Marie les aristochats gris et blancs disney baby en très bon état ${mot()}`, prix: 36, vu: '2 hours', cree: '44 days', publiee: '56 days' });
  const aDep = await releve(f, { platform: 'leboncoin', listing: dep, url: `https://www.leboncoin.fr/ad/jeux_jouets/${dep}`, job: jl, source: 'job',
    titre: t, vu: '1 hour', cree: '44 days' });
  const urlBb = `https://www.beebs.app/fr/p/${bb}-doudou-marie-les-aristochats-gris-et-blanc-disney-baby-en-tr-s-bon-tat`;
  const jb = await depot(f, { platform: 'beebs', action: 'republish', listing: null, url: urlBb, titre: t, il: '43 days',
    pf: { ...auto, republish_step: 'recreated', old_platform_listing_id: nouveau() } });
  const aBb = await releve(f, { platform: 'beebs', listing: bb, url: urlBb, job: jb, source: 'job', titre: t, vu: '1 hour', cree: '43 days' });
  const pidBb = (await un(`SELECT platform_listing_id AS p FROM cross_post_jobs WHERE id = $1`, [jb])).p;
  await vendreSur(f, 'vinted', 'Vinted');
  return { f, jl, jb, aLot, aDep, aBb, lot, dep, bb, pidBb };
}
// Une pièce unique à rattachement NON prouvé : son annonce Leboncoin relevée, rattachée par le moteur (titre), dont le
// dépôt de suivi a été ANNULÉ (« en cours de republication »), ou rattachée SANS dépôt. Vente Vinted.
async function casNonProuve({ sansDepot = false } = {}) {
  const titre = `${sansDepot ? 'Veste Kiabi rouge 4 ans' : 'Puzzle Ravensburger 1000 pièces Tour Eiffel'} ${mot()}`;
  const f = await fiche({ titre, vinted: nouveau() });
  const l = nouveau();
  const j = sansDepot ? null : await depot(f, { platform: 'leboncoin', status: 'cancelled', listing: l, url: `https://www.leboncoin.fr/ad/jeux_jouets/${l}`, titre,
    pf: { source: 'releve', rattachement: { par: 'auto', motif: 'titre_exact' } } });
  if (j) await c.query(`UPDATE cross_post_jobs SET error = 'Annonce en cours de republication sur Leboncoin (retirée puis redéposée pour remonter dans le fil) — pas une vente' WHERE id = $1`, [j]);
  const a = await releve(f, { platform: 'leboncoin', listing: l, url: `https://www.leboncoin.fr/ad/jeux_jouets/${l}`, job: j, titre });
  await vendreSur(f, 'vinted', 'Vinted');
  return { f, j, a, l };
}
// Une SÉRIE : le même titre sur 3 annonces Leboncoin vivantes du compte (trois fiches) ; la fiche vendue porte l'une
// d'elles (dépôt annulé). Et une fiche à DEUX ventes (plusieurs exemplaires).
async function casSerie(suffixe) {
  const titre = `T-shirt Zara blanc taille M ${suffixe}`;
  const f = await fiche({ titre, vinted: nouveau() });
  const autres = [await fiche({ titre }), await fiche({ titre })];
  for (const x of autres) await releve(x, { platform: 'leboncoin', listing: nouveau(), titre });
  const a = await releve(f, { platform: 'leboncoin', listing: nouveau(), titre, job: null });
  await vendreSur(f, 'vinted', 'Vinted');
  const g = await fiche({ titre: `Crayons Faber-Castell x12 ${suffixe}`, quantite: 2 });
  const b = await releve(g, { platform: 'beebs', listing: nouveau(), titre: `Crayons Faber-Castell x12 ${suffixe}`, job: null });
  await c.query(`INSERT INTO ventes (user_id, inventaire_id, titre, prix_vente, quantite, plateforme, plateforme_code, vendu_le, date, source)
    VALUES ($1, $2, 'vente', 5, 1, 'Vinted', 'vinted', now() - interval '2 days', current_date - 2, 'preuve')`, [U, g]);
  await vendreSur(g, 'vinted', 'Vinted');
  return { f, a, g, b };
}
// Les exclusions : chacune sur sa fiche (pièce unique vendue sur Vinted), une annonce relevée sans dépôt publié.
async function casExclusions() {
  const out = {};
  const une = async (cle, opts, avant = null, apres = null, vente = ['vinted', 'Vinted']) => {
    const titre = `Exclusion ${cle} ${mot()}`;
    const f = await fiche({ titre, vinted: nouveau() });
    const pre = avant ? await avant(f, titre) : null;
    const a = await releve(f, { platform: 'leboncoin', listing: nouveau(), titre, ...opts(pre) });
    if (apres) await apres(a);
    await vendreSur(f, vente[0], vente[1]);
    out[cle] = { f, a, q: await questionsDe(f), r: await retraitsDe(f) };
  };
  await une('transaction_leboncoin', () => ({ tx: 'sold' }));
  await une('mise_en_ligne_apres_vente', () => ({ cree: '-1 hour', publiee: '-1 hour' }));
  await une('opla', () => ({ platform: 'opla', listing: `art_${nouveau()}` }));
  await une('plateforme_de_la_vente', () => ({}), null, null, ['leboncoin', 'Leboncoin']);
  await une('declaree_retiree', (j) => ({ job: j.j, listing: j.l, url: j.url }), async (f, titre) => {
    const l = nouveau(); const url = `https://www.leboncoin.fr/ad/jeux_jouets/${l}`;
    const j = await depot(f, { platform: 'leboncoin', status: 'cancelled', listing: l, url, titre, pf: { source: 'releve' } });
    await c.query(`UPDATE cross_post_jobs SET error = 'Réponse dans l''app : « je l''ai retirée moi-même » — pas une vente' WHERE id = $1`, [j]);
    return { j, l, url };
  });
  await une('vendu_encore_en_ligne_a_regler', (j) => ({ job: j.j, listing: j.l }), async (f, titre) => {
    const l = nouveau();
    const j = await depot(f, { platform: 'leboncoin', status: 'cancelled', listing: l, titre,
      pf: { source: 'releve', pending_removal: true, vendu_encore_en_ligne: { par: 'rapprochement_v3' } } });
    return { j, l };
  });
  await une('disparue', () => ({ statut: 'en_ligne' }), null, (a) => c.query(`UPDATE annonces_plateforme SET disparu_le = now() WHERE id = $1`, [a]));
  return out;
}
// Le RATTRAPAGE : une vente PASSÉE (il y a 10 jours) dont une copie est encore vue en ligne. (a) annonce relevée à dépôt
// annulé (non prouvée) ; (b) dépôt Beebs PROUVÉ (photo identique) rattaché APRÈS la vente (fiche née vendue d'un import,
// comme la montre Swatch de boncoin59300) — aucun déclencheur ne l'a jugé.
async function casRattrapage() {
  const titre = `Lampe Pixar vintage métal noir ${mot()}`;
  const f = await fiche({ titre, vinted: nouveau() });
  const l = nouveau();
  const j = await depot(f, { platform: 'leboncoin', status: 'cancelled', listing: l, titre, pf: { source: 'releve', rattachement: { par: 'auto', motif: 'titre_exact' } } });
  const a = await releve(f, { platform: 'leboncoin', listing: l, titre, job: j, vu: '11 days', cree: '30 days' });
  await c.query(`SELECT set_config('fillsell.sans_retrait', '1', false)`);
  await vendreSur(f, 'vinted', 'Vinted', { il: '10 days' });
  await c.query(`SELECT set_config('fillsell.sans_retrait', '', false)`);
  const titre2 = `Montre Swatch skin pureline 1996 ${mot()}`;
  const g = await fiche({ titre: titre2, statut: 'vendu', plateforme: 'Leboncoin' });
  await c.query(`UPDATE inventaire SET quantite = 0 WHERE id = $1`, [g]);
  await c.query(`INSERT INTO ventes (user_id, inventaire_id, titre, prix_vente, quantite, plateforme, plateforme_code, vendu_le, date, source)
    VALUES ($1, $2, 'vente', 40, 1, 'Leboncoin', 'leboncoin', now() - interval '10 days', current_date - 10, 'preuve')`, [U, g]);
  const lb = nouveau();
  const jb = await depot(g, { platform: 'beebs', listing: lb, url: `https://www.beebs.app/fr/p/${lb}`, titre: titre2, il: '9 days',
    pf: { source: 'releve', rattachement: { par: 'auto', motif: 'photo_identique', regle: 'rapprochement_v3', groupe_creation: true } } });
  const b = await releve(g, { platform: 'beebs', listing: lb, url: `https://www.beebs.app/fr/p/${lb}`, titre: titre2, job: jb, vu: '9 days', cree: '9 days', publiee: '200 days' });
  // un relevé, aujourd'hui, revoit les deux annonces EN LIGNE
  await c.query(`UPDATE annonces_plateforme SET vu_le = now(), updated_at = now() WHERE id IN ($1, $2)`, [a, b]);
  await c.query(`UPDATE cross_post_jobs SET last_checked_at = now() WHERE id = $1`, [jb]);
  return { f, j, a, l, g, jb, b, lb };
}

try {
  console.log(`\n0. La base jetable porte le schéma public de prod (lu le ${catalogue.lu_le})`);
  const b = await construire();
  if (bavard) for (const e of b.echecs) console.log(`    · ${e}`);
  ok(b.nf >= catalogue.fonctions.length - 5, `fonctions de prod créées : ${b.nf}/${catalogue.fonctions.length}`, b.echecs.filter((e) => e.startsWith('fonction')).join(' | '));
  const manquantes = (await tous(`SELECT f FROM unnest($1::text[]) f WHERE NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = f AND p.pronamespace = 'public'::regnamespace)`, [CHAINE_FONCTIONS])).map((r) => r.f);
  ok(manquantes.length === 0, `les ${CHAINE_FONCTIONS.length} fonctions de la chaîne vente → retrait sont là (définitions de prod)`, manquantes.join(', '));
  ok(b.ntChaine > 0 && b.ntChaineOk === b.ntChaine, `déclencheurs de prod des tables de la chaîne : ${b.ntChaineOk}/${b.ntChaine} (tous : ${b.nt})`,
    b.echecs.filter((e) => e.startsWith('déclencheur')).join(' | '));
  for (const [s, m] of Object.entries(INTACTES)) ok(await md5De(s) === m, `${s.split('(')[0].slice(7)} = prod (md5 ${m}) — jamais réécrite`);
  await c.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'preuve-vendu-retire-partout@exemple.invalid')`, [U]);
  await c.query(`INSERT INTO profiles (id, email, is_premium, is_pro, is_business, extension_last_seen_at, extension_version, extension_build, lang)
    VALUES ($1, 'preuve-vendu-retire-partout@exemple.invalid', true, true, true, now(), '0.6.174', '0.6.174', 'fr')`, [U]);

  // ── 1. AVANT : les définitions de prod ──
  console.log('\n1. AVANT — les définitions de prod (INVERSE)');
  await c.query(INVERSE);
  for (const s of SIGS) ok(await md5De(s) === MD5_PROD[s], `${s.split('(')[0].slice(7)} = prod (md5 ${MD5_PROD[s]})`);
  ok(!(await existe(NEUVE)), 'armer_retrait_annonce_pour n\'existe pas encore');
  const av = {};
  {
    const x = await casDoudou();
    av.doudou = x;
    const q = await questionsDe(x.f), r = await retraitsDe(x.f);
    const qLbc = q.filter((y) => y.preuves?.platform === 'leboncoin'), qBb = q.filter((y) => y.preuves?.platform === 'beebs');
    ok(r.length === 0, 'LE DÉFAUT — Doudou (prod) vendu sur Vinted : aucun retrait (rattachements automatiques « titre_exact » hérités)', r);
    ok(x.pidBb === null, 'témoin : le dépôt Beebs n\'a PAS de numéro (platform_listing_id vide, lien …/p/<n°>)', x.pidBb);
    ok(qLbc.length === 1 && qBb.length === 1, `une question par DÉPÔT : Leboncoin ${qLbc.length}, Beebs ${qBb.length}`, q.map((y) => y.preuves));
    const montree = qLbc[0]?.preuves?.annonce_id;
    const silence = [x.aLot, x.aDep].filter((a) => a !== montree);
    ok(silence.length === 1, `LE DÉFAUT — l'autre annonce Leboncoin (${silence[0] === x.aDep ? `l'annonce déposée ${x.dep}` : `le lot ${x.lot}`}) n'a ni retrait ni question`, { montree, aLot: x.aLot, aDep: x.aDep });
    if (montree === x.aDep) {
      const rep = await decider(qLbc[0].id, 'oui', x.aDep);
      const r2 = (await retraitsDe(x.f)).filter((y) => y.platform === 'leboncoin');
      ok(rep?.ok === true && r2.length === 1 && r2[0].pid === x.lot && r2[0].pid !== x.dep,
        `LE DÉFAUT — « Oui, la retirer » sur l'annonce montrée ${x.dep} arme le retrait du NUMÉRO DU DÉPÔT ${r2[0]?.pid} (le « Lot 2 doudous ») : la mauvaise annonce`, { rep, r2 });
    } else {
      ok(true, `(la question montre le lot ${x.lot} : l'annonce déposée ${x.dep} reste sans question)`);
    }
  }
  av.doudou2 = await casDoudou();
  {
    const x = await casNonProuve();
    av.np = x;
    ok((await questionsDe(x.f)).length === 0 && (await retraitsDe(x.f)).length === 0,
      'LE DÉFAUT — pièce unique, annonce Leboncoin vivante dont le dépôt est ANNULÉ : ni retrait ni question (la chaîne ne lit que les dépôts publiés)');
    const y = await casNonProuve({ sansDepot: true });
    ok((await questionsDe(y.f)).length === 0 && (await retraitsDe(y.f)).length === 0, 'LE DÉFAUT — annonce vivante rattachée SANS dépôt : ni retrait ni question');
  }
  {
    const x = await casDoudou({ prouve: true });
    av.prouve = x;
    const r = await retraitsDe(x.f);
    const rl = r.find((y) => y.platform === 'leboncoin'), rb = r.find((y) => y.platform === 'beebs');
    ok(!!rl && rl.status === 'pending' && rl.pid === x.dep && !!rb && rb.status === 'pending' && rb.pid === x.bb && /\/p\//.test(rb.url ?? ''),
      `témoin — dépôts PROUVÉS : retrait Leboncoin ${rl?.pid} + retrait Beebs (dépôt sans numéro) par son lien → ${rb?.pid}`, r);
  }
  {
    const x = await casRattrapage();
    av.ratt = x;
    ok((await questionsDe(x.f)).length === 0 && (await retraitsDe(x.f)).length === 0 && (await questionsDe(x.g)).length === 0 && (await retraitsDe(x.g)).length === 0,
      'rattrapage — vente PASSÉE, copies revues EN LIGNE par un relevé aujourd\'hui : RIEN ne la reprend (ni retrait, ni question)');
  }

  // ── 2. APRÈS : la migration ──
  console.log('\n2. APRÈS — la migration 20261105240000 telle quelle');
  const t0 = Date.now();
  await c.query(MIGRATION);
  console.log(`   (appliquée en ${Date.now() - t0} ms)`);
  const md5Neufs = {};
  for (const s of SIGS) { md5Neufs[s] = await md5De(s); ok(md5Neufs[s] !== MD5_PROD[s], `${s.split('(')[0].slice(7)} réécrite (md5 ${md5Neufs[s]})`); }
  ok(await existe(NEUVE), 'armer_retrait_annonce_pour créée');
  for (const [s, m] of Object.entries(INTACTES)) ok(await md5De(s) === m, `${s.split('(')[0].slice(7)} : inchangée (md5 ${m})`);
  const droits = await un(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE') AS auth, has_function_privilege('anon', $1, 'EXECUTE') AS anon,
    has_function_privilege('service_role', $1, 'EXECUTE') AS srv`, [NEUVE]);
  ok(!droits.auth && !droits.anon && droits.srv, 'armer_retrait_annonce_pour : serveur seulement (ni anon, ni authenticated)', droits);

  console.log('\n   le Doudou de nicolas.menar (tel qu\'en prod) : chaque annonce a sa question, le « Oui » retire L\'ANNONCE MONTRÉE');
  {
    const x = await casDoudou();
    const q = await questionsDe(x.f);
    const qLot = await questionDeLAnnonce(x.f, x.aLot), qDep = await questionDeLAnnonce(x.f, x.aDep), qBb = await questionDeLAnnonce(x.f, x.aBb);
    ok((await retraitsDe(x.f)).length === 0, 'vente Vinted : aucun retrait d\'office (rattachements automatiques non confirmés — règles du 05/11, inchangées)');
    ok(q.length === 3 && !!qLot && !!qDep && !!qBb, `TROIS questions « Déjà vendu ? » : Leboncoin ${x.lot} (lot), Leboncoin ${x.dep} (l'annonce déposée), Beebs ${x.bb}`, q.map((y) => y.preuves));
    ok(qLot?.preuves?.job === x.jl, 'la question du DÉPÔT Leboncoin montre l\'annonce qui porte SON numéro (le lot) — celle que son « Oui » retirerait', qLot?.preuves);
    ok(!qDep?.preuves?.job && qDep?.preuves?.portee_par === 'annonce' && qDep?.preuves?.depot === x.jl && qDep?.preuves?.listing_id === x.dep && qDep?.preuves?.vendu_sur === 'vinted',
      'l\'annonce déposée a SA question, portée par l\'annonce (aucun dépôt ne la porte sous son numéro)', qDep?.preuves);
    ok(qBb?.preuves?.job === x.jb, 'Beebs : la question du dépôt (inchangée)', qBb?.preuves);
    const r1 = await decider(qDep.id, 'oui', x.aDep);
    const rl = (await retraitsDe(x.f)).filter((y) => y.platform === 'leboncoin');
    ok(r1?.ok === true && rl.length === 1 && rl[0].pid === x.dep && rl[0].url?.endsWith(`/${x.dep}`) && rl[0].status === 'pending'
      && rl[0].pf?.preuve === 'geste_deja_vendu' && rl[0].pf?.arme_par?.annonce === x.aDep && rl[0].pf?.arme_par?.pose_par === 'armer_retrait_annonce_pour (serveur)',
      `« Oui, la retirer » sur ${x.dep} : retrait de ${rl[0]?.pid} PAR SON NUMÉRO ET SON LIEN — jamais ${x.lot}`, { r1, rl });
    ok((await un(`SELECT statut, preuves ->> 'retrait' AS r, preuves ->> 'retrait_par' AS p FROM inventaire_doublons WHERE id = $1`, [qDep.id])).p === 'annonce', 'la question est close « confirmée », le retrait noté');
    const pfJob = (await un(`SELECT platform_fields AS pf FROM cross_post_jobs WHERE id = $1`, [x.jl])).pf;
    ok(pfJob?.rattachement?.par === 'auto', 'le dépôt 13627ae2 (numéro du lot) n\'est PAS confirmé par ce « Oui » (il porte une autre annonce)', pfJob?.rattachement);
    const rNon = await decider(qLot.id, 'non');
    ok(rNon?.ok === true && (await retraitsDe(x.f)).filter((y) => y.platform === 'leboncoin').length === 1, '« Non » sur le lot : rien n\'est retiré, la question est refusée');
    const r2 = await decider(qBb.id, 'oui', x.aBb);
    const rb = (await retraitsDe(x.f)).filter((y) => y.platform === 'beebs');
    ok(r2?.ok === true && rb.length === 1 && rb[0].status === 'pending' && rb[0].url?.includes(`/p/${x.bb}`) && rb[0].pid === x.bb,
      `« Oui » Beebs : retrait du dépôt SANS numéro par son lien …/p/${x.bb} (numéro relu du lien à la création : ${rb[0]?.pid})`, { r2, rb });
    const n = (await un(`SELECT public.poser_questions_copies_non_prouvees($1, NULL, 'vinted', 'vente:repasse') AS n`, [x.f])).n;
    ok(n === 0 && (await questionsDe(x.f)).length === 3, 'repasser : aucune question de plus (un « Non » n\'est jamais reposé, une confirmée non plus)');
    // une question posée AVANT la migration (le dépôt porte le numéro du lot, l'annonce montrée est l'annonce déposée),
    // répondue APRÈS : le « Oui » retire l'annonce MONTRÉE (avant : le lot)
    const qAv = (await questionsDe(av.doudou2.f)).find((y) => y.statut === 'proposee' && y.preuves?.platform === 'leboncoin');
    ok(qAv?.preuves?.annonce_id === av.doudou2.aDep && qAv?.preuves?.job === av.doudou2.jl, 'question d\'avant restée ouverte : dépôt au numéro du lot, annonce déposée montrée', qAv?.preuves);
    const r3 = await decider(qAv.id, 'oui', av.doudou2.aDep);
    const rr = (await retraitsDe(av.doudou2.f)).filter((y) => y.platform === 'leboncoin');
    ok(r3?.ok === true && rr.length === 1 && rr[0].pid === av.doudou2.dep && rr[0].pid !== av.doudou2.lot,
      `question d'avant, répondue après : le « Oui » retire l'annonce montrée ${rr[0]?.pid} (avant : le lot ${av.doudou2.lot})`, { r3, rr });
  }

  console.log('\n   le même Doudou aux dépôts PROUVÉS : vente Vinted → retrait Leboncoin + retrait Beebs SANS numéro, d\'office (inchangé)');
  {
    const x = await casDoudou({ prouve: true });
    const r = await retraitsDe(x.f);
    const rl = r.find((y) => y.platform === 'leboncoin'), rb = r.find((y) => y.platform === 'beebs');
    ok(!!rl && rl.status === 'pending' && rl.pid === x.dep && rl.pf?.arme_par?.depot === x.jl, `retrait Leboncoin ${rl?.pid} armé d'office (dépôt prouvé)`, rl);
    ok(!!rb && rb.status === 'pending' && rb.url?.includes(`/p/${x.bb}`) && x.pidBb === null && rb.pf?.arme_par?.depot === x.jb,
      `retrait Beebs armé d'office pour le dépôt SANS numéro, par son lien (numéro relu : ${rb?.pid})`, rb);
    ok((await questionsDe(x.f)).length === 0, 'aucune question (toutes les annonces vivantes sont portées par leur dépôt, retirées)');
    const ra = await retraitsDe(av.prouve.f);
    ok(r.length === ra.length && r.length === 2, `même résultat qu'avant : ${ra.length} retraits avant, ${r.length} après`);
  }

  console.log('\n   une pièce unique à rattachement NON prouvé : la question, jamais le retrait d\'office');
  {
    const x = await casNonProuve();
    const q = await questionsDe(x.f);
    ok((await retraitsDe(x.f)).length === 0 && q.length === 1 && q[0].preuves?.annonce_id === x.a && q[0].preuves?.portee_par === 'annonce' && q[0].preuves?.rattachement_automatique === true,
      'annonce vivante à dépôt ANNULÉ : aucun retrait d\'office, la question « Déjà vendu ? »', q[0]?.preuves);
    const r = await decider(q[0].id, 'oui', x.a);
    const rr = await retraitsDe(x.f);
    ok(r?.ok === true && rr.length === 1 && rr[0].pid === x.l && rr[0].pf?.preuve === 'geste_deja_vendu', '« Oui » : retrait de CETTE annonce par son numéro', { r, rr });
    const y = await casNonProuve({ sansDepot: true });
    const qy = await questionsDe(y.f);
    ok((await retraitsDe(y.f)).length === 0 && qy.length === 1 && qy[0].preuves?.annonce_id === y.a && qy[0].preuves?.depot === null, 'annonce rattachée SANS dépôt : la question', qy[0]?.preuves);
    const rn = await decider(qy[0].id, 'non');
    const n = (await un(`SELECT public.poser_questions_copies_non_prouvees($1, NULL, 'vinted', 'vente:repasse') AS n`, [y.f])).n;
    ok(rn?.ok === true && n === 0 && (await retraitsDe(y.f)).length === 0, '« Non » : rien n\'est retiré, la question n\'est jamais reposée');
    const z = await decider(qy[0].id, 'oui', y.a);
    ok(z?.ok === false && z?.reason === 'deja_tranchee', 'une question tranchée ne se rejoue pas', z);
    const faux = await casNonProuve();
    const qf = (await questionsDe(faux.f))[0];
    const zf = await decider(qf.id, 'oui', av.np.a);
    ok(zf?.ok === false && zf?.reason === 'annonce_non_montree' && (await retraitsDe(faux.f)).length === 0, 'jamais un retrait sur une annonce que l\'écran n\'a pas montrée', zf);
  }

  console.log('\n   une série, plusieurs exemplaires : rien');
  {
    const x = await casSerie('apres');
    ok((await questionsDe(x.f)).length === 0 && (await retraitsDe(x.f)).length === 0, 'titre en série (3 annonces Leboncoin vivantes du même titre) : ni question ni retrait');
    ok((await questionsDe(x.g)).length === 0 && (await retraitsDe(x.g)).length === 0, 'fiche à deux ventes (plusieurs exemplaires) : ni question ni retrait');
  }

  console.log('\n   les exclusions : rien');
  {
    const x = await casExclusions();
    for (const [k, v] of Object.entries(x)) ok(v.q.length === 0 && v.r.length === 0, `${k.replace(/_/g, ' ')} : ni question ni retrait`, { q: v.q.map((y) => y.preuves), r: v.r });
  }

  console.log('\n   le RATTRAPAGE : une vente passée dont une copie est encore vue en ligne');
  {
    const x = await casRattrapage();
    ok((await questionsDe(x.f)).length === 0 && (await retraitsDe(x.f)).length === 0 && (await questionsDe(x.g)).length === 0 && (await retraitsDe(x.g)).length === 0,
      'un relevé qui revoit les copies EN LIGNE ne reprend RIEN, après comme avant (la règle joue à la vente — aucun déclencheur de relevé, voulu)');
    // la relance par le circuit normal : la MÊME fonction que la vente pose la question, puis le « Oui » de la personne
    const n = (await un(`SELECT public.poser_questions_copies_non_prouvees($1, NULL, 'vinted', 'rattrapage:vendu_retire_partout') AS n`, [x.f])).n;
    const q = await questionsDe(x.f);
    ok(n === 1 && q.length === 1 && q[0].preuves?.annonce_id === x.a && q[0].preuves?.portee_par === 'annonce', 'relance (a) : poser_questions_copies_non_prouvees(fiche, NULL, \'vinted\', \'rattrapage:…\') pose la question', q[0]?.preuves);
    const r = await decider(q[0].id, 'oui', x.a);
    ok(r?.ok === true && (await retraitsDe(x.f))[0]?.pid === x.l, '… et le « Oui » de la personne retire cette annonce', r);
    // (b) le dépôt PROUVÉ rattaché après la vente : armer_retrait_job_pour, toutes ses gardes
    const d = (await un(`SELECT public.armer_retrait_job_pour($1, 'rattrapage_vendu_retire_partout', '0', false) AS d`, [x.jb])).d;
    const rb = await retraitsDe(x.g);
    ok(!!d && rb.length === 1 && rb[0].pid === x.lb && rb[0].status === 'pending' && rb[0].pf?.arme_par?.chemin === 'rattrapage_vendu_retire_partout',
      'relance (b) : dépôt prouvé (photo identique) d\'une vente passée → armer_retrait_job_pour(dépôt, \'rattrapage_vendu_retire_partout\', \'0\', false) passe ses gardes', rb);
    const nb = (await un(`SELECT public.poser_questions_copies_non_prouvees($1, NULL, 'leboncoin', 'rattrapage:vendu_retire_partout') AS n`, [x.g])).n;
    ok(nb === 0, '… et aucune question en plus (retrait en cours)');
  }
  {
    // coût : la question portée par l'annonce, sur une fiche à 6 annonces vivantes
    const titre = `Mesure coût ${mot()}`; const f = await fiche({ titre: `${titre} fiche`, vinted: nouveau() });
    for (let i = 0; i < 6; i++) await releve(f, { platform: ['leboncoin', 'beebs', 'ebay'][i % 3], listing: nouveau(), titre: `${titre} ${i}` });
    await c.query(`INSERT INTO ventes (user_id, inventaire_id, titre, prix_vente, quantite, plateforme, plateforme_code, vendu_le, date, source)
      VALUES ($1, $2, 'vente', 24, 1, 'Vinted', 'vinted', now(), current_date, 'preuve')`, [U, f]);
    await c.query(`UPDATE inventaire SET statut = 'vendu', quantite = 0 WHERE id = $1`, [f]);
    await c.query(`DELETE FROM inventaire_doublons WHERE garde = $1`, [f]);
    const t = Date.now();
    const n = (await un(`SELECT public.poser_questions_copies_non_prouvees($1, NULL, 'vinted', 'mesure') AS n`, [f])).n;
    ok(n === 6, `6 annonces vivantes → 6 questions, en ${Date.now() - t} ms (une fois par vente)`);
  }

  // ── 3. L'INVERSE ──
  console.log("\n3. L'INVERSE : les définitions de prod, mot pour mot");
  await c.query(INVERSE);
  for (const s of SIGS) ok(await md5De(s) === MD5_PROD[s], `${s.split('(')[0].slice(7)} revenue à la prod`);
  ok(!(await existe(NEUVE)), 'armer_retrait_annonce_pour retirée');
  ok(!(await un(`SELECT to_regclass('public.inventaire_doublons_copie_annonce') IS NOT NULL AS e`)).e, 'index inventaire_doublons_copie_annonce retiré');
  {
    const x = await casNonProuve();
    ok((await questionsDe(x.f)).length === 0, 'avec l\'inverse, le défaut revient (comportement de prod)');
  }
  await c.query(MIGRATION);
  for (const s of SIGS) ok(await md5De(s) === md5Neufs[s], `la migration se rejoue : ${s.split('(')[0].slice(7)}`);
} catch (e) {
  ko++; console.log(`  ✗ ERREUR : ${e.message}\n${e.stack?.split('\n').slice(1, 4).join('\n')}`);
} finally {
  await c.end().catch(() => {});
  if (embarque) { await embarque.pg.stop().catch(() => {}); rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — migration prouvée de bout en bout sur un Postgres jetable`);
process.exit(ko ? 1 : 0);
