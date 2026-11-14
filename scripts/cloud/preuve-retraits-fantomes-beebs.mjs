// PREUVE SUR UNE BASE JETABLE de scripts/reparations/20261114_retraits_fantomes_beebs.sql et de son inverse
// (14/11/2026, point 4c de Nico) — jamais la prod.
//   node scripts/cloud/pg-jetable.mjs scripts/cloud/preuve-retraits-fantomes-beebs.mjs
// Les 6 retraits Beebs de 13e274de (5 fantômes prouvés + la vraie annonce 34356253) tels que lus le 14/11 : le script
// clôt les 5 fantômes « Fait · déjà absente » (deleted, deja_absente, erreur archivée), ne touche jamais 34356253, ni
// un retrait déjà parti ; l'inverse remet tout comme avant ; rejoué, le script ne refait rien.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod).'); process.exit(2); }
const SCRIPT = readFileSync(join(RACINE, 'scripts/reparations/20261114_retraits_fantomes_beebs.sql'), 'utf8');
const INVERSE = readFileSync(join(RACINE, 'scripts/reparations/20261114_retraits_fantomes_beebs_INVERSE.sql'), 'utf8');
const U = '13e274de-7af1-4368-8c31-afe214252ca2';
const TEXTE_PC = "En attente de ta connexion à Beebs dans Chrome : ton article est vendu mais son annonce est encore en ligne sur Beebs (risque de double vente). Connecte-toi à Beebs sur ton ordinateur : le retrait repartira tout seul.";
const FANTOMES = ['27214557', '27214877', '27214883', '27214891', '27214895'];

const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
let ko = 0;
const ok = (nom, cond, d = '') => { if (!cond) ko++; console.log(`  ${cond ? 'ok  ' : 'KO  '} ${nom}${cond ? '' : `  ← ${d}`}`); };
await c.query(String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
DROP TABLE IF EXISTS public.cross_post_jobs, public.annonces_plateforme, public._backup_1411_beebs_fantomes_annonces, public._backup_1411_retraits_fantomes_beebs CASCADE;
CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, action text, status text,
  platform_listing_id text, error text, platform_fields jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.annonces_plateforme (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, listing_id text, disparu_le timestamptz);
CREATE TABLE public._backup_1411_beebs_fantomes_annonces (sauve_le timestamptz, id uuid, user_id uuid, platform text, listing_id text, disparu_le timestamptz);
`);
const attente = { motif: "session connue morte (relevée par l'extension) — tâche retenue par le serveur", depuis: '2026-11-14T11:44:09.553Z',
  derniere: '2026-11-14T13:03:03.351Z', platform: 'beebs', pose_par: 'get-pending-jobs (session connue morte)', observations: 0 };
for (const n of [...FANTOMES, '34356253']) {
  await c.query(`INSERT INTO public.cross_post_jobs (user_id, platform, action, status, platform_listing_id, error, platform_fields) VALUES ($1,'beebs','delete','pending',$2,$3,$4)`,
    [U, n, TEXTE_PC, JSON.stringify({ attente_session: attente })]);
}
// Un retrait d'un fantôme déjà parti (processing) : jamais touché.
await c.query(`INSERT INTO public.cross_post_jobs (user_id, platform, action, status, platform_listing_id, error, platform_fields) VALUES ($1,'beebs','delete','processing','27214901',null,'{}')`, [U]);
for (const n of [...FANTOMES, '27214901']) {
  await c.query(`INSERT INTO public.annonces_plateforme (user_id, platform, listing_id, disparu_le) VALUES ($1,'beebs',$2, now())`, [U, n]);
  await c.query(`INSERT INTO public._backup_1411_beebs_fantomes_annonces (sauve_le, user_id, platform, listing_id) VALUES (now(), $1, 'beebs', $2)`, [U, n]);
}
await c.query(`INSERT INTO public.annonces_plateforme (user_id, platform, listing_id, disparu_le) VALUES ($1,'beebs','34356253', null)`, [U]);
const etat = async () => (await c.query('SELECT platform_listing_id n, status, error, platform_fields pf FROM public.cross_post_jobs ORDER BY 1')).rows;

console.log('1. Le script');
await c.query(SCRIPT);
let r = await etat();
const clos = r.filter((x) => FANTOMES.includes(x.n));
ok('les 5 fantômes : « deleted », sans message, drapeau deja_absente du script', clos.length === 5 && clos.every((x) => x.status === 'deleted' && x.error === null
  && x.pf?.deja_absente?.pose_par === 'scripts/reparations/20261114_retraits_fantomes_beebs' && x.pf.deja_absente.numero === x.n && x.pf.retrait_par === 'annonce_deja_hors_ligne'), JSON.stringify(clos[0]));
ok('l\'attente de session retirée, l\'ancien message archivé', clos.every((x) => !('attente_session' in x.pf) && x.pf.erreurs_archivees?.at(-1)?.erreur === TEXTE_PC));
const vraie = r.find((x) => x.n === '34356253');
ok('la vraie annonce 34356253 : jamais touchée', vraie.status === 'pending' && vraie.error === TEXTE_PC);
ok('un retrait déjà parti (processing) : jamais touché', r.find((x) => x.n === '27214901').status === 'processing');
const { rows: sauv } = await c.query('SELECT count(*)::int n FROM public._backup_1411_retraits_fantomes_beebs');
ok('sauvegarde : 5 lignes', sauv[0].n === 5, String(sauv[0].n));

console.log('2. Rejoué : rien de plus');
await c.query(SCRIPT);
const { rows: sauv2 } = await c.query('SELECT count(*)::int n FROM public._backup_1411_retraits_fantomes_beebs');
ok('aucune ligne de plus, aucune sauvegarde de plus', sauv2[0].n === 5 && JSON.stringify(await etat()) === JSON.stringify(r));

console.log('3. L\'inverse');
await c.query(INVERSE);
r = await etat();
ok('les 5 retraits remis en file, message et attente d\'avant', r.filter((x) => FANTOMES.includes(x.n)).every((x) => x.status === 'pending' && x.error === TEXTE_PC && x.pf?.attente_session?.depuis === '2026-11-14T11:44:09.553Z'));

await c.end();
console.log(ko ? `\n${ko} KO` : '\nTout est vert (base jetable).');
process.exit(ko ? 1 : 0);
