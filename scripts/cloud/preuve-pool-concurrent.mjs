// PREUVE, EN CONCURRENCE RÉELLE, de « une IP = un compte » (socle Cloud) :
// 10 comptes préparent leur essai AU MÊME INSTANT alors qu'il n'y a que 3 IP,
// puis leurs paiements démarrent l'essai au même instant.
//
// Contre un Postgres JETABLE (jamais la prod) — comme la preuve de réservation :
//   node <pg-jetable> scripts/cloud/preuve-pool-concurrent.mjs   (PREUVE_PG fourni)
// Ce qui est prouvé :
//   · 3 préparations acceptées, 7 « pool_vide » — jamais une IP réservée deux fois ;
//   · au démarrage simultané des essais, 3 IP attribuées, chacune à UN compte,
//     aucun compte avec deux IP ; les 7 autres sans IP (et rien n'a démarré pour
//     eux : ils n'avaient pas de place) ;
//   · les migrations 20261004233000 puis 20261005120000 s'appliquent sur un vrai
//     Postgres 17 (et pas seulement PGlite).
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod).'); process.exit(2); }
const lire = (f) => readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${f}`, import.meta.url)), 'utf8');

const admin = new pg.Client({ connectionString: PG_URL });
await admin.connect();
await admin.query(`
  CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
  DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS auth.sessions (id uuid PRIMARY KEY, user_id uuid);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  CREATE SCHEMA IF NOT EXISTS vault;
  CREATE TABLE IF NOT EXISTS vault.secrets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, secret text, description text);
  CREATE OR REPLACE VIEW vault.decrypted_secrets AS SELECT id, name, secret AS decrypted_secret, description FROM vault.secrets;
  CREATE OR REPLACE FUNCTION vault.create_secret(new_secret text, new_name text DEFAULT NULL, new_description text DEFAULT '')
    RETURNS uuid LANGUAGE sql AS $f$ INSERT INTO vault.secrets (name, secret, description) VALUES (new_name, new_secret, new_description) RETURNING id $f$;
  CREATE OR REPLACE FUNCTION vault.update_secret(secret_id uuid, new_secret text DEFAULT NULL, new_name text DEFAULT NULL, new_description text DEFAULT NULL)
    RETURNS void LANGUAGE sql AS $f$ UPDATE vault.secrets SET secret = COALESCE(new_secret, secret) WHERE id = secret_id $f$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE TABLE IF NOT EXISTS public.profiles (id uuid PRIMARY KEY REFERENCES auth.users (id), is_premium boolean, is_pro boolean, is_business boolean, is_comped boolean, lang text);
  GRANT SELECT ON public.profiles TO authenticated, service_role;
  CREATE TABLE IF NOT EXISTS public.coin_config (key text PRIMARY KEY, value integer, updated_at timestamptz DEFAULT now());
  CREATE TABLE IF NOT EXISTS public.vinted_sync_runs (id bigserial PRIMARY KEY, user_id uuid, vinted_user_id bigint);
  CREATE TABLE IF NOT EXISTS public.email_logs (id bigserial PRIMARY KEY, user_id uuid, email_type text);
  CREATE UNIQUE INDEX IF NOT EXISTS email_logs_one_shot_unique ON public.email_logs USING btree (user_id, email_type)
    WHERE (email_type = ANY (ARRAY['welcome'::text, 'how_it_works'::text, 'blast_relaunch_aout'::text, 'blast_founder'::text,
      'founder_plan'::text, 'voice_conversion'::text, 'blast_sync_dressing'::text, 'reactiv_1409_a'::text, 'reactiv_1409_b'::text,
      'reactiv_1409_c'::text, 'reactiv_1409_d'::text, 'extension_link_rattrapage'::text, 'stock_pret_2309'::text,
      'blast_rentree_fillsell50_2609'::text]));
`);
await admin.query(lire('20261004233000_option_cloud_paiements.sql'));
await admin.query(lire('20261005120000_cloud_socle_ip_dediee.sql'));
await admin.query(`SELECT vault.create_secret(repeat('s', 64), 'cloud_empreinte_sel', 'sel')`);
for (let i = 1; i <= 3; i++) {
  const id = (await admin.query(`SELECT public.cloud_ip_ajouter($1, $2::inet, 12323, 'Paris', 'AS3215', $3, now() + interval '30 days') id`, [`c${i}`, `10.0.0.${i}`, `http://u:p@10.0.0.${i}:12323`])).rows[0].id;
  await admin.query('SELECT public.cloud_ip_controle_entree($1, $2::jsonb)', [id, JSON.stringify({ fait_le: new Date().toISOString(), ip_sortie: `10.0.0.${i}`, pays: 'FR', listes_noires: [], plateformes: { vinted: 'ok' } })]);
}
const users = [];
for (let i = 0; i < 10; i++) {
  const u = (await admin.query('SELECT gen_random_uuid() u')).rows[0].u;
  await admin.query('INSERT INTO auth.users VALUES ($1)', [u]);
  await admin.query('INSERT INTO public.profiles (id) VALUES ($1)', [u]);
  users.push(u);
}
const clients = [];
for (const u of users) {
  const c = new pg.Client({ connectionString: PG_URL });
  await c.connect();
  clients.push({ c, u });
}
// 1. Dix préparations au même instant (chacun en « authenticated », son propre auth.uid()).
const prep = await Promise.all(clients.map(async ({ c, u }) => {
  await c.query('BEGIN');
  await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [u]);
  await c.query('SET LOCAL ROLE authenticated');
  const r = (await c.query(`SELECT public.cloud_essai_preparer_moi($1) r`, [`appareil-${u}`])).rows[0].r;
  await c.query('COMMIT');
  return { u, r };
}));
const acceptes = prep.filter((p) => p.r.ok === true);
const vides = prep.filter((p) => p.r.raison === 'pool_vide');
const reserv = (await admin.query('SELECT reserve_pour, count(*) n FROM public.cloud_ips WHERE reserve_pour IS NOT NULL GROUP BY 1')).rows;
// 2. Les dix paiements démarrent l'essai au même instant (le déclencheur attribue).
await Promise.all(clients.map(({ c, u }) => c.query("UPDATE public.profiles SET cloud_essai_debut = now(), cloud_essai_fin = now() + interval '7 days', cloud_canal = 'stripe' WHERE id = $1", [u])));
const titulaires = (await admin.query('SELECT user_id, count(*) n FROM public.cloud_ips WHERE user_id IS NOT NULL GROUP BY 1')).rows;
const parIp = (await admin.query("SELECT count(*) n FROM public.cloud_ips WHERE etat = 'attribuee_essai'")).rows[0].n;
const sansPlace = (await admin.query('SELECT public.cloud_pool_etat() e')).rows[0].e.comptes_sans_place;

let ko = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) ko++; };
console.log('\nPool en concurrence — 10 comptes, 3 IP, au même instant');
ok(acceptes.length === 3 && vides.length === 7, `3 préparations acceptées, 7 « pool_vide » (${acceptes.length} / ${vides.length})`);
ok(reserv.length === 3 && reserv.every((r) => Number(r.n) === 1), 'chaque IP réservée pour UN compte, aucun compte avec deux réservations');
ok(Number(parIp) === 3 && titulaires.length === 3 && titulaires.every((t) => Number(t.n) === 1), 'au démarrage simultané : 3 IP attribuées, chacune à UN compte, aucun compte avec deux IP');
ok(titulaires.every((t) => acceptes.some((a) => a.u === t.user_id)), 'ce sont les comptes qui avaient une place (réservation honorée)');
ok(Number(sansPlace) === 7, `les 7 autres sans IP, comptés pour l'alerte « sans_place » (${sansPlace})`);
for (const { c } of clients) await c.end();
await admin.end();
console.log(ko === 0 ? '\nPREUVE FAITE' : `\n${ko} ÉCHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
