// PREUVE, SUR UN POSTGRES JETABLE, de la migration 20261103203000_cloud_voie_place_attente (03/11/2026, points 3 et 5
// de Nico) : le drapeau cloud_voie suit l'état Cloud tous canaux, l'arrêt rend les tâches à l'extension, la vente
// attend une place serveur ET une IP, la liste d'attente prévient dans l'ordre, une fois.
//
//   PREUVE_PG=embarque node scripts/cloud/preuve-voie-place-attente.mjs   (Postgres 17 jetable sur le PC ;
//   embedded-postgres et pg déjà dans node_modules — sinon : npm i --no-save embedded-postgres@17.10.0-beta.17 pg@8.16.3)
//
// Jamais la prod (refus si l'URL est celle de Supabase). Les fonctions touchées par la migration sont celles de la PROD
// (scripts/cloud/fixtures/prod-0311-cloud-voie.sql, pg_get_functiondef du 03/11) ; le reste (IP attribuée, cron, push,
// cloud_places_libres du chantier A) est un bouchon qui ne décide de rien d'autre que ce que le test règle.
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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-voie-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55437, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55437/postgres';
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Le décor : rôles, schémas auth / cron / net, tables réduites à leurs colonnes utiles, bouchons.
const DECOR = String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS cron; CREATE SCHEMA IF NOT EXISTS net;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $f$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$
  SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') $f$;
CREATE TABLE cron.job (jobid serial PRIMARY KEY, jobname text, schedule text, command text);
CREATE OR REPLACE FUNCTION cron.schedule(n text, s text, c text) RETURNS integer LANGUAGE sql AS $f$
  INSERT INTO cron.job (jobname, schedule, command) VALUES (n, s, c) RETURNING jobid $f$;
CREATE OR REPLACE FUNCTION cron.unschedule(i integer) RETURNS boolean LANGUAGE sql AS $f$ DELETE FROM cron.job WHERE jobid = i RETURNING true $f$;
CREATE OR REPLACE FUNCTION net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer) RETURNS bigint LANGUAGE sql AS $f$ SELECT 1::bigint $f$;
CREATE OR REPLACE FUNCTION public.cron_secret() RETURNS text LANGUAGE sql AS $f$ SELECT 'secret' $f$;

CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, lang text, platform_settings jsonb DEFAULT '{}'::jsonb,
  is_cloud boolean, cloud_essai_debut timestamptz, cloud_essai_fin timestamptz, cloud_essai_arrete boolean DEFAULT false,
  cloud_periode_fin timestamptz, cloud_arret_fin_periode boolean DEFAULT false, cloud_voie boolean NOT NULL DEFAULT false,
  is_business boolean, is_pro boolean, is_premium boolean, is_comped boolean);
CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, status text, error text, platform_fields jsonb DEFAULT '{}'::jsonb);
CREATE TABLE public.cloud_ips (id bigserial PRIMARY KEY, etat text, user_id uuid, dernier_user_id uuid, reserve_pour uuid,
  reserve_jusqu_au timestamptz, expire_le timestamptz, attributions integer DEFAULT 0, liberee_le timestamptz, maj_le timestamptz);
CREATE TABLE public.cloud_attente (user_id uuid PRIMARY KEY, demande_le timestamptz NOT NULL DEFAULT now(), derniere_le timestamptz NOT NULL DEFAULT now(), essais integer NOT NULL DEFAULT 1);
CREATE TABLE public.appareils_push (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, plateforme text, jeton text, apns_env text);
CREATE TABLE public.cloud_essai_demandes (user_id uuid PRIMARY KEY, appareil_h text, comptes_h jsonb, essai_permis boolean, raison text, demande_le timestamptz DEFAULT now());
CREATE TABLE public.cloud_essai_empreintes (id bigserial, user_id uuid, nature text, empreinte text);
CREATE TABLE public.vinted_sync_runs (user_id uuid, vinted_user_id bigint);
CREATE TABLE public.essai_places (n integer);  INSERT INTO public.essai_places VALUES (0);
CREATE OR REPLACE FUNCTION public.cloud_places_libres() RETURNS integer LANGUAGE sql STABLE AS $f$ SELECT n FROM public.essai_places $f$;
CREATE OR REPLACE FUNCTION public.cloud_ts(t text) RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $f$ SELECT t::timestamptz $f$;
CREATE OR REPLACE FUNCTION public.cloud_journal(p_ip bigint, p_nature text, p_user uuid, p_details jsonb) RETURNS void LANGUAGE sql AS $f$ SELECT $f$;
CREATE OR REPLACE FUNCTION public.cloud_ip_attribuer(p_user uuid, p_nature text) RETURNS bigint LANGUAGE sql AS $f$ SELECT NULL::bigint $f$;
CREATE OR REPLACE FUNCTION public.cloud_ip_liberer(p_user uuid, p_raison text) RETURNS bigint LANGUAGE sql AS $f$ SELECT NULL::bigint $f$;
CREATE OR REPLACE FUNCTION public.cloud_empreintes_engager(p_user uuid) RETURNS void LANGUAGE sql AS $f$ SELECT $f$;
CREATE OR REPLACE FUNCTION public.cloud_hacher(e text, v text) RETURNS text LANGUAGE sql AS $f$ SELECT md5(e || ':' || v) $f$;
CREATE TABLE public.essai_push (p jsonb);
CREATE OR REPLACE FUNCTION public.push_ventes_resultat(p jsonb) RETURNS jsonb LANGUAGE sql AS $f$
  INSERT INTO public.essai_push VALUES (p) RETURNING jsonb_build_object('appareils_oublies', jsonb_array_length(p -> 'invalides')) $f$;
`;

const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let echecs = 0, n = 0;
const ok = (c, m, d = '') => { n++; console.log(`  ${c ? '✓' : '✗'} ${m}${c || !d ? '' : `   ← ${d}`}`); if (!c) echecs++; };

const client = new pg.Client({ connectionString: PG_URL });
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;
const un = async (sql, params = []) => (await q(sql, params))[0];
const comme = (sub) => client.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify(sub ? { sub, role: 'authenticated' } : {})]);
try {
  await q('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await q(DECOR);
  await q(lire('./fixtures/prod-0311-cloud-voie.sql'));
  // Le parc avant : Nico (offert, payé), un essai en cours, un essai fini à l'heure (drapeau resté levé), un ordinaire.
  await q(`INSERT INTO public.profiles (id, is_cloud, cloud_voie, platform_settings) VALUES
    ($1, true, true, '{"beebs":{"cloud_verification":{"etat":"a_resoudre"},"x":1},"vinted":{"autre":2}}'),
    ($2, false, false, '{}'), ($3, false, true, '{"leboncoin":{"cloud_verification":{"etat":"restreint"}}}'), ($4, null, false, '{}'),
    ($5, null, false, '{}'), ($6, null, false, '{}'), ($7, null, false, '{}')`, [NICO, U(2), U(3), U(4), U(5), U(6), U(7)]);
  await q(`ALTER TABLE public.profiles DISABLE TRIGGER profiles_cloud_pool`);
  await q(`UPDATE public.profiles SET cloud_essai_debut = now() - interval '3 days', cloud_essai_fin = now() + interval '4 days' WHERE id = $1`, [U(2)]);
  await q(`UPDATE public.profiles SET cloud_essai_debut = now() - interval '8 days', cloud_essai_fin = now() - interval '1 hour' WHERE id = $1`, [U(3)]);
  await q(`ALTER TABLE public.profiles ENABLE TRIGGER profiles_cloud_pool`);
  const msg = 'Leboncoin demande une vérification anti-robot au navigateur FillSell Cloud.';
  await q(`INSERT INTO public.cross_post_jobs (user_id, platform, status, error, platform_fields) VALUES
    ($1, 'leboncoin', 'pending', $2, jsonb_build_object('attente_verification_cloud', jsonb_build_object('message', $2::text), 'garde', 1)),
    ($1, 'leboncoin', 'pending', 'Autre message à garder', jsonb_build_object('attente_verification_cloud', jsonb_build_object('message', $2::text))),
    ($1, 'vinted', 'processing', $2, jsonb_build_object('attente_verification_cloud', jsonb_build_object('message', $2::text))),
    ($3, 'leboncoin', 'pending', $2, jsonb_build_object('attente_verification_cloud', jsonb_build_object('message', $2::text)))`, [U(3), msg, NICO]);

  console.log('A. La migration s’applique sur la prod recopiée');
  const mig = lire('../../supabase/migrations/20261103203000_cloud_voie_place_attente.sql');
  await q(mig);
  ok(Boolean((await un(`SELECT to_regprocedure('public.cloud_compte_synchroniser_pool(uuid)') AS x`)).x), 'l’ancienne cloud_compte_synchroniser est renommée (corps intact), la nouvelle l’appelle');
  ok((await q(`SELECT jobname FROM cron.job ORDER BY 1`)).map((r) => r.jobname).join(',') === 'cloud-voies-5min,push-cloud-place-5min', 'les deux réveils sont posés');
  await q(mig);
  ok((await q(`SELECT jobname FROM cron.job`)).length === 2 && Boolean((await un(`SELECT to_regprocedure('public.cloud_compte_synchroniser_pool(uuid)') AS x`)).x), 'rejouée : idempotente (deux réveils, un seul renommage)');

  console.log('B. La règle, appliquée une fois à tout le parc');
  const voies = Object.fromEntries((await q(`SELECT id, cloud_voie FROM public.profiles`)).map((r) => [r.id, r.cloud_voie]));
  ok(voies[NICO] === true, 'Nico (offert, payé) : reste à vrai');
  ok(voies[U(2)] === true, 'essai en cours : drapeau POSÉ (sans aucun script)');
  ok(voies[U(3)] === false, 'essai fini à l’heure, drapeau resté levé : RETIRÉ');
  ok(voies[U(4)] === false, 'compte ordinaire : faux, inchangé');
  const j3 = await q(`SELECT status, error, platform_fields FROM public.cross_post_jobs WHERE user_id = $1 ORDER BY status, error NULLS FIRST`, [U(3)]);
  const attente = j3.filter((j) => j.status === 'pending');
  ok(attente.every((j) => !('attente_verification_cloud' in j.platform_fields)), 'tâches en attente : la marque du Cloud part');
  ok(attente.some((j) => j.error === null && j.platform_fields.garde === 1), '… avec SON message (le reste de platform_fields gardé)');
  ok(attente.some((j) => j.error === 'Autre message à garder'), '… un autre message reste');
  ok(j3.find((j) => j.status === 'processing')?.platform_fields?.attente_verification_cloud, 'une tâche en cours n’est jamais touchée');
  ok(!(await un(`SELECT platform_settings FROM public.profiles WHERE id = $1`, [U(3)])).platform_settings.leboncoin?.cloud_verification,
    '« Résoudre la vérification » du Cloud retiré (platform_settings_fusionner)');
  ok((await un(`SELECT count(*)::int AS n FROM public.cross_post_jobs WHERE user_id = $1 AND platform_fields ? 'attente_verification_cloud'`, [NICO])).n === 1,
    'Nico (toujours actif) : sa tâche garde sa marque');

  console.log('C. Tous canaux : le drapeau suit chaque écriture des colonnes Cloud (déclencheur)');
  await q(`UPDATE public.profiles SET is_cloud = false WHERE id = $1`, [NICO]);
  let p = await un(`SELECT cloud_voie, platform_settings FROM public.profiles WHERE id = $1`, [NICO]);
  ok(p.cloud_voie === false, 'Stripe/Apple/Google : is_cloud tombe (impayé, résiliation) → drapeau retiré à la même écriture');
  ok(!p.platform_settings.beebs.cloud_verification && p.platform_settings.beebs.x === 1 && p.platform_settings.vinted.autre === 2, '… vérification Beebs du Cloud retirée, le reste de platform_settings intact');
  ok((await un(`SELECT count(*)::int AS n FROM public.cross_post_jobs WHERE user_id = $1 AND platform_fields ? 'attente_verification_cloud'`, [NICO])).n === 0, '… sa tâche rendue à l’extension');
  await q(`UPDATE public.profiles SET is_cloud = true WHERE id = $1`, [NICO]);
  ok((await un(`SELECT cloud_voie FROM public.profiles WHERE id = $1`, [NICO])).cloud_voie === true, 'payé de nouveau (facture réglée) → drapeau reposé');
  await q(`UPDATE public.profiles SET cloud_essai_arrete = true WHERE id = $1`, [U(2)]);
  ok((await un(`SELECT cloud_voie FROM public.profiles WHERE id = $1`, [U(2)])).cloud_voie === false, 'essai arrêté par la personne → retiré tout de suite');
  await q(`UPDATE public.profiles SET cloud_essai_arrete = false, cloud_essai_debut = now() - interval '1 day', cloud_essai_fin = now() + interval '6 days' WHERE id = $1`, [U(5)]);
  ok((await un(`SELECT cloud_voie FROM public.profiles WHERE id = $1`, [U(5)])).cloud_voie === true, 'essai qui démarre (webhook) → posé');

  console.log('D. La fin d’essai qui arrive SANS écriture : le passage de 5 min');
  await q(`ALTER TABLE public.profiles DISABLE TRIGGER profiles_cloud_pool`);
  await q(`UPDATE public.profiles SET cloud_essai_fin = now() - interval '1 minute' WHERE id = $1`, [U(5)]);
  await q(`ALTER TABLE public.profiles ENABLE TRIGGER profiles_cloud_pool`);
  ok((await un(`SELECT cloud_voie FROM public.profiles WHERE id = $1`, [U(5)])).cloud_voie === true, 'avant le passage : encore levé (l’heure a passé, rien n’a écrit)');
  const s = (await un(`SELECT public.cloud_voies_synchroniser() AS r`)).r;
  ok((await un(`SELECT cloud_voie FROM public.profiles WHERE id = $1`, [U(5)])).cloud_voie === false && s.changes === 1, 'cloud_voies_synchroniser : retiré, un seul compte changé', JSON.stringify(s));
  const s2 = (await un(`SELECT public.cloud_voies_synchroniser() AS r`)).r;
  ok(s2.changes === 0 && s2.vus >= 1, 'rejoué : aucune ligne réécrite', JSON.stringify(s2));

  console.log('E. Pas de vente sans place serveur ET IP');
  await comme(U(4));
  let d = (await un(`SELECT public.cloud_disponibilite_moi() AS r`)).r;
  ok(d.vente_possible === false && d.raison === 'complet', 'aucune place serveur : « complet »', JSON.stringify(d));
  let r = (await un(`SELECT public.cloud_essai_preparer_moi('app-1') AS r`)).r;
  ok(r.ok === false && r.raison === 'complet' && r.inscrit === false, 'la préparation refuse « complet » (ni essai, ni paiement, ni feuille du store)', JSON.stringify(r));
  ok((await un(`SELECT count(*)::int AS n FROM public.cloud_ips WHERE reserve_pour = $1`, [U(4)])).n === 0, '… sans réserver d’IP');
  await q(`UPDATE public.essai_places SET n = 2`);
  d = (await un(`SELECT public.cloud_disponibilite_moi() AS r`)).r;
  ok(d.vente_possible === false && d.raison === 'pool_vide', 'place serveur mais aucune IP : « pool_vide »', JSON.stringify(d));
  await q(`INSERT INTO public.cloud_ips (etat, expire_le) VALUES ('disponible', now() + interval '25 days'), ('disponible', now() + interval '25 days')`);
  d = (await un(`SELECT public.cloud_disponibilite_moi() AS r`)).r;
  ok(d.vente_possible === true && d.places === 2 && d.ip === true, 'place ET IP : vente possible', JSON.stringify(d));
  r = (await un(`SELECT public.cloud_essai_preparer_moi('app-1') AS r`)).r;
  ok(r.ok === true && r.essai === true, 'la préparation passe, l’essai est permis', JSON.stringify(r));
  await comme(NICO);
  ok((await un(`SELECT public.cloud_disponibilite_moi() AS r`)).r.raison === 'deja_client', 'un compte au Cloud actif : « deja_client »');

  console.log('F. La liste d’attente : dans l’ordre, une notification, la place gardée 24 h');
  await q(`UPDATE public.essai_places SET n = 0`);
  await comme(U(6));
  let i6 = (await un(`SELECT public.cloud_attente_inscrire_moi() AS r`)).r;
  ok(i6.ok && i6.attente.inscrit && i6.attente.rang === 1, 'U6 s’inscrit : rang 1', JSON.stringify(i6.attente));
  await new Promise((ok2) => setTimeout(ok2, 20));
  await comme(U(7));
  let i7 = (await un(`SELECT public.cloud_attente_inscrire_moi() AS r`)).r;
  ok(i7.attente.rang === 2, 'U7 s’inscrit après : rang 2');
  const i7bis = (await un(`SELECT public.cloud_attente_inscrire_moi() AS r`)).r;
  ok(i7bis.attente.rang === 2 && i7bis.attente.inscrit_le === i7.attente.inscrit_le, 'se réinscrire ne change pas sa place');
  ok((await un(`SELECT public.cloud_attente_a_prevenir_existe() AS r`)).r === false, 'complet : personne à prévenir (le cron n’appelle rien)');
  await q(`INSERT INTO public.appareils_push (user_id, plateforme, jeton) VALUES ($1, 'ios', 'jeton-6')`, [U(6)]);
  // Une place se libère (U4 garde sa réservation d'IP du E ; cloud_places_libres l'a déjà retirée).
  await q(`UPDATE public.essai_places SET n = 1`);
  await comme(null);
  ok((await un(`SELECT public.cloud_attente_places_a_offrir() AS r`)).r === 1 && (await un(`SELECT public.cloud_attente_a_prevenir_existe() AS r`)).r === true, 'une place : un inscrit à prévenir');
  const lot = (await un(`SELECT public.cloud_attente_a_prevenir(20) AS r`)).r;
  ok(lot.length === 1 && lot[0].user_id === U(6) && lot[0].appareils.length === 1, 'U6 (le premier) est prévenu, U7 non', JSON.stringify(lot.map((x) => x.user_id)));
  ok((await un(`SELECT public.cloud_attente_a_prevenir(20) AS r`)).r.length === 0, 'rejoué : personne d’autre (la place est gardée)');
  await comme(U(6));
  d = (await un(`SELECT public.cloud_disponibilite_moi() AS r`)).r;
  ok(d.vente_possible === true && d.attente.place_pour_toi === true, 'U6 : la place est pour lui (bandeau), il peut acheter', JSON.stringify(d));
  await comme(U(7));
  d = (await un(`SELECT public.cloud_disponibilite_moi() AS r`)).r;
  ok(d.vente_possible === false && d.raison === 'complet' && d.attente.rang === 1, 'U7 : complet, il passe rang 1', JSON.stringify(d));
  await comme(U(4));
  await q(`UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL`);
  d = (await un(`SELECT public.cloud_disponibilite_moi() AS r`)).r;
  ok(d.vente_possible === false && d.raison === 'complet', 'un non-inscrit ne passe pas devant la file', JSON.stringify(d));
  await comme(null);
  await un(`SELECT public.cloud_attente_resultat($1::jsonb) AS r`, [JSON.stringify({ notes: [{ id: U(6), statut: 'envoyee', resultat: [] }], invalides: [], ok: [], sandbox: [], echecs: [] })]);
  ok((await un(`SELECT notif_statut FROM public.cloud_attente WHERE user_id = $1`, [U(6)])).notif_statut === 'envoyee', 'le verdict de l’envoi est noté (une seule notification)');
  await comme(U(6));
  await q(`SELECT public.cloud_attente_quitter_moi()`);
  ok((await un(`SELECT public.cloud_disponibilite_moi() AS r`)).r.attente.inscrit === false, 'quitter la liste : plus inscrit');
  await comme(U(7));
  r = (await un(`SELECT public.cloud_essai_preparer_moi('app-7') AS r`)).r;
  ok(r.ok === true, 'U6 parti : U7 peut prendre la place', JSON.stringify(r));
  ok((await un(`SELECT count(*)::int AS n FROM public.cloud_attente WHERE user_id = $1`, [U(7)])).n === 0, '… et quitte la liste (préparation acceptée)');

  console.log('G. Droits');
  const droits = await q(`SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS a, has_function_privilege('anon', p.oid, 'EXECUTE') AS an
    FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname ~ '^cloud_(voie|voies|vente|disponibilite|attente|compte_synchroniser|essai_preparer)'`);
  const app = ['cloud_disponibilite_moi', 'cloud_attente_inscrire_moi', 'cloud_attente_quitter_moi', 'cloud_essai_preparer_moi'];
  ok(droits.filter((x) => app.includes(x.proname)).every((x) => x.a && !x.an), 'l’app : ses quatre fonctions « _moi » seulement (jamais anon)');
  ok(droits.filter((x) => !app.includes(x.proname)).every((x) => !x.a && !x.an), 'tout le reste : fermé à l’app', JSON.stringify(droits.filter((x) => !app.includes(x.proname) && (x.a || x.an))));
} catch (e) {
  echecs++;
  console.error('ERREUR', e.message, e.position ?? '', e.where ?? '');
} finally {
  await client.end().catch(() => {});
  if (embarque) { await embarque.pg.stop().catch(() => {}); try { embarque.rmSync(embarque.dossier, { recursive: true, force: true }); } catch { /* dossier temporaire */ } }
}
console.log(`\n${echecs === 0 ? 'TOUT VERT' : `${echecs} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(echecs === 0 ? 0 : 1);
