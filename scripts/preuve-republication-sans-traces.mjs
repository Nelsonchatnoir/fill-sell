// PREUVE, SUR UN POSTGRES JETABLE, de la migration 20261104210000_republication_sans_traces_de_retrait (04/11, point 1) :
// une republication neuve n'hérite d'aucune trace de retrait du dépôt précédent.
//
//   PREUVE_PG=embarque node scripts/preuve-republication-sans-traces.mjs   (Postgres 17 jetable sur le PC)
//
// Jamais la prod. La migration s'applique EN ENTIER (BEGIN … COMMIT) ; spend_coins_and_republish (définition de prod)
// est compilée par plpgsql (ses deux types de ligne existent ici ; ses autres tables — quotas, file — ne sont pas
// recréées, elle n'est pas exécutée) : ce qui est prouvé, c'est la règle `republication_sans_traces` sur les
// platform_fields RÉELS du 03/11, son branchement dans la copie, ses droits, et l'inverse.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { TRACES_DE_RETRAIT_RE } from '../supabase/functions/_shared/retenue-creneau.js';

let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-traces-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55443, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55443/postgres';
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
let ko = 0, n = 0;
const ok = (cond, msg, detail) => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${detail ? `\n      ${String(detail).slice(0, 600)}` : ''}`); } };

try {
  await c.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
  END $$;`);
  // Les deux types de ligne que déclare la fonction : le corps est alors COMPILÉ par plpgsql à la création (syntaxe,
  // déclarations), sans que ses autres tables existent.
  await c.query(`CREATE TABLE public.coin_wallets (user_id uuid PRIMARY KEY, balance integer);
    CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY, user_id uuid, inventaire_id bigint, platform text, action text, status text,
      photo_option text, title text, description text, price numeric, photos jsonb, listing_url text, platform_listing_id text,
      platform_fields jsonb, created_at timestamptz, published_at timestamptz);`);
  await c.query(lire('../supabase/migrations/20261104210000_republication_sans_traces_de_retrait.sql'));

  console.log('1. La règle sur les platform_fields réels de la source du Pyjama (03/11, avant déblocage)');
  // Les clés de la republication d01df8b1 (18-19/10), source de c10e8d1a : dépôt + traces.
  const source = {
    beebsCategory: 'Pyjamas', beebsAspects: { Taille: '36 mois' }, adresse: { cp: '00000' }, republish_prevol_formulaire: { ok: true },
    preuve_identifiant_beebs: { numero: '34199633' }, vinted_item_id: null,
    republish_suppression_envoyee: { annonce: '34174560', at: '2026-10-18T14:59:30Z' }, suppression_non_prouvee: { n: 1 },
    preuve_retrait: { numero: '34174560' }, republish_retrait: { le: '2026-10-19T19:27:00Z' }, retenue_levee_le: '2026-10-19T19:30:00Z',
    retenue_hors_ligne: { job: 'x' }, recreation_attente_depuis: 'x', recreation_verifiee: {}, recreated_at: 'x', deleted_at: 'x',
    deleted_at_client: 'x', old_platform_listing_id: '34174560', new_listing_url: 'x', orphan_alerted_at: 'x', error_technique: { brut: 'x' },
    retrait_arme: true, republish_etat_indetermine_leve: 'x', republish_reprise_apres_suppression: {}, deja_absente: {}, delete_trace: [],
  };
  const r = (await c.query('SELECT public.republication_sans_traces($1::jsonb) AS pf', [JSON.stringify(source)])).rows[0].pf;
  const gardees = Object.keys(r).sort();
  ok(JSON.stringify(gardees) === JSON.stringify(['adresse', 'beebsAspects', 'beebsCategory', 'preuve_identifiant_beebs', 'republish_prevol_formulaire', 'vinted_item_id']),
    'seuls les champs de dépôt passent', gardees.join(', '));
  const attendu = Object.fromEntries(Object.entries(source).filter(([k]) => !TRACES_DE_RETRAIT_RE.test(k)));
  ok(JSON.stringify(Object.keys(attendu).sort()) === JSON.stringify(gardees), 'la base et le miroir JS (TRACES_DE_RETRAIT_RE) gardent les mêmes clés');
  ok(JSON.stringify(r.beebsAspects) === JSON.stringify(source.beebsAspects) && r.vinted_item_id === null, 'les valeurs gardées sont intactes (null compris)');
  ok(JSON.stringify((await c.query(`SELECT public.republication_sans_traces('[1]'::jsonb) a, public.republication_sans_traces(NULL) b`)).rows[0])
    === JSON.stringify({ a: {}, b: {} }), 'un pf illisible ou vide donne {} (jamais d\'erreur)');

  console.log('2. Le branchement et les droits');
  const def = (await c.query(`SELECT pg_get_functiondef('public.spend_coins_and_republish(bigint,text,text,numeric,text)'::regprocedure) d`)).rows[0].d;
  ok(/v_pf_src := public\.republication_sans_traces\(COALESCE\(v_src\.platform_fields, '\{\}'::jsonb\)\)\s*- ARRAY\['needsUserField'/.test(def),
    'spend_coins_and_republish : la copie passe par la règle, puis la liste d\'avant');
  const priv = (await c.query(`SELECT has_function_privilege('authenticated', 'public.republication_sans_traces(jsonb)', 'EXECUTE') a,
    has_function_privilege('anon', 'public.republication_sans_traces(jsonb)', 'EXECUTE') b,
    has_function_privilege('service_role', 'public.republication_sans_traces(jsonb)', 'EXECUTE') s`)).rows[0];
  ok(!priv.a && !priv.b && priv.s, 'republication_sans_traces : ni anon ni authenticated');

  console.log('3. L\'inverse');
  await c.query(lire('../supabase/rollbacks/20261104210000_republication_sans_traces_de_retrait_INVERSE.sql'));
  const def2 = (await c.query(`SELECT pg_get_functiondef('public.spend_coins_and_republish(bigint,text,text,numeric,text)'::regprocedure) d`)).rows[0].d;
  const existe = (await c.query(`SELECT to_regprocedure('public.republication_sans_traces(jsonb)') r`)).rows[0].r;
  ok(!/republication_sans_traces/.test(def2) && existe === null, 'l\'inverse rend la copie d\'avant et retire la fonction');
} finally {
  await c.end();
  if (embarque) { await embarque.pg.stop(); try { embarque.rmSync(embarque.dossier, { recursive: true, force: true }); } catch { /* */ } }
}
console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n}`);
process.exit(ko ? 1 : 0);
