// BANC JETABLE (PGlite) de 20261120200000_cloud_ip_plateformes_fermees_priorite : les fonctions de PROD (relues le 20/11,
// empreintes md5 vérifiées), la migration, l'inverse — rien ne touche la prod.
//   node scripts/bancs/plateformes-fermees-2011/banc.mjs
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const lire = (f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const MIG = lire('supabase/migrations/20261120200000_cloud_ip_plateformes_fermees_priorite.sql');
const INV = lire('supabase/rollbacks/20261120200000_cloud_ip_plateformes_fermees_priorite_INVERSE.sql');
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? ` — ${d}` : ''}`); } };

const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer);
CREATE TABLE public.cloud_ips (id bigint PRIMARY KEY, etat text, user_id uuid, dernier_user_id uuid, liberee_le timestamptz, reserve_pour uuid,
  reserve_jusqu_au timestamptz, refus jsonb DEFAULT '{}'::jsonb, sante jsonb, expire_le timestamptz, attributions integer DEFAULT 0,
  derniere_origine text, attribuee_le timestamptz, repos_fin timestamptz, purge_preuve jsonb, purge_prouvee_le timestamptz, maj_le timestamptz);
CREATE TABLE public.cloud_coffre (user_id uuid, plateforme text, connecte boolean);
CREATE TABLE public.annonces_plateforme (user_id uuid, platform text, disparu_le timestamptz);
CREATE TABLE public.journal (ip bigint, nature text, user_id uuid);
CREATE FUNCTION public.cloud_param(p_cle text, p_defaut integer) RETURNS integer LANGUAGE sql STABLE AS $f$ SELECT COALESCE((SELECT value FROM public.coin_config WHERE key = 'cloud_' || p_cle), p_defaut); $f$;
CREATE FUNCTION public.cloud_ip_attribuable(p cloud_ips, p_user uuid, p_nature text) RETURNS boolean LANGUAGE sql STABLE
  AS $f$ SELECT COALESCE(p.sante ->> 'verdict', '') = 'saine' AND (p.etat = 'disponible' OR (p.etat = 'repos' AND p.dernier_user_id = p_user))
    AND (p.reserve_pour IS NULL OR p.reserve_pour = p_user OR p.reserve_jusqu_au < now()); $f$;
CREATE FUNCTION public.cloud_ip_controlee_avant_attribution(p cloud_ips) RETURNS boolean LANGUAGE sql STABLE AS $f$ SELECT true; $f$;
CREATE FUNCTION public.cloud_ip_refus_prouve(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $f$ SELECT false; $f$;
CREATE FUNCTION public.cloud_ip_rang_operateur(p jsonb) RETURNS integer LANGUAGE sql IMMUTABLE AS $f$ SELECT 0; $f$;
CREATE FUNCTION public.cloud_journal(p_ip bigint, p_nature text, p_user uuid, p_d jsonb) RETURNS void LANGUAGE sql AS $f$ INSERT INTO public.journal VALUES (p_ip, p_nature, p_user); $f$;
`);
// Les fonctions de prod = le corps de l'INVERSE (sans la ligne DROP).
await db.exec(INV.replace(/DROP FUNCTION[^\n]*\n?/, ''));
const md5 = async (sig) => (await db.query(`SELECT md5(pg_get_functiondef('${sig}'::regprocedure)) h`)).rows[0].h;
const mA = await md5('public.cloud_ip_attribuer(uuid, text)'), mR = await md5('public.cloud_ip_reserver(uuid)');
ok(mA === '100def96467f086932e8dc1e7e2e8e7c' && mR === 'd4910c017c371e12cb1695c2a761d854', 'les fonctions rejouées ont les empreintes de la prod (la garde est donc éprouvée telle quelle)', `${mA} ${mR}`);

const B = '11111111-1111-1111-1111-111111111111', V = '22222222-2222-2222-2222-222222222222', N = '33333333-3333-3333-3333-333333333333';
const remplir = async () => {
  await db.exec(`DELETE FROM public.cloud_ips; DELETE FROM public.cloud_coffre; DELETE FROM public.annonces_plateforme;
  INSERT INTO public.cloud_ips (id, etat, sante, expire_le) VALUES
    (81, 'disponible', '{"verdict":"saine","plateformes_fermees":["beebs"]}', now() + interval '10 days'),
    (90, 'disponible', '{"verdict":"saine","plateformes_fermees":[]}', now() + interval '25 days');
  INSERT INTO public.cloud_coffre VALUES ('${B}', 'beebs', true), ('${B}', 'fillsell', true), ('${V}', 'vinted', true);
  INSERT INTO public.annonces_plateforme VALUES ('${N}', 'beebs', NULL);`);
};
const attribuer = async (u) => (await db.query(`SELECT public.cloud_ip_attribuer($1::uuid, 'essai') ip`, [u])).rows[0].ip;
const reserver = async (u) => (await db.query(`SELECT public.cloud_ip_reserver($1::uuid) ip`, [u])).rows[0].ip;

console.log('1. Avant (la prod du 20/11)');
await remplir();
ok(Number(await attribuer(B)) === 81, 'le compte Beebs reçoit la 81 (Beebs fermé) : la plus proche de l’échéance d’abord');

console.log('2. La garde');
let refus = null;
try { await db.exec(MIG.replace("IS DISTINCT FROM '100def96467f086932e8dc1e7e2e8e7c'", "IS DISTINCT FROM '00000000000000000000000000000000'")); } catch (e) { refus = e.message; }
ok(/a changé depuis sa relecture/.test(refus ?? '') && await md5('public.cloud_ip_attribuer(uuid, text)') === mA, 'une fonction différente : migration arrêtée, rien changé', refus);

console.log('3. Après la migration');
await db.exec(MIG);
await remplir();
ok(Number(await attribuer(B)) === 90, 'compte Beebs (coffre) : la 90, où Beebs est ouvert, avant la 81 pourtant plus proche de l’échéance');
ok(Number(await attribuer(V)) === 81, 'compte Vinted seul : la 81 lui va (Beebs fermé ne le gêne pas)');
await remplir();
ok(Number(await attribuer(N)) === 90, 'compte Beebs par ses annonces relevées (pas encore de coffre) : la 90');
await remplir();
await db.exec(`DELETE FROM public.cloud_ips WHERE id = 90`);
ok(Number(await attribuer(B)) === 81, 'plus d’IP où Beebs est ouvert : la 81 quand même (les autres plateformes tournent)');
await remplir();
ok(Number(await reserver(B)) === 90 && Number(await reserver(V)) === 81, 'la réservation (essai) suit la même priorité');
ok((await db.query(`SELECT public.cloud_plateformes_du_compte($1::uuid) p`, [B])).rows[0].p.join() === 'beebs', 'les plateformes du compte : son coffre, jamais « fillsell »');

console.log('4. L’inverse');
await db.exec(INV);
await remplir();
ok(Number(await attribuer(B)) === 81 && await md5('public.cloud_ip_attribuer(uuid, text)') === mA, 'la règle et la fonction d’avant reviennent');

console.log(ko ? `✗ ${ko} échec(s) sur ${n}` : `✓ banc plateformes-fermees : ${n}/${n}`);
await db.close();
process.exitCode = ko ? 1 : 0;
