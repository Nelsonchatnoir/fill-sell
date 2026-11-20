// BANC JETABLE (PGlite, en mémoire) de 20261120190000_cloud_ip_attribuable_saine_seulement : la fonction de PROD (relue le
// 20/11, corps CRLF compris), puis la migration, puis l'inverse — rien ne touche la prod.
//   node scripts/bancs/attribuable-saine-2011/banc.mjs
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const lire = (f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const MIG = lire('supabase/migrations/20261120190000_cloud_ip_attribuable_saine_seulement.sql');
const INV = lire('supabase/rollbacks/20261120190000_cloud_ip_attribuable_saine_seulement_INVERSE.sql');
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? ` — ${d}` : ''}`); } };

const db = new PGlite();
await db.exec(`
CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer);
CREATE TABLE public.cloud_ips (id bigint PRIMARY KEY, etat text, expire_le timestamptz, sante jsonb, attributions integer DEFAULT 0,
  reserve_pour uuid, reserve_jusqu_au timestamptz, dernier_user_id uuid, user_id uuid);
CREATE OR REPLACE FUNCTION public.cloud_param(p_cle text, p_defaut integer) RETURNS integer LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT COALESCE((SELECT value FROM public.coin_config WHERE key = 'cloud_' || p_cle), p_defaut); $function$;
CREATE OR REPLACE FUNCTION public.cloud_ts(p text) RETURNS timestamptz LANGUAGE plpgsql STABLE
AS $function$ BEGIN RETURN p::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN NULL; END; $function$;
`);
// La fonction de prod, telle que relue (pg_get_functiondef, corps en CRLF).
const PROD = "CREATE OR REPLACE FUNCTION public.cloud_ip_attribuable(p cloud_ips, p_user uuid, p_nature text)\n RETURNS boolean\n LANGUAGE sql\n STABLE\n SET search_path TO 'public', 'pg_temp'\nAS $function$\r\n  SELECT p.expire_le >= CASE WHEN p_nature = 'essai'\r\n                             THEN now() + make_interval(days => 7 + public.cloud_param('grace_jours', 2)\r\n                                                              + public.cloud_param('marge_expiration_jours', 1))\r\n                             ELSE now() + make_interval(days => public.cloud_param('renouvellement_avant_jours', 3)) END\r\n     AND COALESCE(p.sante ->> 'verdict', '') <> 'grillee'\r\n     AND CASE\r\n           WHEN p.etat = 'repos' THEN p_user IS NOT NULL AND p.dernier_user_id = p_user\r\n           WHEN p.etat = 'disponible' THEN p.attributions < public.cloud_param('attributions_max', 6)\r\n                AND (p.reserve_pour IS NULL OR p.reserve_pour = p_user OR p.reserve_jusqu_au < now())\r\n           ELSE false END;\r\n$function$\n";
await db.exec(PROD);
const md5Banc = (await db.query(`SELECT md5(pg_get_functiondef('public.cloud_ip_attribuable(cloud_ips, uuid, text)'::regprocedure)) h`)).rows[0].h;
console.log(`  (md5 de la fonction de prod rejouée dans le banc : ${md5Banc} ; en prod : a6d76077bf8335dc662a30c781215771)`);

const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222';
const h = (x) => `now() - interval '${x} hours'`;
await db.exec(`
INSERT INTO public.cloud_ips (id, etat, expire_le, sante, dernier_user_id) VALUES
 (80, 'disponible', now() + interval '25 days', jsonb_build_object('verdict','saine','saine_le', (${h(2)})::text, 'echecs','[]'::jsonb), NULL),
 (81, 'disponible', now() + interval '25 days', jsonb_build_object('verdict','inconnue','saine_le', NULL, 'echecs','[]'::jsonb), NULL),
 (82, 'disponible', now() + interval '25 days', jsonb_build_object('verdict','grillee','echecs','["sortie:pays"]'::jsonb), NULL),
 (83, 'disponible', now() + interval '25 days', jsonb_build_object('verdict','suspecte','suspecte_le', (${h(1)})::text, 'echecs','["beebs:verification"]'::jsonb), NULL),
 (84, 'disponible', now() + interval '25 days', jsonb_build_object('verdict','saine','saine_le', (${h(40)})::text), NULL),
 (85, 'disponible', now() + interval '25 days', NULL, NULL),
 (86, 'repos',      now() + interval '25 days', jsonb_build_object('verdict','saine','saine_le', (${h(3)})::text), '${U1}'),
 (87, 'disponible', now() + interval '4 days',  jsonb_build_object('verdict','saine','saine_le', (${h(1)})::text), NULL),
 (76, 'attribuee_essai', now() + interval '25 days', jsonb_build_object('verdict','saine','saine_le', (${h(1)})::text), NULL);
`);
const attr = async (id, user = null, nature = 'essai') => (await db.query(`SELECT public.cloud_ip_attribuable(i, $1::uuid, $2) a FROM public.cloud_ips i WHERE id = $3`, [user, nature, id])).rows[0].a;

console.log('1. Avant (la prod du 20/11)');
ok(await attr(81) === true && await attr(83) === true && await attr(85) === true, 'le défaut, rejoué : inconnue, suspecte, jamais contrôlée → attribuables');

console.log('2. La garde md5');
const garde = (h) => MIG.replace("IS DISTINCT FROM 'a6d76077bf8335dc662a30c781215771'", `IS DISTINCT FROM '${h}'`);
const migBanc = garde(md5Banc);
if (!/IS DISTINCT FROM 'a6d76077bf8335dc662a30c781215771'/.test(MIG)) throw new Error("garde introuvable dans la migration");
let refus = null;
try { await db.exec(garde('00000000000000000000000000000000')); } catch (e) { refus = e.message; }
const md5Apres = (await db.query(`SELECT md5(pg_get_functiondef('public.cloud_ip_attribuable(cloud_ips, uuid, text)'::regprocedure)) h`)).rows[0].h;
  console.log('  (après le refus : ' + md5Apres + ' ; refus : ' + String(refus).slice(0, 90) + ')');
  ok(/a chang/.test(refus ?? '') && md5Apres === md5Banc && await attr(81) === true, 'une fonction différente de celle relue : migration arrêtée, rien changé', refus);

console.log('3. Après la migration');
await db.exec(migBanc);
await db.exec(migBanc.replace(/DO \$garde\$[\s\S]*?\$garde\$;/, ''));   // rejouée : idempotente (sans la garde, qui a vu l'ancienne)
ok(await attr(80) === true, '80 : saine depuis 2 h → attribuable');
ok(await attr(81) === false, '81 : contrôle sans conclusion (inconnue) → JAMAIS attribuable');
ok(await attr(82) === false, '82 : grillée (pays) → jamais');
ok(await attr(83) === false, 'suspecte (Beebs en vérification) → jamais');
ok(await attr(84) === false, 'saine il y a 40 h (au-delà de 36 h) → plus attribuable avant un nouveau contrôle');
ok(await attr(85) === false, 'jamais contrôlée → jamais');
ok(await attr(86, U1) === true && await attr(86, U2) === false && await attr(86) === false, 'au repos : seulement à son dernier titulaire (règle inchangée), saine');
ok(await attr(87) === false && await attr(87, null, 'client') === true, 'l\'échéance garde sa règle (essai : 10 jours ; client : 3)');
ok(await attr(76) === false, 'une IP attribuée n\'est jamais attribuable à un autre');
await db.exec(`INSERT INTO public.coin_config VALUES ('cloud_sante_validite_h', 48)`);
ok(await attr(84) === true, 'la validité se règle (cloud_sante_validite_h)');
await db.exec(`DELETE FROM public.coin_config WHERE key = 'cloud_sante_validite_h'`);

console.log('4. L\'inverse');
await db.exec(INV);
ok(await attr(81) === true && await attr(82) === false && await attr(80) === true, 'la règle d\'avant revient (seule la grillée écartée)');

console.log(ko ? `✗ ${ko} échec(s) sur ${n}` : `✓ banc attribuable-saine : ${n}/${n}`);
process.exit(ko ? 1 : 0);
