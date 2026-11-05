// PREUVE DE BOUT EN BOUT, SUR UN POSTGRES JETABLE, de la migration 20261105180000_mail_a_chaque_vente (05/11, règle de
// Nico) : un mail (et un push) à CHAQUE vente détectée, tout de suite ; une vente = un mail, jamais deux.
//
//   PREUVE_PG=embarque node scripts/preuve-mail-a-chaque-vente.mjs                       (Postgres 17 jetable sur le PC)
//   PREUVE_PG=embarque node scripts/preuve-mail-a-chaque-vente.mjs --catalogue <f.json>  (catalogue déjà lu, hors ligne)
//
// Même méthode que scripts/preuve-remise-en-vente-series.mjs (code de chargement repris tel quel) : la base jetable porte
// le schéma public DE PROD — fonctions (pg_get_functiondef), tables, contraintes, index, déclencheurs (avec leur état),
// coin_config et platform_health — lu EN LECTURE SEULE (`npx supabase db query --linked --read-only`, catalogue système,
// aucune donnée client). Bouchons Supabase : auth, net (http_post RETENU dans net._appels : rien ne part), vault, cron,
// storage. push-ventes (fonction edge) est jouée à la main : push_ventes_a_envoyer décide, la réservation
// « vente:<note> » (index email_logs_vente_unique) est posée pour chaque note servie avec un mail — c'est le compte des
// mails. Les deux fonctions sous preuve partent de leur définition de prod (l'INVERSE, md5 vérifiés).
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
const MIGRATION = lire('supabase/migrations/20261105180000_mail_a_chaque_vente.sql');
const INVERSE = lire('supabase/rollbacks/20261105180000_mail_a_chaque_vente_INVERSE.sql');
// md5 des définitions (pg_get_functiondef, SANS les retours chariot) : prod du 05/11 (l'INVERSE les porte mot pour mot)
// et migration.
const MD5_PROD = {
  'public.push_trg_job()': '13b1cb3aff9ef824e02cdea9716ad989',
  'public.push_trg_ventes()': 'c239ab8d93e194ff3a0bbe8bd798146e',
};
const MD5_MIGRATION = {
  'public.push_trg_job()': '44419b65a0d5e3031da349106a80da00',
  'public.push_trg_ventes()': '52dc9401d6133fcf2fd406c602d0ae5f',
};
const SIGS = Object.keys(MD5_PROD);
// Une seule fonction d'un fichier.
const fonctionDe = (texte, nom) => {
  const i = texte.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  const corps = i < 0 ? -1 : texte.indexOf('AS $function$', i);
  const f = corps < 0 ? -1 : texte.indexOf('$function$', corps + 'AS $function$'.length);
  if (f < 0) throw new Error(`${nom} introuvable`);
  return texte.slice(i, f + '$function$'.length);
};
// Variantes de contrôle (base jetable seulement) : la migration SANS l'une des deux parades doublon eBay, pour montrer
// le double mail qu'elle empêche.
const sansParade = (nom) => {
  const f = fonctionDe(MIGRATION, nom);
  const n = f.split("if v_pf = 'ebay' and exists (").length - 1;
  if (n !== 1) throw new Error(`parade eBay de ${nom} : ${n} occurrence(s)`);
  return f.replace("if v_pf = 'ebay' and exists (", 'if false and exists (');
};

let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.(co|com)|pooler/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
const iCat = process.argv.indexOf('--catalogue');
const FICHIER_CATALOGUE = iCat > 0 ? process.argv[iCat + 1] : null;
const bavard = process.argv.includes('--bavard');

// ── 1. LE CATALOGUE DE PROD, EN LECTURE SEULE (repris de preuve-remise-en-vente-series.mjs) ─────────────────────────
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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-mail-vente-'));
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
const CHAINE_FONCTIONS = ['push_trg_job', 'push_trg_ventes', 'push_noter', 'push_ventes_a_envoyer', 'push_vente_deja_signalee',
  'push_plateforme_suivie', 'push_preuve_en_ligne', 'push_declaration_en_cours', 'push_vente_enregistree', 'push_vinted_vendue_avant',
  'prix_vente_du_job', 'prix_vente_enregistree', 'cron_secret', 'leboncoin_transaction_noter', 'annonces_plateforme_transaction_leboncoin',
  'ventes_prouvees_tick', 'ventes_prouvees_a_enregistrer', 'enregistrer_vente_prouvee', 'enregistrer_vente_atomique',
  'enregistrer_vente_declaree', 'ebay_commande_appliquer', 'ebay_quantite_connue', 'palier_de', '_ts_ou_null', 'plateforme_normalisee'];
const CHAINE_TABLES = ['cross_post_jobs', 'inventaire', 'annonces_plateforme', 'ventes', 'ventes_operations', 'push_ventes',
  'email_logs', 'vinted_sync_runs', 'ventes_ebay_exemplaires', 'usage_logs'];

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

// ── 3. COMPTES, DÉPÔTS, VENTES D'ESSAI ──────────────────────────────────────────────────────────────────────────────
let nComptes = 0, invSuivant = 7710000000000, lbcSuivant = 3399500000, ebaySuivant = 136990000000, cmdSuivante = 10;
const PHOTOS = ['https://exemple.invalid/1.jpg'];
// Un compte par scénario : la règle de la rafale (8 ventes en 5 minutes PAR COMPTE) ne mêle jamais deux scénarios.
async function compte(nom) {
  const u = crypto.randomUUID();
  const email = `preuve-${nom}-${++nComptes}@exemple.invalid`;
  await c.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [u, email]);
  await c.query(`INSERT INTO profiles (id, email, is_premium, is_pro, is_business, extension_last_seen_at, extension_version, extension_build, lang)
    VALUES ($1, $2, true, true, true, now(), '0.6.174', '0.6.174', 'fr')`, [u, email]);
  return u;
}
// Un dépôt publié et son annonce. verifie : la veille l'a relu il y a 1 h (sinon last_checked_at NULL : dépôt importé
// jamais relu). publie : âge de la publication. vu : dernière fois que le relevé l'a vue en ligne (null : jamais).
async function depot(u, { platform = 'leboncoin', quantite = 1, verifie = false, publie = '10 days', vu = '2 hours', voie = 'extension', pf = {} } = {}) {
  const inv = invSuivant++;
  const lid = String(platform === 'ebay' ? ebaySuivant++ : lbcSuivant++);
  const url = platform === 'ebay' ? `https://www.ebay.fr/itm/${lid}` : `https://www.leboncoin.fr/ad/jeux_jouets/${lid}`;
  await c.query(`INSERT INTO inventaire (id, user_id, titre, statut, quantite, prix_vente, prix_achat, description, photos)
    VALUES ($1, $2, $3, 'stock', $4, 25, 4, 'Neuf.', $5)`, [inv, u, `Article d'essai ${inv}`, quantite, JSON.stringify(PHOTOS)]);
  const { id: job } = await un(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, title, description, price, photos,
      platform_listing_id, listing_url, published_at, created_at, handler_build, platform_fields, last_checked_at, voie)
    VALUES ($1, $2, $3, 'published', 'publish', $4, 'Neuf.', 25, $5, $6, $7, now() - $8::interval, now() - $8::interval, '0.6.174', $9,
            CASE WHEN $10 THEN now() - interval '1 hour' END, $11)
    RETURNING id`, [u, inv, platform, `Article d'essai ${inv}`, JSON.stringify(PHOTOS), lid, url, publie, JSON.stringify(pf), verifie, voie]);
  let annonce = null;
  if (vu) {
    annonce = (await un(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, prix, statut_plateforme, inventaire_id, job_id, vu_le)
      VALUES ($1, $2, $3, $4, $5, 25, 'en_ligne', $6, $7, now() - $8::interval) RETURNING id`, [u, platform, lid, url, `Article d'essai ${inv}`, inv, job, vu])).id;
  }
  return { u, inv, lid, job, annonce, platform };
}
// Le relevé Leboncoin lit la transaction de l'annonce (handler-watch écrit transaction_plateforme / transaction_lue_le).
const lireTransaction = (a, tx) => c.query(`UPDATE annonces_plateforme SET transaction_plateforme = $2, transaction_lue_le = clock_timestamp(),
  vu_le = clock_timestamp(), statut_plateforme = 'en_ligne' WHERE id = $1`, [a.annonce, tx]);
const ventesProuvees = () => un(`SELECT public.ventes_prouvees_tick(25, 4000) AS r`).then((x) => x.r);
const signal = (a, champs) => c.query(`UPDATE cross_post_jobs SET platform_fields = coalesce(platform_fields, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
  [a.job, JSON.stringify(champs)]);
const preuveExacte = (a, plus = {}) => ({ platform: a.platform, listing_id: a.lid, state: 'sold', exact: true, lu_le: new Date().toISOString(), ...plus });
// Le relevé des commandes (enregistrer_ventes_relevees / ebay-ventes-sync) : une ligne « releve » datée par la plateforme.
async function venteRelevee(u, { plateforme = 'ebay', commande, annonce, inv = null, venduIlYa = '2 hours' }) {
  return (await un(`INSERT INTO ventes (user_id, titre, prix_vente, date, vendu_le, plateforme, plateforme_code, commande_ref, source, releve_le,
      devise, frais_plateforme, selling_fees, inventaire_id, quantite, statut, annonce_id)
    VALUES ($1, 'Vente relevée', 25, (CASE WHEN $2::interval IS NULL THEN now() ELSE now() - $2::interval END)::date,
            CASE WHEN $2::interval IS NULL THEN NULL ELSE now() - $2::interval END, $3, $3, $4, 'releve', now(), 'EUR', 0, 0, $5, 1, 'vendu', $6)
    RETURNING id`, [u, venduIlYa, plateforme, commande, inv, annonce])).id;
}
const nouvelleCommande = () => { cmdSuivante++; return { ordre: `${cmdSuivante}-15339-08906`, ligne: `100859145141${cmdSuivante}` }; };
// Décor « plateforme suivie » (relevé d'annonces eBay terminé il y a 1 h) : posé sans ses déclencheurs de garde (cadence,
// pauses, voie API), base jetable seulement.
async function suivre(u) {
  await c.query('BEGIN');
  await c.query('SET LOCAL session_replication_role = replica');
  await c.query(`INSERT INTO vinted_sync_runs (user_id, kind, status, platform, started_at, finished_at) VALUES ($1, 'annonces', 'done', 'ebay', now() - interval '70 minutes', now() - interval '1 hour')`, [u]);
  await c.query('COMMIT');
  if (!(await un(`SELECT public.push_plateforme_suivie($1, 'ebay') AS s`, [u])).s) throw new Error('le décor « plateforme suivie » ne tient pas');
}

// push-ventes, joué à la main : push_ventes_a_envoyer décide (par compte, sous verrou) ; chaque note servie avec un mail
// pose la réservation « vente:<note> » (index unique email_logs_vente_unique) = UN mail ; le résultat est rendu.
// Les 15 s de calme d'une note sont simulées (cree_le reculé de 20 s à chaque passage).
async function decider(passes = 3) {
  for (let i = 0; i < passes; i++) {
    await c.query(`UPDATE push_ventes SET cree_le = cree_le - interval '20 seconds' WHERE statut = 'a_envoyer' AND part_le IS NULL`);
    const r = (await un(`SELECT public.push_ventes_a_envoyer(50) AS r`)).r;
    for (const note of r.notes ?? []) {
      if (note.mail === true) await c.query(`INSERT INTO email_logs (user_id, email_type, email) VALUES ($1, 'vente:' || $2, $3)`, [note.user_id, note.id, note.email]);
      await c.query(`UPDATE push_ventes SET statut = CASE WHEN statut = 'en_envoi' THEN 'envoyee' ELSE statut END,
        mail_statut = CASE WHEN mail_statut = 'en_envoi' THEN 'envoye' ELSE mail_statut END WHERE id = $1`, [note.id]);
    }
  }
}
const appelsPushVentes = async () => (await un(`SELECT count(*)::int AS n FROM net._appels WHERE url LIKE '%/functions/v1/push-ventes'`)).n;
async function bilan(u, appels0) {
  const b = await un(`SELECT count(*)::int AS notes,
      count(*) FILTER (WHERE part_le IS NOT NULL)::int AS decidees,
      count(*) FILTER (WHERE statut = 'declaree')::int AS declarees,
      count(*) FILTER (WHERE statut = 'doublon')::int AS doublons,
      count(*) FILTER (WHERE statut = 'ignoree')::int AS ignorees,
      coalesce(array_agg(DISTINCT motif) FILTER (WHERE motif IS NOT NULL), '{}') AS motifs,
      coalesce(array_agg(preuve_recente ORDER BY id) FILTER (WHERE preuve_recente IS NOT NULL), '{}') AS preuves,
      coalesce(array_agg(origine || '/' || statut ORDER BY id), '{}') AS notes_detail,
      count(*) FILTER (WHERE origine = 'commande')::int AS notes_releve
    FROM push_ventes WHERE user_id = $1`, [u]);
  const m = await un(`SELECT count(*)::int AS n FROM email_logs WHERE user_id = $1 AND email_type LIKE 'vente:%'`, [u]);
  return { ...b, mails: m.n, appels: (await appelsPushVentes()) - appels0 };
}

// ── 4. LES SCÉNARIOS (rejoués à l'identique AVANT et APRÈS) ─────────────────────────────────────────────────────────
const SCENARIOS = {
  // Le cas d'assopmfrance (05/11) / Louis (01/11) : « Achat en cours » sur un dépôt que la veille n'a jamais relu ;
  // le déclencheur part DEUX fois : au signal (preuve exacte posée), puis au passage « sold » (vente enregistrée).
  S1: async (u) => {
    const a = await depot(u, { platform: 'leboncoin', verifie: false, publie: '10 days', vu: '2 hours' });
    await lireTransaction(a, 'pending');
    const j1 = await un(`SELECT status, platform_fields ->> 'sale_signal' AS signal, last_checked_at FROM cross_post_jobs WHERE id = $1`, [a.job]);
    await ventesProuvees();
    const j2 = await un(`SELECT status FROM cross_post_jobs WHERE id = $1`, [a.job]);
    const v = await un(`SELECT count(*)::int AS n FROM ventes WHERE inventaire_id = $1`, [a.inv]);
    return { signal: j1.signal, relu: j1.last_checked_at, statut: j2.status, ventes: v.n };
  },
  // Aucune preuve : dépôt jamais relu, publié il y a 10 jours, jamais vu au relevé, signal sans preuve exacte.
  S1b: async (u) => { const a = await depot(u, { verifie: false, publie: '10 days', vu: null }); await signal(a, { sale_signal: 'sold' }); return {}; },
  // Publication de moins de 48 h, sans autre preuve.
  S1c: async (u) => { const a = await depot(u, { verifie: false, publie: '20 hours', vu: null }); await signal(a, { sale_signal: 'sold' }); return {}; },
  // Le relevé l'a vue en ligne aujourd'hui, sans autre preuve.
  S1d: async (u) => { const a = await depot(u, { verifie: false, publie: '10 days', vu: '3 hours' }); await signal(a, { sale_signal: 'sold' }); return {}; },
  // Une preuve exacte d'une annonce eBay CLOSE il y a 3 jours (browse_api, fin), lue maintenant : pas une vente du moment.
  S1e: async (u) => {
    const a = await depot(u, { platform: 'ebay', quantite: 1, verifie: false, publie: '10 days', vu: null });
    await signal(a, { sale_signal: 'sold', sale_evidence: preuveExacte(a, { source: 'browse_api', fin: new Date(Date.now() - 3 * 86400e3).toISOString(), vendus: 1 }) });
    return {};
  },
  // eBay relevé (ebay-ventes-sync) : vente datée de 2 h, compte sans relevé d'annonces (jamais « suivi »), sans fiche.
  S2: async (u) => { const k = nouvelleCommande(); await venteRelevee(u, { commande: `${k.ordre}:${k.ligne}`, annonce: String(ebaySuivant++), venduIlYa: '2 hours' }); return {}; },
  // Témoins (B) : sans date de vente, et datée de plus de 24 h.
  S2b: async (u) => { const k = nouvelleCommande(); await venteRelevee(u, { commande: `${k.ordre}:${k.ligne}`, annonce: String(ebaySuivant++), venduIlYa: null }); return {}; },
  S2c: async (u) => { const k = nouvelleCommande(); await venteRelevee(u, { commande: `${k.ordre}:${k.ligne}`, annonce: String(ebaySuivant++), venduIlYa: '30 hours' }); return {}; },
  // Témoin (B) : compte « suivi » (relevé d'annonces eBay terminé il y a 1 h) — une note avant comme après. La ligne de
  // relevé est un décor : posée sans ses déclencheurs de garde (cadence, pauses, voie API), base jetable seulement.
  S2d: async (u) => {
    await suivre(u);
    const k = nouvelleCommande(); await venteRelevee(u, { commande: `${k.ordre}:${k.ligne}`, annonce: String(ebaySuivant++), venduIlYa: '2 hours' }); return {};
  },
  // Vinted relevé daté de 3 h, compte sans relevé du dressing récent.
  S2e: async (u) => { await venteRelevee(u, { plateforme: 'vinted', commande: `177${cmdSuivante++}0099`, annonce: `77${ebaySuivant++}`, venduIlYa: '3 hours' }); return {}; },
  // LA MÊME COMMANDE eBay par le chemin du job (confirmation de commande, order_id) puis par le relevé (non adoptée :
  // fiche introuvable par le relevé → une ligne de plus) ; fiche à 2 exemplaires (aucune clé fiche:).
  S3: async (u) => {
    const a = await depot(u, { platform: 'ebay', quantite: 2, verifie: true, publie: '10 days', vu: null });
    const k = nouvelleCommande();
    await signal(a, { sale_signal: 'sold', sale_evidence: preuveExacte(a, { source: 'order_confirmation', order_id: k.ordre, quantite: 1 }) });
    await ventesProuvees();
    await decider();
    const j = await un(`SELECT status FROM cross_post_jobs WHERE id = $1`, [a.job]);
    const w = await un(`SELECT count(*)::int AS n FROM ventes WHERE user_id = $1 AND annonce_id = $2`, [u, a.lid]);
    await venteRelevee(u, { commande: `${k.ordre}:${k.ligne}`, annonce: a.lid, inv: null, venduIlYa: '20 minutes' });
    return { statut: j.status, ventes_api: w.n };
  },
  // DEUX commandes différentes de la même annonce (fiche à 2 exemplaires) : deux ventes, deux mails (forme 4414 / 4467).
  S3b: async (u) => {
    const a = await depot(u, { platform: 'ebay', quantite: 2, verifie: true, publie: '10 days', vu: null });
    const k1 = nouvelleCommande(), k2 = nouvelleCommande();
    await signal(a, { sale_signal: 'sold', sale_evidence: preuveExacte(a, { source: 'order_confirmation', order_id: k1.ordre, quantite: 1 }) });
    await ventesProuvees();
    await decider();
    await venteRelevee(u, { commande: `${k2.ordre}:${k2.ligne}`, annonce: a.lid, inv: null, venduIlYa: '18 minutes' });
    return {};
  },
  // La même vente par le job SANS numéro de commande (annonce close lue par l'API Browse) puis par le relevé : le reçu
  // (ventes_operations) du job désigne une vente sans commande, enregistrée après cette vente → la même vente.
  S3c: async (u) => {
    const a = await depot(u, { platform: 'ebay', quantite: 2, verifie: true, publie: '10 days', vu: null });
    const k = nouvelleCommande();
    await signal(a, { sale_signal: 'sold', sale_evidence: preuveExacte(a, { source: 'browse_api', fin: new Date(Date.now() - 10 * 60e3).toISOString(), vendus: 1 }) });
    await ventesProuvees();
    await decider();
    await venteRelevee(u, { commande: `${k.ordre}:${k.ligne}`, annonce: a.lid, inv: null, venduIlYa: '15 minutes' });
    return {};
  },
  // Fiche à pièce unique vendue par le job (clé fiche:), puis une vente relevée de la même fiche sous un autre numéro
  // d'annonce dans les 3 jours : la même cession (règle « même job ou fiche » de push_ventes_a_envoyer).
  S3d: async (u) => {
    const a = await depot(u, { platform: 'ebay', quantite: 1, verifie: true, publie: '10 days', vu: null });
    const k = nouvelleCommande();
    await signal(a, { sale_signal: 'sold', sale_evidence: preuveExacte(a, { source: 'browse_api', fin: new Date(Date.now() - 10 * 60e3).toISOString(), vendus: 1 }) });
    await ventesProuvees();
    await decider();
    await venteRelevee(u, { commande: `${k.ordre}:${k.ligne}`, annonce: String(ebaySuivant++), inv: a.inv, venduIlYa: '15 minutes' });
    return {};
  },
  // Le relevé d'ABORD (fiche à 3 exemplaires), puis ebay_commande_appliquer (eBay épuisée) passe le job « vendu » dans
  // la même transaction : dépôt jamais relu par la veille, vu au relevé d'annonces ce matin.
  S6: async (u) => {
    const a = await depot(u, { platform: 'ebay', quantite: 3, verifie: false, publie: '10 days', vu: '2 hours' });
    const k = nouvelleCommande();
    await c.query('BEGIN');
    const v = await venteRelevee(u, { commande: `${k.ordre}:${k.ligne}`, annonce: a.lid, inv: a.inv, venduIlYa: '1 hour' });
    const ex = (await un(`SELECT public.ebay_commande_appliquer($1, $2::jsonb) AS r`, [v, JSON.stringify({ http: '200', epuisee: true, lu_le: new Date().toISOString() })])).r;
    await c.query('COMMIT');
    const j = await un(`SELECT status, platform_fields #>> '{vente_commande_ebay,commande}' AS cmd FROM cross_post_jobs WHERE id = $1`, [a.job]);
    return { decision: ex?.decision, statut: j.status, cmd: j.cmd };
  },
  // LE DOUBLE MAIL VU EN PROD (notes 1828/1829, 2577/2776, 4345/4370 ; compte « suivi ») : le relevé des commandes note la
  // vente d'abord (fiche introuvable), puis, des heures plus tard, la veille lit l'annonce close (API Browse, fin = l'heure
  // de la vente, aucun numéro de commande) → vente prouvée → job « sold » → seconde note.
  S6b: async (u) => {
    await suivre(u);
    const a = await depot(u, { platform: 'ebay', quantite: 2, verifie: true, publie: '10 days', vu: null });
    const k = nouvelleCommande();
    await venteRelevee(u, { commande: `${k.ordre}:${k.ligne}`, annonce: a.lid, inv: null, venduIlYa: '3 hours' });
    await decider();
    await signal(a, { sale_signal: 'sold', sale_evidence: preuveExacte(a, { source: 'browse_api', fin: new Date(Date.now() - 3 * 3600e3).toISOString(), vendus: 1 }) });
    await ventesProuvees();
    return {};
  },
  // La même chose sur un compte NON suivi : avant, seul le job notait ; la règle (B) note le relevé — jamais deux.
  S6c: async (u) => {
    const a = await depot(u, { platform: 'ebay', quantite: 2, verifie: true, publie: '10 days', vu: null });
    const k = nouvelleCommande();
    await venteRelevee(u, { commande: `${k.ordre}:${k.ligne}`, annonce: a.lid, inv: null, venduIlYa: '3 hours' });
    await decider();
    await signal(a, { sale_signal: 'sold', sale_evidence: preuveExacte(a, { source: 'browse_api', fin: new Date(Date.now() - 3 * 3600e3).toISOString(), vendus: 1 }) });
    await ventesProuvees();
    return {};
  },
  // DEUX ventes d'une annonce eBay en quantité : la première relevée il y a 5 h, la seconde épuise l'annonce (fin il y a
  // 10 min, lue par la veille), puis relevée à son tour : deux ventes, deux mails.
  S6d: async (u) => {
    const a = await depot(u, { platform: 'ebay', quantite: 3, verifie: true, publie: '10 days', vu: null });
    const k1 = nouvelleCommande(), k2 = nouvelleCommande();
    await venteRelevee(u, { commande: `${k1.ordre}:${k1.ligne}`, annonce: a.lid, inv: null, venduIlYa: '5 hours' });
    await decider();
    await signal(a, { sale_signal: 'sold', sale_evidence: preuveExacte(a, { source: 'browse_api', fin: new Date(Date.now() - 10 * 60e3).toISOString(), vendus: 2 }) });
    await ventesProuvees();
    await decider();
    await venteRelevee(u, { commande: `${k2.ordre}:${k2.ligne}`, annonce: a.lid, inv: null, venduIlYa: '10 minutes' });
    return {};
  },
  // Vente déclarée par la personne : aucune note à envoyer, aucun mail (inchangé).
  S4: async (u) => {
    const a = await depot(u, { verifie: false, publie: '10 days', vu: '2 hours' });
    const r = (await un(`SELECT public.enregistrer_vente_declaree($1, $2, 25) AS r`, [u, a.job])).r;
    return { declaree: r?.ok === true };
  },
  // Rattrapage par lecture fraiche, première lecture il y a 3 jours : aucune note (inchangé).
  S5: async (u) => {
    const a = await depot(u, { verifie: false, publie: '10 days', vu: '1 hour' });
    await signal(a, { sale_signal: 'sold', sale_evidence: preuveExacte(a, { source: 'transaction_leboncoin', statut: 'pending',
      rattrapage: { regle: 'lecture_fraiche_2410', le: new Date().toISOString(), premiere_lecture: new Date(Date.now() - 3 * 86400e3).toISOString() } }) });
    await ventesProuvees();
    return {};
  },
  // « Vendu » (transaction terminée) : aucune note (inchangé).
  S5b: async (u) => {
    const a = await depot(u, { verifie: false, publie: '10 days', vu: '1 hour' });
    await signal(a, { sale_signal: 'sold', sale_evidence: preuveExacte(a, { source: 'transaction_leboncoin', statut: 'sold' }) });
    await ventesProuvees();
    return {};
  },
  // Témoin : dépôt relu par la veille il y a 1 h — un mail avant comme après, sans preuve notée.
  T1: async (u) => {
    const a = await depot(u, { verifie: true, publie: '10 days', vu: '2 hours' });
    await lireTransaction(a, 'pending'); await ventesProuvees(); return {};
  },
  // Témoin : disparition constatée il y a 3 jours — rien avant comme après.
  T2: async (u) => {
    const a = await depot(u, { verifie: false, publie: '10 days', vu: '2 hours' });
    await signal(a, { sale_signal: 'sold', unavailable_since: new Date(Date.now() - 3 * 86400e3).toISOString() }); return {};
  },
  // 9 ventes « Achat en cours » d'un même compte lues en une fois (forme assopmfrance 05/11 14:59).
  S7: async (u) => {
    const ds = [];
    for (let i = 0; i < 9; i++) ds.push(await depot(u, { verifie: false, publie: '10 days', vu: '2 hours' }));
    for (const a of ds) await lireTransaction(a, 'pending');
    await ventesProuvees();
    return {};
  },
};
async function jouer(phase, cles = Object.keys(SCENARIOS)) {
  const res = {};
  for (const k of cles) {
    const u = await compte(`${phase}-${k}`);
    const a0 = await appelsPushVentes();
    const extra = await SCENARIOS[k](u);
    await decider();
    res[k] = { ...(await bilan(u, a0)), extra };
    if (bavard) console.log(`    · ${phase} ${k} ${JSON.stringify(res[k])}`);
  }
  return res;
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
  const trig = await tous(`SELECT tgname FROM pg_trigger WHERE tgname IN ('cross_post_jobs_push_vendu', 'ventes_push_releve', 'ventes_push_personne', 'ventes_push_serveur') AND tgenabled = 'O'`);
  ok(trig.length === 4, `les 4 déclencheurs de note de vente sont actifs (${trig.map((t) => t.tgname).join(', ')})`);
  for (const s of SIGS) ok(await md5De(s) === MD5_PROD[s], `catalogue = prod du 05/11 : ${s} (md5 ${MD5_PROD[s]})`, await md5De(s));
  const cfg = await un(`SELECT (SELECT value FROM coin_config WHERE key = 'ventes_leboncoin_transaction') AS tx,
    (SELECT value FROM coin_config WHERE key = 'ventes_prouvees_auto_depuis') AS depuis, (SELECT count(*)::int FROM platform_health WHERE paused) AS pauses`);
  ok(cfg.tx === 1 && cfg.depuis > 0 && cfg.pauses === 0, `coin_config / platform_health de prod : ventes_leboncoin_transaction=${cfg.tx}, ventes_prouvees_auto_depuis=${cfg.depuis}, pauses=${cfg.pauses}`);

  // ── 1. AVANT ──
  console.log('\n1. AVANT — les définitions de prod (INVERSE)');
  await c.query(INVERSE);
  for (const s of SIGS) ok(await md5De(s) === MD5_PROD[s], `${s} = prod (md5 ${MD5_PROD[s]})`);
  const AV = await jouer('avant');
  ok(AV.S1.extra.signal === 'sold' && AV.S1.extra.relu === null && AV.S1.extra.statut === 'sold' && AV.S1.extra.ventes === 1,
    'S1 — « Achat en cours » sur un dépôt jamais relu : la vente est bien prouvée et enregistrée (signal, job « sold », 1 vente)', AV.S1.extra);
  ok(AV.S1.notes === 0 && AV.S1.mails === 0 && AV.S1.appels === 0, `S1 — LE DÉFAUT : ${AV.S1.notes} note, ${AV.S1.mails} mail, ${AV.S1.appels} appel push-ventes`, AV.S1);
  ok(AV.S2.notes === 0 && AV.S2.mails === 0, `S2 — LE DÉFAUT : vente eBay relevée datée de 2 h, compte jamais « suivi » : ${AV.S2.notes} note, ${AV.S2.mails} mail`, AV.S2);
  ok(AV.S2e.notes === 0 && AV.S2e.mails === 0, `S2e — LE DÉFAUT : vente Vinted relevée datée de 3 h, compte non suivi : ${AV.S2e.notes} note`, AV.S2e);
  ok(AV.S3.extra.statut === 'sold' && AV.S3.mails === 1 && AV.S3.notes_releve === 0, `S3 — même commande job + relevé : ${AV.S3.mails} mail (le relevé n'est jamais noté : compte non suivi)`, AV.S3);
  ok(AV.S3b.mails === 1, `S3b — deux commandes de la même annonce : ${AV.S3b.mails} mail pour 2 ventes (la seconde, relevée, sans mail)`, AV.S3b);
  ok(AV.S6.extra.decision === 'vendue' && AV.S6.extra.statut === 'sold' && AV.S6.mails === 0,
    `S6 — relevé puis ebay_commande_appliquer (job « vendu ») : ${AV.S6.mails} mail (dépôt jamais relu, relevé non suivi)`, AV.S6);

  // ── 2. APRÈS ──
  console.log('\n2. APRÈS — la migration, appliquée en entier');
  await c.query(MIGRATION);
  for (const s of SIGS) ok(await md5De(s) === MD5_MIGRATION[s], `${s} réécrite (md5 ${MD5_MIGRATION[s]})`, await md5De(s));
  const AP = await jouer('apres');
  console.log('   (A) push_trg_job — la fraîcheur accepte les autres preuves');
  ok(AP.S1.extra.relu === null && AP.S1.extra.statut === 'sold' && AP.S1.notes === 2 && AP.S1.decidees === 1 && AP.S1.doublons === 1,
    `S1 — le déclencheur part deux fois (signal, puis « sold ») : ${AP.S1.notes} notes nées, ${AP.S1.decidees} décidée, ${AP.S1.doublons} doublon`, AP.S1);
  ok(AP.S1.mails === 1, `S1 — UN mail, un seul (réservation vente:<note>) : ${AP.S1.mails}`, AP.S1);
  ok(AP.S1.appels >= 1, `S1 — push-ventes appelée (pg_net retenu) : ${AP.S1.appels} appel(s)`, AP.S1);
  ok(/^exacte:transaction_leboncoin:/.test(AP.S1.preuves[0] ?? ''), `S1 — la preuve est gardée dans la note : ${AP.S1.preuves[0]}`, AP.S1.preuves);
  ok(AP.S1b.notes === 0 && AV.S1b.notes === 0, `S1b — AUCUNE preuve (jamais relu, publiée il y a 10 j, jamais vue au relevé, pas de preuve exacte) : 0 note, avant comme après`, { AV: AV.S1b, AP: AP.S1b });
  ok(AV.S1c.notes === 0 && AP.S1c.notes === 1 && /^publiee:/.test(AP.S1c.preuves[0] ?? '') && AP.S1c.mails === 0,
    'S1c — publiée il y a 20 h : la note naît (preuve « publiee: ») ; aucun mail tant que la vente n\'est pas enregistrée (règle du 09/10)', { AV: AV.S1c, AP: AP.S1c });
  ok(AV.S1d.notes === 0 && AP.S1d.notes === 1 && /^releve:/.test(AP.S1d.preuves[0] ?? ''), 'S1d — vue en ligne au relevé aujourd\'hui : la note naît (preuve « releve: »)', { AV: AV.S1d, AP: AP.S1d });
  ok(AV.S1e.notes === 0 && AP.S1e.notes === 0, 'S1e — preuve exacte d\'une annonce eBay CLOSE il y a 3 jours, lue maintenant : 0 note (pas une vente du moment)', { AV: AV.S1e, AP: AP.S1e });
  console.log('   (B) push_trg_ventes — une date de vente lue de moins de 24 h est sa propre preuve');
  ok(AP.S2.notes === 1 && AP.S2.notes_releve === 1 && AP.S2.mails === 1, `S2 — vente eBay relevée datée de 2 h : ${AP.S2.notes} note, ${AP.S2.mails} mail`, AP.S2);
  ok(AP.S2e.notes === 1 && AP.S2e.mails === 1, `S2e — vente Vinted relevée datée de 3 h : ${AP.S2e.notes} note, ${AP.S2e.mails} mail`, AP.S2e);
  ok(AV.S2b.notes === 0 && AP.S2b.notes === 0, 'S2b — relevée SANS date, compte non suivi : 0 note, avant comme après', { AV: AV.S2b, AP: AP.S2b });
  ok(AV.S2c.notes === 0 && AP.S2c.notes === 0, 'S2c — relevée datée de 30 h : 0 note, avant comme après', { AV: AV.S2c, AP: AP.S2c });
  ok(AV.S2d.mails === 1 && AP.S2d.mails === 1 && AV.S2d.notes === AP.S2d.notes, 'S2d — compte « suivi » : 1 mail avant comme après (inchangé)', { AV: AV.S2d, AP: AP.S2d });
  console.log('   (C) parade doublon eBay — une vente = une note');
  ok(AP.S3.extra.statut === 'sold' && AP.S3.extra.ventes_api === 1, 'S3 — la vente est enregistrée par le chemin du job (job « sold », 1 vente)', AP.S3.extra);
  ok(AP.S3.notes_releve === 0 && AP.S3.mails === 1, `S3 — même commande par le job (order_id) puis par le relevé : la vente relevée n'est PAS notée ; ${AP.S3.mails} mail`, AP.S3);
  ok(AP.S3b.notes_releve === 1 && AP.S3b.mails === 2, `S3b — deux commandes différentes de la même annonce : deux ventes, ${AP.S3b.mails} mails`, AP.S3b);
  ok(AV.S3c.mails === 1 && AP.S3c.notes_releve === 0 && AP.S3c.mails === 1,
    `S3c — même vente par le job sans numéro de commande (reçu ventes_operations) puis par le relevé : ${AP.S3c.mails} mail`, { AV: AV.S3c, AP: AP.S3c });
  ok(AV.S3d.mails === 1 && AP.S3d.mails === 1 && AP.S3d.notes_releve === 0,
    `S3d — fiche à pièce unique déjà annoncée (clé fiche:), vente relevée sous un autre numéro : ${AP.S3d.mails} mail`, { AV: AV.S3d, AP: AP.S3d });
  ok(AP.S6.extra.decision === 'vendue' && AP.S6.extra.statut === 'sold' && AP.S6.extra.cmd && AP.S6.notes_releve === 1 && AP.S6.mails === 1,
    `S6 — relevé PUIS job « vendu » par ebay_commande_appliquer (même transaction) : la note du relevé seule, ${AP.S6.mails} mail`, AP.S6);
  ok(AV.S6b.mails === 2 && AP.S6b.mails === 1 && AP.S6b.notes_releve === 1,
    `S6b — LE DOUBLE VU EN PROD (compte suivi : relevé, puis annonce close lue par la veille) : ${AV.S6b.mails} mails avant → ${AP.S6b.mails} après`, { AV: AV.S6b, AP: AP.S6b });
  ok(AV.S6c.mails === 1 && AP.S6c.mails === 1 && AP.S6c.notes_releve === 1,
    `S6c — même chose, compte non suivi : ${AV.S6c.mails} mail avant (le job) → ${AP.S6c.mails} après (le relevé) ; jamais deux`, { AV: AV.S6c, AP: AP.S6c });
  ok(AV.S6d.mails === 1 && AP.S6d.mails === 2,
    `S6d — deux ventes d'une annonce eBay en quantité (relevée à 5 h d'écart de la fin lue) : ${AV.S6d.mails} mail avant → ${AP.S6d.mails} après (une par vente)`, { AV: AV.S6d, AP: AP.S6d });
  console.log('   Inchangés');
  ok(AV.S4.extra.declaree && AP.S4.extra.declaree && AV.S4.mails === 0 && AP.S4.mails === 0 && AV.S4.appels === 0 && AP.S4.appels === 0
    && AV.S4.declarees >= 1 && AV.S4.declarees === AP.S4.declarees && AV.S4.notes === AP.S4.notes,
    `S4 — vente déclarée par la personne : note(s) « declaree » (${AP.S4.declarees}), 0 mail, 0 appel — avant comme après`, { AV: AV.S4, AP: AP.S4 });
  ok(AV.S5.notes === 0 && AP.S5.notes === 0, 'S5 — rattrapage, première lecture il y a 3 jours : 0 note, avant comme après', { AV: AV.S5, AP: AP.S5 });
  ok(AV.S5b.notes === 0 && AP.S5b.notes === 0, 'S5b — « Vendu » (transaction terminée) : 0 note, avant comme après', { AV: AV.S5b, AP: AP.S5b });
  ok(AV.T1.mails === 1 && AP.T1.mails === 1 && AV.T1.notes === AP.T1.notes && AP.T1.preuves.length === 0,
    `T1 — dépôt relu il y a 1 h : 1 mail avant comme après, ${AP.T1.notes} notes, aucune preuve neuve notée`, { AV: AV.T1, AP: AP.T1 });
  ok(AV.T2.notes === 0 && AP.T2.notes === 0, 'T2 — disparition constatée il y a 3 jours : 0 note, avant comme après', { AV: AV.T2, AP: AP.T2 });
  ok(AV.S7.notes === 0 && AP.S7.notes === 18 && AP.S7.mails === 0 && AP.S7.motifs.includes('rattrapage_de_masse'),
    `S7 — CONSTAT (règle du 06/10 NON touchée) : 9 ventes d'un compte en une lecture → ${AP.S7.notes} notes, ${AP.S7.mails} mail (rattrapage_de_masse) — décision de Nico`, { AV: AV.S7, AP: AP.S7 });

  // ── 2 bis. Ce que chaque parade empêche (base jetable seulement) ──
  console.log('\n2 bis. Sans l\'une des deux parades doublon eBay (variantes de contrôle, base jetable)');
  await c.query(sansParade('push_trg_ventes'));
  const sansC = await jouer('sansC', ['S3', 'S3c']);
  ok(sansC.S3.notes_releve === 1 && sansC.S3.mails === 2, `sans la parade de push_trg_ventes : S3 donne ${sansC.S3.mails} mails pour UNE vente`, sansC.S3);
  ok(sansC.S3c.notes_releve === 1 && sansC.S3c.mails === 2, `sans la parade de push_trg_ventes : S3c donne ${sansC.S3c.mails} mails pour UNE vente`, sansC.S3c);
  await c.query(fonctionDe(MIGRATION, 'push_trg_ventes'));
  await c.query(sansParade('push_trg_job'));
  const sansCp = await jouer('sansCp', ['S6', 'S6c']);
  ok(sansCp.S6.mails === 2, `sans la parade de push_trg_job : S6 donne ${sansCp.S6.mails} mails pour UNE vente`, sansCp.S6);
  ok(sansCp.S6c.mails === 2, `sans la parade de push_trg_job : S6c donne ${sansCp.S6c.mails} mails pour UNE vente (le double de prod, étendu par (B))`, sansCp.S6c);
  await c.query(fonctionDe(MIGRATION, 'push_trg_job'));
  for (const s of SIGS) ok(await md5De(s) === MD5_MIGRATION[s], `définition de la migration remise : ${s.split('(')[0]}`);

  // ── 3. L'INVERSE ──
  console.log("\n3. L'INVERSE : les définitions de prod, mot pour mot");
  await c.query(INVERSE);
  for (const s of SIGS) ok(await md5De(s) === MD5_PROD[s], `${s} revenue à la prod (md5 ${MD5_PROD[s]})`);
  const INV = await jouer('inverse', ['S1', 'S2']);
  ok(INV.S1.notes === 0 && INV.S2.notes === 0, "avec l'inverse, S1 et S2 retombent à 0 note (comportement de prod)", INV);
  await c.query(MIGRATION);
  for (const s of SIGS) ok(await md5De(s) === MD5_MIGRATION[s], `la migration se rejoue (CREATE OR REPLACE) : ${s.split('(')[0]}`);
} catch (e) {
  ko++; console.log(`  ✗ ERREUR : ${e.message}\n${e.stack?.split('\n').slice(1, 4).join('\n')}`);
} finally {
  await c.end().catch(() => {});
  if (embarque) { await embarque.pg.stop().catch(() => {}); rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — migration prouvée de bout en bout sur un Postgres jetable`);
process.exit(ko ? 1 : 0);
