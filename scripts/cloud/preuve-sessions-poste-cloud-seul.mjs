// PREUVE SUR UNE BASE JETABLE de la migration 20261114170000_sessions_poste_cloud_seul (14/11/2026, point 4 de Nico) :
// « compte sur le Cloud : l'extension du PC ne peut pas changer l'état d'une connexion ; seul le Cloud fait foi ».
//
//   node scripts/cloud/pg-jetable.mjs scripts/cloud/preuve-sessions-poste-cloud-seul.mjs
//   (embedded-postgres + pg : npm i --no-save embedded-postgres@17.10.0-beta.17 pg@8.16.3)
//
// Jamais la prod (refus si l'URL est celle de Supabase). Le fichier de migration est joué TEL QUEL (puis son inverse),
// sur une table profiles réduite aux colonnes lues, avec un déclencheur AFTER témoin (comme profiles_session_revue_bonne).
// Ce qui est prouvé :
//   A. compte au Cloud actif, jeton du PC (session non Cloud) : beebs = false IGNORÉ, aucun déclencheur aval ;
//   B. jeton du poste Cloud (cloud_postes.session_fillsell_id) : écrit ;
//   C. jeton d'un poste au build « -cloud » (extension_postes) : écrit ;
//   D. Cloud plus actif (cloud_voie faux) : le PC écrit de nouveau (reprise sans geste) ;
//   E. rôle service et SQL sans jeton : écrits ;
//   F. une autre colonne écrite par le PC dans la même requête : écrite (seule la connexion est ignorée) ;
//   G. l'inverse retire la garde : le PC écrit.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod).'); process.exit(2); }
const MIGRATION = readFileSync(join(RACINE, 'supabase/migrations/20261114170000_sessions_poste_cloud_seul.sql'), 'utf8');
const INVERSE = readFileSync(join(RACINE, 'supabase/rollbacks/20261114170000_sessions_poste_cloud_seul_INVERSE.sql'), 'utf8');

const U = '13e274de-0000-4000-8000-000000000001';
const PC = '727410c6-0000-4000-8000-000000000002';
const CLOUD = '8564d390-0000-4000-8000-000000000003';
const CLOUD_BUILD = '9a9a9a9a-0000-4000-8000-000000000004';

const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
let ko = 0;
const ok = (nom, cond, d = '') => { if (!cond) ko++; console.log(`  ${cond ? 'ok  ' : 'KO  '} ${nom}${cond ? '' : `  ← ${d}`}`); };

await c.query(String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
DROP TABLE IF EXISTS public.profiles CASCADE; DROP TABLE IF EXISTS public.cloud_postes CASCADE; DROP TABLE IF EXISTS public.temoin_aval CASCADE;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, cloud_voie boolean, extension_sessions jsonb, extension_postes jsonb, platform_settings jsonb);
CREATE TABLE public.cloud_postes (user_id uuid PRIMARY KEY, session_fillsell_id uuid);
CREATE TABLE public.temoin_aval (le timestamptz DEFAULT now(), beebs text);
CREATE FUNCTION public.temoin_aval_f() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN INSERT INTO public.temoin_aval(beebs) VALUES (new.extension_sessions->>'beebs'); RETURN new; END $f$;
CREATE TRIGGER profiles_session_revue_bonne AFTER UPDATE OF extension_sessions ON public.profiles FOR EACH ROW
  WHEN (new.extension_sessions IS DISTINCT FROM old.extension_sessions) EXECUTE FUNCTION public.temoin_aval_f();
`);
await c.query(MIGRATION);

const remettre = async ({ cloudVoie = true } = {}) => {
  await c.query('DELETE FROM public.profiles; DELETE FROM public.cloud_postes; DELETE FROM public.temoin_aval;');
  await c.query(`INSERT INTO public.profiles VALUES ($1, $2, '{"beebs": null, "vinted": true}'::jsonb, $3::jsonb, '{}'::jsonb)`,
    [U, cloudVoie, JSON.stringify({ [PC]: { build: '2026-11-10T14:10:14Z+ba13a51' }, [CLOUD]: { build: '2026-11-14T11:39:28Z+b05bafe-cloud' }, [CLOUD_BUILD]: { build: '2026-11-14T11:39:28Z+b05bafe-cloud' } })]);
  await c.query('INSERT INTO public.cloud_postes VALUES ($1, $2)', [U, CLOUD]);
};
const ecrire = async (claims, patch = { beebs: false }, autres = null) => {
  await c.query('BEGIN');
  try {
    if (claims) await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await c.query(`UPDATE public.profiles SET extension_sessions = extension_sessions || $2::jsonb${autres ? ', platform_settings = $3::jsonb' : ''} WHERE id = $1`,
      autres ? [U, JSON.stringify(patch), JSON.stringify(autres)] : [U, JSON.stringify(patch)]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; }
  const { rows } = await c.query('SELECT extension_sessions, platform_settings FROM public.profiles WHERE id = $1', [U]);
  const { rows: aval } = await c.query('SELECT count(*)::int n FROM public.temoin_aval');
  return { sessions: rows[0].extension_sessions, settings: rows[0].platform_settings, aval: aval[0].n };
};
const jeton = (sid, role = 'authenticated') => ({ role, sub: U, session_id: sid });

console.log('A. Compte au Cloud actif, jeton du PC (13e274de, poste 727410c6, ba13a51)');
await remettre();
let r = await ecrire(jeton(PC));
ok('beebs = false du PC IGNORÉ (la colonne garde null)', r.sessions.beebs === null, JSON.stringify(r.sessions));
ok('aucun déclencheur aval (profiles_session_revue_bonne) ne se déclenche', r.aval === 0, String(r.aval));
r = await ecrire(jeton(PC), { beebs: true });
ok('beebs = true du PC ignoré aussi (ni morte ni vivante)', r.sessions.beebs === null, JSON.stringify(r.sessions));

console.log('B. Jeton du poste Cloud (cloud_postes.session_fillsell_id)');
await remettre();
r = await ecrire(jeton(CLOUD));
ok('écrit', r.sessions.beebs === false && r.aval === 1, JSON.stringify(r));

console.log('C. Jeton d\'un poste au build « -cloud » (extension_postes)');
await remettre();
r = await ecrire(jeton(CLOUD_BUILD));
ok('écrit', r.sessions.beebs === false, JSON.stringify(r.sessions));

console.log('D. Cloud plus actif (fin d\'essai non convertie, résiliation, impayé : cloud_voie faux)');
await remettre({ cloudVoie: false });
r = await ecrire(jeton(PC));
ok('le PC écrit de nouveau, sans geste', r.sessions.beebs === false && r.aval === 1, JSON.stringify(r));

console.log('E. Rôle service, SQL sans jeton');
await remettre();
r = await ecrire(jeton(null, 'service_role'));
ok('service_role : écrit', r.sessions.beebs === false, JSON.stringify(r.sessions));
await remettre();
r = await ecrire(null);
ok('sans jeton : écrit', r.sessions.beebs === false, JSON.stringify(r.sessions));

console.log('F. Une autre colonne dans la même requête du PC');
await remettre();
r = await ecrire(jeton(PC), { beebs: false }, { autre: 1 });
ok('la connexion est ignorée, l\'autre colonne écrite', r.sessions.beebs === null && r.settings?.autre === 1, JSON.stringify(r));

console.log('G. L\'inverse retire la garde');
await c.query(INVERSE);
await remettre();
r = await ecrire(jeton(PC));
ok('le PC écrit de nouveau', r.sessions.beebs === false, JSON.stringify(r.sessions));
const { rows: fn } = await c.query(`SELECT count(*)::int n FROM pg_proc WHERE proname = 'profiles_sessions_poste_cloud_seul'`);
ok('la fonction est retirée', fn[0].n === 0);

await c.end();
console.log(ko ? `\n${ko} KO` : '\nTout est vert (base jetable).');
process.exit(ko ? 1 : 0);
