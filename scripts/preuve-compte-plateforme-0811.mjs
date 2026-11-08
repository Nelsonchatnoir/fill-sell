// PREUVE DE BOUT EN BOUT, SUR UN POSTGRES JETABLE, de la migration 20261108190000_compte_plateforme_releve (08/11 soir,
// point 3 de Nico — ayadi007 : « savoir quel compte Leboncoin est connecté ») — jamais la prod.
//   PREUVE_PG=embarque node scripts/preuve-compte-plateforme-0811.mjs                       (Postgres 17 jetable sur le PC)
//   PREUVE_PG=embarque node scripts/preuve-compte-plateforme-0811.mjs --catalogue <f.json>  (catalogue déjà lu, hors ligne)
// Banc repris de scripts/preuve-ayadi-0811.mjs (schéma public DE PROD lu en lecture seule, catalogue système seulement).
// A. AVANT : un compte changé avec moins de 5 annonces fait des « Vendue ? » ; B. la migration : comptes connus jamais
// mélangés, même compte = règle d'avant ; C. l'INVERSE rend la définition de prod (md5) et retire les colonnes.
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
  { v: '20261108190000', nom: 'compte_plateforme_releve', sig: 'public.constater_absences_releve(uuid)', md5: 'c21ea346968770991dad85ea9c36b70e' },
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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-compte-0811-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55488, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55488/postgres';
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

// ── LES SCÉNARIOS (chacun sur un compte FillSell neuf) ─────────────────────────────────────────────────────────────
const avecCompte = async (table, idL, compteP) => {
  if (compteP === null) return;
  await c.query(`UPDATE public.${table} SET compte_plateforme = $2 WHERE id = $1`, [idL, compteP]);
};
// L'ancien compte (nbAnciennes annonces vues il y a 20 h, une fiche et un dépôt publié chacune), puis deux relevés
// probants (b1, b2) qui voient chacun 2 annonces neuves. `comptes` : { ancien, b1, b2 } (null = inconnu).
async function scenario({ nbAnciennes = 6, comptes = { ancien: null, b1: null, b2: null }, colonnes = true, continuite = false } = {}) {
  const u = await compte();
  const ancien = await run(u, { debut: il(20), fin: il(19.95), vus: nbAnciennes });
  const b1 = await run(u, { debut: il(2), fin: il(1.95), vus: 2 });
  const b2 = await run(u, { debut: il(1), fin: il(0.95), vus: 2 });
  if (colonnes) { await avecCompte('vinted_sync_runs', ancien, comptes.ancien); await avecCompte('vinted_sync_runs', b1, comptes.b1); await avecCompte('vinted_sync_runs', b2, comptes.b2); }
  for (let k = 0; k < nbAnciennes; k++) {
    const inv = await fiche(u);
    const j = await job(u, { inv, hb: 'releve-annonces' });
    const a = await annonce(u, { lid: j.lid, runId: ancien, vu: il(19.97), cree: il(72), inv, jobId: j.id });
    if (colonnes) await avecCompte('annonces_plateforme', a.id, comptes.ancien);
  }
  for (const rb of [b1, b2]) {
    const a = await annonce(u, { runId: rb, vu: rb === b1 ? il(1.97) : il(0.97), cree: il(1.99) });
    if (colonnes) await avecCompte('annonces_plateforme', a.id, rb === b1 ? comptes.b1 : comptes.b2);
  }
  if (continuite) { const a = await annonce(u, { runId: b2, vu: il(0.97), cree: il(72) }); if (colonnes) await avecCompte('annonces_plateforme', a.id, comptes.b2); }
  await service();
  const r = (await un(`SELECT public.constater_absences_releve($1) AS r`, [b2])).r;
  const disparues = (await un(`SELECT count(*)::int n FROM annonces_plateforme WHERE user_id = $1 AND disparu_le IS NOT NULL`, [u])).n;
  const signaux = (await un(`SELECT count(*)::int n FROM cross_post_jobs WHERE user_id = $1 AND platform_fields->>'sale_signal' = 'unavailable'`, [u])).n;
  const autre = (await un(`SELECT count(*)::int n FROM usage_logs WHERE user_id = $1 AND feature = 'releve_autre_compte'`, [u])).n;
  const change = (await un(`SELECT count(*)::int n FROM usage_logs WHERE user_id = $1 AND feature = 'releve_compte_change'`, [u])).n;
  return { r, disparues, signaux, autre, change, b2, u };
}

try {
  console.log(`\n0. La base jetable porte le schéma public de prod (lu le ${catalogue.lu_le})`);
  const b = await construire();
  if (bavard) for (const e of b.echecs) console.log(`    · ${e}`);
  ok(b.nf >= catalogue.fonctions.length - 5, `fonctions de prod créées : ${b.nf}/${catalogue.fonctions.length}`, b.echecs.filter((e) => e.startsWith('fonction')).join(' | '));
  const manquantes = (await tous(`SELECT f FROM unnest($1::text[]) f WHERE NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = f AND p.pronamespace = 'public'::regnamespace)`, [CHAINE_FONCTIONS])).map((r) => r.f);
  ok(manquantes.length === 0, `les fonctions de la chaîne sont là (définitions de prod)`, manquantes.join(', '));
  ok(b.ntChaine > 0 && b.ntChaineOk === b.ntChaine, `déclencheurs de prod des tables de la chaîne : ${b.ntChaineOk}/${b.ntChaine}`, b.echecs.filter((e) => e.startsWith('déclencheur')).join(' | '));
  for (const m of LOT) ok(await md5De(m.sig) === m.md5, `${m.sig} = la définition de prod du 08/11 18:20 (md5 ${m.md5.slice(0, 8)})`);

  console.log('\nA. AVANT (définition de prod, aucune colonne de compte)');
  const a1 = await scenario({ nbAnciennes: 3, colonnes: false });
  ok(a1.r.disparues === 3 && a1.signaux === 3, 'compte changé avec 3 annonces sur l\'ancien : 3 datées disparues, 3 « Vendue ? » (l\'heuristique exige 5)', a1);
  const a2 = await scenario({ nbAnciennes: 6, colonnes: false });
  ok(a2.r.disparues === 0 && a2.r.motif === 'compte_change_ou_vide', 'avec 6 : rien de daté (heuristique du 08/11 midi)', a2);

  console.log('\nB. LA MIGRATION (appliquée deux fois)');
  for (const m of LOT) {
    let e = await leve(() => appliquer(m));
    ok(!e, `${m.v} appliquée`, e);
    e = await leve(() => appliquer(m));
    ok(!e, `${m.v} rejouée sans erreur (idempotente)`, e);
  }
  const cols = await tous(`SELECT table_name, column_name FROM information_schema.columns WHERE column_name = 'compte_plateforme' ORDER BY 1`);
  ok(cols.map((x) => x.table_name).join() === 'annonces_plateforme,vinted_sync_runs', 'les deux colonnes existent (NULL partout : aucune donnée réécrite)', cols);
  const b1 = await scenario({ nbAnciennes: 3, comptes: { ancien: 'A', b1: 'B', b2: 'B' } });
  ok(b1.r.disparues === 0 && b1.disparues === 0 && b1.signaux === 0 && b1.autre === 1 && b1.r.annonces_autre_compte === 3,
    'compte changé PROUVÉ (A puis B), 3 annonces sur A : aucune datée, aucun « Vendue ? », une trace releve_autre_compte', b1);
  await c.query(`SELECT public.constater_absences_releve($1)`, [b1.b2]);
  ok((await un(`SELECT count(*)::int n FROM usage_logs WHERE user_id = $1 AND feature = 'releve_autre_compte'`, [b1.u])).n === 1, '… une seule trace par relevé');
  const b2 = await scenario({ nbAnciennes: 6, comptes: { ancien: 'A', b1: 'A', b2: 'A' }, continuite: true });
  ok(b2.r.disparues === 6 && b2.signaux === 6 && b2.autre === 0,
    'même compte connu (A, A, A), une annonce connue revue, 6 absentes : datées comme avant (la règle d\'absence n\'est pas affaiblie)', b2);
  const b2b = await scenario({ nbAnciennes: 6, comptes: { ancien: 'A', b1: 'A', b2: 'A' } });
  ok(b2b.r.motif === 'compte_change_ou_vide' && b2b.disparues === 0 && b2b.change === 1,
    'même compte connu, tout vidé d\'un coup (aucune continuité) : l\'heuristique du 08/11 midi joue comme avant (aucun « Vendue ? » en série)', b2b);
  const b3 = await scenario({ nbAnciennes: 3, comptes: { ancien: null, b1: null, b2: null } });
  ok(b3.r.disparues === 3 && b3.signaux === 3 && b3.autre === 0, 'compte inconnu partout (ancien poste) : la règle d\'avant, à l\'identique', b3);
  const b4 = await scenario({ nbAnciennes: 3, comptes: { ancien: null, b1: 'B', b2: 'B' } });
  ok(b4.r.disparues === 3 && b4.autre === 0, 'annonces d\'avant la 0.6.182 (compte inconnu) : la règle d\'avant (l\'heuristique du 08/11 midi les protège à partir de 5)', b4);
  const b5 = await scenario({ nbAnciennes: 3, comptes: { ancien: 'A', b1: 'A', b2: 'B' } });
  ok(b5.r.motif === 'second_releve_attendu' && b5.disparues === 0,
    'deux relevés de comptes différents (A puis B) ne forment jamais une paire : rien de daté', b5);
  const b6 = await scenario({ nbAnciennes: 6, comptes: { ancien: 'A', b1: 'B', b2: 'B' } });
  ok(b6.disparues === 0 && b6.signaux === 0, 'compte changé prouvé avec 6 annonces : rien de daté non plus', b6);

  console.log('\nC. L\'INVERSE');
  for (const m of [...LOT].reverse()) {
    const e = await leve(() => c.query(m.inverse));
    ok(!e && await md5De(m.sig) === m.md5, `${m.v} : l'INVERSE rend ${m.sig} à sa définition de prod (md5)`, e);
  }
  ok((await un(`SELECT count(*)::int n FROM information_schema.columns WHERE column_name = 'compte_plateforme'`)).n === 0, 'les deux colonnes retirées');
  const c1 = await scenario({ nbAnciennes: 3, colonnes: false });
  ok(c1.r.disparues === 3, 'après l\'inverse, le comportement d\'avant revient (la preuve mesure bien la migration)', c1);
  for (const m of LOT) { const e = await leve(() => appliquer(m)); ok(!e, `${m.v} : se rejoue après son inverse`, e); }
} catch (e) {
  ko++; console.log(`  ✗ ERREUR : ${e.message}\n${e.stack?.split('\n').slice(1, 4).join('\n')}`);
} finally {
  await c.end().catch(() => {});
  if (embarque) { await embarque.pg.stop().catch(() => {}); rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — 20261108190000 (compte de la plateforme relevé) prouvée de bout en bout sur un Postgres jetable`);
process.exit(ko ? 1 : 0);
