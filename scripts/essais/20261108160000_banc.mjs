// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261108160000_cloud_places_ip_du_compte (08/11, point 3 de Nico :
// « 14 places restantes » affichées quand 5 seulement pouvaient être servies) — jamais la prod.
//   PREUVE_PG=embarque node scripts/essais/20261108160000_banc.mjs
// Corps de la PROD du 08/11 (scripts/essais/fixtures/prod-0811-places-ip-compte/) ; décor = l'état relu en prod le 08/11
// à 14:53 : cloud-2 (15, apte) avec Nico dessus (IP 42), 5 IP « disponible » attribuables + l'IP 39 réservée à Nico,
// l'IP 2 AU REPOS qui revient à Nicotest (dernier_user_id).
//   A. AVANT : un compte ordinaire voit 5 ; Nicotest (IP au repos à lui) voit 14 — le défaut ;
//   B. APRÈS : ordinaire 5 (inchangé), Nicotest 6 = LEAST(14, 5 + la sienne) ; le compteur (cloud_disponibilite_moi)
//      lit le même chiffre ;
//   C. plus AUCUNE IP libre : l'ordinaire « complet », Nicotest garde UNE place (son IP) — jamais 14 ;
//   D. serveur plein : 0 pour tous, son IP n'ouvre rien (jamais une place que le serveur ne peut pas servir) ;
//   E. rotation : inchangée (le serveur seul borne) ; Nico, déjà client : inchangé ;
//   F. l'INVERSE rend la règle d'avant (Nicotest 14).
import pg from 'pg';
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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-places-ip-compte-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port: 55449, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }) };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:banc@127.0.0.1:55449/postgres';
}

const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
const NICOTEST = '5322fa18-c194-458b-a222-7ee4093c4968';
const ORDINAIRE = '00000000-0000-4000-8000-000000000001';
const DECOR = String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('banc.uid', true), '')::uuid $f$;
CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer, updated_at timestamptz DEFAULT now());
CREATE TABLE public.profiles (id uuid PRIMARY KEY, is_cloud boolean DEFAULT false, cloud_essai_debut timestamptz);
CREATE TABLE public.cloud_serveurs (nom text PRIMARY KEY, domaine text, capacite integer NOT NULL DEFAULT 0, ouverts integer DEFAULT 0,
  comptes integer DEFAULT 0, etat text NOT NULL DEFAULT 'actif', vu_le timestamptz, details jsonb DEFAULT '{}'::jsonb);
CREATE TABLE public.cloud_ips (id bigserial PRIMARY KEY, ip inet, etat text DEFAULT 'achetee', user_id uuid, dernier_user_id uuid,
  reserve_pour uuid, reserve_jusqu_au timestamptz, repos_fin timestamptz, expire_le timestamptz, attributions integer DEFAULT 0,
  sante jsonb);
CREATE TABLE public.cloud_attente (user_id uuid PRIMARY KEY, inscrit_le timestamptz, notifie_le timestamptz);
-- Réduits (hors sujet ; la prod les lit ailleurs) : les comptes servis = les profils Cloud ; l'état Cloud = is_cloud.
CREATE FUNCTION public.cloud_comptes_a_servir() RETURNS TABLE (user_id uuid) LANGUAGE sql STABLE AS
  $f$ SELECT p.id FROM public.profiles p WHERE p.is_cloud $f$;
CREATE FUNCTION public.cloud_etat(p_user uuid, p_maintenant timestamptz DEFAULT now()) RETURNS jsonb LANGUAGE sql STABLE AS
  $f$ SELECT jsonb_build_object('actif', COALESCE((SELECT is_cloud FROM public.profiles WHERE id = p_user), false)) $f$;
`;
const PROD = ['cloud_ts', 'cloud_param', 'cloud_voie_attendue', 'cloud_ip_attribuable', 'cloud_places_libres', 'cloud_attente_places_a_offrir',
  'cloud_vente_etat', 'cloud_disponibilite_moi'];
const FIX = 'scripts/essais/fixtures/prod-0811-places-ip-compte';
const ETAT = String.raw`
INSERT INTO public.coin_config (key, value) VALUES ('cloud_ip_rotation', 0);
INSERT INTO public.profiles (id, is_cloud) VALUES ('${NICO}', true);
INSERT INTO public.profiles (id, cloud_essai_debut) VALUES ('${NICOTEST}', now() - interval '20 hours');
INSERT INTO public.profiles (id) VALUES ('${ORDINAIRE}');
INSERT INTO public.cloud_serveurs (nom, domaine, capacite, ouverts, comptes, etat, vu_le, details) VALUES
  ('cloud-2', 'cloud-2.fillsell.app', 15, 1, 1, 'actif', now(), '{"service":{"apte":true}}');
INSERT INTO public.cloud_ips (id, ip, etat, user_id, attributions, expire_le) VALUES
  (42, '198.51.100.42', 'attribuee_client', '${NICO}', 1, now() + interval '23 days');
INSERT INTO public.cloud_ips (id, ip, etat, attributions, expire_le, reserve_pour, reserve_jusqu_au) VALUES
  (39, '198.51.100.39', 'disponible', 1, now() + interval '22 days', '${NICO}', now() + interval '22 days');
INSERT INTO public.cloud_ips (id, ip, etat, attributions, expire_le, sante)
  SELECT 30 + n, ('198.51.100.' || (30 + n))::inet, 'disponible', 0, now() + interval '16 days', '{"verdict":"saine"}'::jsonb
    FROM generate_series(1, 5) n;
INSERT INTO public.cloud_ips (id, ip, etat, dernier_user_id, attributions, expire_le, repos_fin) VALUES
  (2, '198.51.100.2', 'repos', '${NICOTEST}', 1, now() + interval '21 days', now() + interval '6 days');
`;

const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
let echecs = 0;
const verifier = (nom, cond, detail = '') => { console.log(`${cond ? '✓' : '✗'} ${nom}${!cond && detail !== '' ? ` — ${detail}` : ''}`); if (!cond) echecs++; };
const un = async (q, p) => (await c.query(q, p)).rows[0];
const vente = async (u) => (await un('SELECT public.cloud_vente_etat($1::uuid) AS v', [u])).v;
const dispoMoi = async (u) => {
  await c.query('BEGIN');
  await c.query(`SELECT set_config('banc.uid', $1, true)`, [u]);
  const r = await un('SELECT public.cloud_disponibilite_moi() AS d');
  await c.query('COMMIT');
  return r.d;
};

try {
  await c.query(DECOR);
  for (const f of PROD) await c.query(`${lire(`${FIX}/${f}.sql`)};`);
  await c.query(ETAT);

  // A. AVANT — la prod du 08/11
  let o = await vente(ORDINAIRE);
  let t = await vente(NICOTEST);
  verifier('A. AVANT : un compte ordinaire voit 5 places (LEAST(14, 5 IP))', o.places === 5 && o.vente_possible === true, JSON.stringify(o));
  verifier('A. AVANT : Nicotest (IP au repos à lui) voit 14 — le défaut', t.places === 14, JSON.stringify(t));

  // B. LA MIGRATION
  await c.query(lire('supabase/migrations/20261108160000_cloud_places_ip_du_compte.sql'));
  o = await vente(ORDINAIRE);
  t = await vente(NICOTEST);
  verifier('B. APRÈS : l’ordinaire voit toujours 5', o.places === 5 && o.vente_possible === true && o.raison === null, JSON.stringify(o));
  verifier('B. APRÈS : Nicotest voit 6 = LEAST(14, 5 libres + la sienne), vente possible', t.places === 6 && t.vente_possible === true && t.ip === true, JSON.stringify(t));
  const d = await dispoMoi(NICOTEST);
  verifier('B. le compteur de l’app (cloud_disponibilite_moi) lit le même 6', d.places === 6 && d.vente_possible === true, JSON.stringify(d));
  verifier('B. Nico, déjà client : inchangé', (await vente(NICO)).raison === 'deja_client');

  // C. Plus aucune IP libre
  await c.query(`UPDATE public.cloud_ips SET etat = 'expiree' WHERE id BETWEEN 31 AND 35`);
  o = await vente(ORDINAIRE);
  t = await vente(NICOTEST);
  verifier('C. plus d’IP libre : l’ordinaire est « complet », jamais une place sans IP', o.places === 0 && o.vente_possible === false, JSON.stringify(o));
  verifier('C. Nicotest garde UNE place, la sienne — jamais 14', t.places === 1 && t.vente_possible === true, JSON.stringify(t));
  await c.query(`UPDATE public.cloud_ips SET etat = 'disponible' WHERE id BETWEEN 31 AND 35`);

  // D. Serveur plein
  await c.query(`UPDATE public.cloud_serveurs SET capacite = 1`);
  o = await vente(ORDINAIRE);
  t = await vente(NICOTEST);
  verifier('D. serveur plein : 0 pour l’ordinaire et pour Nicotest (son IP n’ouvre pas une place serveur)', o.places === 0 && t.places === 0 && t.vente_possible === false, `${JSON.stringify(o)} ${JSON.stringify(t)}`);
  await c.query(`UPDATE public.cloud_serveurs SET capacite = 15`);

  // E. Rotation : le serveur seul borne (inchangé)
  await c.query(`UPDATE public.coin_config SET value = 1 WHERE key = 'cloud_ip_rotation'`);
  verifier('E. rotation : 14 pour tous (règle inchangée)', (await vente(ORDINAIRE)).places === 14 && (await vente(NICOTEST)).places === 14);
  await c.query(`UPDATE public.coin_config SET value = 0 WHERE key = 'cloud_ip_rotation'`);

  // F. L'INVERSE
  await c.query(lire('supabase/rollbacks/20261108160000_cloud_places_ip_du_compte_INVERSE.sql'));
  verifier('F. INVERSE : la règle d’avant revient (Nicotest 14, ordinaire 5)', (await vente(NICOTEST)).places === 14 && (await vente(ORDINAIRE)).places === 5);
  const def = (await un(`SELECT pg_get_functiondef('public.cloud_vente_etat(uuid)'::regprocedure) AS d`)).d.replace(/\r\n/g, '\n').trim();
  verifier('F. INVERSE : le corps rendu est celui de la prod, mot pour mot', def === lire(`${FIX}/cloud_vente_etat.sql`).trim());
} catch (e) {
  echecs++;
  console.error('✗ banc interrompu :', e.message);
} finally {
  await c.end();
  if (embarque) await embarque.pg.stop();
}
console.log(echecs ? `✗ ${echecs} échec(s)` : '✓ banc 20261108160000 : tout est vert');
process.exit(echecs ? 1 : 0);
