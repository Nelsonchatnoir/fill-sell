// PREUVE, SUR UN POSTGRES JETABLE, de la migration 20261121120000_retouche_reservee (décision de Nico du 21/11/2026 :
// la retouche est réservée AVANT d'être lancée — plusieurs préparations en même temps ne dépassent plus le quota).
//
//   PREUVE_PG=embarque node scripts/quotas/preuve-retouche-reservee.mjs   (Postgres jetable sur le PC)
//
// Jamais la prod. quotas_etat « avant » = celle de la PROD (scripts/quotas/fixtures/prod-2111-quotas-etat.sql, md5
// 91ce0ea8…) ; ses dépendances (palier, cycle, annonces, remontées) sont des bouchons à valeur fixe.
//   A. Le cas de 0c97dc8b : quota 20, 19 faites, 3 réservations EN MÊME TEMPS (3 connexions) → 1 seule passe.
//   B. Une réservation complétée livrée compte, non livrée ne compte pas ; sans suite depuis 10 min : libérée.
//   C. Une retouche rendue (hors_quota) ne compte plus ; avant la migration, elle comptait.
//   D. quotas_etat dit le même décompte ; une session de l'app ne peut pas réserver ; l'inverse rend la prod à l'octet.
import pg from 'pg';
import { readFileSync } from 'node:fs';

let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-retouche-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55445, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55445/postgres';
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const PROD = lire('./fixtures/prod-2111-quotas-etat.sql');
const MIGRATION = lire('../../supabase/migrations/20261121120000_retouche_reservee.sql');
const INVERSE = lire('../../supabase/rollbacks/20261121120000_retouche_reservee_INVERSE.sql');

const DECOR = String.raw`
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $f$ SELECT NULLIF(current_setting('preuve.role', true), '') $f$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $f$ SELECT NULLIF(current_setting('preuve.uid', true), '')::uuid $f$;
CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE anon;
CREATE TABLE public.usage_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, feature text, metadata jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.coin_config (key text PRIMARY KEY, value numeric);
CREATE TABLE public.coin_wallets (user_id uuid PRIMARY KEY, next_grant_at timestamptz);
INSERT INTO public.coin_config VALUES ('quota_retouche_pro', 20), ('quotas_retouche_depuis', 0), ('quota_scan_pro', 0);
CREATE OR REPLACE FUNCTION public.palier_de(u uuid) RETURNS text LANGUAGE sql AS $f$ SELECT 'pro'::text $f$;
CREATE OR REPLACE FUNCTION public.debut_cycle_quotas(u uuid) RETURNS timestamptz LANGUAGE sql AS $f$ SELECT now() - interval '10 days' $f$;
CREATE OR REPLACE FUNCTION public.jauge_annonces_plafond(u uuid, t text) RETURNS integer LANGUAGE sql AS $f$ SELECT 120 $f$;
CREATE OR REPLACE FUNCTION public.quota_annonces_consommees(u uuid, c timestamptz) RETURNS integer LANGUAGE sql AS $f$ SELECT 0 $f$;
CREATE OR REPLACE FUNCTION public.jauges_actives() RETURNS boolean LANGUAGE sql AS $f$ SELECT false $f$;
CREATE OR REPLACE FUNCTION public.quota_remontees_plafond(t text) RETURNS integer LANGUAGE sql AS $f$ SELECT 50 $f$;
CREATE OR REPLACE FUNCTION public.remontees_du_cycle(u uuid, c timestamptz) RETURNS integer LANGUAGE sql AS $f$ SELECT 0 $f$;
CREATE OR REPLACE FUNCTION public.quota_republication_free_etat(u uuid) RETURNS jsonb LANGUAGE sql AS $f$ SELECT '{}'::jsonb $f$;
CREATE OR REPLACE FUNCTION public.jauge_publications_plafond(t text) RETURNS integer LANGUAGE sql AS $f$ SELECT NULL::integer $f$;
CREATE OR REPLACE FUNCTION public.publications_du_cycle(u uuid, c timestamptz) RETURNS integer LANGUAGE sql AS $f$ SELECT 0 $f$;
CREATE OR REPLACE FUNCTION public.jauge_lens_plafond(t text) RETURNS integer LANGUAGE sql AS $f$ SELECT NULL::integer $f$;
`;
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let echecs = 0, n = 0;
const ok = (c, m, d = '') => { n++; console.log(`  ${c ? '✓' : '✗'} ${m}${c || !d ? '' : `   ← ${d}`}`); if (!c) echecs++; };
const client = new pg.Client({ connectionString: PG_URL });
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;
const un = async (sql, params = []) => (await q(sql, params))[0];
const ligne = (u, meta, minutes = 60) => q(`INSERT INTO usage_logs (user_id, feature, metadata, created_at) VALUES ($1, 'photo_retouche', $2::jsonb, now() - ($3::text || ' minutes')::interval)`, [u, JSON.stringify(meta), String(minutes)]);
const etatRetouches = async (u) => { await q(`SELECT set_config('preuve.uid', $1, false)`, [u]); const r = (await un(`SELECT public.quotas_etat() AS e`)).e; await q(`SELECT set_config('preuve.uid', '', false)`); return r?.retouches?.consommes; };
const md5QE = async () => (await un(`SELECT md5(pg_get_functiondef('public.quotas_etat()'::regprocedure)) AS m`)).m;

try {
  await q(DECOR);
  await q(PROD);
  const m0 = await md5QE();
  ok(m0 === '91ce0ea8ff31c2e3c9e1e929a3ddc66e', 'décor : quotas_etat de PROD, à l\'octet près', m0);
  const M = U(1);
  for (let i = 0; i < 19; i++) await ligne(M, { delivered: true, level: 'ia_light' }, 120 + i);
  const R = U(2);   // une retouche rendue au client
  for (let i = 0; i < 3; i++) await ligne(R, { delivered: true }, 200 + i);
  await ligne(R, { delivered: true, hors_quota: { motif: 'rendue', le: '2026-11-21' } }, 300);
  const avantR = await etatRetouches(R);
  ok(avantR === 4, 'AVANT : la retouche rendue compte encore (4)', `lu ${avantR}`);

  await q(MIGRATION);
  console.log('A. trois réservations EN MÊME TEMPS, quota 20, 19 faites');
  const clients = await Promise.all([0, 1, 2].map(async () => { const c = new pg.Client({ connectionString: PG_URL }); await c.connect(); return c; }));
  const res = await Promise.all(clients.map((c) => c.query(`SELECT public.reserver_retouche($1, 20, now() - interval '10 days', '{"level":"ia_light"}'::jsonb) AS r`, [M]).then((x) => x.rows[0].r)));
  await Promise.all(clients.map((c) => c.end()));
  const passes = res.filter((r) => r.allowed);
  ok(passes.length === 1 && res.filter((r) => !r.allowed && r.reason === 'quota_retouche_atteint').length === 2,
    '1 seule passe (la 20e), 2 refusées « quota_retouche_atteint » — avant : les 3 partaient (22 pour 20)', JSON.stringify(res));
  ok((await un(`SELECT public.retouches_consommees($1, now() - interval '10 days') AS c`, [M])).c === 20, 'la réservation compte tout de suite : 20');

  console.log('B. la réservation complétée, et celle restée sans suite');
  await q(`UPDATE usage_logs SET metadata = '{"level":"ia_light","delivered":true,"cost_usd":0.01}'::jsonb WHERE id = $1`, [passes[0].id]);
  ok((await un(`SELECT public.retouches_consommees($1, now() - interval '10 days') AS c`, [M])).c === 20, 'complétée livrée : compte (20)');
  const L = U(3);
  const r1 = (await un(`SELECT public.reserver_retouche($1, 5, now() - interval '10 days') AS r`, [L])).r;
  await q(`UPDATE usage_logs SET metadata = '{"delivered":false}'::jsonb WHERE id = $1`, [r1.id]);
  ok((await un(`SELECT public.retouches_consommees($1, now() - interval '10 days') AS c`, [L])).c === 0, 'complétée NON livrée (panne, échéance) : ne compte pas — règle du 01/10');
  await ligne(L, { reservee: true, reservee_le: 'x' }, 11);
  await ligne(L, { reservee: true, reservee_le: 'y' }, 2);
  ok((await un(`SELECT public.retouches_consommees($1, now() - interval '10 days') AS c`, [L])).c === 1, 'réservation sans suite depuis 11 min : libérée ; depuis 2 min : compte (1)');

  console.log('C. la retouche rendue');
  ok((await un(`SELECT public.retouches_consommees($1, now() - interval '10 days') AS c`, [R])).c === 3, 'APRÈS : la retouche rendue ne compte plus (3)');

  console.log('D. quotas_etat, droits, inverse');
  ok((await etatRetouches(M)) === 20 && (await etatRetouches(R)) === 3 && (await etatRetouches(L)) === 1, 'quotas_etat dit le même décompte (20, 3, 1)');
  await q(`SELECT set_config('preuve.role', 'authenticated', false)`);
  let refuse = false;
  try { await q(`SELECT public.reserver_retouche($1, 99, now() - interval '10 days')`, [L]); } catch (e) { refuse = /réservé au serveur/.test(e.message); }
  await q(`SELECT set_config('preuve.role', '', false)`);
  ok(refuse, 'une session de l\'app ne réserve jamais (seul le serveur)');
  const droits = await q(`SELECT p.proname, array_to_string(p.proacl, ',') acl FROM pg_proc p WHERE p.proname IN ('reserver_retouche','retouches_consommees') ORDER BY 1`);
  ok(droits.every((d) => /service_role=X/.test(d.acl) && !/authenticated=X|anon=X|(^|,)=X/.test(d.acl)), 'EXECUTE : service_role seulement', JSON.stringify(droits));
  const nil = (await un(`SELECT public.reserver_retouche($1, NULL, now() - interval '10 days') AS r`, [U(9)])).r;
  ok(nil.allowed === true, 'sans quota configuré (clé absente) : la réservation passe, comme avant (fail-open)');
  await q(INVERSE);
  ok((await md5QE()) === m0 && !(await un(`SELECT to_regprocedure('public.reserver_retouche(uuid,integer,timestamptz,jsonb)') AS f`)).f, 'l\'inverse rend quotas_etat de prod à l\'octet près, et retire les deux fonctions');
} catch (e) {
  echecs++;
  console.error('ERREUR :', e.message);
} finally {
  await client.end().catch(() => {});
  if (embarque) { await embarque.pg.stop().catch(() => {}); try { embarque.rmSync(embarque.dossier, { recursive: true, force: true }); } catch { /* rien */ } }
}
console.log(`\n${n - echecs}/${n} ${echecs ? '— ROUGE' : '— vert'}`);
process.exit(echecs ? 1 : 0);
