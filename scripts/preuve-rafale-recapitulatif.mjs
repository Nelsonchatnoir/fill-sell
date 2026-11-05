// PREUVE DE BOUT EN BOUT, SUR UN POSTGRES JETABLE, de la migration 20261105220000_rafale_recapitulatif_et_trace (05/11
// soir, décisions de Nico) : c) une rafale (8 ventes ou plus d'un compte en 5 min) = UN mail récapitulatif (et UN push),
// jamais deux, jamais un mail par vente en plus ; d) une parade doublon eBay qui écarte une note laisse UNE trace
// (usage_logs « vente_notification_ecartee »), jamais sur le chemin normal ; e) aucune vente passée rattrapée.
//
//   PREUVE_PG=embarque node scripts/preuve-rafale-recapitulatif.mjs                       (Postgres 17 jetable sur le PC)
//   PREUVE_PG=embarque node scripts/preuve-rafale-recapitulatif.mjs --catalogue <f.json>  (catalogue déjà lu, hors ligne)
//
// Même méthode que scripts/preuve-mail-a-chaque-vente.mjs (code de chargement repris tel quel) : la base jetable porte
// le schéma public DE PROD — fonctions (pg_get_functiondef), tables, contraintes, index, déclencheurs (avec leur état),
// coin_config et platform_health — relu à neuf EN LECTURE SEULE (`npx supabase db query --linked --read-only`,
// catalogue système, aucune donnée client). Bouchons Supabase : auth, net (http_post RETENU dans net._appels : rien ne
// part), vault, cron, storage. push-ventes (fonction edge) est jouée à la main : push_ventes_a_envoyer décide ; chaque
// note servie avec un mail pose la réservation « vente:<note> » (index email_logs_vente_unique) = UN mail ; chaque note
// servie avec un téléphone = UN push ; le verdict est rendu par push_ventes_resultat (définition de prod). Le temps
// passe en reculant les dates de push_ventes (vieillir).
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
const MIGRATION = lire('supabase/migrations/20261105220000_rafale_recapitulatif_et_trace.sql');
const INVERSE = lire('supabase/rollbacks/20261105220000_rafale_recapitulatif_et_trace_INVERSE.sql');
// md5 des définitions (pg_get_functiondef, SANS les retours chariot) : prod du 05/11 après 20261105180000 (l'INVERSE
// les porte mot pour mot) et migration.
const MD5_PROD = {
  'public.push_trg_job()': '44419b65a0d5e3031da349106a80da00',
  'public.push_trg_ventes()': '52dc9401d6133fcf2fd406c602d0ae5f',
  'public.push_ventes_a_envoyer(integer)': 'dd07d5c6c40f260220ba05f2380cabe6',
};
const MD5_MIGRATION = {
  'public.push_trg_job()': 'f2928ca29ce2f793726b9494a873b2eb',
  'public.push_trg_ventes()': 'eb3c16595a335ac43ab40e0852bf97e2',
  'public.push_ventes_a_envoyer(integer)': '6d8d2af393adbe52e8474d7281260e24',
  'public.push_ventes_rafale_porte(bigint)': 'bcafe2b01214ea460bb2f92357b35892',
};
const SIGS = Object.keys(MD5_PROD);
const PORTE = 'public.push_ventes_rafale_porte(bigint)';
// Une seule fonction d'un fichier.
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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-rafale-'));
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
const CHAINE_FONCTIONS = ['push_trg_job', 'push_trg_ventes', 'push_noter', 'push_ventes_a_envoyer', 'push_ventes_resultat', 'push_vente_deja_signalee',
  'push_plateforme_suivie', 'push_preuve_en_ligne', 'push_declaration_en_cours', 'push_vente_enregistree', 'push_vinted_vendue_avant',
  'prix_vente_du_job', 'prix_vente_enregistree', 'cron_secret', 'leboncoin_transaction_noter', 'annonces_plateforme_transaction_leboncoin',
  'ventes_prouvees_tick', 'ventes_prouvees_a_enregistrer', 'enregistrer_vente_prouvee', 'enregistrer_vente_atomique',
  'enregistrer_vente_declaree', 'ebay_commande_appliquer', 'ebay_quantite_connue', 'palier_de', '_ts_ou_null', 'plateforme_normalisee'];
const CHAINE_TABLES = ['cross_post_jobs', 'inventaire', 'annonces_plateforme', 'ventes', 'ventes_operations', 'push_ventes',
  'email_logs', 'vinted_sync_runs', 'ventes_ebay_exemplaires', 'usage_logs', 'appareils_push'];

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

// ── 4. push-ventes, JOUÉE À LA MAIN ─────────────────────────────────────────────────────────────────────────────────
// Un passage = un appel de push_ventes_a_envoyer(50) ; chaque note servie avec un mail pose la réservation
// « vente:<note> » (index unique email_logs_vente_unique : une réservation déjà là = « deja_envoye », rien ne part) ;
// une note servie avec un téléphone = un push ; le verdict passe par push_ventes_resultat (définition de prod), sauf
// quand on simule une fonction tuée après l'envoi (sansVerdict). Le temps passe en reculant les dates de push_ventes.
const servies = new Map(), pushs = new Map(), mailsPartis = new Map(), recapsServies = new Map();
const vieillir = (s) => c.query(`UPDATE push_ventes SET cree_le = cree_le - $1 * interval '1 second', part_le = part_le - $1 * interval '1 second',
  traite_le = traite_le - $1 * interval '1 second', mail_traite_le = mail_traite_le - $1 * interval '1 second'`, [s]);
async function passage({ sansVerdict = false } = {}) {
  const r = (await un(`SELECT public.push_ventes_a_envoyer(50) AS r`)).r;
  const verdicts = [];
  for (const note of r.notes ?? []) {
    servies.set(note.id, (servies.get(note.id) ?? 0) + 1);
    if (note.recap === true) recapsServies.set(note.id, note);
    const v = { id: note.id };
    if (note.push === true) { pushs.set(note.id, (pushs.get(note.id) ?? 0) + 1); v.statut = 'envoyee'; }
    if (note.mail === true) {
      const res = await c.query(`INSERT INTO email_logs (user_id, email_type, email) VALUES ($1, 'vente:' || $2, $3) ON CONFLICT DO NOTHING`,
        [note.user_id, note.id, note.email]);
      if (res.rowCount === 1) mailsPartis.set(note.id, (mailsPartis.get(note.id) ?? 0) + 1);
      v.mail = { statut: res.rowCount === 1 ? 'envoye' : 'deja_envoye' };
    }
    verdicts.push(v);
  }
  if (!sansVerdict && verdicts.length) await un(`SELECT public.push_ventes_resultat($1::jsonb) AS r`, [JSON.stringify({ notes: verdicts })]);
  return r.notes ?? [];
}
async function tic(n = 1, pas = 20) { const out = []; for (let i = 0; i < n; i++) { await vieillir(pas); out.push(...(await passage())); } return out; }

// ── 5. COMPTES, DÉPÔTS, VENTES D'ESSAI (repris de preuve-mail-a-chaque-vente.mjs) ──────────────────────────────────
let nComptes = 0, invSuivant = 7720000000000, lbcSuivant = 3399600000, ebaySuivant = 136995000000, cmdSuivante = 10;
const PHOTOS = ['https://exemple.invalid/1.jpg'];
// Un compte par scénario : la rafale (8 ventes en 5 minutes PAR COMPTE) ne mêle jamais deux scénarios.
async function compte(nom, { telephone = false } = {}) {
  const u = crypto.randomUUID();
  const email = `preuve-rafale-${nom}-${++nComptes}@exemple.invalid`;
  await c.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [u, email]);
  await c.query(`INSERT INTO profiles (id, email, is_premium, is_pro, is_business, extension_last_seen_at, extension_version, extension_build, lang)
    VALUES ($1, $2, true, true, true, now(), '0.6.174', '0.6.174', 'fr')`, [u, email]);
  if (telephone) await c.query(`INSERT INTO appareils_push (user_id, plateforme, jeton) VALUES ($1, 'android', $2)`, [u, `jeton-factice-preuve-rafale-${nComptes}-${u}`]);
  return u;
}
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
const lireTransaction = (a, tx) => c.query(`UPDATE annonces_plateforme SET transaction_plateforme = $2, transaction_lue_le = clock_timestamp(),
  vu_le = clock_timestamp(), statut_plateforme = 'en_ligne' WHERE id = $1`, [a.annonce, tx]);
const ventesProuvees = () => un(`SELECT public.ventes_prouvees_tick(25, 4000) AS r`).then((x) => x.r);
const signal = (a, champs) => c.query(`UPDATE cross_post_jobs SET platform_fields = coalesce(platform_fields, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
  [a.job, JSON.stringify(champs)]);
const preuveExacte = (a, plus = {}) => ({ platform: a.platform, listing_id: a.lid, state: 'sold', exact: true, lu_le: new Date().toISOString(), ...plus });
async function venteRelevee(u, { plateforme = 'ebay', commande, annonce, inv = null, venduIlYa = '2 hours' }) {
  return (await un(`INSERT INTO ventes (user_id, titre, prix_vente, date, vendu_le, plateforme, plateforme_code, commande_ref, source, releve_le,
      devise, frais_plateforme, selling_fees, inventaire_id, quantite, statut, annonce_id)
    VALUES ($1, 'Vente relevée', 25, (CASE WHEN $2::interval IS NULL THEN now() ELSE now() - $2::interval END)::date,
            CASE WHEN $2::interval IS NULL THEN NULL ELSE now() - $2::interval END, $3, $3, $4, 'releve', now(), 'EUR', 0, 0, $5, 1, 'vendu', $6)
    RETURNING id`, [u, venduIlYa, plateforme, commande, inv, annonce])).id;
}
const nouvelleCommande = () => { cmdSuivante++; return { ordre: `${cmdSuivante}-15339-08906`, ligne: `100859145141${cmdSuivante}` }; };
// N ventes Leboncoin « Achat en cours » d'un compte, lues ensemble (forme assopmfrance 05/11 14:59) : les signaux d'abord ;
// enregistrees : la vente prouvée enregistrée tout de suite (ventes_prouvees_tick).
async function ventesLbc(u, n, { enregistrees = true } = {}) {
  const ds = [];
  for (let i = 0; i < n; i++) ds.push(await depot(u, { verifie: false, publie: '10 days', vu: '2 hours' }));
  for (const a of ds) await lireTransaction(a, 'pending');
  if (enregistrees) await ventesProuvees();
  return ds;
}

async function bilan(u) {
  const b = await un(`SELECT count(*) FILTER (WHERE origine <> 'rafale')::int AS notes,
      count(*) FILTER (WHERE origine = 'rafale')::int AS recaps,
      count(*) FILTER (WHERE origine = 'rafale' AND part_le IS NOT NULL)::int AS recaps_partis,
      count(*) FILTER (WHERE origine <> 'rafale' AND motif LIKE 'recapitulatif:%' AND part_le IS NOT NULL)::int AS dans_recap,
      count(*) FILTER (WHERE origine <> 'rafale' AND motif LIKE 'rafale:%')::int AS en_attente_recap,
      count(*) FILTER (WHERE statut = 'doublon')::int AS doublons,
      count(*) FILTER (WHERE motif = 'rattrapage_de_masse')::int AS masse,
      count(*) FILTER (WHERE origine = 'commande')::int AS notes_releve,
      count(*) FILTER (WHERE origine = 'job')::int AS notes_job,
      coalesce(array_agg(id ORDER BY id), '{}') AS ids,
      coalesce(array_agg(DISTINCT motif) FILTER (WHERE motif IS NOT NULL), '{}') AS motifs
    FROM push_ventes WHERE user_id = $1`, [u]);
  const m = await un(`SELECT count(*)::int AS n FROM email_logs WHERE user_id = $1 AND email_type LIKE 'vente:%'`, [u]);
  const t = await tous(`SELECT metadata FROM usage_logs WHERE user_id = $1 AND feature = 'vente_notification_ecartee' ORDER BY created_at`, [u]);
  const ids = b.ids.map(Number);
  const recap = await un(`SELECT id, statut, mail_statut, motif, part_le IS NOT NULL AS parti, titre, articles FROM push_ventes
    WHERE user_id = $1 AND origine = 'rafale' ORDER BY id DESC LIMIT 1`, [u]);
  return {
    ...b, mails: m.n, traces: t.length, raisons: t.map((x) => x.metadata?.raison), trace: t[0]?.metadata ?? null,
    servies_unitaires: ids.filter((i) => i !== Number(recap?.id)).reduce((s, i) => s + (servies.get(i) ?? 0), 0),
    servi_recap: recap ? (servies.get(Number(recap.id)) ?? 0) : 0,
    push: ids.reduce((s, i) => s + (pushs.get(i) ?? 0), 0),
    recap: recap ? { ...recap, lignes: Array.isArray(recap.articles) ? recap.articles.length : 0 } : null,
  };
}


// ── 6. LES SCÉNARIOS ────────────────────────────────────────────────────────────────────────────────────────────────
// (C) eBay : la même commande par le chemin du job (confirmation de commande), puis par le relevé → la note du relevé
// est écartée par la parade de push_trg_ventes.
async function paradeReleve(u) {
  const a = await depot(u, { platform: 'ebay', quantite: 2, verifie: true, publie: '10 days', vu: null });
  const k = nouvelleCommande();
  await signal(a, { sale_signal: 'sold', sale_evidence: preuveExacte(a, { source: 'order_confirmation', order_id: k.ordre, quantite: 1 }) });
  await ventesProuvees();
  await tic(3);
  const v = await venteRelevee(u, { commande: `${k.ordre}:${k.ligne}`, annonce: a.lid, inv: null, venduIlYa: '20 minutes' });
  await tic(3);
  return { vente: v, commande: `${k.ordre}:${k.ligne}` };
}
// (C') eBay : le relevé d'ABORD, puis ebay_commande_appliquer passe le job « vendu » (même transaction) → la note du job
// est écartée par la parade de push_trg_job.
async function paradeJob(u) {
  const a = await depot(u, { platform: 'ebay', quantite: 3, verifie: false, publie: '10 days', vu: '2 hours' });
  const k = nouvelleCommande();
  await c.query('BEGIN');
  const v = await venteRelevee(u, { commande: `${k.ordre}:${k.ligne}`, annonce: a.lid, inv: a.inv, venduIlYa: '1 hour' });
  await un(`SELECT public.ebay_commande_appliquer($1, $2::jsonb) AS r`, [v, JSON.stringify({ http: '200', epuisee: true, lu_le: new Date().toISOString() })]);
  await c.query('COMMIT');
  await tic(3);
  return { job: a.job };
}
// Chemin normal : une vente eBay relevée datée de 2 h ; un dépôt relu « Achat en cours ».
async function normalReleve(u) { const k = nouvelleCommande(); await venteRelevee(u, { commande: `${k.ordre}:${k.ligne}`, annonce: String(ebaySuivant++), venduIlYa: '2 hours' }); await tic(3); }
async function normalJob(u) { const a = await depot(u, { verifie: true, publie: '10 days', vu: '2 hours' }); await lireTransaction(a, 'pending'); await ventesProuvees(); await tic(3); }

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
  ok(!(await un(`SELECT to_regprocedure($1) IS NOT NULL AS x`, [PORTE])).x, `${PORTE} absente de la prod`);
  const cfg = await un(`SELECT (SELECT value FROM coin_config WHERE key = 'ventes_leboncoin_transaction') AS tx,
    (SELECT value FROM coin_config WHERE key = 'ventes_prouvees_auto_depuis') AS depuis, (SELECT count(*)::int FROM platform_health WHERE paused) AS pauses`);
  ok(cfg.tx === 1 && cfg.depuis > 0 && cfg.pauses === 0, `coin_config / platform_health de prod : ventes_leboncoin_transaction=${cfg.tx}, ventes_prouvees_auto_depuis=${cfg.depuis}, pauses=${cfg.pauses}`);

  // ── 1. AVANT ──
  console.log('\n1. AVANT — les définitions de prod (INVERSE)');
  await c.query(INVERSE);
  for (const s of SIGS) ok(await md5De(s) === MD5_PROD[s], `${s} = prod (md5 ${MD5_PROD[s]})`);
  const uA = await compte('avant-masse-ancienne', { telephone: true });
  await ventesLbc(uA, 9); await tic(3);
  const A0 = await bilan(uA);
  const etatA = await tous(`SELECT id, statut, motif, part_le, mail_statut FROM push_ventes WHERE user_id = $1 ORDER BY id`, [uA]);
  ok(A0.notes === 18 && A0.masse === 18 && A0.mails === 0 && A0.push === 0 && A0.recaps === 0,
    `rafale de 9 ventes AVANT : ${A0.notes} notes « rattrapage_de_masse », ${A0.mails} mail, ${A0.push} push (la règle du 06/10)`, A0);
  const u7av = await compte('avant-7');
  await ventesLbc(u7av, 7); await tic(3);
  const R7av = await bilan(u7av);
  ok(R7av.mails === 7 && R7av.recaps === 0, `7 ventes AVANT : ${R7av.mails} mails à l'unité`, R7av);
  const uCav = await compte('avant-parade-releve'); await paradeReleve(uCav);
  const Cav = await bilan(uCav);
  ok(Cav.notes_releve === 0 && Cav.traces === 0, `(C) AVANT : la note du relevé est écartée SANS RIEN écrire (${Cav.traces} trace)`, Cav);
  const uCpav = await compte('avant-parade-job'); await paradeJob(uCpav);
  const Cpav = await bilan(uCpav);
  ok(Cpav.notes_job === 0 && Cpav.notes_releve === 1 && Cpav.traces === 0, `(C') AVANT : la note du job est écartée SANS RIEN écrire (${Cpav.traces} trace)`, Cpav);
  // Une rafale d'AVANT encore dans sa fenêtre de 5 minutes au moment de l'application.
  const uB = await compte('avant-masse-fraiche');
  await ventesLbc(uB, 9); await tic(1);
  const B0 = await bilan(uB);
  const etatB = await tous(`SELECT id, statut, motif, part_le FROM push_ventes WHERE user_id = $1 ORDER BY id`, [uB]);
  ok(B0.masse === 18 && B0.mails === 0, `rafale d'AVANT encore « fraîche » (moins de 5 min) : ${B0.masse} notes « rattrapage_de_masse », 0 mail`, B0);

  // ── 2. APRÈS ──
  console.log('\n2. APRÈS — la migration, appliquée en entier');
  await c.query(MIGRATION);
  for (const s of [...SIGS, PORTE]) ok(await md5De(s) === MD5_MIGRATION[s], `${s} (md5 ${MD5_MIGRATION[s]})`, await md5De(s));
  const droits = await un(`SELECT has_function_privilege('anon', $1, 'EXECUTE') AS anon, has_function_privilege('authenticated', $1, 'EXECUTE') AS auth,
    has_function_privilege('service_role', $1, 'EXECUTE') AS svc`, [PORTE]);
  ok(!droits.anon && !droits.auth && droits.svc, `${PORTE} : service_role seulement (ni anon, ni authenticated)`, droits);

  console.log('   (e) Les ventes passées ne sont pas rattrapées');
  // B : une vente NEUVE dans la fenêtre d'une rafale d'avant (18 notes déjà closes).
  const aB = await ventesLbc(uB, 1); await tic(4);
  const B1 = await bilan(uB);
  const etatB1 = await tous(`SELECT id, statut, motif, part_le FROM push_ventes WHERE user_id = $1 AND id = ANY($2::bigint[]) ORDER BY id`, [uB, etatB.map((x) => x.id)]);
  ok(JSON.stringify(etatB1) === JSON.stringify(etatB), `rafale d'avant encore fraîche : ses ${etatB.length} notes closes restent intactes (statut, motif, part_le)`, { avant: etatB.slice(0, 2), apres: etatB1.slice(0, 2) });
  ok(B1.recaps_partis === 1 && B1.recap?.lignes === 1 && B1.mails === 1 && B1.servies_unitaires === 0,
    `… et la vente NEUVE (décidée après l'application) part seule dans le récapitulatif : ${B1.recap?.lignes} ligne, ${B1.mails} mail — jamais les 9 d'avant`, B1);
  ok(Number(B1.recap?.articles?.[0]?.note) > Math.max(...etatB.map((x) => Number(x.id))), '… sa ligne est une note née APRÈS l\'application', B1.recap?.articles);

  console.log('   (c) Une rafale = UN mail récapitulatif');
  // R9 : 9 ventes Leboncoin prouvées et enregistrées, lues ensemble (forme assopmfrance) ; compte avec un téléphone.
  const u9 = await compte('r9', { telephone: true });
  const d9 = await ventesLbc(u9, 9);
  const s1 = await tic(1);
  const R9a = await bilan(u9);
  ok(s1.filter((n) => n.user_id === u9).length === 0 && R9a.recaps === 1 && R9a.recaps_partis === 0 && R9a.en_attente_recap === 18,
    `R9 — 1er passage : la rafale ouvre UNE note récapitulative et y range ses ${R9a.en_attente_recap} notes ; rien ne part encore (15 s de calme)`, R9a);
  await tic(1);
  const R9 = await bilan(u9);
  ok(R9.recaps === 1 && R9.recaps_partis === 1 && R9.servi_recap === 1, `R9 — le récapitulatif part : servi ${R9.servi_recap} fois`, R9);
  ok(R9.mails === 1, `R9 — UN mail (réservation vente:<récapitulatif>) : ${R9.mails}`, R9);
  const types9 = (await tous(`SELECT email_type FROM email_logs WHERE user_id = $1`, [u9])).map((x) => x.email_type);
  ok(JSON.stringify(types9) === JSON.stringify([`vente:${R9.recap.id}`]), `R9 — la seule réservation du compte est celle du récapitulatif (${types9.join(', ')}) : aucune « vente:<note> » par vente`, types9);
  ok(R9.push === 1, `R9 — UN push (téléphone enregistré) : ${R9.push}`, R9);
  ok(R9.servies_unitaires === 0, `R9 — 0 mail ni push à l'unité : ${R9.servies_unitaires} note servie seule`, R9);
  ok(R9.recap.lignes === 9 && R9.dans_recap === 9 && R9.doublons === 9, `R9 — 9 lignes (9 ventes décidées, part_le posé) ; les 9 notes « vendu » de ces jobs : doublons`, R9);
  const l9 = R9.recap.articles;
  ok(l9.every((l) => l.plateforme === 'leboncoin' && Number(l.prix) === 25 && /^Article d'essai/.test(l.titre) && l.a_decider === false),
    'R9 — chaque ligne : titre, plateforme, prix (25 €), vente enregistrée (pas « à confirmer »)', l9[0]);
  ok(new Set(l9.map((l) => String(l.inventaire_id))).size === 9 && d9.every((a) => l9.some((l) => Number(l.inventaire_id) === a.inv)),
    'R9 — les 9 fiches vendues, chacune une fois');
  ok(recapsServies.get(Number(R9.recap.id))?.recap === true && recapsServies.get(Number(R9.recap.id))?.nb_ventes === 9 && /^9 ventes d'un coup$/.test(R9.recap.titre),
    'R9 — push-ventes reçoit « recap: true », nb_ventes 9', recapsServies.get(Number(R9.recap.id)));
  await tic(6);
  const R9b = await bilan(u9);
  ok(R9b.mails === 1 && R9b.servi_recap === 1 && R9b.servies_unitaires === 0 && R9b.push === 1, `R9 — le tick repasse 6 fois : rien de plus (${R9b.mails} mail, servi ${R9b.servi_recap} fois)`, R9b);

  // R9 suite : la même rafale continue après le départ (moins de 5 min) → rien ; puis, la rafale finie, une vente seule.
  await ventesLbc(u9, 1); await tic(3);
  const R9c = await bilan(u9);
  ok(R9c.mails === 1 && R9c.recaps === 1 && R9c.masse === 2 && R9c.servies_unitaires === 0,
    `R9 — une vente de plus 1 min après le récapitulatif (même rafale) : rien de plus, « rattrapage_de_masse » comme avant (${R9c.mails} mail)`, R9c);
  await vieillir(6 * 60);
  await ventesLbc(u9, 1); await tic(3);
  const R9d = await bilan(u9);
  ok(R9d.mails === 2 && R9d.recaps === 1 && R9d.servies_unitaires === 1, `R9 — la rafale finie (6 min plus tard), une vente seule repart à l'unité : ${R9d.mails - R9c.mails} mail de plus`, R9d);

  // R9t : la vraie chronologie — les signaux d'abord, les ventes enregistrées 2 minutes plus tard.
  const u9t = await compte('r9t');
  const d9t = await ventesLbc(u9t, 9, { enregistrees: false });
  await tic(4);
  const R9t0 = await bilan(u9t);
  ok(R9t0.recaps === 1 && R9t0.recaps_partis === 0 && R9t0.mails === 0 && R9t0.servies_unitaires === 0,
    `R9t — signaux lus, ventes pas encore enregistrées : le récapitulatif ATTEND (règle du 09/10 : le mail après la vente) — ${R9t0.mails} mail`, R9t0);
  await ventesProuvees();
  await tic(2);
  const R9t = await bilan(u9t);
  ok(R9t.recaps_partis === 1 && R9t.recap.lignes === 9 && R9t.mails === 1 && R9t.servies_unitaires === 0,
    `R9t — ventes enregistrées : le récapitulatif part avec ses 9 ventes, ${R9t.mails} mail, 0 à l'unité`, R9t);
  await tic(5);
  const R9t2 = await bilan(u9t);
  ok(R9t2.mails === 1 && R9t2.servi_recap === 1, `R9t — le tick repasse : toujours ${R9t2.mails} mail`, R9t2);
  ok(d9t.length === 9, 'R9t — 9 dépôts');

  // R9e : 9 ventes eBay relevées (commandes datées de 1 h) ; puis la fonction « tuée » après l'envoi (verdict perdu) :
  // la relance trouve la réservation — jamais un second mail.
  const u9e = await compte('r9e');
  for (let i = 0; i < 9; i++) { const k = nouvelleCommande(); await venteRelevee(u9e, { commande: `${k.ordre}:${k.ligne}`, annonce: String(ebaySuivant++), venduIlYa: '1 hour' }); }
  await vieillir(20); await passage();
  await vieillir(20); const servi = await passage({ sansVerdict: true });
  const R9e = await bilan(u9e);
  ok(servi.filter((n) => n.user_id === u9e).length === 1 && R9e.recap?.lignes === 9 && R9e.mails === 1 && R9e.recap.articles.every((l) => l.plateforme === 'ebay' && Number(l.prix) === 25 && l.vente_id),
    `R9e — 9 ventes eBay relevées : UN récapitulatif de 9 lignes, ${R9e.mails} mail`, R9e);
  await vieillir(4 * 60);
  const relance = (await passage()).filter((n) => n.user_id === u9e);
  const R9e2 = await bilan(u9e);
  ok(relance.length === 1 && relance[0].recap === true && relance[0].mail === true && R9e2.mails === 1,
    `R9e — verdict perdu, relance 3 min plus tard : resservi « recap: true », la réservation tient → ${R9e2.mails} mail (« deja_envoye »)`, { relance, R9e2 });
  await tic(4);
  ok((await bilan(u9e)).servi_recap === 2, 'R9e — puis plus rien');

  // R9cap : 9 signaux SANS preuve (publiés il y a 20 h, jamais vendus pour de vrai) : jamais un mail, comme avant.
  const u9c = await compte('r9cap');
  for (let i = 0; i < 9; i++) { const a = await depot(u9c, { verifie: false, publie: '20 hours', vu: null }); await signal(a, { sale_signal: 'sold' }); }
  await tic(4);
  const R9c0 = await bilan(u9c);
  ok(R9c0.notes === 9 && R9c0.recaps === 1 && R9c0.recaps_partis === 0 && R9c0.mails === 0, `R9cap — 9 signaux sans vente enregistrée : le récapitulatif attend, 0 mail`, R9c0);
  await vieillir(6 * 60); await tic(2);
  const R9c1 = await bilan(u9c);
  ok(R9c1.recaps_partis === 0 && R9c1.recap?.motif === 'rafale_sans_vente' && R9c1.masse === 9 && R9c1.mails === 0 && R9c1.servies_unitaires === 0,
    `R9cap — 6 min plus tard : clos « rafale_sans_vente », les 9 notes « rattrapage_de_masse », 0 mail (inchangé)`, R9c1);

  // R7 : 7 ventes → 7 mails à l'unité, comme avant.
  const u7 = await compte('r7');
  await ventesLbc(u7, 7); await tic(3);
  const R7 = await bilan(u7);
  ok(R7.mails === 7 && R7.recaps === 0 && R7.servies_unitaires === 7 && R7.mails === R7av.mails, `R7 — 7 ventes : ${R7.mails} mails à l'unité, 0 récapitulatif (inchangé : ${R7av.mails} avant)`, R7);

  // Rmix : 3 ventes déjà parties à l'unité, puis 6 de plus dans les 5 minutes (9 en tout : rafale) → le récapitulatif
  // ne reprend QUE les 6 nouvelles : aucune vente dans deux mails.
  const uM = await compte('rmix');
  const dM1 = await ventesLbc(uM, 3); await tic(3);
  const M0 = await bilan(uM);
  const dM2 = await ventesLbc(uM, 6); await tic(3);
  const M1 = await bilan(uM);
  const invRecap = new Set((M1.recap?.articles ?? []).map((l) => Number(l.inventaire_id)));
  ok(M0.mails === 3 && M0.recaps === 0 && M1.recaps_partis === 1 && M1.recap.lignes === 6 && M1.mails === 4
    && dM2.every((a) => invRecap.has(a.inv)) && dM1.every((a) => !invRecap.has(a.inv)),
  `Rmix — 3 mails à l'unité, puis la rafale (9 en 5 min) : le récapitulatif liste les ${M1.recap?.lignes} nouvelles seulement, ${M1.mails} mails en tout`, { M0, M1 });

  // A : les notes « rattrapage_de_masse » d'AVANT l'application ne partent jamais.
  await tic(3);
  const A1 = await bilan(uA);
  const etatA1 = await tous(`SELECT id, statut, motif, part_le, mail_statut FROM push_ventes WHERE user_id = $1 ORDER BY id`, [uA]);
  ok(A1.mails === 0 && A1.push === 0 && A1.recaps === 0 && A1.servies_unitaires === 0, `rafale d'AVANT (A) : après l'application, ${A1.mails} mail, ${A1.push} push, ${A1.recaps} récapitulatif`, A1);
  ok(JSON.stringify(etatA1.map(({ id, statut, motif, part_le, mail_statut }) => ({ id, statut, motif, part_le, mail_statut })))
    === JSON.stringify(etatA.map(({ id, statut, motif, part_le, mail_statut }) => ({ id, statut, motif, part_le, mail_statut }))),
    `… ses ${etatA.length} notes restent closes à l'identique (« rattrapage_de_masse »)`);

  console.log('   (d) Une notification écartée laisse UNE trace ; le chemin normal, aucune');
  const uC = await compte('parade-releve'); const pc = await paradeReleve(uC);
  const C = await bilan(uC);
  ok(C.notes_releve === 0 && C.mails === 1, `(C) relevé : la vente déjà notée par le job n'est PAS notée une 2e fois (${C.notes_releve} note du relevé, ${C.mails} mail)`, C);
  ok(C.traces === 1 && C.trace?.raison === 'parade_ebay_releve' && Number(C.trace?.vente_id) === Number(pc.vente) && C.trace?.commande_ref === pc.commande && C.trace?.plateforme === 'ebay',
    `(C) relevé : 1 trace « vente_notification_ecartee » (raison ${C.trace?.raison}, vente ${C.trace?.vente_id}, commande ${C.trace?.commande_ref})`, C.trace);
  const uCp = await compte('parade-job'); const pj = await paradeJob(uCp);
  const Cp = await bilan(uCp);
  ok(Cp.notes_job === 0 && Cp.notes_releve === 1 && Cp.mails === 1, `(C') job : la note du job n'est PAS née (${Cp.notes_job}), ${Cp.mails} mail (celui du relevé)`, Cp);
  ok(Cp.traces === 1 && Cp.trace?.raison === 'parade_ebay_job' && Cp.trace?.job_id === pj.job && Cp.trace?.commande,
    `(C') job : 1 trace (raison ${Cp.trace?.raison}, job ${String(Cp.trace?.job_id).slice(0, 8)}, commande ${Cp.trace?.commande})`, Cp.trace);
  const uN1 = await compte('normal-releve'); await normalReleve(uN1);
  const uN2 = await compte('normal-job'); await normalJob(uN2);
  const N1 = await bilan(uN1), N2 = await bilan(uN2);
  ok(N1.notes === 1 && N1.mails === 1 && N1.traces === 0 && N2.mails === 1 && N2.traces === 0,
    `chemin normal (vente eBay relevée ; dépôt relu « Achat en cours ») : 1 mail chacun, ${N1.traces + N2.traces} trace`, { N1, N2 });
  const tracesHors = (await un(`SELECT count(*)::int AS n FROM usage_logs WHERE feature = 'vente_notification_ecartee' AND user_id NOT IN ($1, $2)`, [uC, uCp])).n;
  ok(tracesHors === 0, `aucune trace ailleurs (rafales, ventes seules, comptes d'avant) : ${tracesHors}`);
  ok(Cav.mails === C.mails && Cpav.mails === Cp.mails, `(C)/(C') : mêmes mails qu'avant (${Cav.mails}/${Cpav.mails}) — seule la trace s'ajoute`);

  // ── 3. L'INVERSE ──
  console.log("\n3. L'INVERSE : les définitions de prod, mot pour mot ; un récapitulatif ouvert est clos, jamais envoyé");
  const uI = await compte('inverse');
  await ventesLbc(uI, 9, { enregistrees: false }); await tic(2);
  const I0 = await bilan(uI);
  ok(I0.recaps === 1 && I0.recaps_partis === 0, 'un récapitulatif ouvert (ventes pas encore enregistrées) au moment de l\'inverse', I0);
  await c.query(INVERSE);
  for (const s of SIGS) ok(await md5De(s) === MD5_PROD[s], `${s} revenue à la prod (md5 ${MD5_PROD[s]})`);
  ok(!(await un(`SELECT to_regprocedure($1) IS NOT NULL AS x`, [PORTE])).x, `${PORTE} retirée`);
  await ventesProuvees(); await tic(4);
  const I1 = await bilan(uI);
  ok(I1.recap?.statut === 'ignoree' && I1.recap?.motif === 'rafale_inverse' && I1.mails === 0 && I1.servi_recap === 0,
    `le récapitulatif ouvert est clos « rafale_inverse » ; l'ancienne règle reprend (rafale = rien) : ${I1.mails} mail`, I1);
  await c.query(MIGRATION);
  for (const s of [...SIGS, PORTE]) ok(await md5De(s) === MD5_MIGRATION[s], `la migration se rejoue (CREATE OR REPLACE) : ${s.split('(')[0]}`);
} catch (e) {
  ko++; console.log(`  ✗ ERREUR : ${e.message}\n${e.stack?.split('\n').slice(1, 4).join('\n')}`);
} finally {
  await c.end().catch(() => {});
  if (embarque) { await embarque.pg.stop().catch(() => {}); rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — migration prouvée de bout en bout sur un Postgres jetable`);
process.exit(ko ? 1 : 0);
