// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261114120000_cloud_ip_grillee_recontrolee (14/11, complément 3 de Nico :
// « aucune IP payée ne doit être gaspillée » ; la quarantaine remplace « grillée définitif ») — jamais la prod.
//   PREUVE_PG=embarque node scripts/essais/20261114120000_banc.mjs
// Corps de la PROD du 14/11 (pg_get_functiondef relu en lecture seule, md5 5d8de791f46faa1f9c4951ed3bdc4c51) ; cloud_ts et
// cloud_journal : fixtures de prod du 13/11 (scripts/essais/fixtures/prod-1311-ip-quarantaine/). Décor synthétique (IP 10.x).
//   A. AVANT (la prod) : une IP grillée ne revient JAMAIS (« deja_grillee »), même après un contrôle réussi ;
//   B. APRÈS : un contrôle réussi la remet « saine » (journal visite_controle grillee → saine) ; refus inchangés (IP tenue
//      par un compte, hors pool, santé illisible) ; droits inchangés ; la migration se rejoue (idempotente) ;
//   C. L'INVERSE : le corps de la prod revient à l'octet près (fins de ligne mises à part), la garde avec lui.
import pg from 'pg';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = process.env.BANC_MIGRATION ?? 'supabase/migrations/20261114120000_cloud_ip_grillee_recontrolee.sql';
const INVERSE = process.env.BANC_INVERSE ?? 'supabase/rollbacks/20261114120000_cloud_ip_grillee_recontrolee_INVERSE.sql';
const PROD_NOTER = process.env.BANC_PROD ?? 'scripts/essais/fixtures/prod-1411-ip-sante/cloud_ip_sante_noter.sql';
const FIX13 = 'scripts/essais/fixtures/prod-1311-ip-quarantaine';
let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  // Les fichiers de travail restent dans le projet (.tmp-terminal/, consigne de Nico du 14/11), jamais dans le Temp système.
  const dossier = join(ROOT, '.tmp-terminal', `banc-pg-${process.pid}`);
  mkdirSync(dossier, { recursive: true });
  embarque = { pg: new EmbeddedPostgres({ databaseDir: join(dossier, 'base'), user: 'postgres', password: 'banc', port: 55452, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:banc@127.0.0.1:55452/postgres';
}
const DECOR = String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE public.cloud_ips (id bigserial PRIMARY KEY, commande text NOT NULL, ip inet NOT NULL, etat text NOT NULL DEFAULT 'disponible',
  user_id uuid, expire_le timestamptz NOT NULL, maj_le timestamptz NOT NULL DEFAULT now(), sante jsonb);
CREATE TABLE public.cloud_ip_evenements (id bigserial PRIMARY KEY, ip_id bigint NOT NULL REFERENCES public.cloud_ips (id),
  le timestamptz NOT NULL DEFAULT now(), nature text NOT NULL, user_id uuid, details jsonb NOT NULL DEFAULT '{}'::jsonb);
`;
const U = '00000000-0000-4000-8000-000000000001';
const GRILLEE = { version: 1, verdict: 'grillee', le: '2026-11-14T09:05:00Z', grillee_le: '2026-11-14T09:05:00Z', suspecte_le: '2026-11-14T08:30:00Z', echecs: ['beebs', 'leboncoin'] };
const ETAT = `
TRUNCATE public.cloud_ip_evenements RESTART IDENTITY; DELETE FROM public.cloud_ips;
INSERT INTO public.cloud_ips (id, commande, ip, etat, user_id, expire_le, sante) VALUES
  (3,  '90000003', '10.9.0.3',  'disponible', NULL, now() + interval '20 days', '${JSON.stringify(GRILLEE)}'::jsonb),
  (79, '90000079', '10.9.0.79', 'disponible', NULL, now() + interval '20 days', '${JSON.stringify({ ...GRILLEE, echecs: ['ebay'] })}'::jsonb),
  (50, '90000050', '10.9.0.50', 'attribuee_client', '${U}', now() + interval '20 days', '${JSON.stringify(GRILLEE)}'::jsonb),
  (51, '90000051', '10.9.0.51', 'expiree', NULL, now() - interval '1 day', '${JSON.stringify(GRILLEE)}'::jsonb);
`;
const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
let echecs = 0;
const verifier = (nom, cond, detail = '') => { console.log(`${cond ? '✓' : '✗'} ${nom}${!cond && detail !== '' ? ` — ${detail}` : ''}`); if (!cond) echecs++; };
const un = async (q, p) => (await c.query(q, p)).rows[0];
const saine = { version: 1, verdict: 'saine', le: new Date().toISOString(), saine_le: new Date().toISOString(), echecs: [] };
const noter = async (id, s) => (await un('SELECT public.cloud_ip_sante_noter($1, $2::jsonb) AS r', [id, JSON.stringify(s)])).r;
const verdict = async (id) => (await un('SELECT sante ->> \'verdict\' AS v FROM public.cloud_ips WHERE id = $1', [id])).v;
const corps = async () => (await un(`SELECT pg_get_functiondef('public.cloud_ip_sante_noter'::regproc) AS d`)).d.replace(/\r\n/g, '\n').trim();
const acl = async () => (await un(`SELECT proacl::text AS a FROM pg_proc WHERE proname = 'cloud_ip_sante_noter'`)).a;
try {
  await c.query(DECOR);
  for (const f of ['cloud_ts', 'cloud_journal']) await c.query(`${lire(`${FIX13}/${f}.sql`)};`);
  await c.query(`${lire(PROD_NOTER)};`);
  await c.query(`REVOKE ALL ON FUNCTION public.cloud_ip_sante_noter(bigint, jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.cloud_ip_sante_noter(bigint, jsonb) TO service_role;`);
  const corpsProd = await corps();
  const aclAvant = await acl();
  await c.query(ETAT);
  // ── A. AVANT ──
  const a = await noter(3, saine);
  verifier('A. AVANT (prod) : IP grillée + contrôle réussi → refusé « deja_grillee », reste grillée',
    a.ok === false && a.raison === 'deja_grillee' && await verdict(3) === 'grillee', JSON.stringify(a));
  // ── B. APRÈS ──
  await c.query(lire(MIGRATION));
  await c.query(lire(MIGRATION));
  verifier('B0. la migration passe deux fois (idempotente)', true);
  verifier('B0. droits INCHANGÉS (service_role seul)', await acl() === aclAvant && !/anon|authenticated|(^|[{,])=X/.test(aclAvant), `${aclAvant} → ${await acl()}`);
  const b = await noter(3, saine);
  verifier('B1. un contrôle réussi remet l’IP grillée « saine » (retour au pool)', b.ok === true && b.avant === 'grillee' && b.apres === 'saine' && await verdict(3) === 'saine', JSON.stringify(b));
  const j = (await c.query(`SELECT nature, details FROM public.cloud_ip_evenements WHERE ip_id = 3 ORDER BY id`)).rows;
  verifier('B1. … journal : visite_controle grillee → saine', j.length === 1 && j[0].nature === 'visite_controle' && j[0].details?.sante?.avant === 'grillee' && j[0].details?.sante?.apres === 'saine', JSON.stringify(j));
  const b79 = await noter(79, saine);
  verifier('B1. l’IP « grillée sur eBay seulement » revient aussi au premier contrôle réussi', b79.ok === true && await verdict(79) === 'saine', JSON.stringify(b79));
  const bg = await noter(3, GRILLEE);
  verifier('B2. un nouvel échec la remet grillée (rien de bloqué dans l’autre sens)', bg.ok === true && await verdict(3) === 'grillee', JSON.stringify(bg));
  const t = await noter(50, saine);
  verifier('B3. refus inchangé : IP tenue par un compte', t.ok === false && t.raison === 'ip_tenue_par_un_compte', JSON.stringify(t));
  const h = await noter(51, saine);
  verifier('B3. refus inchangé : IP hors pool (expirée)', h.ok === false && h.raison === 'ip_hors_pool', JSON.stringify(h));
  const i = await noter(3, { verdict: 'peut-etre' });
  verifier('B3. refus inchangé : santé illisible', i.ok === false && i.raison === 'sante_illisible', JSON.stringify(i));
  // ── C. L'INVERSE ──
  await c.query(lire(INVERSE));
  verifier('C. inverse : le corps de la prod revient (fins de ligne mises à part)', await corps() === corpsProd);
  await c.query(ETAT);
  const ci = await noter(3, saine);
  verifier('C. … et la garde avec lui (deja_grillee)', ci.ok === false && ci.raison === 'deja_grillee', JSON.stringify(ci));
  verifier('C. droits inchangés après l’inverse', await acl() === aclAvant);
} catch (e) {
  echecs++;
  console.log(`✗ ERREUR : ${e.message}`);
} finally {
  await c.end();
  if (embarque) { await embarque.pg.stop(); rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(echecs ? `\n${echecs} ÉCHEC(S)` : '\nBanc VERT.');
process.exit(echecs ? 1 : 0);
