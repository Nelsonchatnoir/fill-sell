// PREUVE SUR BASE JETABLE (Postgres embarqué, jamais la prod) — migration 20261112120000 (index one-shot du mail
// d'annonce des formules avec Cloud) et son retour arrière. Usage : node scripts/essais/20261112120000_banc.mjs (écrit par le terminal MARKETING, repris dans le dépôt le 12/11)
// Décision de Nico (03/11) : plus jamais d'« essai à blanc » sur la prod ; (12/11) : base jetable OK, feu vert avant prod.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const { default: EmbeddedPostgres } = await import(pathToFileURL(require.resolve('embedded-postgres')).href);
const ICI = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lire = (f) => readFileSync(join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = lire('../../supabase/migrations/20261112120000_email_logs_index_annonce_formules_cloud.sql');
const INVERSE = lire('../../supabase/rollbacks/20261112120000_email_logs_index_annonce_formules_cloud_INVERSE.sql');
// La définition de la PROD, lue le 12/11/2026 (pg_indexes), mot pour mot.
const DEF_PROD = "CREATE UNIQUE INDEX email_logs_one_shot_unique ON public.email_logs USING btree (user_id, email_type) WHERE (email_type = ANY (ARRAY['welcome'::text, 'how_it_works'::text, 'blast_relaunch_aout'::text, 'blast_founder'::text, 'founder_plan'::text, 'voice_conversion'::text, 'blast_sync_dressing'::text, 'reactiv_1409_a'::text, 'reactiv_1409_b'::text, 'reactiv_1409_c'::text, 'reactiv_1409_d'::text, 'extension_link_rattrapage'::text, 'stock_pret_2309'::text, 'blast_rentree_fillsell50_2609'::text, 'cloud_essai_veille'::text]))";
const DEF_APRES = DEF_PROD.replace("'cloud_essai_veille'::text]", "'cloud_essai_veille'::text, 'annonce_formules_cloud'::text]");
const listeDe = (sql) => [...sql.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);

const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-index-'));
const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55441, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} });
let echecs = 0;
const ok = (c, m) => { console.log(`${c ? 'ok   ' : 'ÉCHEC'} ${m}`); if (!c) echecs++; };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
try {
  await base.initialise();
  await base.start();
  const c = new pg.Client({ connectionString: 'postgres://postgres:preuve@127.0.0.1:55441/postgres' });
  await c.connect();
  const q = (s, v) => c.query(s, v);
  const def = async () => (await q("select indexdef from pg_indexes where schemaname='public' and indexname='email_logs_one_shot_unique'")).rows[0]?.indexdef;
  const inserer = async (u, t) => { try { await q('insert into public.email_logs (user_id, email_type, email) values ($1, $2, $3)', [u, t, 'x@exemple.fr']); return 'ok'; } catch (e) { return e.code; } };

  // Le décor : la table et l'index TELS QU'EN PROD.
  await q('create table public.email_logs (id bigserial primary key, user_id uuid, email_type text not null, sent_at timestamptz default now(), email text)');
  await q(DEF_PROD.replace('CREATE UNIQUE INDEX', 'create unique index'));
  ok((await def()) === DEF_PROD, 'décor : index identique à la prod');
  const avantTypes = listeDe(DEF_PROD.replace(/::text/g, ''));
  ok(JSON.stringify(listeDe(MIGRATION.split('array[').pop())) === JSON.stringify([...avantTypes, 'annonce_formules_cloud']), 'migration = liste de la prod + annonce_formules_cloud, rien d\'autre (même ordre)');
  ok(JSON.stringify(listeDe(INVERSE.split('array[').pop())) === JSON.stringify(avantTypes), 'retour arrière = liste de la prod, exactement');

  // AVANT : le type neuf n'est pas protégé (c'est le risque).
  ok((await inserer(U(1), 'annonce_formules_cloud')) === 'ok' && (await inserer(U(1), 'annonce_formules_cloud')) === 'ok', 'avant : deux annonces au même compte PASSENT (doublon invisible)');
  await q("delete from public.email_logs where email_type = 'annonce_formules_cloud'");
  await inserer(U(2), 'welcome');
  await inserer(U(2), 'job_pending_relaunch');

  // La migration, forme rejouée par une base neuve, deux fois (idempotence).
  await q(MIGRATION);
  await q(MIGRATION);
  ok((await def()) === DEF_APRES, 'après migration (jouée deux fois) : la prod + annonce_formules_cloud');
  ok((await inserer(U(3), 'annonce_formules_cloud')) === 'ok' && (await inserer(U(3), 'annonce_formules_cloud')) === '23505', 'après : la seconde annonce au même compte est REFUSÉE (23505)');
  ok((await inserer(U(4), 'annonce_formules_cloud')) === 'ok', 'après : un autre compte reçoit la sienne');
  ok((await inserer(U(2), 'welcome')) === '23505', 'après : les anciens types restent protégés (welcome)');
  ok((await inserer(U(2), 'job_pending_relaunch')) === 'ok', 'après : un type récurrent n\'est pas touché');

  // Le retour arrière.
  await q(INVERSE);
  ok((await def()) === DEF_PROD, 'retour arrière : index EXACTEMENT comme en prod');
  ok((await q("select count(*)::int n from public.email_logs where email_type='annonce_formules_cloud'")).rows[0].n === 2, 'retour arrière : aucune ligne supprimée');

  // La forme PROD (CONCURRENTLY, hors transaction, trois ordres séparés), puis son retour arrière.
  const liste = (types) => types.map((t) => `'${t}'`).join(', ');
  await q(`create unique index concurrently email_logs_one_shot_unique_v2 on public.email_logs (user_id, email_type) where email_type = any (array[${liste([...avantTypes, 'annonce_formules_cloud'])}])`);
  await q('drop index concurrently public.email_logs_one_shot_unique');
  await q('alter index public.email_logs_one_shot_unique_v2 rename to email_logs_one_shot_unique');
  ok((await def()) === DEF_APRES, 'forme prod (concurrently) : même résultat que la migration');
  await q(`create unique index concurrently email_logs_one_shot_unique_v1 on public.email_logs (user_id, email_type) where email_type = any (array[${liste(avantTypes)}])`);
  await q('drop index concurrently public.email_logs_one_shot_unique');
  await q('alter index public.email_logs_one_shot_unique_v1 rename to email_logs_one_shot_unique');
  ok((await def()) === DEF_PROD, 'retour arrière forme prod (concurrently) : index EXACTEMENT comme en prod');
  await c.end();
} catch (e) {
  console.log(`ÉCHEC exception : ${e.message}`);
  echecs++;
} finally {
  try { await base.stop(); } catch { /* déjà arrêtée */ }
  rmSync(dossier, { recursive: true, force: true });
}
console.log(`\npreuve index annonce_formules_cloud : ${echecs ? `${echecs} ÉCHEC(S)` : 'tout vert'} (base jetable, supprimée)`);
process.exit(echecs ? 1 : 0);
