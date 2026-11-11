// PREUVE DE BOUT EN BOUT, SUR UN POSTGRES JETABLE, des cinq migrations du 08/11 (ayadi007, point 4 Jess) — jamais la prod.
//   20261108140000_cadence_stock_vide_garde_runs      « Synchroniser » depuis un stock vide : jamais SYNC_CADENCE
//   20261108141000_releve_ancien_jamais_importe       rapprochement_v3_lire rend « perimee » (le moteur ne l'importe pas)
//   20261108142000_republication_vendue_avant_suivi   Leboncoin « vendue avant le suivi », en ligne : se republie
//   20261108143000_une_ligne_vivante_par_annonce      « Réinitialiser » clôt ses lignes ; une ligne vivante par annonce
//   20261108144000_compte_change_sans_vendue          compte changé / vidé d'un coup : aucun « Vendue ? » en série
//
//   PREUVE_PG=embarque node scripts/preuve-ayadi-0811.mjs                       (Postgres 17 jetable sur le PC)
//   PREUVE_PG=embarque node scripts/preuve-ayadi-0811.mjs --catalogue <f.json>  (catalogue déjà lu, hors ligne)
//
// La base jetable porte le schéma public DE PROD — fonctions (pg_get_functiondef), tables (colonnes, défauts,
// contraintes, index), déclencheurs, coin_config, platform_health — lus EN LECTURE SEULE (`npx supabase db query
// --linked --read-only`, catalogue système seulement, aucune donnée client). Banc repris de
// scripts/preuve-remise-en-vente-series.mjs (mêmes bouchons auth / net / vault / cron / storage).
// Étapes : A. AVANT (définitions de prod) : les cinq défauts se reproduisent ; B. les migrations (deux fois chacune) :
// les règles neuves, et tout le reste comme avant ; C. les INVERSES rendent les définitions de prod (md5), les
// migrations se rejouent.
import pg from 'pg';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const lire = (p) => readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
const LOT = [
  { v: '20261108140000', nom: 'cadence_stock_vide_garde_runs', sig: 'public.garde_cadence_sync_runs()', md5: '55eb8af87d77ca0d6edbcc7c8ee08d45' },
  { v: '20261108141000', nom: 'releve_ancien_jamais_importe', sig: 'public.rapprochement_v3_lire(uuid)', md5: 'a0aeaefb68d34d9120949df2cc5c79cb' },
  { v: '20261108142000', nom: 'republication_vendue_avant_suivi', sig: 'public.republication_annonce_partie(uuid,bigint,text,text)', md5: 'b58d4f684b16b34ab20a4c631c9bea01' },
  { v: '20261108143000', nom: 'une_ligne_vivante_par_annonce', sig: 'public.supprimer_mon_stock_sans_retrait()', md5: 'b0ab3a21aaf15c2b11864f9650f3a86e' },
  { v: '20261108144000', nom: 'compte_change_sans_vendue', sig: 'public.constater_absences_releve(uuid)', md5: 'd36984b5c0fc70a5251059b5703f0404' },
].map((m) => ({ ...m, migration: lire(`supabase/migrations/${m.v}_${m.nom}.sql`), inverse: lire(`supabase/rollbacks/${m.v}_${m.nom}_INVERSE.sql`) }));

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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-ayadi-0811-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55487, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55487/postgres';
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
const CHAINE_FONCTIONS = ['garde_cadence_sync_runs', 'demander_sync_dressing', 'rapprochement_v3_lire', 'republication_annonce_partie',
  'leboncoin_vendu_avant_suivi', 'leboncoin_transaction_noter', 'annonce_importee', 'supprimer_mon_stock_sans_retrait',
  'inventaire_arme_retraits_avant_suppression', 'constater_absences_releve', 'releve_preuve_absence', 'republication_engagee',
  'republication_engagee_numero', 'republication_recreee_non_confirmee', 'listing_designe'];
const CHAINE_TABLES = ['cross_post_jobs', 'inventaire', 'annonces_plateforme', 'ventes', 'vinted_sync_runs', 'usage_logs', 'rapprochements', 'profiles'];

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

// ── 3. LES COMPTES ET LES DONNÉES D'ESSAI ───────────────────────────────────────────────────────────────────────────
import { passe } from '../supabase/functions/_shared/rapprochement/passe.js';

let invSuivant = 7790000000000, lidSuivant = 3399100000, uSuivant = 1;
const nouvelU = () => `0f5e5e5e-5e5e-4e5e-8e5e-${String(uSuivant++).padStart(12, '0')}`;
const comme = (u) => c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: u, role: 'authenticated' })]);
const service = () => c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ role: 'service_role' })]);
async function compte() {
  const u = nouvelU();
  await c.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [u, `preuve-${u.slice(-4)}@exemple.invalid`]);
  await c.query(`INSERT INTO profiles (id, email, is_premium, is_pro, is_business, extension_last_seen_at, extension_version, extension_build, lang)
    VALUES ($1, $2, true, true, true, now(), '0.6.180', '0.6.180', 'fr')`, [u, `preuve-${u.slice(-4)}@exemple.invalid`]);
  return u;
}
async function fiche(u, { statut = 'stock', origine = null, titre = 'Autoradio CarPlay' } = {}) {
  const id = invSuivant++;
  await c.query(`INSERT INTO inventaire (id, user_id, titre, statut, quantite, prix_vente, origine, photos)
    VALUES ($1, $2, $3, $4, 1, 50, $5, '[]'::jsonb)`, [id, u, `${titre} ${id}`, statut, origine]);
  return id;
}
async function job(u, { inv = null, platform = 'leboncoin', action = 'publish', status = 'published', lid = null, pf = {}, hb = null } = {}) {
  const l = lid ?? String(lidSuivant++);
  const url = platform === 'vinted' ? `https://www.vinted.fr/items/${l}` : `https://www.leboncoin.fr/ad/equipement_auto/${l}`;
  const r = await un(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, title, price, platform_listing_id,
      listing_url, published_at, handler_build, platform_fields)
    VALUES ($1, $2::bigint, $3, $4, $5::text, 'Autoradio CarPlay', 50, $6, $7, CASE WHEN $5::text IN ('published','sold') THEN now() - interval '1 day' END, $8::text, $9::jsonb)
    RETURNING id`, [u, inv, platform, action, status, l, url, hb, JSON.stringify(pf)]);
  return { id: r.id, lid: l };
}
const jobDe = (id) => un(`SELECT id, status, inventaire_id, error, platform_fields AS pf FROM cross_post_jobs WHERE id = $1`, [id]);
async function run(u, { platform = 'leboncoin', kind = 'annonces', status = 'done', debut, fin, vus = 2, decl = 'bouton' }) {
  const r = await un(`INSERT INTO vinted_sync_runs (user_id, platform, kind, status, declencheur, started_at, finished_at, updated_at, items_vus, total_entries)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $8) RETURNING id`, [u, platform, kind, status, decl, debut, fin, vus]);
  return r.id;
}
async function annonce(u, { lid = null, platform = 'leboncoin', runId = null, vu, cree = null, inv = null, jobId = null, tx = null, titre = 'Autoradio CarPlay' }) {
  const l = lid ?? String(lidSuivant++);
  const r = await un(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, prix, statut_plateforme, inventaire_id, job_id,
      run_id, vu_le, created_at, transaction_plateforme, statut_brut)
    VALUES ($1, $2, $3, $4, $11, 50, 'en_ligne', $5::bigint, $6::uuid, $7::uuid, $8::timestamptz, COALESCE($9::timestamptz, $8::timestamptz), $10::text, 'active') RETURNING id`,
    [u, platform, l, `https://www.leboncoin.fr/ad/equipement_auto/${l}`, inv, jobId, runId, vu, cree, tx, titre]);
  return { id: r.id, lid: l };
}
const il = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const appliquer = async (m) => { await c.query(m.migration); };
const leve = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };

// ── LES SCÉNARIOS (chacun sur un compte neuf : AVANT et APRÈS se lisent côte à côte) ──
// 1. Cadence : dressing lu il y a 5 min, stock vide (« Réinitialiser » vient de passer).
async function cadence({ stock = false, decl = 'bouton_distant' } = {}) {
  const u = await compte();
  await run(u, { platform: 'vinted', kind: 'dressing', status: 'done', debut: il(0.2), fin: il(5 / 60), vus: 144, decl: 'bouton' });
  if (stock) await fiche(u);
  await service();
  const insertion = await leve(() => c.query(`INSERT INTO vinted_sync_runs (user_id, kind, status, declencheur, queued_at, platform)
    VALUES ($1, 'dressing', 'queued', $2, now(), 'vinted')`, [u, decl]));
  await c.query(`DELETE FROM vinted_sync_runs WHERE user_id = $1 AND status = 'queued'`, [u]);
  await comme(u);
  let rpc = null; const erreurRpc = await leve(async () => { rpc = (await un(`SELECT public.demander_sync_dressing() AS r`)).r; });
  await service();
  return { insertion, rpc, erreurRpc };
}
// 2. Jess : annonce Leboncoin importée, « Vendu » dès sa première lecture, toujours en ligne.
async function jess({ avantSuivi = true } = {}) {
  const u = await compte();
  const inv = await fiche(u);
  const j = await job(u, { inv, pf: { source: 'releve', rattachement: { par: 'rapprochement', import: true } }, hb: 'releve-annonces' });
  const a = await annonce(u, { lid: j.lid, vu: il(0.1), inv, jobId: j.id, tx: avantSuivi ? 'sold' : 'aucune' });
  if (!avantSuivi) await c.query(`UPDATE annonces_plateforme SET transaction_plateforme = 'sold', vu_le = now() WHERE id = $1`, [a.id]);
  const trace = (await tous(`SELECT metadata->>'issue' AS issue, metadata->>'avant' AS avant FROM usage_logs
    WHERE user_id = $1 AND feature = 'vente_leboncoin_transaction' ORDER BY created_at`, [u]));
  const verdict = (await un(`SELECT public.republication_annonce_partie($1, $2, 'leboncoin', $3) AS v`, [u, inv, j.lid])).v;
  return { u, inv, j, verdict, trace };
}
// 3. « Réinitialiser » : des lignes de chaque sorte sur deux fiches.
async function reinitialiser() {
  const u = await compte();
  const f1 = await fiche(u), f2 = await fiche(u);
  const L = {
    lbc_publie: await job(u, { inv: f1, hb: 'releve-annonces', pf: { source: 'releve' } }),
    vinted_publie: await job(u, { inv: f1, platform: 'vinted' }),
    repub_capturee: await job(u, { inv: f1, action: 'republish', status: 'pending', pf: { republish_step: 'captured' } }),
    beebs_en_file: await job(u, { inv: f1, platform: 'beebs', status: 'pending', lid: null }),
    repub_engagee: await job(u, { inv: f2, action: 'republish', status: 'pending', pf: { republish_step: 'deleted' } }),
    retrait: await job(u, { inv: f2, action: 'delete', status: 'pending' }),
    vinted_en_cours: await job(u, { inv: f2, platform: 'vinted', status: 'processing' }),
    lbc_vendu: await job(u, { inv: f2, status: 'sold' }),
  };
  await c.query(`INSERT INTO ventes (id, user_id, titre, prix_vente, date, inventaire_id) VALUES ($1, $2, 'vente', 50, '2026-11-07', $3)`, [invSuivant++, u, f2]);
  const deletesAvant = (await un(`SELECT count(*)::int n FROM cross_post_jobs WHERE user_id = $1 AND action = 'delete'`, [u])).n;
  await comme(u);
  const erreur = await leve(() => c.query(`SELECT public.supprimer_mon_stock_sans_retrait()`));
  await service();
  const lignes = {};
  for (const [k, v] of Object.entries(L)) lignes[k] = await jobDe(v.id);
  const reste = await un(`SELECT (SELECT count(*)::int FROM inventaire WHERE user_id = $1) AS fiches, (SELECT count(*)::int FROM ventes WHERE user_id = $1) AS ventes,
    (SELECT count(*)::int FROM cross_post_jobs WHERE user_id = $1 AND action = 'delete') AS deletes`, [u]);
  return { erreur, lignes, reste, deletesAvant };
}
// 4. Une ligne vivante par annonce : lignes sans fiche d'une annonce qui revient au stock.
async function uneLigne() {
  const u = await compte();
  const L1 = String(lidSuivant++), V1 = String(lidSuivant++), L9 = String(lidSuivant++);
  const o = {
    publie: await job(u, { lid: L1, hb: 'releve-annonces' }),
    repub_pending: await job(u, { lid: L1, action: 'republish', status: 'pending', pf: { republish_step: 'captured' } }),
    en_cours: await job(u, { lid: L1, status: 'processing' }),
    vinted: await job(u, { lid: V1, platform: 'vinted' }),
    autre_annonce: await job(u, { lid: L9 }),
  };
  const g = await fiche(u), autre = await fiche(u);
  const autreFiche = await job(u, { inv: autre, lid: String(lidSuivant++) });
  const garde = await job(u, { inv: g, lid: L1, hb: 'releve-annonces' });                       // l'import qui la ramène (INSERT)
  const gv = await job(u, { inv: g, platform: 'vinted', lid: V1, status: 'pending' });
  await c.query(`UPDATE cross_post_jobs SET status = 'published', published_at = now() WHERE id = $1`, [gv.id]);   // (UPDATE)
  const e = {};
  for (const [k, v] of Object.entries(o)) e[k] = await jobDe(v.id);
  e.autreFiche = await jobDe(autreFiche.id); e.garde = await jobDe(garde.id); e.gv = await jobDe(gv.id);
  return { e, garde, gv };
}
// 5. rapprochement_v3_lire + moteur : l'annonce que le dernier relevé n'a pas revue.
async function lecture() {
  const u = await compte();
  const vieux = await run(u, { debut: il(40), fin: il(39.9), vus: 3 });
  const neuf = await run(u, { debut: il(1), fin: il(0.95), vus: 1 });
  const inv = await fiche(u);
  const A = {
    perimee: await annonce(u, { runId: vieux, vu: il(39.95), titre: 'Lustre LED deux anneaux' }),
    fraiche: await annonce(u, { runId: neuf, vu: il(0.97), titre: 'Pompe à eau de mer Mercruiser' }),
    rattachee: await annonce(u, { runId: vieux, vu: il(39.95), inv, titre: 'Costume quatre pièces garçon' }),
    sans_releve: await annonce(u, { platform: 'beebs', runId: null, vu: il(50), titre: 'Tapis de chambre enfant' }),
  };
  const d = (await un(`SELECT public.rapprochement_v3_lire($1) AS d`, [u])).d;
  const par = Object.fromEntries((d.annonces ?? []).map((a) => [a.id, a]));
  const plan = passe(d, new Map(), { mode: 'normal' }).decisions;
  return { A, par, plan };
}
// 6. constater_absences_releve : l'ancien compte (6 annonces vues il y a 20 h), puis deux relevés probants.
async function absences({ continuite = false, nbAnciennes = 6 } = {}) {
  const u = await compte();
  const ancien = await run(u, { debut: il(20), fin: il(19.95), vus: nbAnciennes + (continuite ? 1 : 0) });
  const b1 = await run(u, { debut: il(2), fin: il(1.95), vus: 2 });
  const b2 = await run(u, { debut: il(1), fin: il(0.95), vus: 2 });
  const anciennes = [];
  for (let k = 0; k < nbAnciennes; k++) {
    const inv = await fiche(u);
    const j = await job(u, { inv, hb: 'releve-annonces' });
    anciennes.push({ ...(await annonce(u, { lid: j.lid, runId: ancien, vu: il(19.97), cree: il(72), inv, jobId: j.id })), job: j.id });
  }
  await annonce(u, { runId: b2, vu: il(0.97), cree: il(1.9) });                       // le nouveau compte : annonce née après
  if (continuite) await annonce(u, { runId: b2, vu: il(0.97), cree: il(72) });        // une annonce connue, revue : même compte
  else await annonce(u, { runId: b2, vu: il(0.97), cree: il(1.9) });
  await service();
  const r = (await un(`SELECT public.constater_absences_releve($1) AS r`, [b2])).r;
  const disparues = (await un(`SELECT count(*)::int n FROM annonces_plateforme WHERE user_id = $1 AND disparu_le IS NOT NULL`, [u])).n;
  const signaux = (await un(`SELECT count(*)::int n FROM cross_post_jobs WHERE user_id = $1 AND platform_fields->>'sale_signal' = 'unavailable'`, [u])).n;
  const traces = (await un(`SELECT count(*)::int n FROM usage_logs WHERE user_id = $1 AND feature = 'releve_compte_change'`, [u])).n;
  return { r, disparues, signaux, traces, b2, u };
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
  for (const m of LOT) ok(await md5De(m.sig) === m.md5, `${m.sig} = la définition de prod du 08/11 (md5 ${m.md5.slice(0, 8)})`);
  ok((await un(`SELECT value FROM coin_config WHERE key = 'ventes_leboncoin_transaction'`))?.value === 1, 'coin_config de prod : ventes_leboncoin_transaction = 1');

  // ── A. AVANT : les défauts du 08/11 se reproduisent sur les définitions de prod ──
  console.log('\nA. AVANT (définitions de prod)');
  const a1 = await cadence();
  ok(/SYNC_CADENCE/.test(a1.insertion ?? '') && /SYNC_CADENCE/.test(a1.erreurRpc ?? ''),
    'stock vide, dressing lu il y a 5 min : l\'INSERT ET demander_sync_dressing() meurent sur « SYNC_CADENCE » (ce qu\'a vu client-cfdfda6f à 11:01:16)', a1);
  const a2 = await jess();
  ok(a2.verdict === 'annonce_vendue' && a2.trace.some((t) => t.issue === 'vendu_avant_suivi'),
    'Compte-essai-9 : « vendu_avant_suivi » pour les ventes, mais republication_annonce_partie = « annonce_vendue » (refus « annonce_introuvable »)', a2);
  const a3 = await reinitialiser();
  ok(!a3.erreur && a3.reste.fiches === 0 && a3.reste.ventes === 0, '« Réinitialiser » efface fiches et ventes', a3);
  ok(a3.lignes.lbc_publie.status === 'published' && a3.lignes.lbc_publie.inventaire_id === null
     && a3.lignes.beebs_en_file.status === 'pending' && a3.lignes.repub_capturee.status === 'pending',
    '… et laisse les lignes VIVANTES sans fiche : publiée, publication en file (partirait sans fiche), republication « captured »', a3.lignes);
  const a4 = await uneLigne();
  ok(a4.e.publie.status === 'published' && a4.e.repub_pending.status === 'pending' && a4.e.vinted.status === 'published',
    'l\'import qui ramène l\'annonce au stock laisse sa ligne sans fiche « published » (doublon) et la republication orpheline « pending »', a4.e);
  const a5 = await lecture();
  ok(Object.values(a5.par).every((x) => !('perimee' in x)), 'rapprochement_v3_lire ne dit rien de la fraîcheur d\'une annonce');
  ok(a5.plan.some((p) => p.type === 'creer' && p.annonce === a5.A.perimee.id),
    'le moteur crée une fiche pour l\'annonce que le dernier relevé n\'a PAS revue (ce qu\'il a fait à 11:04 et 11:28)', a5.plan);
  const a6 = await absences();
  ok(a6.r.disparues === 6 && a6.disparues === 6 && a6.signaux === 6,
    'nouveau compte (aucune continuité) : les 6 annonces de l\'ancien compte datées disparues, 6 « Vendue ? » posés', a6);

  // ── B. LES MIGRATIONS (deux fois chacune : la garde laisse passer une migration déjà passée) ──
  console.log('\nB. APRÈS les migrations');
  for (const m of LOT) {
    const e1 = await leve(() => appliquer(m)); const e2 = await leve(() => appliquer(m));
    ok(!e1 && !e2, `${m.v}_${m.nom} : appliquée, puis rejouée sans erreur`, e1 ?? e2);
  }
  // B1. Cadence
  const b1 = await cadence();
  ok(!b1.insertion && b1.rpc?.ok === true, 'stock vide : la demande passe (INSERT accepté, demander_sync_dressing → ok)', b1);
  const b1s = await cadence({ stock: true });
  ok(/SYNC_CADENCE/.test(b1s.insertion ?? '') && b1s.rpc?.reason === 'cadence' && Number(b1s.rpc?.prochaine_dans_min) >= 9,
    'un article au stock : la cadence de 15 min tient comme avant (INSERT refusé, RPC « cadence » avec « prochaine_dans_min »)', b1s);
  const b1c = await cadence({ decl: 'cron' });
  ok(/SYNC_CRON_CADENCE/.test(b1c.insertion ?? ''), 'le cron garde sa règle des 20 h, stock vide ou non', b1c);
  // B2. Jess
  const b2 = await jess();
  ok(b2.verdict === null, 'Compte-essai-9 : l\'annonce « vendue avant le suivi », en ligne, se republie (verdict NULL)', b2);
  const b2v = await jess({ avantSuivi: false });
  ok(b2v.verdict === 'annonce_vendue', 'une vente LUE pendant le suivi (aucune → sold) reste « annonce_vendue »', b2v);
  {
    await c.query(`UPDATE annonces_plateforme SET statut_plateforme = 'desactivee', disparu_le = now() WHERE user_id = $1`, [b2.u]);
    const v = (await un(`SELECT public.republication_annonce_partie($1, $2, 'leboncoin', $3) AS v`, [b2.u, b2.inv, b2.j.lid])).v;
    ok(v === 'annonce_vendue', 'la même, plus vue en ligne : le badge redevient une vente (règle d\'avant)', v);
  }
  // B3. Réinitialiser
  const b3 = await reinitialiser();
  const L3 = b3.lignes;
  ok(!b3.erreur && b3.reste.fiches === 0 && b3.reste.ventes === 0, '« Réinitialiser » efface toujours fiches et ventes', b3.erreur);
  ok(['lbc_publie', 'vinted_publie', 'repub_capturee', 'beebs_en_file'].every((k) => L3[k].status === 'cancelled' && L3[k].pf?.reinitialisation?.statut_avant),
    'lignes closes AVANT l\'effacement : publiées, publication en file, republication « captured » (état d\'avant gardé)', L3);
  ok(/restée en ligne, rien n'a été retiré/.test(L3.lbc_publie.error ?? '') && /Rien n'a été retiré ni publié/.test(L3.beebs_en_file.error ?? ''),
    '… avec un texte qui dit pourquoi (annonce restée en ligne / rien publié)', { a: L3.lbc_publie.error, b: L3.beebs_en_file.error });
  ok(L3.repub_engagee.status === 'pending' && L3.retrait.status === 'pending' && L3.vinted_en_cours.status === 'processing' && L3.lbc_vendu.status === 'sold',
    'jamais : la republication engagée (« deleted »), le retrait, la tâche « processing », la ligne vendue', L3);
  ok(b3.reste.deletes === b3.deletesAvant, 'aucun retrait armé (garde fillsell.sans_retrait inchangée)', b3.reste);
  // B4. Une ligne vivante par annonce
  const b4 = await uneLigne();
  const E = b4.e;
  ok(E.publie.status === 'cancelled' && E.publie.pf?.ligne_sans_fiche_close?.remplacee_par === b4.garde.id && E.repub_pending.status === 'cancelled',
    'l\'import (INSERT) clôt la ligne sans fiche publiée ET la republication orpheline du même numéro (trace « remplacee_par »)', E);
  ok(E.vinted.status === 'cancelled' && E.vinted.pf?.ligne_sans_fiche_close?.remplacee_par === b4.gv.id,
    'une ligne rattachée qui DEVIENT publiée (UPDATE) clôt son double sans fiche (Vinted)', E.vinted);
  ok(E.en_cours.status === 'processing' && E.autre_annonce.status === 'published' && E.autreFiche.status === 'published'
     && E.garde.status === 'published' && E.gv.status === 'published',
    'jamais : « processing », une autre annonce, une ligne rattachée (la gardée comprise)', E);
  // B5. Lecture + moteur
  const b5 = await lecture();
  const P = (k) => b5.par[b5.A[k].id]?.perimee;
  ok(P('perimee') === true && P('fraiche') === false && P('rattachee') === true && P('sans_releve') === false,
    'perimee : vraie pour l\'annonce non revue par le dernier relevé terminé ; fausse pour la revue, et sans relevé terminé', { p: P('perimee'), f: P('fraiche'), r: P('rattachee'), s: P('sans_releve') });
  ok(!b5.plan.some((p) => p.type === 'creer' && p.annonce === b5.A.perimee.id) && b5.plan.some((p) => p.type === 'creer' && p.annonce === b5.A.fraiche.id),
    'le moteur ne crée plus de fiche pour l\'annonce « perimee » ; il crée toujours celle de l\'annonce revue', b5.plan);
  // B6. Constater
  const b6 = await absences();
  ok(b6.r.disparues === 0 && b6.r.motif === 'compte_change_ou_vide' && b6.disparues === 0 && b6.signaux === 0 && b6.traces === 1,
    'nouveau compte : aucune annonce datée disparue, aucun « Vendue ? », une trace releve_compte_change', b6);
  await c.query(`SELECT public.constater_absences_releve($1)`, [b6.b2]);
  ok((await un(`SELECT count(*)::int n FROM usage_logs WHERE user_id = $1 AND feature = 'releve_compte_change'`, [b6.u])).n === 1, '… une seule trace par relevé (rappel du même relevé)');
  const b6c = await absences({ continuite: true });
  ok(b6c.r.disparues === 6 && b6c.signaux === 6 && b6c.traces === 0, 'même compte (une annonce connue revue) : les 6 absentes datées comme avant', b6c);
  const b6p = await absences({ nbAnciennes: 4 });
  ok(b6p.r.disparues === 4 && b6p.traces === 0, 'moins de 5 annonces absentes : la règle d\'avant, sans changement', b6p);

  // ── C. LES INVERSES ──
  console.log('\nC. INVERSES');
  for (const m of [...LOT].reverse()) {
    const e = await leve(() => c.query(m.inverse));
    ok(!e && await md5De(m.sig) === m.md5, `${m.v} : l'INVERSE rend ${m.sig} à sa définition de prod (md5)`, e);
  }
  ok((await un(`SELECT count(*)::int n FROM pg_trigger WHERE tgname LIKE 'cross_post_jobs_une_ligne_par_annonce%'`)).n === 0
     && (await un(`SELECT to_regprocedure('public.lignes_sans_fiche_clore(uuid,text,text,uuid,text)') IS NULL AS x`)).x
     && (await un(`SELECT to_regclass('public.cross_post_jobs_sans_fiche_vivantes') IS NULL AS x`)).x,
    'déclencheurs, fonction et index ajoutés retirés');
  const ra = await cadence();
  ok(/SYNC_CADENCE/.test(ra.insertion ?? ''), 'après l\'inverse, le défaut revient (la preuve mesure bien la migration)');
  for (const m of LOT) { const e = await leve(() => appliquer(m)); ok(!e, `${m.v} : se rejoue après son inverse`, e); }
} catch (e) {
  ko++; console.log(`  ✗ ERREUR : ${e.message}\n${e.stack?.split('\n').slice(1, 4).join('\n')}`);
} finally {
  await c.end().catch(() => {});
  if (embarque) { await embarque.pg.stop().catch(() => {}); rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — les cinq migrations du 08/11 prouvées de bout en bout sur un Postgres jetable`);
process.exit(ko ? 1 : 0);
