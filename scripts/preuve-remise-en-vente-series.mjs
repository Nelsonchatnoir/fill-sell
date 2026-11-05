// PREUVE DE BOUT EN BOUT, SUR UN POSTGRES JETABLE, de la migration 20261105170000_remise_en_vente_series_leboncoin
// (05/11, règle de Nico) : une vente Leboncoin « Achat en cours » d'un article EN SÉRIE publié par FillSell va au point
// final (enregistrer_vente_atomique : −1, job « vendu », reçu avec le restant) et la remise en vente suit
// (remises_en_vente_tick : dépôt « publish » à l'identique, sans IA, marqueur remise_en_vente) ; un achat annulé rend
// l'exemplaire et arrête la remise non servie.
//
//   PREUVE_PG=embarque node scripts/preuve-remise-en-vente-series.mjs                       (Postgres 17 jetable sur le PC)
//   PREUVE_PG=embarque node scripts/preuve-remise-en-vente-series.mjs --catalogue <f.json>  (catalogue déjà lu, hors ligne)
//
// LE PLUS FIDÈLE POSSIBLE : la base jetable porte le schéma public DE PROD — toutes ses fonctions (pg_get_functiondef),
// ses tables (colonnes, défauts, contraintes, clés étrangères, index), ses déclencheurs (avec leur état), coin_config et
// platform_health — lus EN LECTURE SEULE (`npx supabase db query --linked --read-only`, catalogue système seulement,
// aucune donnée client). Les schémas de Supabase sont des bouchons : auth (uid/role/jwt), net (http_post RETENU dans
// net._appels : on compte les mails / notifications, rien ne part), vault, cron, storage. Les trois fonctions sous
// preuve partent de leur définition de prod (l'INVERSE, md5 vérifiés) ; la migration est appliquée telle quelle.
// ⛔ Jamais la prod : PREUVE_PG refuse toute adresse supabase.co ; rien n'est écrit ailleurs que dans la base jetable.
import pg from 'pg';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const lire = (p) => readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = lire('supabase/migrations/20261105170000_remise_en_vente_series_leboncoin.sql');
const INVERSE = lire('supabase/rollbacks/20261105170000_remise_en_vente_series_leboncoin_INVERSE.sql');
// md5 des définitions de prod du 05/11 (pg_get_functiondef, SANS les retours chariot) — l'INVERSE les porte mot pour mot.
const MD5_PROD = {
  'public.leboncoin_transaction_noter(uuid,text,text)': 'dbf4bdd2e8ce0246518a3ffafb2f918d',
  'public.remises_en_vente_tick(integer,uuid)': 'd93d5ddd7306743644921495c23434cc',
  'public.vente_transaction_annulee_leboncoin(bigint,text)': 'f3a8a336985bed96456f3f1d00d659bf',
};
const SIGS = Object.keys(MD5_PROD);
// Une seule fonction d'un fichier (pour rejouer la définition de prod d'UNE fonction, étape 2 bis).
const fonctionDe = (texte, nom) => {
  const i = texte.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  const corps = i < 0 ? -1 : texte.indexOf('AS $function$', i);
  const f = corps < 0 ? -1 : texte.indexOf('$function$', corps + 'AS $function$'.length);
  if (f < 0) throw new Error(`${nom} introuvable`);
  return texte.slice(i, f + '$function$'.length);
};

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
  // Réglages du serveur (interrupteurs, plafonds, paliers) et santé des plateformes : de la configuration, aucune donnée client.
  config: `SELECT 'coin_config' AS t, jsonb_agg(to_jsonb(c)) AS lignes FROM public.coin_config c
  UNION ALL SELECT 'platform_health', jsonb_agg(to_jsonb(h)) FROM public.platform_health h;`,
};
function lireProd(sql, dossier) {
  const f = join(dossier, `requete-${Object.keys(REQUETES).find((k) => REQUETES[k] === sql)}.sql`);
  writeFileSync(f, sql);
  // --read-only : la session est en lecture seule côté serveur ; seules des requêtes SELECT du catalogue partent.
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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-remise-series-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55451, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55451/postgres';
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
-- pg_net RETENU : chaque appel (mail, notification, fonction edge) est noté, rien ne part.
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
const CHAINE_FONCTIONS = ['leboncoin_transaction_noter', 'annonces_plateforme_transaction_leboncoin', 'leboncoin_transaction_lue',
  'annonce_importee', 'leboncoin_vendu_avant_suivi', 'ventes_prouvees_tick', 'ventes_prouvees_a_enregistrer', 'enregistrer_vente_prouvee',
  'enregistrer_vente_atomique', 'enregistrer_vente_declaree', 'retrait_job_prouve', 'fiche_annonces_vivantes',
  'cross_post_jobs_vendu_remise_en_vente', 'remises_en_vente_tick', 'remise_en_vente_place', 'remise_en_vente_champs',
  'vente_transaction_annulee_leboncoin', 'signal_vente_lever', 'push_trg_job', 'push_noter', 'inventaire_vendu_retire_ses_copies',
  'cross_post_jobs_preuve_vente_retire_copies', 'armer_retraits_copies', 'palier_de', 'quota_remontees_plafond', 'remontees_du_cycle'];
const CHAINE_TABLES = ['cross_post_jobs', 'inventaire', 'annonces_plateforme', 'ventes', 'ventes_operations', 'remises_en_vente',
  'usage_logs', 'ventes_prouvees_refus', 'ventes_prouvees_passages', 'inventaire_journal', 'ventes_supprimees', 'push_ventes'];

async function construire() {
  const echecs = [];
  const essayer = async (sql, quoi) => { try { await c.query(sql); return true; } catch (e) { echecs.push(`${quoi} : ${e.message}`); return false; } };
  await c.query(PRELUDE);
  await c.query('SET search_path = public, extensions');
  const tables = catalogue.tables;
  for (const s of catalogue.divers.filter((d) => d.k === 'seq')) await essayer(`CREATE SEQUENCE public.${id(s.nom)}`, `séquence ${s.nom}`);
  // Tables : colonnes, NOT NULL, identités ; les défauts après les fonctions (un défaut peut en appeler une).
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
  // La configuration du serveur, telle qu'en prod.
  for (const cfg of catalogue.config) {
    if (!cfg.lignes) continue;
    await c.query(`INSERT INTO public.${id(cfg.t)} SELECT * FROM jsonb_populate_recordset(NULL::public.${id(cfg.t)}, $1)`, [JSON.stringify(cfg.lignes)]);
  }
  return { echecs, nf, nt, ntChaine, ntChaineOk };
}

// ── 3. LE COMPTE ET LES ARTICLES D'ESSAI ────────────────────────────────────────────────────────────────────────────
const U = '0f5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e';
let invSuivant = 7700000000000, lidSuivant = 3399000000;
const PHOTOS = ['https://exemple.invalid/1.jpg', 'https://exemple.invalid/2.jpg'];
// Un article et son annonce Leboncoin en ligne. origine : 'fillsell' (publication FillSell), 'republication' (dépôt
// FillSell qui hérite source / rattachement d'une annonce importée — 3298491503, job 6696ce1f), 'importee' (vraie
// annonce importée par le relevé).
async function article({ quantite, origine = 'fillsell', copieVinted = false, titre = 'Lot de 10 crayons' } = {}) {
  const inv = invSuivant++; const lid = String(lidSuivant++);
  await c.query(`INSERT INTO inventaire (id, user_id, titre, statut, quantite, prix_vente, prix_achat, description, photos)
    VALUES ($1, $2, $3, 'stock', $4, 25, 4, 'Neuf, emballé.', $5)`, [inv, U, `${titre} ${inv}`, quantite, JSON.stringify(PHOTOS)]);
  const pf = { lbcCategoryPath: ['Loisirs', 'Jeux & Jouets'], etat: 'Neuf', adresse: 'Paris' };
  if (origine === 'republication') Object.assign(pf, { source: 'releve', rattachement: { par: 'utilisateur', import: true },
    republish_snapshot: { prix: 25 }, recreated_at: new Date().toISOString(), old_platform_listing_id: '3200000000' });
  if (origine === 'importee') Object.assign(pf, { source: 'releve', rattachement: { par: 'auto', import: true } });
  const { id: job } = await un(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, title, description, price, photos,
      platform_listing_id, listing_url, published_at, created_at, handler_build, platform_fields, last_checked_at)
    VALUES ($1, $2, 'leboncoin', 'published', $3, $4, 'Neuf, emballé.', $5, $6, $7, $8, now() - interval '3 days', now() - interval '3 days', '0.6.174', $9,
      now() - interval '1 hour')
    RETURNING id`, [U, inv, origine === 'republication' ? 'republish' : 'publish', `${titre} ${inv}`, origine === 'republication' ? null : 25,
    JSON.stringify(PHOTOS), lid, `https://www.leboncoin.fr/ad/jeux_jouets/${lid}`, JSON.stringify(pf)]);
  if (copieVinted) {
    await c.query(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, listing_url, published_at, handler_build, platform_fields)
      VALUES ($1, $2, 'vinted', 'published', 'publish', $3, 25, $4, $5, now() - interval '3 days', '0.6.174', '{}')`,
      [U, inv, `${titre} ${inv}`, `77${lid}`, `https://www.vinted.fr/items/77${lid}`]);
  }
  const { id: annonce } = await un(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, prix, statut_plateforme, inventaire_id, job_id, vu_le)
    VALUES ($1, 'leboncoin', $2, $3, $4, 25, 'en_ligne', $5, $6, now() - interval '1 hour') RETURNING id`,
    [U, lid, `https://www.leboncoin.fr/ad/jeux_jouets/${lid}`, `${titre} ${inv}`, inv, job]);
  return { inv, lid, job, annonce };
}
// Le relevé Leboncoin lit la transaction de l'annonce (handler-watch écrit transaction_plateforme / transaction_lue_le).
const lireTransaction = (a, tx) => c.query(`UPDATE annonces_plateforme SET transaction_plateforme = $2, transaction_lue_le = clock_timestamp(),
  vu_le = clock_timestamp(), statut_plateforme = 'en_ligne' WHERE id = $1`, [a.annonce, tx]);
const revoirEnLigne = (a) => c.query(`UPDATE annonces_plateforme SET vu_le = clock_timestamp() WHERE id = $1`, [a.annonce]);
const trace = async (a) => (await un(`SELECT metadata FROM usage_logs WHERE feature = 'vente_leboncoin_transaction' AND metadata ->> 'annonce' = $1
  ORDER BY created_at DESC LIMIT 1`, [a.annonce]))?.metadata ?? {};
const etat = async (a) => un(`SELECT i.quantite, i.statut, j.status AS job, j.platform_fields AS pf,
    (SELECT count(*)::int FROM ventes v WHERE v.inventaire_id = i.id) AS ventes,
    (SELECT o.resultat FROM ventes_operations o WHERE o.user_id = j.user_id AND o.cle = 'annonce:leboncoin:' || $3) AS recu,
    (SELECT to_jsonb(r) FROM remises_en_vente r WHERE r.job_vendu = j.id) AS remise,
    (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at) FROM cross_post_jobs d WHERE d.inventaire_id = i.id AND d.platform_fields ? 'remise_en_vente') AS depots,
    (SELECT count(*)::int FROM inventaire h WHERE h.user_id = i.user_id AND h.statut = 'vendu' AND h.titre = i.titre AND h.id <> i.id) AS copies_vendu
  FROM inventaire i JOIN cross_post_jobs j ON j.id = $2 WHERE i.id = $1`, [a.inv, a.job, a.lid]);
const notes = async () => un(`SELECT (SELECT count(*)::int FROM push_ventes) AS push, (SELECT count(*)::int FROM net._appels) AS appels`);
const ventesProuvees = () => un(`SELECT public.ventes_prouvees_tick(25, 4000) AS r`).then((x) => x.r);
// remises_en_vente_tick : la ligne naît « dans 2 minutes » — les 2 minutes passent.
const tourRemises = async (a) => {
  await c.query(`UPDATE remises_en_vente SET prochain_essai = now() - interval '1 second' WHERE job_vendu = $1 AND statut = 'a_faire'`, [a.job]);
  return (await un(`SELECT public.remises_en_vente_tick(20, $1) AS r`, [U])).r;
};
const declarer = async (a) => (await un(`SELECT public.enregistrer_vente_declaree($1, $2, 25) AS r`, [U, a.job])).r;

async function venteSerieComplete(quantite = 9997) {
  const a = await article({ quantite });
  await lireTransaction(a, 'pending');
  await ventesProuvees();
  await revoirEnLigne(a);
  await tourRemises(a);
  return a;
}

try {
  // ── 0. CONSTRUCTION ──
  console.log(`\n0. La base jetable porte le schéma public de prod (lu le ${catalogue.lu_le})`);
  const b = await construire();
  if (bavard) for (const e of b.echecs) console.log(`    · ${e}`);
  ok(b.nf >= catalogue.fonctions.length - 5, `fonctions de prod créées : ${b.nf}/${catalogue.fonctions.length}`, b.echecs.filter((e) => e.startsWith('fonction')).join(' | '));
  const manquantes = (await tous(`SELECT f FROM unnest($1::text[]) f WHERE NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = f AND p.pronamespace = 'public'::regnamespace)`, [CHAINE_FONCTIONS])).map((r) => r.f);
  ok(manquantes.length === 0, `les ${CHAINE_FONCTIONS.length} fonctions de la chaîne sont là (définitions de prod)`, manquantes.join(', '));
  ok(b.ntChaine > 0 && b.ntChaineOk === b.ntChaine, `déclencheurs de prod des tables de la chaîne : ${b.ntChaineOk}/${b.ntChaine} (tous les déclencheurs : ${b.nt})`,
    b.echecs.filter((e) => e.startsWith('déclencheur')).join(' | '));
  const cfg = await un(`SELECT (SELECT value FROM coin_config WHERE key = 'ventes_leboncoin_transaction') AS tx,
    (SELECT value FROM coin_config WHERE key = 'ventes_prouvees_auto_depuis') AS depuis,
    (SELECT value FROM coin_config WHERE key = 'price_per_platform') AS prix,
    (SELECT count(*)::int FROM platform_health WHERE paused) AS pauses`);
  ok(cfg.tx === 1 && cfg.depuis > 0 && (cfg.prix ?? 0) === 0, `coin_config de prod : ventes_leboncoin_transaction=${cfg.tx}, ventes_prouvees_auto_depuis=${cfg.depuis}, price_per_platform=${cfg.prix ?? 0}`);
  ok(cfg.pauses === 0, `platform_health de prod : aucune plateforme en pause (${cfg.pauses})`);
  // Le compte d'essai : palier « business » comme Louis (Amiral), poste vu à l'instant.
  await c.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'preuve@exemple.invalid')`, [U]);
  await c.query(`INSERT INTO profiles (id, email, is_premium, is_pro, is_business, extension_last_seen_at, extension_version, extension_build, lang)
    VALUES ($1, 'preuve@exemple.invalid', true, true, true, now(), '0.6.174', '0.6.174', 'fr')`, [U]);
  ok((await un(`SELECT public.palier_de($1) AS p`, [U])).p === 'business', 'compte d\'essai au palier « business » (celui de Louis)');

  // ── 1. AVANT : les définitions de prod ──
  console.log('\n1. AVANT — les définitions de prod (INVERSE)');
  await c.query(INVERSE);
  for (const s of SIGS) ok(await md5De(s) === MD5_PROD[s], `${s} = prod (md5 ${MD5_PROD[s]})`);
  const av = {};
  {
    const a = await article({ quantite: 9997 });
    await lireTransaction(a, 'pending');
    const t = await trace(a);
    ok(t.issue === 'plusieurs_exemplaires', `série (9997) publiée par FillSell, « Achat en cours » lu : trace « ${t.issue} »`, t);
    const e0 = await etat(a);
    ok(!e0.pf?.sale_signal && !e0.pf?.sale_evidence, 'aucune preuve posée sur le job', e0.pf);
    await ventesProuvees();
    await revoirEnLigne(a);
    await tourRemises(a);
    const e = await etat(a);
    ok(e.quantite === 9997 && e.job === 'published' && e.ventes === 0 && !e.remise && !e.depots,
      'LA RÉGRESSION : stock 9997, job « published », aucune vente, aucune remise en vente', e);
  }
  {
    const a = await article({ quantite: 9998, origine: 'republication' });
    await lireTransaction(a, 'pending');
    const t = await trace(a); const e = (await ventesProuvees(), await etat(a));
    ok(t.issue === 'plusieurs_exemplaires' && e.quantite === 9998 && e.ventes === 0,
      `republication FillSell aux marques héritées (6696ce1f) : « ${t.issue} », stock ${e.quantite}, ${e.ventes} vente`, { t, e });
  }
  {
    const a = await article({ quantite: 1 });
    const n0 = await notes();
    await lireTransaction(a, 'pending');
    const t = await trace(a); await ventesProuvees();
    const n1 = await notes();
    await revoirEnLigne(a); await tourRemises(a);
    const e = await etat(a);
    av.unique = { issue: t.issue, push: n1.push - n0.push, appels: n1.appels - n0.appels, e };
    ok(t.issue === 'prouvee' && e.statut === 'vendu' && e.quantite === 0 && e.job === 'sold' && e.ventes === 1,
      'témoin pièce unique : prouvée, vendue, stock 0', { t, e });
    ok(e.remise?.statut === 'abandonnee' && e.remise?.motif === 'plus_de_stock' && !e.depots, 'témoin pièce unique : aucune remise (plus_de_stock)', e.remise);
  }
  {
    const a = await article({ quantite: 5, origine: 'importee' });
    await lireTransaction(a, 'pending');
    const t = await trace(a); await ventesProuvees(); const e = await etat(a);
    av.importee = t.issue;
    ok(t.issue === 'plusieurs_exemplaires' && !e.pf?.sale_signal && e.quantite === 5 && e.ventes === 0,
      'témoin vraie annonce importée à 5 unités : trace « plusieurs_exemplaires », rien d\'écrit', { t, e });
  }
  {
    // (a) isolée : la vente d'une série enregistrée par un autre chemin (déclarée), l'annonce relue « en ligne » sous transaction.
    const a = await article({ quantite: 50 });
    const r = await declarer(a);
    await lireTransaction(a, 'pending');
    const t = await tourRemises(a); const e = await etat(a);
    ok(r.ok === true && e.quantite === 49, 'série vendue par une déclaration : stock 49, job « vendu »', r);
    ok(e.remise?.motif === 'annonce_vendue_encore_en_ligne' && e.remise?.statut === 'a_faire' && !e.depots,
      '(a) annonce sous transaction revue « en ligne » : remise REPORTÉE de 6 h (annonce_vendue_encore_en_ligne), sans fin', { t, remise: e.remise });
  }
  {
    // (b) isolée : republication aux marques héritées, vente déclarée.
    const a = await article({ quantite: 50, origine: 'republication' });
    await declarer(a); await tourRemises(a); const e = await etat(a);
    ok(e.remise?.motif === 'annonce_importee_a_quantite' && e.remise?.statut === 'abandonnee' && !e.depots,
      '(b) republication FillSell aux marques héritées : remise ABANDONNÉE « annonce_importee_a_quantite »', e.remise);
  }

  // ── 2. APRÈS : la migration ──
  console.log('\n2. APRÈS — la migration, appliquée en entier');
  await c.query(MIGRATION);
  const md5Neufs = {};
  for (const s of SIGS) { md5Neufs[s] = await md5De(s); ok(md5Neufs[s] !== MD5_PROD[s], `${s} réécrite (md5 ${md5Neufs[s]})`); }
  let serie;
  {
    const a = serie = await article({ quantite: 9997, copieVinted: true });
    const n0 = await notes();
    await lireTransaction(a, 'pending');
    const t = await trace(a);
    ok(t.issue === 'prouvee', `série (9997) publiée par FillSell, « Achat en cours » lu : « ${t.issue} »`, t);
    const e0 = await etat(a);
    const ev = e0.pf?.sale_evidence ?? {};
    ok(e0.pf?.sale_signal === 'sold' && ev.exact === true && ev.source === 'transaction_leboncoin' && ev.state === 'sold'
      && ev.statut === 'pending' && ev.listing_id === a.lid && ev.platform === 'leboncoin' && Number(e0.pf?.detected_price) === 25,
      'la MÊME preuve exacte qu\'une pièce unique (sale_signal, sale_evidence transaction_leboncoin « Achat en cours », prix lu)', e0.pf);
    const vp = await ventesProuvees();
    ok(vp.enregistrees >= 1, `ventes_prouvees_tick : ${vp.enregistrees} vente(s) enregistrée(s) par le point final`, vp);
    const n1 = await notes();
    const e = await etat(a);
    ok(e.quantite === 9996 && e.statut === 'stock', `stock 9997 → ${e.quantite} (enregistrer_vente_atomique, −1)`, e);
    ok(e.job === 'sold' && e.ventes === 1 && e.recu?.ok === true && e.recu?.restant === 9996,
      `job « sold », 1 vente Leboncoin, reçu « restant » ${e.recu?.restant}`, e.recu);
    const v = await un(`SELECT plateforme_code, annonce_id, prix_vente, quantite FROM ventes WHERE inventaire_id = $1`, [a.inv]);
    ok(v.plateforme_code === 'leboncoin' && v.annonce_id === a.lid && Number(v.prix_vente) === 25 && v.quantite === 1, 'la vente : Leboncoin, ce numéro d\'annonce, 25 €, 1 exemplaire', v);
    ok(e.copies_vendu === 1, 'une copie « vendu » de l\'exemplaire (historique, comme toute vente partielle)', e.copies_vendu);
    const cv = await un(`SELECT status, (SELECT count(*)::int FROM cross_post_jobs d WHERE d.inventaire_id = $1 AND d.action = 'delete') AS retraits
      FROM cross_post_jobs WHERE inventaire_id = $1 AND platform = 'vinted'`, [a.inv]);
    ok(cv.status === 'published' && cv.retraits === 0, 'la copie Vinted reste en ligne : aucun retrait armé (il reste du stock)', cv);
    ok(e.remise?.statut === 'a_faire', 'déclencheur : la remise en vente est notée (remises_en_vente « a_faire »)', e.remise);
    ok(n1.push - n0.push === av.unique.push && n1.appels - n0.appels === av.unique.appels,
      `notes de vente (push_ventes / pg_net) : ${n1.push - n0.push} / ${n1.appels - n0.appels}, comme une pièce unique`, { serie: [n1.push - n0.push, n1.appels - n0.appels], unique: [av.unique.push, av.unique.appels] });
    // Le relevé suivant revoit l'annonce « en ligne », toujours sous « Achat en cours » (Leboncoin la garde active).
    await revoirEnLigne(a);
    const t2 = await tourRemises(a);
    const e2 = await etat(a);
    const d = e2.depots?.[0];
    ok(t2.faites === 1 && e2.remise?.statut === 'faite' && e2.depots?.length === 1, `remises_en_vente_tick : 1 dépôt de remise créé (${JSON.stringify(t2)})`, { t2, remise: e2.remise });
    ok(d && d.action === 'publish' && d.status === 'pending' && d.platform === 'leboncoin' && d.title === `Lot de 10 crayons ${a.inv}`
      && Number(d.price) === 25 && JSON.stringify(d.photos) === JSON.stringify(PHOTOS) && d.photo_option === 'standard',
      'à l\'identique, sans IA : publish / pending, même titre, même prix, mêmes photos, même option photo', d);
    const rv = d?.platform_fields?.remise_en_vente ?? {};
    ok(rv.apres_vente_job === a.job && rv.annonce_vendue === a.lid && rv.restant === 9996 && rv.apres_annulation === false,
      'marqueur platform_fields.remise_en_vente (job vendu, annonce vendue, restant 9996)', rv);
    ok(!['sale_signal', 'sale_evidence', 'source', 'rattachement', 'vente_operation_cle', 'detected_price'].some((k) => k in (d?.platform_fields ?? {})),
      'aucune clé de vente ni d\'origine héritée par le dépôt', Object.keys(d?.platform_fields ?? {}));
    const t3 = await un(`SELECT public.remises_en_vente_tick(20, $1) AS r`, [U]);
    ok((await etat(a)).depots?.length === 1, 'un second tour ne crée rien (jamais deux remises)', t3.r);
    // La transaction se termine (« Vendu ») : jamais une seconde vente.
    await lireTransaction(a, 'sold');
    const t4 = await trace(a); await ventesProuvees(); const e4 = await etat(a);
    ok(t4.issue === 'deja_vendue' && e4.ventes === 1 && e4.quantite === 9996, `« Achat en cours » → « Vendu » : « ${t4.issue} », toujours 1 vente, stock 9996`, { t4, e4: [e4.ventes, e4.quantite] });
  }
  {
    const a = await article({ quantite: 9998, origine: 'republication' });
    await lireTransaction(a, 'pending');
    const t = await trace(a); await ventesProuvees(); await revoirEnLigne(a); await tourRemises(a);
    const e = await etat(a);
    ok(t.issue === 'prouvee' && e.quantite === 9997 && e.job === 'sold' && e.depots?.length === 1,
      `republication FillSell aux marques héritées (6696ce1f) : « ${t.issue} », stock 9997, remise créée`, { t: t.issue, q: e.quantite, remise: e.remise });
  }
  {
    const a = await article({ quantite: 1 });
    const n0 = await notes();
    await lireTransaction(a, 'pending');
    const t = await trace(a); await ventesProuvees();
    const n1 = await notes();
    await revoirEnLigne(a); await tourRemises(a);
    const e = await etat(a);
    ok(t.issue === av.unique.issue && e.statut === av.unique.e.statut && e.quantite === 0 && e.job === 'sold' && e.ventes === 1
      && e.remise?.motif === 'plus_de_stock' && !e.depots, 'témoin pièce unique : INCHANGÉ (prouvée, vendue, stock 0, aucune remise)', e);
    ok(n1.push - n0.push === av.unique.push && n1.appels - n0.appels === av.unique.appels, 'témoin pièce unique : mêmes notes de vente qu\'avant');
  }
  {
    const a = await article({ quantite: 5, origine: 'importee' });
    await lireTransaction(a, 'pending');
    const t = await trace(a); await ventesProuvees(); const e = await etat(a);
    ok(t.issue === 'plusieurs_exemplaires' && t.issue === av.importee && !e.pf?.sale_signal && e.quantite === 5 && e.ventes === 0 && !e.remise,
      'témoin vraie annonce importée à 5 unités : INCHANGÉ (trace, rien d\'écrit, aucune remise)', { t, e });
  }
  {
    const a = await article({ quantite: 50 });
    await declarer(a); await lireTransaction(a, 'pending');
    const t = await tourRemises(a); const e = await etat(a);
    ok(e.remise?.statut === 'faite' && e.depots?.length === 1, '(a) annonce sous transaction revue « en ligne » : la remise PART', { t, remise: e.remise });
  }
  {
    const a = await article({ quantite: 50 });
    await declarer(a); await revoirEnLigne(a);
    const t = await tourRemises(a); const e = await etat(a);
    ok(e.remise?.motif === 'annonce_vendue_encore_en_ligne' && !e.depots, '(a) témoin : annonce revue en ligne SANS transaction → toujours reportée (jamais de doublon)', { t, remise: e.remise });
  }
  {
    const a = await article({ quantite: 50, origine: 'republication' });
    await declarer(a); await tourRemises(a); const e = await etat(a);
    ok(e.remise?.statut === 'faite' && e.depots?.length === 1, '(b) republication FillSell aux marques héritées : la remise PART', e.remise);
  }
  {
    const a = await article({ quantite: 50, origine: 'importee' });
    await declarer(a); await tourRemises(a); const e = await etat(a);
    ok(e.remise?.motif === 'annonce_importee_a_quantite' && !e.depots, '(b) témoin : vraie annonce importée → toujours « annonce_importee_a_quantite »', e.remise);
  }
  console.log('\n   Achat annulé (« Achat en cours » disparu, annonce de nouveau en ligne)');
  {
    const a = await venteSerieComplete(9997);
    const avant = await etat(a);
    const depot = avant.depots?.[0];
    ok(avant.quantite === 9996 && depot?.status === 'pending', `état de départ : stock 9996, dépôt de remise « pending » pas encore pris`, avant);
    await lireTransaction(a, 'aucune');
    const t = await trace(a);
    const e = await etat(a);
    ok(t.issue === 'annulation_retiree' && t.resultat?.fiche === 'exemplaire' && t.resultat?.remise_arretee === 'depot',
      `trace « ${t.issue} » : fiche « ${t.resultat?.fiche} », remise arrêtée « ${t.resultat?.remise_arretee} »`, t);
    ok(e.quantite === 9997 && e.statut === 'stock', `stock rendu : 9996 → ${e.quantite}`, e);
    ok(e.ventes === 0 && !e.recu && e.copies_vendu === 0, 'vente retirée, reçu retiré, copie « vendu » effacée', { ventes: e.ventes, recu: e.recu, copies: e.copies_vendu });
    ok(e.job === 'published' && !e.pf?.sale_signal && e.pf?.vente_annulee?.source === 'transaction_leboncoin', 'le job de l\'annonce redevient « published » (preuve levée, gardée dans vente_annulee)', e.pf?.vente_annulee);
    const d = e.depots?.[0];
    ok(d?.status === 'cancelled' && d?.platform_fields?.remise_arretee?.avant?.status === 'pending' && /Achat Leboncoin annulé/.test(d?.error ?? ''),
      'le dépôt de remise pas encore pris est ARRÊTÉ (cancelled, remise_arretee + état d\'avant)', d);
    ok(!e.remise, 'la ligne de file de CETTE vente tombe (une revente de l\'annonce refera sa remise)', e.remise);
    const jl = await un(`SELECT avant, apres, detail FROM inventaire_journal WHERE inventaire_id = $1 AND motif = 'transaction_annulee' ORDER BY id DESC LIMIT 1`, [a.inv]);
    ok(jl?.avant === '9996' && jl?.apres === '9997' && jl.detail?.avant?.quantite === 9996 && jl.detail?.avant?.remise?.statut === 'faite'
      && jl.detail?.avant?.depot?.status === 'pending' && jl.detail?.copie_effacee?.statut === 'vendu',
      'trace (inventaire_journal) : quantité, ligne de file, dépôt et copie effacée d\'AVANT, de quoi tout rendre', jl);
    const sup = await un(`SELECT count(*)::int AS n FROM ventes_supprimees WHERE annonce_id = $1 AND motif = 'transaction_annulee'`, [a.lid]);
    ok(sup.n === 1, 'la vente retirée est gardée dans ventes_supprimees');
    // Revente de la même annonce (de nouveau « Achat en cours ») : −1 et une remise neuve.
    await lireTransaction(a, 'pending');
    const t2 = await trace(a); await ventesProuvees(); await revoirEnLigne(a); await tourRemises(a);
    const e2 = await etat(a);
    ok(t2.issue === 'prouvee' && e2.quantite === 9996 && e2.ventes === 1 && e2.remise?.statut === 'faite'
      && e2.depots?.filter((x) => x.status === 'pending').length === 1, 'revente après l\'annulation : prouvée, stock 9996, UNE remise neuve', { t: t2.issue, q: e2.quantite, remise: e2.remise });
  }
  {
    // Annulée AVANT le tour des remises : la ligne « a_faire » tombe, aucun dépôt ne naît.
    const a = await article({ quantite: 9997 });
    await lireTransaction(a, 'pending'); await ventesProuvees();
    await lireTransaction(a, 'aucune');
    const t = await trace(a);
    await tourRemises(a);
    const e = await etat(a);
    ok(t.resultat?.remise_arretee === 'file' && e.quantite === 9997 && !e.remise && !e.depots,
      'annulée avant le tour : stock 9997, ligne de file retirée, aucun dépôt créé', { t: t.resultat, e });
  }
  {
    // Le dépôt de remise est DÉJÀ pris par l'extension : rien n'est arrêté, c'est dit.
    const a = await venteSerieComplete(9997);
    const d0 = (await etat(a)).depots[0];
    await c.query(`UPDATE cross_post_jobs SET status = 'processing' WHERE id = $1`, [d0.id]);
    await lireTransaction(a, 'aucune');
    const t = await trace(a); const e = await etat(a);
    ok(t.resultat?.remise_arretee === 'deja_prise' && e.quantite === 9997 && e.depots?.[0]?.status === 'processing' && e.remise?.statut === 'faite',
      'dépôt déjà pris (processing) : stock rendu, dépôt NON touché, « deja_prise » dit dans la trace', { t: t.resultat, d: e.depots?.[0]?.status });
  }
  {
    // Pièce unique annulée : le chemin d'avant, inchangé (fiche revenue au stock, remise « a_faire » close).
    const a = await article({ quantite: 1 });
    await lireTransaction(a, 'pending'); await ventesProuvees();
    await lireTransaction(a, 'aucune');
    const t = await trace(a); const e = await etat(a);
    ok(t.resultat?.fiche === 'fiche' && e.statut === 'stock' && e.quantite === 1 && e.job === 'published'
      && e.remise?.statut === 'abandonnee' && e.remise?.motif === 'transaction_annulee', 'témoin pièce unique annulée : INCHANGÉ (fiche au stock, remise close « transaction_annulee »)', { t: t.resultat, remise: e.remise });
  }

  // ── 2 bis. La fonction d'annulation DE PROD sur une vente de série : le défaut qu'elle corrige ──
  console.log('\n2 bis. vente_transaction_annulee_leboncoin DE PROD seule, sur une vente de série enregistrée');
  {
    const a = await venteSerieComplete(9997);
    await c.query(fonctionDe(INVERSE, 'vente_transaction_annulee_leboncoin'));
    ok(await md5De(SIGS[2]) === MD5_PROD[SIGS[2]], 'définition de prod remise (md5)');
    await lireTransaction(a, 'aucune');
    const e = await etat(a);
    ok(e.quantite === 9996 && e.ventes === 0 && e.depots?.[0]?.status === 'pending',
      'AVANT : vente retirée mais stock JAMAIS rendu (9996) et remise toujours en file (dépôt « pending »)', { q: e.quantite, depot: e.depots?.[0]?.status });
    await c.query(fonctionDe(MIGRATION, 'vente_transaction_annulee_leboncoin'));
    ok(await md5De(SIGS[2]) === md5Neufs[SIGS[2]], 'définition de la migration remise');
  }

  // ── 3. L'INVERSE ──
  console.log("\n3. L'INVERSE : les définitions de prod, mot pour mot");
  await c.query(INVERSE);
  for (const s of SIGS) ok(await md5De(s) === MD5_PROD[s], `${s} revenue à la prod`);
  {
    const a = await article({ quantite: 9997 });
    await lireTransaction(a, 'pending');
    ok((await trace(a)).issue === 'plusieurs_exemplaires', 'avec l\'inverse, la série retombe sur « plusieurs_exemplaires » (comportement de prod)');
  }
  await c.query(MIGRATION);
  for (const s of SIGS) ok(await md5De(s) === md5Neufs[s], `la migration se rejoue (CREATE OR REPLACE) : ${s.split('(')[0]}`);

  // ── 4. La vente SUIVANTE de la même fiche (migration en place) ──
  // L1 vendue → remise publiée (L2). Leboncoin garde L1 listée « Vendu » des jours (prod, 05/11 : 126 annonces « Vendu »
  // encore listées, médiane 5 jours, jusqu'à 14). L2 passe « Achat en cours ».
  console.log("\n4. LIMITE HORS MIGRATION — la vente suivante de la même fiche, l'annonce vendue d'avant encore listée « Vendu »");
  const cycle2 = async () => {
    const a = await venteSerieComplete(9997);
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
  {
    const { a, b } = await cycle2();
    ok((await trace(b)).issue === 'prouvee', 'L2 (le dépôt de remise, publié) « Achat en cours » : prouvée par la règle neuve');
    const vp = await ventesProuvees();
    const refus = await un(`SELECT raison FROM ventes_prouvees_refus WHERE job_id = $1`, [b.job]);
    const e = await etat(b);
    ok(vp.refusees === 1 && /Plusieurs exemplaires sont possibles/.test(refus?.raison ?? '') && e.quantite === 9996 && e.job === 'published',
      'refusée par enregistrer_vente_atomique : fiche_annonces_vivantes = 2 (L1 « Vendu » encore listée + L2) → réessai dans 6 h', { vp, refus, q: e.quantite });
    await c.query(`UPDATE annonces_plateforme SET disparu_le = now() WHERE id = $1`, [a.annonce]);   // le relevé ne voit plus L1
    await c.query(`UPDATE ventes_prouvees_refus SET reessayer_apres = now() - interval '1 second' WHERE job_id = $1`, [b.job]);
    await ventesProuvees(); await revoirEnLigne(b); await tourRemises(b);
    const e2 = await etat(b);
    ok(e2.quantite === 9995 && e2.job === 'sold' && e2.remise?.statut === 'faite', "dès que le relevé ne voit plus L1 : vente enregistrée (9995) et remise créée — en retard, jamais perdue", { q: e2.quantite, remise: e2.remise });
  }
  {
    // LE CORRECTIF PROPOSÉ (base jetable seulement, PAS dans cette migration) : UNE ligne dans fiche_annonces_vivantes.
    const prodFav = catalogue.fonctions.find((f) => f.nom === 'fiche_annonces_vivantes' && f.args === 'p_inventaire bigint, p_platform text').def;
    const ancre = "AND ap.statut_plateforme IN ('en_ligne', 'en_verification');";
    ok(prodFav.includes(ancre), 'fiche_annonces_vivantes de prod lue (2 arguments)');
    await c.query(prodFav.replace(ancre, "AND ap.statut_plateforme IN ('en_ligne', 'en_verification')\n     AND NOT (ap.platform = 'leboncoin' AND COALESCE(public.leboncoin_transaction_lue(ap.transaction_plateforme, ap.capture), '') IN ('pending', 'sold'));"));
    const x = await cycle2();
    await ventesProuvees();
    const ex = await etat(x.b);
    ok(ex.quantite === 9995 && ex.job === 'sold', 'avec la ligne proposée : la vente suivante passe tout de suite (9995)', { q: ex.quantite, job: ex.job });
    await revoirEnLigne(x.a);   // seule L1 (« Vendu ») est revue après la vente : on isole la garde « déjà en vente »
    await c.query(fonctionDe(INVERSE, 'remises_en_vente_tick'));
    await tourRemises(x.b);
    const ep = await etat(x.b);
    ok(ep.remise?.statut === 'abandonnee' && ep.remise?.motif === 'deja_en_vente', "… mais le tick DE PROD l'abandonnerait « deja_en_vente » (L1 « Vendu » listée)", ep.remise);
    await c.query(fonctionDe(MIGRATION, 'remises_en_vente_tick'));
    const y = await cycle2();
    await ventesProuvees(); await revoirEnLigne(y.a); await revoirEnLigne(y.b); await tourRemises(y.b);
    const ey = await etat(y.b);
    ok(ey.quantite === 9995 && ey.remise?.statut === 'faite' && ey.depots?.filter((d) => d.status === 'pending').length === 1,
      'le tick de la migration (a, « déjà en vente ») la crée : vente suivante + remise, sans attendre', { q: ey.quantite, remise: ey.remise });
    await c.query(prodFav);
    ok(await md5De('public.fiche_annonces_vivantes(bigint,text)') === crypto.createHash('md5').update(prodFav.replace(/\r/g, '')).digest('hex'),
      'fiche_annonces_vivantes rendue à sa définition de prod dans la base jetable');
  }
} catch (e) {
  ko++; console.log(`  ✗ ERREUR : ${e.message}\n${e.stack?.split('\n').slice(1, 4).join('\n')}`);
} finally {
  await c.end().catch(() => {});
  if (embarque) { await embarque.pg.stop().catch(() => {}); rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — migration prouvée de bout en bout sur un Postgres jetable`);
process.exit(ko ? 1 : 0);
