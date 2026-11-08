// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261108233000_cloud_ip_repos_sans_connexion (08/11 nuit, décision de
// Nico : « on peut les réattribuer, celles où la connexion n'a jamais réussi ») — jamais la prod.
//   PREUVE_PG=embarque node scripts/essais/20261108233000_banc.mjs
// Corps de la PROD relu le 08/11 (scripts/essais/fixtures/prod-0811-remettre-en-pool/) ; les fonctions qu'il appelle
// (purge, contrôle, journal) sont des doublures neutres : seul le repos est en jeu.
//   A. AVANT (prod) : une IP au repos depuis 1 h, jamais connectée → refusée « repos_en_cours » (le défaut) ;
//   B. APRÈS : jamais connectée pendant la tenue → rejoint le pool ; connectée pendant la tenue → repos gardé ; connectée
//      AVANT la tenue (autre IP) → rejoint le pool ; repos fini → rejoint le pool (inchangé) ; purge non prouvée → refusée
//      (inchangé) ; expirée → refusée (inchangé) ;
//   C. l'INVERSE rend le corps de la prod (le défaut revient).
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  embarque = new EmbeddedPostgres({ databaseDir: mkdtempSync(join(tmpdir(), 'fillsell-banc-ip-repos-')), user: 'postgres', password: 'banc',
    port: 55453, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} });
  await embarque.initialise();
  await embarque.start();
  PG_URL = 'postgres://postgres:banc@127.0.0.1:55453/postgres';
}
const DECOR = `
CREATE TABLE public.cloud_ips (id bigint PRIMARY KEY, ip text, etat text, user_id uuid, dernier_user_id uuid, attribuee_le timestamptz,
  liberee_le timestamptz, repos_fin timestamptz, purge_preuve jsonb, purge_prouvee_le timestamptz, expire_le timestamptz, maj_le timestamptz);
CREATE TABLE public.cloud_connexions (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid, plateforme text, statut text,
  ouverte_le timestamptz, close_le timestamptz, raison text);
CREATE FUNCTION public.cloud_purge_manques(p jsonb, l timestamptz) RETURNS text[] LANGUAGE sql AS $$ SELECT '{}'::text[] $$;
CREATE FUNCTION public.cloud_controle_manques(c jsonb, ip text) RETURNS text[] LANGUAGE sql AS $$ SELECT '{}'::text[] $$;
CREATE FUNCTION public.cloud_journal(i bigint, n text, u uuid, d jsonb) RETURNS void LANGUAGE sql AS $$ SELECT $$;
`;
const U = (n) => `00000000-0000-4000-8000-00000000001${n}`;
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
const client = new pg.Client({ connectionString: PG_URL });
await client.connect();
const q = (s, v) => client.query(s, v);
// Une IP au repos : attribuée il y a 2 h, libérée il y a 1 h, repos jusqu'à J+6, purge prouvée il y a 30 min.
const ip = (id, user, { finRepos = "now() + interval '6 days'", purge = "now() - interval '30 minutes'", expire = "now() + interval '20 days'" } = {}) =>
  q(`INSERT INTO public.cloud_ips VALUES ($1, '10.0.0.${id}', 'repos', NULL, $2, now() - interval '2 hours', now() - interval '1 hour',
     ${finRepos}, '{}'::jsonb, ${purge}, ${expire}, now())
     ON CONFLICT (id) DO UPDATE SET etat = 'repos', dernier_user_id = EXCLUDED.dernier_user_id, repos_fin = EXCLUDED.repos_fin,
       purge_prouvee_le = EXCLUDED.purge_prouvee_le, expire_le = EXCLUDED.expire_le`, [id, user]);
const remettre = async (id) => (await q("SELECT public.cloud_ip_remettre_en_pool($1, '{}'::jsonb) AS r", [id])).rows[0].r;
const etat = async (id) => (await q('SELECT etat FROM public.cloud_ips WHERE id = $1', [id])).rows[0].etat;
try {
  await q(DECOR);
  await q(`INSERT INTO public.cloud_connexions (user_id, plateforme, statut, ouverte_le) VALUES
    ($1, 'vinted', 'abandonnee', now() - interval '110 minutes'), ($1, 'leboncoin', 'abandonnee', now() - interval '100 minutes'),
    ($2, 'vinted', 'connectee', now() - interval '90 minutes'),
    ($3, 'vinted', 'connectee', now() - interval '3 days')`, [U(1), U(2), U(3)]);

  console.log('A. AVANT (corps de la prod)');
  await q(lire('scripts/essais/fixtures/prod-0811-remettre-en-pool/cloud_ip_remettre_en_pool.sql'));
  await ip(4, U(1));
  let r = await remettre(4);
  ok(r.ok === false && r.manques.includes('repos_en_cours'), 'prod : IP jamais connectée, repos en cours → refusée (le défaut)');

  console.log('B. APRÈS (migration)');
  await q(lire('supabase/migrations/20261108233000_cloud_ip_repos_sans_connexion.sql'));
  r = await remettre(4);
  ok(r.ok === true && await etat(4) === 'disponible', 'jamais connectée pendant la tenue (abandonnées seulement) → rejoint le pool');
  await ip(5, U(2));
  r = await remettre(5);
  ok(r.ok === false && r.manques.includes('repos_en_cours') && await etat(5) === 'repos', 'connectée pendant la tenue → repos gardé');
  await ip(6, U(3));
  r = await remettre(6);
  ok(r.ok === true, 'connectée AVANT la tenue (une autre IP, il y a 3 jours) → rejoint le pool');
  await ip(7, U(2), { finRepos: "now() - interval '1 minute'" });
  r = await remettre(7);
  ok(r.ok === true, 'repos fini → rejoint le pool (inchangé)');
  await ip(8, U(1), { purge: 'NULL' });
  r = await remettre(8);
  ok(r.ok === false && r.manques.includes('purge_non_prouvee'), 'purge non prouvée → refusée (inchangé)');
  await ip(9, U(1), { expire: "now() - interval '1 day'" });
  r = await remettre(9);
  ok(r.ok === false && r.manques.includes('expiree'), 'expirée → refusée (inchangé)');
  await q("INSERT INTO public.cloud_ips VALUES (10, '10.0.0.10', 'repos', NULL, NULL, NULL, now() - interval '1 hour', now() + interval '6 days', '{}'::jsonb, now(), now() + interval '9 days', now())");
  r = await remettre(10);
  ok(r.ok === false && r.manques.includes('repos_en_cours'), 'IP sans dernier compte connu → repos gardé (prudence)');

  console.log('C. INVERSE');
  await q(lire('supabase/rollbacks/20261108233000_cloud_ip_repos_sans_connexion_INVERSE.sql'));
  await ip(4, U(1));
  r = await remettre(4);
  ok(r.ok === false && r.manques.includes('repos_en_cours'), 'inverse : le corps de la prod revient (repos de 7 jours pour toutes)');
  const corps = (await q("SELECT pg_get_functiondef('public.cloud_ip_remettre_en_pool(bigint, jsonb)'::regprocedure) AS d")).rows[0].d;
  const norm = (s) => s.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();
  ok(norm(corps) === norm(lire('scripts/essais/fixtures/prod-0811-remettre-en-pool/cloud_ip_remettre_en_pool.sql')), 'inverse : corps = prod, mot pour mot');
  console.log(`\n${n}/${n} — banc vert.`);
} finally {
  await client.end().catch(() => {});
  if (embarque) await embarque.stop().catch(() => {});
}
