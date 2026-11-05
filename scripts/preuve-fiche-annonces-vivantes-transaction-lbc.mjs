// PREUVE, SUR UN POSTGRES JETABLE, de la migration 20261105210000_fiche_annonces_vivantes_transaction_lbc (PRÉPARÉE,
// NON APPLIQUÉE) : UNE ligne dans fiche_annonces_vivantes(bigint, text) — une annonce Leboncoin sous transaction
// (« Achat en cours » / « Vendu ») n'est plus comptée « vivante ».
//   1-2. la vente SUIVANTE d'une fiche en série (l'annonce vendue d'avant encore listée « Vendu ») : refusée avec la
//        définition de prod, enregistrée tout de suite avec la ligne, et sa remise en vente suit ;
//   3.   chaque appelant de la surcharge (bigint, text), sous les DEUX définitions, sur les mêmes fixtures (chaque mesure
//        dans une transaction annulée) : témoins INCHANGÉS, et les changements MONTRÉS (formes des 2 fiches de prod du
//        05/11 : 1790174155261 et 1791656197832, deux pièces uniques) ;
//   4.   l'inverse rend la prod mot pour mot ; la migration se rejoue.
//
//   PREUVE_PG=embarque node scripts/preuve-fiche-annonces-vivantes-transaction-lbc.mjs                       (Postgres 17 jetable)
//   PREUVE_PG=embarque node scripts/preuve-fiche-annonces-vivantes-transaction-lbc.mjs --catalogue <f.json>  (catalogue déjà lu)
//
// Catalogue de prod relu À NEUF (20261105170000 appliquée le 05/11 à 20:26) EN LECTURE SEULE (`npx supabase db query
// --linked --read-only`, catalogue système + coin_config + platform_health, aucune donnée client). Bouchons pour auth,
// net (http_post RETENU), vault, cron, storage — comme scripts/preuve-remise-en-vente-series.mjs.
// ⛔ Jamais la prod : PREUVE_PG refuse toute adresse supabase.co ; rien n'est écrit ailleurs que dans la base jetable.
import pg from 'pg';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const lire = (p) => readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = lire('supabase/migrations/20261105210000_fiche_annonces_vivantes_transaction_lbc.sql');
const INVERSE = lire('supabase/rollbacks/20261105210000_fiche_annonces_vivantes_transaction_lbc_INVERSE.sql');
const SIG = 'public.fiche_annonces_vivantes(bigint,text)';
const MD5_PROD = '243f00f332d04056223f20e330c5da8f';
const MD5_NEUF = '90aa35917c373886c99917ec22dd84d6';
// Définitions de prod lues le 05/11 soir (pg_get_functiondef, md5 sans CR) : celles que la relecture a jugées.
const MD5_LUS = {
  'fiche_annonces_vivantes(p_inv bigint)': 'e8b77b4eb668bae9b85a755cf409823c',
  'leboncoin_transaction_lue(p_colonne text, p_capture jsonb)': 'cb85655a9a6025047536c00e1a9a60fe',
  'armer_retrait_job_pour(p_job_id uuid, p_chemin text, p_delai interval, p_preuve_geste boolean)': '0985562bc7f9d611dbf5cf520816d3d9',
  'armer_retraits_copies(p_inventaire_id bigint, p_chemin text, p_sauf_job uuid, p_sauf_plateforme text, p_delai interval)': '15e05ec507246ffe51dbccc69b79b9c8',
  'enregistrer_ventes_prouvees(p_user uuid)': 'ee7f16e6d8f2485b4ee56c2e47992401',
  'poser_questions_copies_non_prouvees(p_inventaire_id bigint, p_sauf_job uuid, p_sauf_plateforme text, p_source text)': '3f69b70226669e19fb219574056bceb3',
  'ventes_a_decider()': 'a5cf791061f65f3e69a2d2476bcf62fc',
  'enregistrer_vente_atomique(p_user uuid, p_cle text, p_inventaire bigint, p_job uuid, p_prix numeric, p_frais numeric, p_quantite integer, p_quantite_attendue integer, p_plateforme text)': 'd0efd535b771fefdf0ab8220ebac80bc',
  'inventaire_doublon_evaluer(p_a bigint, p_b bigint)': 'b8edc95c0339a5f2d34a694720b6ea37',
};
const APPELANTS = ['armer_retrait_job_pour', 'armer_retraits_copies', 'enregistrer_vente_atomique', 'enregistrer_ventes_prouvees',
  'inventaire_doublon_evaluer', 'poser_questions_copies_non_prouvees', 'ventes_a_decider'];
const fonctionDe = (texte, nom) => {
  const i = texte.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  const corps = i < 0 ? -1 : texte.indexOf('AS $function$', i);
  const f = corps < 0 ? -1 : texte.indexOf('$function$', corps + 'AS $function$'.length);
  if (f < 0) throw new Error(`${nom} introuvable`);
  return texte.slice(i, f + '$function$'.length);
};
const FAV_PROD = fonctionDe(INVERSE, 'fiche_annonces_vivantes');
const FAV_NEUF = fonctionDe(MIGRATION, 'fiche_annonces_vivantes');
const md5Texte = (t) => crypto.createHash('md5').update(t.replace(/\r/g, '')).digest('hex');

let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.(co|com)|pooler/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
const iCat = process.argv.indexOf('--catalogue');
const FICHIER_CATALOGUE = iCat > 0 ? process.argv[iCat + 1] : null;
const bavard = process.argv.includes('--bavard');

// ── 1. LE CATALOGUE DE PROD, EN LECTURE SEULE ───────────────────────────────────────────────────────────────────────
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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-fav-lbc-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55453, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55453/postgres';
}
const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
c.on('notice', () => {});
let ko = 0, n = 0;
const ok = (cond, msg, detail) => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${detail !== undefined ? `\n      ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900)}` : ''}`); } };
const un = async (sql, p = []) => (await c.query(sql, p)).rows[0];
const tous = async (sql, p = []) => (await c.query(sql, p)).rows;
const md5De = async (sig) => (await un(`SELECT md5(replace(pg_get_functiondef($1::regprocedure), chr(13), '')) AS m`, [sig])).m;
const id = (s) => `"${String(s).replace(/"/g, '""')}"`;
const J = (x) => JSON.stringify(x);

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

const CHAINE_FONCTIONS = ['fiche_annonces_vivantes', 'leboncoin_transaction_lue', 'leboncoin_transaction_noter', 'annonce_importee',
  'ventes_prouvees_tick', 'ventes_prouvees_a_enregistrer', 'enregistrer_vente_prouvee', 'enregistrer_vente_atomique', 'retrait_job_prouve',
  'remises_en_vente_tick', 'cross_post_jobs_vendu_remise_en_vente', ...APPELANTS, 'armer_retrait_job', 'inventaire_vendu_retire_ses_copies',
  'cross_post_jobs_preuve_vente_retire_copies', 'vente_apres_mise_en_ligne', 'annonce_mise_en_ligne', 'palier_de'];
const CHAINE_TABLES = ['cross_post_jobs', 'inventaire', 'annonces_plateforme', 'ventes', 'ventes_operations', 'remises_en_vente',
  'usage_logs', 'ventes_prouvees_refus', 'inventaire_doublons', 'push_ventes', 'inventaire_journal'];

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

// ── LA SÉRIE (chemin de 20261105170000, déclencheurs actifs) ────────────────────────────────────────────────────────
const U = '0f5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e';
let invSuivant = 7700000000000, lidSuivant = 3399000000;
const PHOTOS = ['https://exemple.invalid/1.jpg', 'https://exemple.invalid/2.jpg'];
async function article({ quantite, titre = 'Lot de 10 crayons' } = {}) {
  const inv = invSuivant++; const lid = String(lidSuivant++);
  await c.query(`INSERT INTO inventaire (id, user_id, titre, statut, quantite, prix_vente, prix_achat, description, photos)
    VALUES ($1, $2, $3, 'stock', $4, 25, 4, 'Neuf, emballé.', $5)`, [inv, U, `${titre} ${inv}`, quantite, JSON.stringify(PHOTOS)]);
  const pf = { lbcCategoryPath: ['Loisirs', 'Jeux & Jouets'], etat: 'Neuf', adresse: 'Paris' };
  const { id: job } = await un(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, title, description, price, photos,
      platform_listing_id, listing_url, published_at, created_at, handler_build, platform_fields, last_checked_at)
    VALUES ($1, $2, 'leboncoin', 'published', 'publish', $3, 'Neuf, emballé.', 25, $4, $5, $6, now() - interval '3 days', now() - interval '3 days', '0.6.174', $7,
      now() - interval '1 hour') RETURNING id`,
  [U, inv, `${titre} ${inv}`, JSON.stringify(PHOTOS), lid, `https://www.leboncoin.fr/ad/jeux_jouets/${lid}`, JSON.stringify(pf)]);
  const { id: annonce } = await un(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, prix, statut_plateforme, inventaire_id, job_id, vu_le)
    VALUES ($1, 'leboncoin', $2, $3, $4, 25, 'en_ligne', $5, $6, now() - interval '1 hour') RETURNING id`,
  [U, lid, `https://www.leboncoin.fr/ad/jeux_jouets/${lid}`, `${titre} ${inv}`, inv, job]);
  return { inv, lid, job, annonce };
}
const lireTransaction = (a, tx) => c.query(`UPDATE annonces_plateforme SET transaction_plateforme = $2, transaction_lue_le = clock_timestamp(),
  vu_le = clock_timestamp(), statut_plateforme = 'en_ligne' WHERE id = $1`, [a.annonce, tx]);
const revoirEnLigne = (a) => c.query(`UPDATE annonces_plateforme SET vu_le = clock_timestamp() WHERE id = $1`, [a.annonce]);
const trace = async (a) => (await un(`SELECT metadata FROM usage_logs WHERE feature = 'vente_leboncoin_transaction' AND metadata ->> 'annonce' = $1
  ORDER BY created_at DESC LIMIT 1`, [a.annonce]))?.metadata ?? {};
const etat = async (a) => un(`SELECT i.quantite, i.statut, j.status AS job,
    (SELECT o.resultat FROM ventes_operations o WHERE o.user_id = j.user_id AND o.cle = 'annonce:leboncoin:' || $3) AS recu,
    (SELECT to_jsonb(r) FROM remises_en_vente r WHERE r.job_vendu = j.id) AS remise,
    (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at) FROM cross_post_jobs d WHERE d.inventaire_id = i.id AND d.platform_fields ? 'remise_en_vente') AS depots
  FROM inventaire i JOIN cross_post_jobs j ON j.id = $2 WHERE i.id = $1`, [a.inv, a.job, a.lid]);
const ventesProuvees = () => un(`SELECT public.ventes_prouvees_tick(25, 4000) AS r`).then((x) => x.r);
const tourRemises = async (a) => {
  await c.query(`UPDATE remises_en_vente SET prochain_essai = now() - interval '1 second' WHERE job_vendu = $1 AND statut = 'a_faire'`, [a.job]);
  return (await un(`SELECT public.remises_en_vente_tick(20, $1) AS r`, [U])).r;
};
// Vente 1 (L1 « Achat en cours » → vendue, remise L2 publiée), puis L1 relue « Vendu » (Leboncoin la garde listée) et
// L2 « Achat en cours » : la vente SUIVANTE de la même fiche.
const cycle2 = async () => {
  const a = await article({ quantite: 9997 });
  await lireTransaction(a, 'pending');
  await ventesProuvees(); await revoirEnLigne(a); await tourRemises(a);
  const d = (await etat(a)).depots[0];
  const L2 = String(lidSuivant++);
  await c.query(`UPDATE cross_post_jobs SET status = 'processing' WHERE id = $1`, [d.id]);
  await c.query(`UPDATE cross_post_jobs SET status = 'published', platform_listing_id = $2, listing_url = $3, published_at = now(), last_checked_at = now()
    WHERE id = $1`, [d.id, L2, `https://www.leboncoin.fr/ad/jeux_jouets/${L2}`]);
  const { id: an2 } = await un(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, prix, statut_plateforme, inventaire_id, job_id, vu_le)
    VALUES ($1, 'leboncoin', $2, $3, $4, 25, 'en_ligne', $5, $6, now()) RETURNING id`, [U, L2, `https://www.leboncoin.fr/ad/jeux_jouets/${L2}`, d.title, a.inv, d.id]);
  await lireTransaction(a, 'sold');
  const b = { inv: a.inv, lid: L2, job: d.id, annonce: an2 };
  await lireTransaction(b, 'pending');
  return { a, b };
};

// ── FIXTURES DES TÉMOINS (déclencheurs coupés pendant la pose : l'état voulu, rien d'autre) ──────────────────────────
let invT = 7800000000000, lidT = 3500000000;
async function compte() {
  const u = crypto.randomUUID();
  await c.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [u, `t-${u.slice(0, 8)}@exemple.invalid`]);
  await c.query(`INSERT INTO profiles (id, email, is_premium, is_pro, is_business, extension_last_seen_at, extension_version, extension_build, lang)
    VALUES ($1, $2, true, true, true, now(), '0.6.174', '0.6.174', 'fr')`, [u, `t-${u.slice(0, 8)}@exemple.invalid`]);
  return u;
}
async function ficheT(u, { quantite = 1, statut = 'stock', plateforme = null } = {}) {
  const inv = invT++;
  await c.query(`INSERT INTO inventaire (id, user_id, titre, statut, quantite, prix_vente, prix_achat, description, photos, plateforme)
    VALUES ($1, $2, $3, $4, $5, 20, 4, 'Témoin.', $6, $7)`, [inv, u, `Assiette témoin ${inv}`, statut, quantite, JSON.stringify(PHOTOS), plateforme]);
  return inv;
}
const URL_DE = { leboncoin: (l) => `https://www.leboncoin.fr/ad/arts_de_la_table/${l}`, ebay: (l) => `https://www.ebay.fr/itm/${l}`,
  beebs: (l) => `https://www.beebs.app/fr/p/${l}`, vinted: (l) => `https://www.vinted.fr/items/${l}` };
async function annonceT(u, inv, job, { platform, listing, statut = 'en_ligne', tx = null, ilYa = '3 days' }) {
  await c.query(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, prix, statut_plateforme, inventaire_id, job_id, vu_le, created_at,
      transaction_plateforme, transaction_lue_le)
    VALUES ($1, $2, $3, $4, 'Assiette témoin', 20, $5, $6, $7, now() - interval '1 hour', now() - $8::interval, $9::text, CASE WHEN $9::text IS NOT NULL THEN now() - interval '1 hour' END)`,
  [u, platform, listing, URL_DE[platform](listing), statut, inv, job, ilYa, tx]);
}
// Un job publié ET son annonce relevée (statut / transaction donnés).
async function jobT(u, inv, { platform, action = 'publish', status = 'published', ilYa = '3 days', pf = {}, annonce = {} }) {
  const listing = String(lidT++);
  const pfx = typeof pf === 'function' ? pf(listing) : pf;
  const { id: job } = await un(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, photos,
      platform_listing_id, listing_url, published_at, created_at, handler_build, platform_fields, last_checked_at)
    VALUES ($1, $2, $3, $4, $5, 'Assiette témoin', 20, $6, $7, $8, now() - $9::interval, now() - $9::interval, '0.6.174', $10, now() - interval '1 hour')
    RETURNING id`, [u, inv, platform, status, action, JSON.stringify(PHOTOS), listing, URL_DE[platform](listing), ilYa, J(pfx)]);
  if (annonce !== null) await annonceT(u, inv, job, { platform, listing, ilYa, ...annonce });
  return { job, listing };
}
async function venteT(u, inv, { code, libelle }) {
  await c.query(`INSERT INTO ventes (user_id, inventaire_id, titre, prix_vente, plateforme, plateforme_code, quantite, statut, date)
    VALUES ($1, $2, 'Assiette témoin', 20, $3, $4, 1, 'vendu', (now() AT TIME ZONE 'Europe/Paris')::date)`, [u, inv, libelle, code]);
}
const IMPORTEE = { source: 'releve', rattachement: { par: 'rapprochement', import: true } };
const PREUVE_LBC = (statut) => (l) => ({ source: 'releve', rattachement: { par: 'auto', motif: 'photo_identique', regle: 'rapprochement_v3' },
  sale_signal: 'sold', detected_price: 20, sale_evidence: { platform: 'leboncoin', listing_id: l, state: 'sold', exact: true,
    source: 'transaction_leboncoin', statut, libelle: statut === 'pending' ? 'Achat en cours' : 'Vendu', lu_le: new Date().toISOString(), par: 'releve_leboncoin' } });
const poser = async (fn) => { await c.query(`SET session_replication_role = replica`); try { return await fn(); } finally { await c.query(`SET session_replication_role = origin`); } };

// ── LES MESURES (chacune dans une transaction annulée, sous les deux définitions) ──────────────────────────────────────
const etatT = (inv) => un(`SELECT i.statut, i.quantite,
    (SELECT coalesce(jsonb_agg(d.platform || ':' || d.platform_listing_id ORDER BY d.platform, d.platform_listing_id), '[]') FROM cross_post_jobs d
      WHERE d.inventaire_id = $1 AND d.action = 'delete') AS retraits,
    (SELECT coalesce(jsonb_agg((SELECT j.platform || ':' || j.platform_listing_id FROM cross_post_jobs j WHERE j.id::text = q.preuves ->> 'job')
       ORDER BY q.preuves ->> 'job'), '[]') FROM inventaire_doublons q WHERE q.garde = $1 AND q.motif = 'copie_non_prouvee') AS questions,
    (SELECT count(*)::int FROM ventes v WHERE v.inventaire_id = $1) AS ventes
  FROM inventaire i WHERE i.id = $1`, [inv]);
const M = {
  fav: (inv, pl) => async () => (await un(`SELECT public.fiche_annonces_vivantes($1, $2) AS n`, [inv, pl])).n,
  eva: (u, inv, job) => async () => {
    const r = (await un(`SELECT public.enregistrer_vente_atomique($1, NULL, p_job := $2, p_prix := 20) AS r`, [u, job])).r;
    return { ok: r.ok, reason: r.reason ?? null, restant: r.restant ?? null, apres: await etatT(inv) };
  },
  evProuvee: (inv, job) => async () => {
    const r = (await un(`SELECT public.enregistrer_vente_prouvee($1) AS r`, [job])).r;
    return { issue: r.issue, reason: r.reason ?? null, apres: await etatT(inv) };
  },
  evp: (u, inv) => async () => ({ enregistrees: (await un(`SELECT public.enregistrer_ventes_prouvees($1) AS r`, [u])).r.enregistrees, apres: await etatT(inv) }),
  arjp: (inv, job, geste = false) => async () => ({ retrait: (await un(`SELECT public.armer_retrait_job_pour($1, 'preuve_temoin', interval '0', $2) AS r`, [job, geste])).r !== null, apres: await etatT(inv) }),
  arc: (inv) => async () => {
    const r = (await un(`SELECT public.armer_retraits_copies($1, 'preuve_temoin', NULL, NULL, interval '0') AS r`, [inv])).r;
    return { armes: r.armes, questions: r.questions, apres: await etatT(inv) };
  },
  pq: (inv) => async () => ({ n: (await un(`SELECT public.poser_questions_copies_non_prouvees($1, NULL, NULL, 'preuve_temoin') AS n`, [inv])).n, apres: await etatT(inv) }),
  vad: (u, inv) => async () => {
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [J({ sub: u, role: 'authenticated' })]);
    const l = (await un(`SELECT public.ventes_a_decider() AS r`)).r;
    return l.filter((x) => Number(x.inventaire_id) === Number(inv)).map((x) => x.annonce_id);
  },
};
async function sousLesDeux(mesure) {
  const r = {};
  for (const [k, def] of [['avant', FAV_PROD], ['apres', FAV_NEUF]]) {
    await c.query(def);
    await c.query('BEGIN');
    try { r[k] = await mesure(); } catch (e) { r[k] = { erreur: e.message }; } finally { await c.query('ROLLBACK'); }
  }
  return r;
}
const bilan = [];
// attendu : 'inchange' ou { avant, apres } (sous-ensemble comparé en JSON).
async function temoin(appelant, forme, mesure, attendu) {
  const r = await sousLesDeux(mesure);
  const pareil = J(r.avant) === J(r.apres);
  if (attendu === 'inchange') {
    ok(pareil && !r.avant?.erreur, `${appelant} — ${forme} : INCHANGÉ ${J(r.avant)}`, r);
    bilan.push({ appelant, forme, verdict: 'INCHANGÉ' });
  } else {
    const vu = (x) => J(attendu.cle ? attendu.cle(x) : x);
    ok(!pareil && vu(r.avant) === J(attendu.avant) && vu(r.apres) === J(attendu.apres),
      `${appelant} — ${forme} : CHANGE  avant ${vu(r.avant)}  →  après ${vu(r.apres)}`, r);
    bilan.push({ appelant, forme, verdict: 'CHANGE', avant: vu(r.avant), apres: vu(r.apres) });
  }
  return r;
}

try {
  // ── 0. CONSTRUCTION ──
  console.log(`\n0. La base jetable porte le schéma public de prod (lu le ${catalogue.lu_le})`);
  const b = await construire();
  if (bavard) for (const e of b.echecs) console.log(`    · ${e}`);
  ok(b.nf >= catalogue.fonctions.length - 5, `fonctions de prod créées : ${b.nf}/${catalogue.fonctions.length}`, b.echecs.filter((e) => e.startsWith('fonction')).join(' | '));
  const manquantes = (await tous(`SELECT f FROM unnest($1::text[]) f WHERE NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = f AND p.pronamespace = 'public'::regnamespace)`, [CHAINE_FONCTIONS])).map((r) => r.f);
  ok(manquantes.length === 0, `les ${CHAINE_FONCTIONS.length} fonctions de la chaîne sont là (définitions de prod)`, manquantes.join(', '));
  ok(b.ntChaine > 0 && b.ntChaineOk === b.ntChaine, `déclencheurs de prod des tables de la chaîne : ${b.ntChaineOk}/${b.ntChaine} (tous : ${b.nt})`,
    b.echecs.filter((e) => e.startsWith('déclencheur')).join(' | '));
  const favProd = catalogue.fonctions.find((f) => f.nom === 'fiche_annonces_vivantes' && f.args === 'p_inventaire bigint, p_platform text');
  ok(favProd && md5Texte(favProd.def) === MD5_PROD, `fiche_annonces_vivantes(bigint, text) de prod relue à neuf : md5 ${favProd && md5Texte(favProd.def)} = ${MD5_PROD}`);
  ok(favProd && favProd.def.replace(/\r/g, '') + '' === FAV_PROD + '\n', 'l\'INVERSE porte la définition de prod mot pour mot');
  for (const [cle, m] of Object.entries(MD5_LUS)) {
    const f = catalogue.fonctions.find((x) => `${x.nom}(${x.args})` === cle);
    ok(f && md5Texte(f.def) === m, `${cle.split('(')[0]} : la définition relue est celle jugée (md5 ${m})`, f ? md5Texte(f.def) : 'absente');
  }
  const appelants = [...new Set(catalogue.fonctions.filter((f) => f.nom !== 'fiche_annonces_vivantes' && f.def.includes('fiche_annonces_vivantes')).map((f) => f.nom))].sort();
  ok(J(appelants) === J(APPELANTS), `appelants en prod : ${appelants.join(', ')} (aucun autre ; vues : ${catalogue.divers.filter((d) => d.k === 'vue' && /fiche_annonces_vivantes/.test(d.def)).length})`, appelants);
  ok(catalogue.fonctions.find((f) => f.nom === 'remises_en_vente_tick').def.includes("AND NOT (r.platform = 'leboncoin' AND COALESCE(j.action, 'publish') = 'republish')"),
    '20261105170000 est en prod (remises_en_vente_tick relue : sa garde « republication »)');
  // La migration : UNE ligne ajoutée, rien d'autre.
  const lp = FAV_PROD.split('\n'), ln = FAV_NEUF.split('\n');
  const ajout = ln.filter((x, i) => x !== lp[i - (i > ln.findIndex((y, k) => y !== lp[k]) ? 1 : 0)]);
  ok(ln.length === lp.length + 1 && ln.filter((x) => !lp.includes(x)).length === 1 && lp.every((x) => ln.includes(x))
    && (MIGRATION.match(/CREATE OR REPLACE FUNCTION/g) || []).length === 1,
  `la migration : une seule fonction, UNE ligne ajoutée (${ln.filter((x) => !lp.includes(x))[0]?.trim()})`, ajout);
  const cfg = await un(`SELECT (SELECT value FROM coin_config WHERE key = 'ventes_leboncoin_transaction') AS tx, (SELECT count(*)::int FROM platform_health WHERE paused) AS pauses`);
  ok(cfg.tx === 1 && cfg.pauses === 0, `coin_config de prod : ventes_leboncoin_transaction=${cfg.tx} ; aucune plateforme en pause`);
  await c.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'preuve@exemple.invalid')`, [U]);
  await c.query(`INSERT INTO profiles (id, email, is_premium, is_pro, is_business, extension_last_seen_at, extension_version, extension_build, lang)
    VALUES ($1, 'preuve@exemple.invalid', true, true, true, now(), '0.6.174', '0.6.174', 'fr')`, [U]);
  // Droits de prod sur la fonction (service_role seul) : CREATE OR REPLACE doit les garder.
  await c.query(`REVOKE ALL ON FUNCTION ${SIG} FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION ${SIG} TO service_role`);
  const acl = async () => (await un(`SELECT proacl::text AS a FROM pg_proc WHERE oid = $1::regprocedure`, [SIG])).a;
  const aclAvant = await acl();
  // Comme sous PostgREST, la session porte toujours des claims (vides = service_role, auth.uid() NULL) : sans elles, une
  // valeur locale annulée laisse '' et auth.uid() échoue (« invalid input syntax for type json »).
  await c.query(`SELECT set_config('request.jwt.claims', '{}', false)`);

  // ── 1. AVANT ──
  console.log('\n1. AVANT — la définition de prod (INVERSE) : la vente suivante d\'une série attend');
  await c.query(INVERSE);
  ok(await md5De(SIG) === MD5_PROD, `${SIG} = prod (md5 ${MD5_PROD})`);
  {
    const { b: L2 } = await cycle2();
    ok((await trace(L2)).issue === 'prouvee', 'L2 (remise publiée) « Achat en cours » : prouvée (règle de 20261105170000)');
    ok(Number((await un(`SELECT public.fiche_annonces_vivantes($1, 'leboncoin') AS n`, [L2.inv])).n) === 2, 'fiche_annonces_vivantes = 2 (L1 « Vendu » encore listée + L2)');
    const vp = await ventesProuvees();
    const refus = await un(`SELECT raison, reessayer_apres > now() + interval '5 hours' AS six_h FROM ventes_prouvees_refus WHERE job_id = $1`, [L2.job]);
    const e = await etat(L2);
    ok(vp.refusees >= 1 && /Plusieurs exemplaires sont possibles/.test(refus?.raison ?? '') && refus?.six_h && e.quantite === 9996 && e.job === 'published',
      'refusée par enregistrer_vente_atomique (« Plusieurs exemplaires sont possibles »), réessai dans 6 h, stock 9996', { vp, refus, q: e.quantite });
  }

  // ── 2. APRÈS ──
  console.log('\n2. APRÈS — la migration, appliquée en entier');
  await c.query(MIGRATION);
  ok(await md5De(SIG) === MD5_NEUF, `${SIG} réécrite (md5 ${MD5_NEUF})`);
  ok(await md5De('public.fiche_annonces_vivantes(bigint)') === MD5_LUS['fiche_annonces_vivantes(p_inv bigint)'], 'la surcharge fiche_annonces_vivantes(bigint) n\'est pas touchée');
  ok(await acl() === aclAvant, `droits inchangés (${aclAvant})`);
  {
    const { a: L1, b: L2 } = await cycle2();
    ok(Number((await un(`SELECT public.fiche_annonces_vivantes($1, 'leboncoin') AS n`, [L2.inv])).n) === 0, 'fiche_annonces_vivantes = 0 (L1 « Vendu » et L2 « Achat en cours » ne comptent plus)');
    const vp = await ventesProuvees();
    const e = await etat(L2);
    ok(vp.enregistrees >= 1 && e.quantite === 9995 && e.job === 'sold' && e.recu?.ok === true && e.recu?.restant === 9995,
      `la vente suivante est enregistrée TOUT DE SUITE : stock 9996 → ${e.quantite}, job « sold », reçu restant ${e.recu?.restant}`, { vp, e: [e.quantite, e.job, e.recu] });
    ok(!(await un(`SELECT 1 AS x FROM ventes_prouvees_refus WHERE job_id = $1`, [L2.job])), 'aucun refus mémorisé');
    await revoirEnLigne(L1); await revoirEnLigne(L2);
    const t = await tourRemises(L2);
    const e2 = await etat(L2);
    ok(e2.remise?.statut === 'faite' && e2.depots?.filter((d) => d.status === 'pending').length === 1,
      `et sa remise en vente suit (remises_en_vente_tick de prod : ${J(t)})`, e2.remise);
  }

  // ── 3. LES APPELANTS, SOUS LES DEUX DÉFINITIONS ──
  console.log('\n3. Chaque appelant de fiche_annonces_vivantes(bigint, text), sous la définition de prod puis la neuve (mêmes fixtures)');
  // T1 — pièce unique, DEUX annonces Leboncoin vivantes sans transaction (+ une 3e sous « Achat en cours ») : 3 → 2.
  {
    const u = await compte(); const inv = await poser(() => ficheT(u));
    const A = await poser(() => jobT(u, inv, { platform: 'leboncoin' }));
    const A2 = await poser(() => jobT(u, inv, { platform: 'leboncoin', ilYa: '2 days' }));
    const B = await poser(() => jobT(u, inv, { platform: 'leboncoin', ilYa: '1 day', pf: PREUVE_LBC('pending'), annonce: { tx: 'pending' } }));
    console.log('   T1 · pièce unique, 2 annonces Leboncoin sans transaction + 1 « Achat en cours » (3 → 2) : le doute reste');
    await temoin('fiche_annonces_vivantes', 'T1', M.fav(inv, 'leboncoin'), { avant: 3, apres: 2 });
    await temoin('enregistrer_vente_atomique', 'T1 vente de B', M.eva(u, inv, B.job), 'inchange');
    await temoin('enregistrer_vente_prouvee (tick)', 'T1', M.evProuvee(inv, B.job), 'inchange');
    await temoin('enregistrer_ventes_prouvees', 'T1', M.evp(u, inv), 'inchange');
    // vendue ailleurs (Vinted)
    await poser(async () => { await c.query(`UPDATE inventaire SET statut = 'vendu', quantite = 0, plateforme = 'Vinted' WHERE id = $1`, [inv]); await venteT(u, inv, { code: 'vinted', libelle: 'Vinted' }); });
    await temoin('armer_retrait_job_pour', 'T1 vendue sur Vinted, copie A', M.arjp(inv, A.job), 'inchange');
    await temoin('armer_retraits_copies', 'T1 vendue sur Vinted', M.arc(inv), 'inchange');
    await temoin('poser_questions_copies_non_prouvees', 'T1 vendue sur Vinted', M.pq(inv), 'inchange');
    void A2;
  }
  // T2 — pièce unique, UNE seule annonce Leboncoin (sous transaction) + une copie Vinted : 1 → 0, sous le seuil des deux côtés.
  {
    const u = await compte(); const inv = await poser(() => ficheT(u));
    await poser(() => jobT(u, inv, { platform: 'vinted', annonce: null }));
    const B = await poser(() => jobT(u, inv, { platform: 'leboncoin', pf: PREUVE_LBC('pending'), annonce: { tx: 'pending' } }));
    console.log('   T2 · pièce unique, 1 seule annonce Leboncoin « Achat en cours » + copie Vinted (1 → 0) : le chemin ordinaire');
    await temoin('fiche_annonces_vivantes', 'T2', M.fav(inv, 'leboncoin'), { avant: 1, apres: 0 });
    await temoin('enregistrer_vente_atomique', 'T2 vente de B', M.eva(u, inv, B.job), 'inchange');
    await temoin('enregistrer_vente_prouvee (tick)', 'T2', M.evProuvee(inv, B.job), 'inchange');
    await temoin('enregistrer_ventes_prouvees', 'T2', M.evp(u, inv), 'inchange');
    await poser(async () => { await c.query(`UPDATE inventaire SET statut = 'vendu', quantite = 0, plateforme = 'Vinted' WHERE id = $1`, [inv]); await venteT(u, inv, { code: 'vinted', libelle: 'Vinted' }); });
    await temoin('armer_retrait_job_pour', 'T2 vendue sur Vinted, B', M.arjp(inv, B.job), 'inchange');
    await temoin('armer_retraits_copies', 'T2 vendue sur Vinted', M.arc(inv), 'inchange');
    await temoin('poser_questions_copies_non_prouvees', 'T2 vendue sur Vinted', M.pq(inv), 'inchange');
  }
  // T3 — une autre plateforme (Beebs) : deux annonces, même avec un champ de transaction rempli → la ligne ne la voit pas.
  {
    const u = await compte(); const inv = await poser(() => ficheT(u, { statut: 'vendu', quantite: 0, plateforme: 'Vinted' }));
    await poser(() => venteT(u, inv, { code: 'vinted', libelle: 'Vinted' }));
    const A = await poser(() => jobT(u, inv, { platform: 'beebs', annonce: { tx: 'sold' } }));
    await poser(() => jobT(u, inv, { platform: 'beebs', ilYa: '2 days', annonce: { tx: 'pending' } }));
    console.log('   T3 · Beebs, deux annonces (champ transaction rempli) : la ligne ne regarde que Leboncoin');
    await temoin('fiche_annonces_vivantes', 'T3 beebs', M.fav(inv, 'beebs'), 'inchange');
    await temoin('armer_retrait_job_pour', 'T3 copie Beebs', M.arjp(inv, A.job), 'inchange');
    await temoin('armer_retraits_copies', 'T3', M.arc(inv), 'inchange');
    await temoin('poser_questions_copies_non_prouvees', 'T3', M.pq(inv), 'inchange');
  }
  // T4 — « Oui, la retirer » (p_preuve_geste) : armer_retrait_job_pour saute la garde des deux annonces → identique.
  // T5 — ventes_a_decider : X vendue (« Vendue ? » à confirmer) + Y vivante + Z sous transaction.
  const vadForme = async (txZ, avecY = true) => {
    const u = await compte(); const inv = await poser(() => ficheT(u));
    const X = await poser(() => jobT(u, inv, { platform: 'leboncoin', ilYa: '5 days', annonce: { statut: 'vendue' } }));
    if (avecY) await poser(() => jobT(u, inv, { platform: 'leboncoin', ilYa: '4 days' }));
    await poser(() => jobT(u, inv, { platform: 'leboncoin', ilYa: '2 days', annonce: { tx: txZ } }));
    await poser(() => c.query(`INSERT INTO push_ventes (user_id, origine, plateforme, inventaire_id, job_id, annonce_id, titre, prix, part_le)
      VALUES ($1, 'job', 'leboncoin', $2, $3, $4, 'Assiette témoin', 20, now() - interval '1 hour')`, [u, inv, X.job, X.listing]));
    return { u, inv, X };
  };
  {
    console.log('   T5 · ventes_a_decider (X « vendue » à confirmer)');
    const t1 = await vadForme(null);
    await temoin('ventes_a_decider', 'T5a X + Y + Z vivantes sans transaction (2 → 2)', M.vad(t1.u, t1.inv), 'inchange');
    const t2 = await vadForme('pending', false);
    await temoin('ventes_a_decider', 'T5b X + Z « Achat en cours » seule (1 → 0)', M.vad(t2.u, t2.inv), 'inchange');
    const t3 = await vadForme('pending');
    await temoin('ventes_a_decider', 'T5c X + Y vivante + Z « Achat en cours » (2 → 1) — 0 cas en prod le 05/11', M.vad(t3.u, t3.inv), { avant: [], apres: [t3.X.listing] });
  }
  // C1 — FORME DE LA FICHE DE PROD 1790174155261 (pièce unique, quantité 1) : A = republication FillSell Leboncoin encore
  // relevée « en ligne », B = annonce Leboncoin rattachée automatiquement (photo_identique), « Achat en cours », preuve
  // exacte ; une copie eBay importée.
  {
    const u = await compte(); const inv = await poser(() => ficheT(u));
    const E = await poser(() => jobT(u, inv, { platform: 'ebay', ilYa: '40 days', pf: { source: 'releve', rattachement: { par: 'auto', import: true } } }));
    const A = await poser(() => jobT(u, inv, { platform: 'leboncoin', action: 'republish', ilYa: '13 days' }));
    const B = await poser(() => jobT(u, inv, { platform: 'leboncoin', ilYa: '1 day', pf: PREUVE_LBC('pending'), annonce: { tx: 'pending' } }));
    console.log('   C1 · forme de 1790174155261 (pièce unique) : A dépôt FillSell sans transaction + B rattachée auto « Achat en cours » + copie eBay');
    await temoin('fiche_annonces_vivantes', 'C1', M.fav(inv, 'leboncoin'), { avant: 2, apres: 1 });
    const cle = (x) => ({ ok: x.ok, statut: x.apres?.statut, retraits: x.apres?.retraits?.map((r) => r.split(':')[0]), questions: x.apres?.questions?.length });
    await temoin('enregistrer_vente_atomique', 'C1 vente de B (la cible)', M.eva(u, inv, B.job),
      { cle, avant: { ok: false, statut: 'stock', retraits: [], questions: 0 }, apres: { ok: true, statut: 'vendu', retraits: ['ebay'], questions: 0 } });
    await temoin('enregistrer_vente_prouvee (tick)', 'C1', M.evProuvee(inv, B.job),
      { cle: (x) => x.issue, avant: 'refusee', apres: 'enregistree' });
    await temoin('enregistrer_ventes_prouvees', 'C1', M.evp(u, inv),
      { cle: (x) => ({ enregistrees: x.enregistrees, statut: x.apres?.statut }), avant: { enregistrees: 0, statut: 'stock' }, apres: { enregistrees: 1, statut: 'vendu' } });
    // Après la vente : A (Leboncoin, même plateforme que la vente) reste publiée, ni retrait ni question — dit, pas jugé.
    const r = await sousLesDeux(async () => { await un(`SELECT public.enregistrer_vente_atomique($1, NULL, p_job := $2, p_prix := 20)`, [u, B.job]);
      return (await un(`SELECT status FROM cross_post_jobs WHERE id = $1`, [A.job])).status + ' / ' + J(await etatT(inv)); });
    ok(String(r.apres).startsWith('published') && !/leboncoin/.test(String(r.apres).split(' / ')[1]),
      `C1 après la vente (neuve) : A reste « published », aucun retrait ni question Leboncoin (${r.apres})`, r);
    void E;
  }
  // C2 — FORME DE LA FICHE DE PROD 1791656197832 (pièce unique) le jour où elle est vendue AILLEURS : A Leboncoin sans
  // transaction, B Leboncoin « Vendu » (sale_signal sans preuve), toutes deux importées.
  const c2 = async (bPlusRecente) => {
    const u = await compte(); const inv = await poser(() => ficheT(u, { statut: 'vendu', quantite: 0, plateforme: 'Vinted' }));
    await poser(() => venteT(u, inv, { code: 'vinted', libelle: 'Vinted' }));
    const A = await poser(() => jobT(u, inv, { platform: 'leboncoin', ilYa: bPlusRecente ? '26 days' : '24 days', pf: IMPORTEE }));
    const B = await poser(() => jobT(u, inv, { platform: 'leboncoin', ilYa: '25 days', pf: { ...IMPORTEE, sale_signal: 'sold' }, annonce: { tx: 'sold' } }));
    return { u, inv, A, B };
  };
  {
    console.log('   C2 · forme de 1791656197832 (pièce unique) vendue sur Vinted : A sans transaction + B « Vendu »');
    const x = await c2(true);
    await temoin('fiche_annonces_vivantes', 'C2', M.fav(x.inv, 'leboncoin'), { avant: 2, apres: 1 });
    await temoin('armer_retrait_job_pour', 'C2 copie A', M.arjp(x.inv, x.A.job),
      { cle: (r) => ({ retrait: r.retrait }), avant: { retrait: false }, apres: { retrait: true } });
    await temoin('armer_retrait_job_pour', 'C2 copie A, « Oui, la retirer » (p_preuve_geste)', M.arjp(x.inv, x.A.job, true), 'inchange');
    const q = (r) => ({ armes: r.armes, questions: r.questions, retraits: r.apres?.retraits, questions_sur: r.apres?.questions });
    await temoin('armer_retraits_copies', 'C2 (B plus récente : choisie, sale_signal → rien ; A jamais essayée)', M.arc(x.inv),
      { cle: q, avant: { armes: 0, questions: 1, retraits: [], questions_sur: [`leboncoin:${x.A.listing}`] }, apres: { armes: 0, questions: 0, retraits: [], questions_sur: [] } });
    await temoin('poser_questions_copies_non_prouvees', 'C2', M.pq(x.inv),
      { cle: (r) => r.n, avant: 1, apres: 0 });
    const y = await c2(false);
    await temoin('armer_retraits_copies', 'C2 bis (A plus récente)', M.arc(y.inv),
      { cle: q, avant: { armes: 0, questions: 1, retraits: [], questions_sur: [`leboncoin:${y.A.listing}`] }, apres: { armes: 1, questions: 0, retraits: [`leboncoin:${y.A.listing}`], questions_sur: [] } });
    // enregistrer_vente_atomique, 2e usage (boucle des copies, vente sur une AUTRE plateforme, dernier exemplaire).
    const u = await compte(); const inv = await poser(() => ficheT(u));
    const V = await poser(() => jobT(u, inv, { platform: 'vinted', annonce: null, pf: { sale_signal: 'sold' } }));
    const A = await poser(() => jobT(u, inv, { platform: 'leboncoin', ilYa: '26 days', pf: IMPORTEE }));
    await poser(() => jobT(u, inv, { platform: 'leboncoin', ilYa: '25 days', pf: { ...IMPORTEE, sale_signal: 'sold' }, annonce: { tx: 'sold' } }));
    await temoin('enregistrer_vente_atomique (boucle des copies)', 'C2 ter vente Vinted du dernier exemplaire', M.eva(u, inv, V.job),
      { cle: (r) => ({ ok: r.ok, retraits: r.apres?.retraits, questions_sur: r.apres?.questions }),
        avant: { ok: true, retraits: [], questions_sur: [`leboncoin:${A.listing}`] }, apres: { ok: true, retraits: [`leboncoin:${A.listing}`], questions_sur: [] } });
  }

  // ── 4. L'INVERSE ──
  console.log("\n4. L'INVERSE : la définition de prod, mot pour mot ; la migration se rejoue");
  await c.query(INVERSE);
  ok(await md5De(SIG) === MD5_PROD, `${SIG} revenue à la prod (md5 ${MD5_PROD})`);
  ok(await acl() === aclAvant, 'droits inchangés');
  await c.query(MIGRATION);
  ok(await md5De(SIG) === MD5_NEUF, `la migration se rejoue (CREATE OR REPLACE) : md5 ${MD5_NEUF}`);
  await c.query(INVERSE);

  console.log('\nBILAN PAR APPELANT');
  for (const x of bilan) console.log(`   ${x.verdict === 'CHANGE' ? '≠' : '='} ${x.appelant.padEnd(48)} ${x.forme}${x.verdict === 'CHANGE' ? `  [${x.avant} → ${x.apres}]` : ''}`);
} catch (e) {
  ko++; console.log(`  ✗ ERREUR : ${e.message}\n${e.stack?.split('\n').slice(1, 4).join('\n')}`);
} finally {
  await c.end().catch(() => {});
  if (embarque) { await embarque.pg.stop().catch(() => {}); rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — prouvé sur un Postgres jetable (migration NON appliquée en prod)`);
process.exit(ko ? 1 : 0);
