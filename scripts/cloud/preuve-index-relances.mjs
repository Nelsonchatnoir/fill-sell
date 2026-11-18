// PREUVE SUR BASE JETABLE (Postgres embarqué, jamais la prod) — migration 20261118220000 (index one-shot des relances
// Cloud + index_one_shot_types) et son retour arrière. Usage : node scripts/cloud/preuve-index-relances.mjs
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const { default: EmbeddedPostgres } = await import(pathToFileURL(require.resolve('embedded-postgres')).href);
const lire = (f) => readFileSync(fileURLToPath(new URL(`../../supabase/${f}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = lire('migrations/20261118220000_email_logs_index_relances_cloud.sql');
const INVERSE = lire('rollbacks/20261118220000_email_logs_index_relances_cloud_INVERSE.sql');
// La définition de la PROD, lue le 18/11/2026 (pg_get_indexdef), mot pour mot.
const DEF_PROD = "CREATE UNIQUE INDEX email_logs_one_shot_unique ON public.email_logs USING btree (user_id, email_type) WHERE (email_type = ANY (ARRAY['welcome'::text, 'how_it_works'::text, 'blast_relaunch_aout'::text, 'blast_founder'::text, 'founder_plan'::text, 'voice_conversion'::text, 'blast_sync_dressing'::text, 'reactiv_1409_a'::text, 'reactiv_1409_b'::text, 'reactiv_1409_c'::text, 'reactiv_1409_d'::text, 'extension_link_rattrapage'::text, 'stock_pret_2309'::text, 'blast_rentree_fillsell50_2609'::text, 'cloud_essai_veille'::text, 'annonce_formules_cloud'::text]))";
const DEF_APRES = DEF_PROD.replace("'annonce_formules_cloud'::text]", "'annonce_formules_cloud'::text, 'cloud_relance_arret'::text, 'cloud_relance_essai'::text]");
const listeDe = (sql) => [...sql.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);

const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-relances-'));
const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55442, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} });
let echecs = 0;
const ok = (c, m) => { console.log(`${c ? 'ok   ' : 'ÉCHEC'} ${m}`); if (!c) echecs++; };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
try {
  await base.initialise();
  await base.start();
  const c = new pg.Client({ connectionString: 'postgres://postgres:preuve@127.0.0.1:55442/postgres' });
  await c.connect();
  const q = (s, v) => c.query(s, v);
  const def = async () => (await q("select indexdef from pg_indexes where schemaname='public' and indexname='email_logs_one_shot_unique'")).rows[0]?.indexdef;
  const inserer = async (u, t) => { try { await q('insert into public.email_logs (user_id, email_type, email) values ($1, $2, $3)', [u, t, 'x@exemple.fr']); return 'ok'; } catch (e) { return e.code; } };
  await q('create role service_role'); await q('create role anon'); await q('create role authenticated');
  await q('create table public.email_logs (id bigserial primary key, user_id uuid, email_type text not null, sent_at timestamptz default now(), email text)');
  await q(DEF_PROD.replace('CREATE UNIQUE INDEX', 'create unique index'));
  ok((await def()) === DEF_PROD, 'décor : index identique à la prod');
  const avant = listeDe(DEF_PROD.replace(/::text/g, ''));
  ok(JSON.stringify(listeDe(MIGRATION.replace(/^--.*$/gm, '').split('array[')[1].split(']);')[0])) === JSON.stringify([...avant, 'cloud_relance_arret', 'cloud_relance_essai']), 'migration = liste de la prod + les deux types, rien d\'autre');
  ok(JSON.stringify(listeDe(INVERSE.replace(/^--.*$/gm, '').split('array[')[1].split(']);')[0])) === JSON.stringify(avant), 'retour arrière = liste de la prod, exactement');
  ok((await inserer(U(1), 'cloud_relance_arret')) === 'ok' && (await inserer(U(1), 'cloud_relance_arret')) === 'ok', 'avant : deux relances au même compte PASSENT (le risque)');
  await q("delete from public.email_logs where email_type like 'cloud_relance%'");
  await inserer(U(2), 'welcome');
  await q(MIGRATION); await q(MIGRATION);
  ok((await def()) === DEF_APRES, 'après migration (jouée deux fois) : la prod + les deux types');
  ok((await inserer(U(3), 'cloud_relance_arret')) === 'ok' && (await inserer(U(3), 'cloud_relance_arret')) === '23505', 'après : la 2e relance « arrêt » au même compte est REFUSÉE (23505)');
  ok((await inserer(U(3), 'cloud_relance_essai')) === 'ok' && (await inserer(U(3), 'cloud_relance_essai')) === '23505', 'après : idem pour la relance « essai » ; les deux types ne se bloquent pas entre eux');
  ok((await inserer(U(4), 'cloud_relance_arret')) === 'ok', 'après : un autre compte reçoit la sienne');
  ok((await inserer(U(2), 'welcome')) === '23505', 'après : les anciens types restent protégés');
  const t = (await q('select public.index_one_shot_types() as t')).rows[0].t;
  ok(t.includes('cloud_relance_arret') && t.includes('cloud_relance_essai') && t.includes('welcome') && t.length === avant.length + 2, 'index_one_shot_types() rend exactement les types de l\'index');
  const droit = async (r) => (await q('select has_function_privilege($1, \'public.index_one_shot_types()\', \'execute\') as a', [r])).rows[0].a;
  ok((await droit('service_role')) === true && (await droit('anon')) === false && (await droit('authenticated')) === false, 'droits : service_role seulement');
  await q(INVERSE);
  ok((await def()) === DEF_PROD, 'retour arrière : index EXACTEMENT comme en prod');
  ok((await q("select count(*)::int n from pg_proc where proname='index_one_shot_types'")).rows[0].n === 0, 'retour arrière : la fonction est retirée');
  ok((await q("select count(*)::int n from public.email_logs where email_type like 'cloud_relance%'")).rows[0].n === 3, 'retour arrière : aucune ligne supprimée');
  await c.end();
} catch (e) { console.log(`ÉCHEC exception : ${e.message}`); echecs++; }
finally { try { await base.stop(); } catch { /* arrêtée */ } rmSync(dossier, { recursive: true, force: true }); }
console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est vert');
process.exit(echecs ? 1 : 0);
