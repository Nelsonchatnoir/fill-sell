// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261107170000_cloud_places_min_ip (07/11, feu vert NOMMÉ de Nico :
// « places = min(places du serveur, IP libres) ») — jamais la prod.
//   PREUVE_PG=embarque node scripts/essais/20261107170000_banc.mjs
// Corps de la PROD du 07/11 (scripts/essais/fixtures/prod-0711-places-min-ip/) ; décor = l'état relu en prod le 07/11 :
// cloud-2 (15, apte) avec Nico dessus, IP 42 à Nico, 7 IP « disponible » dont l'IP 39 réservée à Nico jusqu'au 03/12.
//   A. AVANT : le compteur dit 14 (serveur seul) quand le pool n'a que 6 IP pour un nouveau compte — le défaut ;
//   B. APRÈS : 6 = LEAST(14, 6), le même chiffre pour la vente, le compteur (cloud_disponibilite_moi) et la liste
//      d'attente (cloud_attente_places_a_offrir) ;
//   C. six comptes paient (cloud_essai_preparer_moi réserve une IP chacun) → le 7e : « complet », inscrit sur la liste,
//      AUCUNE IP réservée — jamais un paiement sans place ET sans IP ;
//   D. la chaîne d'achat (point 2) : une IP livrée (cloud_ip_ajouter, « achetee ») ne compte pas ; contrôlée
//      (cloud_ip_controle_entree) elle entre au pool → la place remonte ; 20 IP de plus → plafonné par le SERVEUR ;
//   E. la file, la rotation, l'IP au repos du compte ; F. l'INVERSE rend la règle d'avant.
import pg from 'pg';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-places-ip-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port: 55447, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:banc@127.0.0.1:55447/postgres';
}

const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Un décor réduit aux colonnes que lisent les fonctions de la prod (types et défauts relus le 07/11).
const DECOR = String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('banc.uid', true), '')::uuid $f$;
CREATE SCHEMA vault;
CREATE FUNCTION vault.create_secret(p_secret text, p_nom text, p_desc text) RETURNS uuid LANGUAGE sql AS $f$ SELECT gen_random_uuid() $f$;
CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer, updated_at timestamptz DEFAULT now());
CREATE TABLE public.profiles (id uuid PRIMARY KEY, is_cloud boolean DEFAULT false, cloud_essai_debut timestamptz);
CREATE TABLE public.cloud_serveurs (nom text PRIMARY KEY, domaine text, capacite integer NOT NULL DEFAULT 0, ouverts integer DEFAULT 0,
  comptes integer DEFAULT 0, etat text NOT NULL DEFAULT 'actif', vu_le timestamptz, details jsonb DEFAULT '{}'::jsonb);
CREATE TABLE public.cloud_ips (id bigserial PRIMARY KEY, fournisseur text DEFAULT 'iproyal', commande text, ip inet, port integer,
  pays text DEFAULT 'FR', ville text, asn text, secret_nom text, etat text DEFAULT 'achetee', user_id uuid, dernier_user_id uuid,
  derniere_origine text, reserve_pour uuid, reserve_jusqu_au timestamptz, attribuee_le timestamptz, liberee_le timestamptz,
  repos_fin timestamptz, purge_preuve jsonb, purge_prouvee_le timestamptz, expire_le timestamptz, livree_le timestamptz DEFAULT now(),
  attributions integer DEFAULT 0, rebut_critere text, rebut_le timestamptz, cree_le timestamptz DEFAULT now(),
  maj_le timestamptz DEFAULT now(), refus jsonb DEFAULT '{}'::jsonb);
CREATE TABLE public.cloud_ip_evenements (id bigserial PRIMARY KEY, ip_id bigint, nature text, user_id uuid, details jsonb);
CREATE TABLE public.cloud_attente (user_id uuid PRIMARY KEY, demande_le timestamptz DEFAULT now(), derniere_le timestamptz DEFAULT now(),
  essais integer DEFAULT 1, inscrit_le timestamptz, notifie_le timestamptz, notif_statut text, notif_essais integer DEFAULT 0,
  notif_motif text, notif_resultat jsonb);
CREATE TABLE public.cloud_essai_demandes (user_id uuid PRIMARY KEY, appareil_h text, comptes_h jsonb DEFAULT '[]'::jsonb,
  essai_permis boolean, raison text, demande_le timestamptz DEFAULT now());
CREATE TABLE public.cloud_essai_empreintes (id bigserial PRIMARY KEY, user_id uuid, nature text, plateforme text, empreinte text,
  vu_le timestamptz DEFAULT now(), conserver_jusqu_au timestamptz);
CREATE TABLE public.vinted_sync_runs (user_id uuid, vinted_user_id bigint);
-- Les comptes servis, l'état Cloud et le hachage : réduits (hors sujet ; la prod les lit ailleurs).
CREATE FUNCTION public.cloud_comptes_a_servir() RETURNS TABLE (user_id uuid) LANGUAGE sql STABLE AS
  $f$ SELECT p.id FROM public.profiles p WHERE p.is_cloud $f$;
CREATE FUNCTION public.cloud_etat(p_user uuid, p_maintenant timestamptz DEFAULT now()) RETURNS jsonb LANGUAGE sql STABLE AS
  $f$ SELECT jsonb_build_object('actif', COALESCE((SELECT is_cloud FROM public.profiles WHERE id = p_user), false)) $f$;
CREATE FUNCTION public.cloud_hacher(p_espace text, p_valeur text) RETURNS text LANGUAGE sql STABLE AS
  $f$ SELECT md5(p_espace || ':' || p_valeur) $f$;
CREATE FUNCTION public.cloud_ip_signaler(p_ip bigint, p_critere text, p_details jsonb) RETURNS jsonb LANGUAGE sql AS
  $f$ UPDATE public.cloud_ips SET etat = 'rebut', rebut_critere = p_critere, rebut_le = now() WHERE id = p_ip RETURNING '{}'::jsonb $f$;
`;
const PROD = ['cloud_ts', 'cloud_param', 'cloud_voie_attendue', 'cloud_ip_attribuable', 'cloud_places_libres', 'cloud_attente_places_a_offrir',
  'cloud_journal', 'cloud_ip_refus_prouve', 'cloud_ip_reserver', 'cloud_vente_etat', 'cloud_disponibilite_moi', 'cloud_essai_preparer_moi',
  'cloud_controle_manques', 'cloud_ip_controle_entree', 'cloud_ip_ajouter'];
const FIX = 'scripts/essais/fixtures/prod-0711-places-min-ip';
const presentes = new Set(readdirSync(join(ROOT, FIX)).map((f) => f.replace(/\.sql$/, '')));
const ETAT = String.raw`
INSERT INTO public.coin_config (key, value) VALUES ('cloud_ip_rotation', 0), ('cloud_ip_stock_min', 2);
INSERT INTO public.profiles (id, is_cloud) VALUES ('${NICO}', true);
INSERT INTO public.profiles (id) SELECT ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid FROM generate_series(1, 40) n;
INSERT INTO public.cloud_serveurs (nom, domaine, capacite, ouverts, comptes, etat, vu_le, details) VALUES
  ('cloud-1', 'cloud.fillsell.app', 7, 0, 0, 'retire', now() - interval '18 hours', '{}'),
  ('cloud-2', 'cloud-2.fillsell.app', 15, 1, 1, 'actif', now(), '{"service":{"apte":true}}');
INSERT INTO public.cloud_ips (id, commande, ip, etat, user_id, attributions, expire_le) VALUES
  (42, 'c42', '198.51.100.42', 'attribuee_client', '${NICO}', 1, now() + interval '27 days');
INSERT INTO public.cloud_ips (id, commande, ip, etat, attributions, expire_le, reserve_pour, reserve_jusqu_au) VALUES
  (39, 'c39', '198.51.100.39', 'disponible', 1, now() + interval '26 days', '${NICO}', now() + interval '26 days');
INSERT INTO public.cloud_ips (id, commande, ip, etat, attributions, expire_le)
  SELECT 30 + n, 'c' || n, ('198.51.100.' || (30 + n))::inet, 'disponible', 0, now() + interval '22 days' + n * interval '1 day'
    FROM generate_series(1, 6) n;
INSERT INTO public.cloud_ips (id, commande, ip, etat, attributions, expire_le) VALUES
  (10, 'c10', '198.51.100.10', 'expiree', 2, now() - interval '4 days'), (11, 'c11', '198.51.100.11', 'expiree', 2, now() - interval '4 days');
SELECT setval('public.cloud_ips_id_seq', 1000);
`;

const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
let echecs = 0;
const verifier = (nom, cond, detail = '') => { console.log(`${cond ? '✓' : '✗'} ${nom}${!cond && detail !== '' ? ` — ${detail}` : ''}`); if (!cond) echecs++; };
const un = async (q, p) => (await c.query(q, p)).rows[0];
const vente = async (u) => (await un('SELECT public.cloud_vente_etat($1::uuid) AS v', [u])).v;
const aOffrir = async () => (await un('SELECT public.cloud_attente_places_a_offrir() AS n')).n;
const commeMoi = async (u, q, p = []) => {
  await c.query('BEGIN');
  await c.query(`SELECT set_config('banc.uid', $1, true)`, [u]);
  const r = await un(q, p);
  await c.query('COMMIT');
  return r;
};
const dispoMoi = async (u) => (await commeMoi(u, 'SELECT public.cloud_disponibilite_moi() AS d')).d;
const preparer = async (u) => (await commeMoi(u, 'SELECT public.cloud_essai_preparer_moi($1) AS r', [`appareil-${u}`])).r;
const reservees = async () => Number((await un(`SELECT count(*) AS n FROM public.cloud_ips WHERE reserve_pour IS NOT NULL AND reserve_jusqu_au > now()`)).n);
const CONTROLE_OK = (ip) => JSON.stringify({ fait_le: new Date().toISOString(), ip_sortie: ip, pays: 'FR', listes_noires: [], plateformes: { vinted: 'ok' } });

try {
  for (const f of PROD) if (!presentes.has(f)) throw new Error(`fixture absente : ${f}`);
  await c.query(DECOR);
  for (const f of PROD) await c.query(`${lire(`${FIX}/${f}.sql`)};`);
  await c.query(ETAT);

  // A. AVANT — la prod du 07/11
  let v = await vente(U(1));
  verifier('A. AVANT : un nouveau compte voit 14 places (serveur seul)', v.places === 14 && v.vente_possible === true, JSON.stringify(v));
  verifier('A. AVANT : la liste d\'attente, elle, offre 6 = LEAST(14, 6 IP) — les deux chiffres diffèrent', (await aOffrir()) === 6);

  // B. LA MIGRATION
  await c.query(lire('supabase/migrations/20261107170000_cloud_places_min_ip.sql'));
  v = await vente(U(1));
  verifier('B. APRÈS : 6 places = LEAST(14 places serveur, 6 IP attribuables), vente possible', v.places === 6 && v.vente_possible === true && v.raison === null, JSON.stringify(v));
  const d = await dispoMoi(U(1));
  verifier('B. le compteur (cloud_disponibilite_moi) lit le même 6', d.places === 6 && d.vente_possible === true, JSON.stringify(d));
  verifier('B. la liste d\'attente offre le même 6', (await aOffrir()) === 6);
  verifier('B. Nico (déjà client) : inchangé (« deja_client »)', (await vente(NICO)).raison === 'deja_client');
  await c.query(`UPDATE public.profiles SET cloud_essai_debut = now() - interval '20 days' WHERE id = $1`, [U(40)]);
  verifier('B. un ancien essai (nature « client ») : 6 aussi', (await vente(U(40))).places === 6);

  // C. LA VENTE S'ARRÊTE AVEC LES IP
  const suite = [];
  for (let k = 1; k <= 6; k++) {
    const r = await preparer(U(k));
    suite.push(`${k}:${r.ok ? 'ok' : r.raison}`);
    const reste = (await vente(U(30))).places;
    if (!r.ok || reste !== 6 - k) { verifier(`C. paiement ${k} : IP réservée et place décomptée`, false, `${JSON.stringify(r)} reste ${reste}`); break; }
  }
  verifier('C. six comptes passent la préparation (une IP réservée chacun), le compteur descend 5,4,3,2,1,0', suite.join(' ') === '1:ok 2:ok 3:ok 4:ok 5:ok 6:ok', suite.join(' '));
  v = await vente(U(7));
  verifier('C. le 7e : 0 place, « complet », vente impossible', v.places === 0 && v.raison === 'complet' && v.vente_possible === false, JSON.stringify(v));
  verifier('C. … alors que le serveur a encore 8 places (14 − 6 réservations)', Number((await un('SELECT public.cloud_places_libres() AS n')).n) === 8);
  const avant7 = await reservees();
  const r7 = await preparer(U(7));
  verifier('C. sa préparation (avant tout paiement) est REFUSÉE « complet », aucune IP réservée', r7.ok === false && r7.raison === 'complet' && (await reservees()) === avant7, JSON.stringify(r7));
  verifier('C. … et le note pour la liste d\'attente', Boolean(await un('SELECT 1 AS x FROM public.cloud_attente WHERE user_id = $1', [U(7)])));
  verifier('C. la liste d\'attente n\'offre rien (0)', (await aOffrir()) === 0);

  // D. LA CHAÎNE D'ACHAT (point 2) : livrée → contrôlée → au pool → la place remonte
  const nouvelle = (await un(`SELECT public.cloud_ip_ajouter('cmd-banc', '203.0.113.10'::inet, 12323, 'Paris', NULL,
    'http://u:p@203.0.113.10:12323', now() + interval '30 days') AS id`)).id;
  verifier('D. IP livrée (« achetee ») : pas encore au pool, toujours 0 place', (await vente(U(8))).places === 0
    && (await un('SELECT etat FROM public.cloud_ips WHERE id = $1', [nouvelle])).etat === 'achetee');
  const ctl = (await un('SELECT public.cloud_ip_controle_entree($1, $2::jsonb) AS r', [nouvelle, CONTROLE_OK('203.0.113.10')])).r;
  v = await vente(U(8));
  verifier('D. contrôle d\'entrée réussi → « disponible » → 1 place, vente rouverte', ctl.ok === true && v.places === 1 && v.vente_possible === true, `${JSON.stringify(ctl)} ${JSON.stringify(v)}`);
  verifier('D. la liste d\'attente offre cette place (1)', (await aOffrir()) === 1);
  const rebut = (await un(`SELECT public.cloud_ip_ajouter('cmd-banc', '203.0.113.11'::inet, 12323, 'Paris', NULL,
    'http://u:p@203.0.113.11:12323', now() + interval '30 days') AS id`)).id;
  const ctlKo = (await un('SELECT public.cloud_ip_controle_entree($1, $2::jsonb) AS r', [rebut, CONTROLE_OK('203.0.113.99')])).r;
  verifier('D. une IP qui échoue au contrôle n\'ouvre aucune place', ctlKo.ok === false && (await vente(U(8))).places === 1, JSON.stringify(ctlKo));
  for (let n = 20; n < 40; n++) {
    const id = (await un(`SELECT public.cloud_ip_ajouter('cmd-banc-2', $1::inet, 12323, 'Paris', NULL, 'http://u:p@x', now() + interval '30 days') AS id`, [`203.0.113.${n}`])).id;
    await un('SELECT public.cloud_ip_controle_entree($1, $2::jsonb) AS r', [id, CONTROLE_OK(`203.0.113.${n}`)]);
  }
  verifier('D. 20 IP de plus : plafonné par le SERVEUR (8 places), jamais au-delà', (await vente(U(8))).places === 8, JSON.stringify(await vente(U(8))));

  // E. LA FILE, LA ROTATION, L'IP AU REPOS
  await c.query(`UPDATE public.cloud_attente SET inscrit_le = now() - interval '1 hour' WHERE user_id = $1`, [U(7)]);
  verifier('E. un inscrit devant : un nouveau compte voit 7 (8 − 1), l\'inscrit voit 8', (await vente(U(9))).places === 7 && (await vente(U(7))).places === 8);
  await c.query(`DELETE FROM public.cloud_ips WHERE commande LIKE 'cmd-banc%'`);
  await c.query(`DELETE FROM public.cloud_attente`);
  await c.query(`UPDATE public.coin_config SET value = 1 WHERE key = 'cloud_ip_rotation'`);
  verifier('E. rotation (cloud_ip_rotation = 1) : l\'IP ne borne rien → 8 (serveur)', (await vente(U(9))).places === 8);
  await c.query(`UPDATE public.coin_config SET value = 0 WHERE key = 'cloud_ip_rotation'`);
  verifier('E. sans rotation, pool vide : 0', (await vente(U(9))).places === 0);
  await c.query(`INSERT INTO public.cloud_ips (commande, ip, etat, dernier_user_id, attributions, expire_le, liberee_le)
    VALUES ('c-repos', '203.0.113.200', 'repos', $1, 1, now() + interval '25 days', now() - interval '1 day')`, [U(9)]);
  v = await vente(U(9));
  verifier('E. son IP au repos lui revient : la place serveur seule compte (8), vente possible', v.places === 8 && v.vente_possible === true, JSON.stringify(v));
  verifier('E. … les autres n\'y ont pas droit : 0', (await vente(U(10))).places === 0);

  // F. L'INVERSE
  await c.query(lire('supabase/rollbacks/20261107170000_cloud_places_min_ip_INVERSE.sql'));
  v = await vente(U(10));
  verifier('F. INVERSE : la règle d\'avant revient (8 places serveur affichées, vente refusée faute d\'IP « pool_vide »)', v.places === 8 && v.raison === 'pool_vide', JSON.stringify(v));
} catch (e) {
  verifier('banc', false, e.message);
} finally {
  await c.end();
  if (embarque) { await embarque.pg.stop(); rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(echecs ? `✗ ${echecs} échec(s)` : '✓ essai complet');
process.exit(echecs ? 1 : 0);
