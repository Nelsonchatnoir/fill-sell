// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261107190000_cloud_ip_sante (07/11 soir, ordres 3 et 4 de Nico : la
// santé des IP libres, « une IP grillée n'est jamais donnée à un client ») — jamais la prod.
//   PREUVE_PG=embarque node scripts/essais/20261107190000_banc.mjs
// Corps de la PROD du 07/11 ~17:45 (scripts/essais/fixtures/prod-0711-ip-sante/, pg_get_functiondef relu en lecture
// seule) ; décor = l'état relu en prod le 07/11 à 17:59 : Nico client sur l'IP 42, l'IP 39 réservée à Nico jusqu'au 03/12,
// 1, 2, 3, 4, 40, 41 « disponible » au refus Beebs non prouvé, 5 et 6 expirées ; et la vérification manuelle de 17:26-17:40
// (saines 1, 2, 3, 4, 39, 41 ; grillée 40, eBay 403 Akamai).
//   A. AVANT : l'IP 40 (grillée) est attribuable — le défaut ;
//   B. APRÈS : sans aucune santé, attribuable, garde et état du pool IDENTIQUES ligne à ligne ; cloud_ip_sante_noter
//      (lisible, IP du pool, jamais tenue par un compte, grillée définitive, journal au changement seulement, 16 Ko) ;
//      une IP GRILLÉE jamais attribuée (essai, client, retour au même compte, réservation) ni comptée par la garde, une
//      SUSPECTE encore attribuable ; le MIROIR JS (ipAttribuable, gardeNombre) égal au SQL sur 300 pools au hasard, et
//      « un achat que le plan demande passe toujours la garde » dans les deux règles (d'aujourd'hui, « saines d'abord ») ;
//      (07/11 soir, « la 3 est donnée en dernier ») L'OPÉRATEUR DE SORTIE : l'ordre de cloud_ip_attribuer et de
//      cloud_ip_reserver — sans santé, le choix d'avant à chaque fois (300 pools, contre les corps de la prod) ; avec les
//      opérateurs relevés le 07/11 (Orange FR, Liberty Global NL, NTT America US), la 3 donnée en dernier ; le miroir JS
//      (choisirIp) = cloud_ip_attribuer ;
//   C. l'INVERSE rend les corps de la prod mot pour mot ; la migration se rejoue.
import pg from 'pg';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as regles from '../../supabase/functions/_shared/cloud-pool.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-ip-sante-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port: 55449, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:banc@127.0.0.1:55449/postgres';
}

const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Un décor réduit aux colonnes que lisent les fonctions de la prod (types, défauts et contraintes relus le 07/11).
const DECOR = String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer, updated_at timestamptz DEFAULT now());
CREATE TABLE public.profiles (id uuid PRIMARY KEY, is_cloud boolean DEFAULT false, cloud_essai_debut timestamptz,
  cloud_essai_fin timestamptz, cloud_essai_arrete boolean DEFAULT false);
CREATE TABLE public.cloud_ips (id bigserial PRIMARY KEY, fournisseur text NOT NULL DEFAULT 'iproyal', commande text NOT NULL, ip inet NOT NULL,
  port integer NOT NULL DEFAULT 12323, pays text NOT NULL DEFAULT 'FR', ville text, asn text, secret_nom text, etat text NOT NULL DEFAULT 'achetee',
  user_id uuid, dernier_user_id uuid, derniere_origine text, reserve_pour uuid, reserve_jusqu_au timestamptz, attribuee_le timestamptz,
  liberee_le timestamptz, repos_fin timestamptz, purge_preuve jsonb, purge_prouvee_le timestamptz, expire_le timestamptz NOT NULL,
  livree_le timestamptz NOT NULL DEFAULT now(), attributions integer NOT NULL DEFAULT 0, rebut_critere text, rebut_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(), maj_le timestamptz NOT NULL DEFAULT now(), refus jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (etat IN ('achetee', 'disponible', 'attribuee_essai', 'attribuee_client', 'repos', 'rebut', 'expiree')),
  CHECK ((etat IN ('attribuee_essai', 'attribuee_client')) = (user_id IS NOT NULL)),
  CHECK ((reserve_pour IS NULL) = (reserve_jusqu_au IS NULL)),
  CHECK (etat <> 'rebut' OR (rebut_critere IS NOT NULL AND rebut_le IS NOT NULL)),
  CHECK (etat <> 'repos' OR (liberee_le IS NOT NULL AND repos_fin IS NOT NULL)),
  CHECK (jsonb_typeof(refus) = 'object'));
CREATE UNIQUE INDEX cloud_ips_un_titulaire ON public.cloud_ips (user_id) WHERE user_id IS NOT NULL;
CREATE TABLE public.cloud_ip_evenements (id bigserial PRIMARY KEY, ip_id bigint NOT NULL REFERENCES public.cloud_ips (id),
  le timestamptz NOT NULL DEFAULT now(), nature text NOT NULL, user_id uuid, details jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (nature IN ('achat', 'controle_entree', 'reservation', 'attribution', 'retour_meme_compte', 'conversion', 'liberation', 'purge',
    'sortie_repos', 'signalement', 'rebut', 'renouvellement', 'identifiants_changes', 'expiration', 'incident', 'refus', 'refus_leve',
    'refus_prouve', 'visite_controle', 'depense')));
CREATE TABLE public.cloud_attente (user_id uuid PRIMARY KEY, demande_le timestamptz DEFAULT now());
CREATE TABLE public.cloud_postes (user_id uuid PRIMARY KEY, serveur text, etat text NOT NULL DEFAULT 'eteint');
CREATE TABLE public.cloud_ip_commandes (id bigserial PRIMARY KEY, fournisseur text NOT NULL DEFAULT 'iproyal', commande text,
  quantite integer NOT NULL CHECK (quantite >= 1 AND quantite <= 50),
  statut text NOT NULL DEFAULT 'demandee' CHECK (statut IN ('demandee', 'en_cours', 'livree', 'echec', 'remboursee')),
  prix_usd numeric, go_par text, demandee_le timestamptz NOT NULL DEFAULT now(), livree_le timestamptz,
  details jsonb NOT NULL DEFAULT '{}'::jsonb, nature text NOT NULL DEFAULT 'achat' CHECK (nature IN ('achat', 'prolongation')),
  ip_id bigint REFERENCES public.cloud_ips (id));
`;
const PROD = ['cloud_ts', 'cloud_param', 'cloud_journal', 'cloud_ip_refus_prouve', 'cloud_ip_attribuable', 'cloud_ip_depenses_mois',
  'cloud_ip_garde_nombre', 'cloud_ip_depense_ouvrir', 'cloud_ip_depense_fermer', 'cloud_pool_etat', 'cloud_ip_attribuer', 'cloud_ip_reserver'];
const FIX = 'scripts/essais/fixtures/prod-0711-ip-sante';
const presentes = new Set(readdirSync(join(ROOT, FIX)).map((f) => f.replace(/\.sql$/, '')));
const MIGRATION = 'supabase/migrations/20261107190000_cloud_ip_sante.sql';
const INVERSE = 'supabase/rollbacks/20261107190000_cloud_ip_sante_INVERSE.sql';
const REFUS_BEEBS = `'{"beebs":{"le":"2026-11-03T15:37:37Z","prouvee":false}}'::jsonb`;
const ETAT = String.raw`
TRUNCATE public.cloud_ip_commandes, public.cloud_ip_evenements, public.cloud_attente, public.cloud_postes RESTART IDENTITY;
DELETE FROM public.cloud_ips; DELETE FROM public.profiles; DELETE FROM public.coin_config;
INSERT INTO public.coin_config (key, value) VALUES ('cloud_capacite_alerte_pct', 80), ('cloud_ip_achat_max', 10), ('cloud_ip_achats_auto', 0),
  ('cloud_ip_budget_mensuel_usd', 60), ('cloud_ip_carte_id', 410814), ('cloud_ip_marge', 3), ('cloud_ip_paiement_carte', 1),
  ('cloud_ip_refus_revisite_jours', 14), ('cloud_ip_renouvellement_auto', 1), ('cloud_ip_rotation', 0), ('cloud_ip_stock_min', 2),
  ('cloud_places_seuil', 2), ('cloud_serveurs_auto', 0), ('cloud_visites_controle_beebs', 0);
INSERT INTO public.profiles (id, is_cloud) VALUES ('${NICO}', true);
INSERT INTO public.profiles (id) SELECT ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid FROM generate_series(1, 20) n;
INSERT INTO public.cloud_ips (id, commande, ip, etat, user_id, dernier_user_id, attributions, expire_le) VALUES
  (42, '87509051', '94.194.94.68', 'attribuee_client', '${NICO}', '${NICO}', 1, now() + interval '27 days');
INSERT INTO public.cloud_ips (id, commande, ip, etat, attributions, expire_le, reserve_pour, reserve_jusqu_au, refus) VALUES
  (39, '87284262', '176.103.182.215', 'disponible', 1, now() + interval '25.8 days', '${NICO}', now() + interval '25.8 days', ${REFUS_BEEBS});
INSERT INTO public.cloud_ips (id, commande, ip, etat, attributions, expire_le, refus) VALUES
  (1, '84458881', '94.194.94.233', 'disponible', 1, now() + interval '26.8 days', ${REFUS_BEEBS}),
  (2, '86965910', '185.134.194.88', 'disponible', 0, now() + interval '21.7 days', ${REFUS_BEEBS}),
  (3, '87004978', '81.181.239.136', 'disponible', 1, now() + interval '22.1 days', ${REFUS_BEEBS}),
  (4, '87277315', '185.134.192.253', 'disponible', 1, now() + interval '24.7 days', ${REFUS_BEEBS}),
  (40, '87481742', '81.181.237.207', 'disponible', 1, now() + interval '26.75 days', ${REFUS_BEEBS}),
  (41, '87495735', '88.151.56.82', 'disponible', 1, now() + interval '26.85 days', ${REFUS_BEEBS});
INSERT INTO public.cloud_ips (id, commande, ip, etat, attributions, expire_le) VALUES
  (5, '87277471', '176.103.180.12', 'expiree', 1, now() - interval '4 days'), (6, '87281765', '80.12.178.102', 'expiree', 0, now() - interval '4 days');
SELECT setval('public.cloud_ips_id_seq', 1000);
`;

const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
let echecs = 0;
const verifier = (nom, cond, detail = '') => { console.log(`${cond ? '✓' : '✗'} ${nom}${!cond && detail !== '' ? ` — ${detail}` : ''}`); if (!cond) echecs++; };
const un = async (q, p, cl = c) => (await cl.query(q, p)).rows[0];
const garde = async (q = 0) => (await un('SELECT public.cloud_ip_garde_nombre($1) AS g', [q])).g;
const etatPool = async () => (await un('SELECT public.cloud_pool_etat() AS e')).e;
const noter = async (ip, sante) => (await un('SELECT public.cloud_ip_sante_noter($1, $2::jsonb) AS r', [ip, sante == null ? null : JSON.stringify(sante)])).r;
const regler = (cle, v) => c.query(`INSERT INTO public.coin_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [cle, v]);
// Toutes les réponses de cloud_ip_attribuable : chaque IP × (sans compte, Nico, un autre, le dernier titulaire) × (essai, client).
const attribuables = async () => (await c.query(`SELECT i.id, u.n AS u, n.n AS nature, public.cloud_ip_attribuable(i, u.id, n.n) AS a
  FROM public.cloud_ips i
  CROSS JOIN (VALUES ('aucun', NULL::uuid), ('nico', '${NICO}'::uuid), ('autre', '${U(1)}'::uuid)) u(n, id)
  CROSS JOIN (VALUES ('essai'), ('client')) n(n)
  UNION ALL SELECT i.id, 'dernier', n.n, public.cloud_ip_attribuable(i, i.dernier_user_id, n.n)
  FROM public.cloud_ips i CROSS JOIN (VALUES ('essai'), ('client')) n(n) WHERE i.dernier_user_id IS NOT NULL
  ORDER BY 1, 2, 3`)).rows.map((r) => `${r.id}/${r.u}/${r.nature}=${r.a}`).join(' ');
const ipsJs = async () => (await c.query(`SELECT id, commande, etat, user_id, dernier_user_id, expire_le, attributions, reserve_pour, reserve_jusqu_au,
  liberee_le, repos_fin, purge_prouvee_le, refus, ${(await un(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'cloud_ips' AND column_name = 'sante'`)).n ? 'sante' : 'NULL::jsonb AS sante'}
  FROM public.cloud_ips`)).rows.map((i) => ({ ...i, expire_le: i.expire_le?.toISOString(), reserve_jusqu_au: i.reserve_jusqu_au?.toISOString() ?? null,
  liberee_le: i.liberee_le?.toISOString() ?? null, repos_fin: i.repos_fin?.toISOString() ?? null, purge_prouvee_le: i.purge_prouvee_le?.toISOString() ?? null, user_id: i.user_id ?? null }));
// (07/11 soir) Le choix de cloud_ip_attribuer / cloud_ip_reserver, sans rien garder (transaction annulée) ; et la suite des choix.
const choix = async (user, nature = 'essai', fonction = 'cloud_ip_attribuer') => {
  await c.query('BEGIN');
  try { return (await un(fonction === 'cloud_ip_reserver' || fonction === 'cloud_ip_reserver_avant' ? `SELECT public.${fonction}($1) AS id` : `SELECT public.${fonction}($1, $2) AS id`,
    fonction.startsWith('cloud_ip_reserver') ? [user] : [user, nature])).id; } finally { await c.query('ROLLBACK'); }
};
const suiteDesChoix = async (fonction = 'cloud_ip_attribuer') => {
  const ordre = [];
  await c.query('BEGIN');
  try {
    for (let k = 0; k < 12; k++) {
      const id = (await un(`SELECT public.${fonction}($1, 'essai') AS id`, [U(300 + k)])).id;
      if (id == null) break;
      ordre.push(Number(id));
    }
  } finally { await c.query('ROLLBACK'); }
  return ordre;
};
const SAINE = (le = new Date().toISOString()) => ({ version: 1, verdict: 'saine', le, saine_le: le, echecs: [], controles: 1 });

try {
  for (const f of PROD) if (!presentes.has(f)) throw new Error(`fixture absente : ${f}`);
  await c.query(DECOR);
  for (const f of PROD) await c.query(`${lire(`${FIX}/${f}.sql`)};`);
  for (const f of PROD) await c.query(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.${f} TO service_role;`)
    .catch(async () => {
      const sig = (await un(`SELECT pg_get_function_identity_arguments(oid) AS a FROM pg_proc WHERE proname = $1`, [f])).a;
      await c.query(`REVOKE ALL ON FUNCTION public.${f}(${sig}) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.${f}(${sig}) TO service_role;`);
    });
  for (const f of ['cloud_ip_attribuer', 'cloud_ip_reserver']) await c.query(`${lire(`${FIX}/${f}.sql`).replace(`public.${f}(`, `public.${f}_avant(`)};`);
  await c.query(ETAT);

  // ── A. AVANT — la prod du 07/11 ──────────────────────────────────────────────────────────────────────────────
  const avantAttrib = await attribuables();
  const avantGarde = await garde(0);
  const avantEtat = await etatPool();
  const aclAvant = (await c.query(`SELECT proname, proacl::text AS a FROM pg_proc WHERE proname IN ('cloud_ip_attribuable', 'cloud_ip_garde_nombre', 'cloud_ip_attribuer', 'cloud_ip_reserver') ORDER BY 1`)).rows;
  const ordreAvant = await suiteDesChoix();
  verifier('A. AVANT : les essais successifs reçoivent 2, 3, 4, 40, 1, 41 (l\'échéance d\'abord) — la 3 (NTT America) DEUXIÈME, la 40 grillée donnée',
    JSON.stringify(ordreAvant) === JSON.stringify([2, 3, 4, 40, 1, 41]), JSON.stringify(ordreAvant));
  verifier('A. AVANT : l\'IP 40 (eBay 403 Akamai, grillée à la vérification de 17:26-17:40) est attribuable à un nouvel essai — le défaut',
    (await un(`SELECT public.cloud_ip_attribuable(i, $1, 'essai') AS a FROM public.cloud_ips i WHERE id = 40`, [U(1)])).a === true);
  verifier('A. AVANT : 6 IP attribuables (1, 2, 3, 4, 40, 41 ; la 39 est réservée à Nico), garde : 8 vivantes, borne 4',
    avantEtat.attribuables_essai === 6 && avantGarde.vivantes === 8 && avantGarde.borne === 4, JSON.stringify({ e: avantEtat.attribuables_essai, avantGarde }));

  // ── B. LA MIGRATION (deux fois : idempotente) ─────────────────────────────────────────────────────────────────
  await c.query(lire(MIGRATION));
  await c.query(lire(MIGRATION));
  verifier('B0. la migration passe deux fois (idempotente)', true);
  const coin = Object.fromEntries((await c.query(`SELECT key, value FROM public.coin_config`)).rows.map((l) => [l.key, l.value]));
  verifier('B0. coin_config : cloud_ip_sante_controle = 0 et cloud_ip_renouveler_saines_seulement = 0 (tout COUPÉ) ; les autres intacts',
    coin.cloud_ip_sante_controle === 0 && coin.cloud_ip_renouveler_saines_seulement === 0 && coin.cloud_ip_marge === 3 && coin.cloud_ip_renouvellement_auto === 1, JSON.stringify(coin));
  const col = await un(`SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'cloud_ips' AND column_name = 'sante'`);
  verifier('B0. cloud_ips.sante : jsonb, NULL permis, aucun défaut (NULL = jamais contrôlée) ; toutes les lignes à NULL',
    col?.data_type === 'jsonb' && col.is_nullable === 'YES' && col.column_default == null
    && (await un(`SELECT count(*)::int AS n FROM public.cloud_ips WHERE sante IS NOT NULL`)).n === 0, JSON.stringify(col));
  const acl = (await un(`SELECT proacl::text AS a FROM pg_proc WHERE proname = 'cloud_ip_sante_noter'`)).a;
  verifier('B0. cloud_ip_sante_noter : service_role seul (ni PUBLIC, ni anon, ni authenticated)',
    /service_role=X/.test(acl) && !/(^|[{,])=X|anon|authenticated/.test(acl), acl);
  const aclRang = (await un(`SELECT proacl::text AS a FROM pg_proc WHERE proname = 'cloud_ip_rang_operateur'`)).a;
  verifier('B0. cloud_ip_rang_operateur : service_role seul', /service_role=X/.test(aclRang) && !/(^|[{,])=X|anon|authenticated/.test(aclRang), aclRang);
  const aclApres = (await c.query(`SELECT proname, proacl::text AS a FROM pg_proc WHERE proname IN ('cloud_ip_attribuable', 'cloud_ip_garde_nombre', 'cloud_ip_attribuer', 'cloud_ip_reserver') ORDER BY 1`)).rows;
  verifier('B0. cloud_ip_attribuable, cloud_ip_garde_nombre, cloud_ip_attribuer, cloud_ip_reserver : droits INCHANGÉS', JSON.stringify(aclAvant) === JSON.stringify(aclApres), JSON.stringify([aclAvant, aclApres]));

  // B1. Sans aucune santé : rien ne change
  verifier('B1. sans santé en base : cloud_ip_attribuable rend EXACTEMENT la même chose (chaque IP × compte × nature)', (await attribuables()) === avantAttrib);
  verifier('B1. … cloud_ip_garde_nombre identique', JSON.stringify(await garde(0)) === JSON.stringify(avantGarde));
  verifier('B1. … cloud_pool_etat identique (clé par clé)', JSON.stringify(await etatPool()) === JSON.stringify(avantEtat));
  verifier('B1. … cloud_ip_attribuer : la même suite de choix (2, 3, 4, 40, 1, 41)', JSON.stringify(await suiteDesChoix()) === JSON.stringify(ordreAvant));
  verifier('B1. … cloud_ip_reserver : le même choix que le corps de la prod', Number(await choix(U(1), null, 'cloud_ip_reserver')) === Number(await choix(U(1), null, 'cloud_ip_reserver_avant'))
    && Number(await choix(NICO, null, 'cloud_ip_reserver')) === Number(await choix(NICO, null, 'cloud_ip_reserver_avant')));

  // B2. L'écriture du verdict
  let r = await noter(1, {});
  verifier('B2. sante_illisible : objet sans verdict', r.ok === false && r.raison === 'sante_illisible', JSON.stringify(r));
  r = await noter(1, { verdict: 'peut-etre' });
  verifier('B2. sante_illisible : verdict inconnu', r.ok === false && r.raison === 'sante_illisible', JSON.stringify(r));
  r = await noter(1, null);
  verifier('B2. sante_illisible : rien', r.ok === false && r.raison === 'sante_illisible', JSON.stringify(r));
  r = await noter(999, SAINE());
  verifier('B2. ip_inconnue', r.ok === false && r.raison === 'ip_inconnue', JSON.stringify(r));
  r = await noter(42, SAINE());
  verifier('B2. jamais sur l\'IP tenue par un compte (42, Nico client) : ip_tenue_par_un_compte, rien écrit', r.ok === false && r.raison === 'ip_tenue_par_un_compte'
    && (await un(`SELECT sante FROM public.cloud_ips WHERE id = 42`)).sante === null, JSON.stringify(r));
  r = await noter(5, SAINE());
  verifier('B2. jamais hors du pool (5, expirée) : ip_hors_pool', r.ok === false && r.raison === 'ip_hors_pool', JSON.stringify(r));
  r = await noter(1, { ...SAINE(), dernier: { bourrage: 'x'.repeat(17000) } });
  verifier('B2. 16 Ko au plus : sante_trop_grosse', r.ok === false && r.raison === 'sante_trop_grosse', JSON.stringify(r));
  const evAvant = Number((await un(`SELECT count(*) AS n FROM public.cloud_ip_evenements`)).n);
  r = await noter(1, SAINE());
  const ev = (await c.query(`SELECT nature, details FROM public.cloud_ip_evenements WHERE ip_id = 1 ORDER BY id`)).rows;
  verifier('B2. IP 1 saine : écrite, et le changement de verdict va au journal (visite_controle, details.sante avant → après)',
    r.ok === true && r.avant === null && r.apres === 'saine' && ev.length === 1 && ev[0].nature === 'visite_controle'
    && ev[0].details.sante.avant === null && ev[0].details.sante.apres === 'saine', JSON.stringify({ r, ev }));
  r = await noter(1, SAINE());
  verifier('B2. le même verdict relu : écrit (date du contrôle), AUCUNE ligne de journal de plus',
    r.ok === true && Number((await un(`SELECT count(*) AS n FROM public.cloud_ip_evenements`)).n) === evAvant + 1, JSON.stringify(r));
  let refusContrainte = null;
  try { await c.query(`UPDATE public.cloud_ips SET sante = '{"verdict":"bof"}' WHERE id = 2`); } catch (e) { refusContrainte = e.message; }
  verifier('B2. la contrainte refuse un verdict illisible écrit à la main', /cloud_ips_sante_lisible/.test(String(refusContrainte)), String(refusContrainte));

  // B3. La vérification manuelle du 07/11 : saines 1, 2, 3, 4, 41 ; 40 suspecte (1re lecture) puis grillée (2e lecture)
  for (const id of [2, 3, 4, 41]) await noter(id, SAINE());
  const t1 = new Date(Date.now() - 40 * 60_000).toISOString();
  r = await noter(40, { version: 1, verdict: 'suspecte', le: t1, suspecte_le: t1, echecs: ['ebay'], controles: 1 });
  verifier('B3. IP 40, 1re lecture (eBay 403) : SUSPECTE — encore attribuable (jamais jetée sur un incident passager)',
    r.ok === true && (await un(`SELECT public.cloud_ip_attribuable(i, $1, 'essai') AS a FROM public.cloud_ips i WHERE id = 40`, [U(1)])).a === true, JSON.stringify(r));
  const grilleeJs = regles.santeSuivante({ version: 1, verdict: 'suspecte', le: t1, suspecte_le: t1, echecs: ['ebay'], controles: 1 },
    { fait_le: new Date().toISOString(), echecs: ['ebay'], inconnus: [] });
  r = await noter(40, grilleeJs);
  verifier('B3. IP 40, 2e lecture 40 min plus tard, même échec : GRILLÉE (santeSuivante, écrite)', grilleeJs.verdict === 'grillee' && r.ok === true && r.apres === 'grillee', JSON.stringify({ grilleeJs, r }));
  const a40 = (await c.query(`SELECT n.n, u.n AS u, public.cloud_ip_attribuable(i, u.id, n.n) AS a FROM public.cloud_ips i
    CROSS JOIN (VALUES ('essai'), ('client')) n(n) CROSS JOIN (VALUES ('aucun', NULL::uuid), ('autre', '${U(1)}'::uuid), ('nico', '${NICO}'::uuid)) u(n, id) WHERE i.id = 40`)).rows;
  verifier('B3. une IP GRILLÉE n\'est attribuable à PERSONNE (essai, client ; sans compte, un autre, Nico)', a40.length === 6 && a40.every((x) => x.a === false), JSON.stringify(a40));
  const e3 = await etatPool();
  const g3 = await garde(0);
  verifier('B3. cloud_pool_etat : 5 attribuables (6 − la 40) ; la garde ne compte plus la 40 vivante (7 au lieu de 8)',
    e3.attribuables_essai === 5 && g3.vivantes === 7 && g3.borne === 4, JSON.stringify({ a: e3.attribuables_essai, g3 }));
  r = await noter(40, SAINE());
  verifier('B3. grillée = DÉFINITIF : un contrôle « saine » suivant est refusé (deja_grillee), elle reste grillée',
    r.ok === false && r.raison === 'deja_grillee' && (await un(`SELECT sante ->> 'verdict' AS v FROM public.cloud_ips WHERE id = 40`)).v === 'grillee', JSON.stringify(r));

  // B4. Attribution, réservation, retour au même compte : jamais la grillée
  await c.query('BEGIN');
  await c.query(`UPDATE public.cloud_ips SET etat = 'rebut', rebut_critere = 'manuel', rebut_le = now() WHERE id IN (1, 2, 3, 4, 41)`);
  let id = (await un(`SELECT public.cloud_ip_attribuer($1, 'essai') AS id`, [U(1)])).id;
  verifier('B4. il ne reste que la 40 (grillée) et la 39 (réservée à Nico) : cloud_ip_attribuer(un nouvel essai) → AUCUNE (pool_vide), jamais la 40', id === null, String(id));
  id = (await un(`SELECT public.cloud_ip_reserver($1) AS id`, [U(1)])).id;
  verifier('B4. … cloud_ip_reserver non plus', id === null, String(id));
  verifier('B4. … et cloud_pool_etat dit 0 attribuable', (await etatPool()).attribuables_essai === 0);
  await c.query(`UPDATE public.cloud_ips SET sante = jsonb_set(sante, '{verdict}', '"suspecte"') WHERE id = 40`);
  id = (await un(`SELECT public.cloud_ip_attribuer($1, 'essai') AS id`, [U(1)])).id;
  verifier('B4. la même IP seulement SUSPECTE (pas encore relue) : attribuée — seule la preuve écarte une IP', Number(id) === 40, String(id));
  await c.query('ROLLBACK');
  await c.query('BEGIN');
  await c.query(`INSERT INTO public.cloud_ips (id, commande, ip, etat, dernier_user_id, attributions, expire_le, liberee_le, repos_fin, sante)
    VALUES (77, 'r77', '203.0.113.77', 'repos', $1, 1, now() + interval '25 days', now() - interval '8 days', now() - interval '1 day',
            '{"verdict":"grillee","le":"2026-11-07T17:00:00Z"}')`, [U(2)]);
  verifier('B4. une IP au repos GRILLÉE ne revient pas à son dernier titulaire', (await un(`SELECT public.cloud_ip_attribuable(i, $1, 'essai') AS a FROM public.cloud_ips i WHERE id = 77`, [U(2)])).a === false);
  await c.query(`UPDATE public.cloud_ips SET sante = '{"verdict":"saine","le":"2026-11-07T17:00:00Z"}' WHERE id = 77`);
  verifier('B4. … saine, elle lui revient (inchangé)', (await un(`SELECT public.cloud_ip_attribuable(i, $1, 'essai') AS a FROM public.cloud_ips i WHERE id = 77`, [U(2)])).a === true);
  await c.query('ROLLBACK');

  // B6. (07/11 soir, « la 3 est donnée en dernier ») L'OPÉRATEUR DE SORTIE — la règle, sur les opérateurs relevés le 07/11
  //     (ip-api « as », Team Cymru) : 1, 39, 41 → AS5511 Orange (FR, rang 0) ; 2, 4 → AS6830 Liberty Global (NL, rang 1) ;
  //     3, 40 → AS2914 NTT America (US, rang 2).
  const OP = { 0: { as: '5511', pays: 'FR', registre: 'ripencc', rang: 0 }, 1: { as: '6830', pays: 'NL', registre: 'ripencc', rang: 1 },
    2: { as: '2914', pays: 'US', registre: 'arin', rang: 2 } };
  for (const [id, rang] of Object.entries({ 1: 0, 39: 0, 41: 0, 2: 1, 4: 1, 3: 2, 40: 2 })) {
    await c.query(`UPDATE public.cloud_ips SET sante = COALESCE(sante, '{"verdict":"saine"}'::jsonb) || jsonb_build_object('operateur', $2::jsonb) WHERE id = $1`,
      [Number(id), JSON.stringify(OP[rang])]);
  }
  let ordre = await suiteDesChoix();
  verifier('B6. APRÈS : 1, 41 (Orange, FR), puis 2, 4 (Liberty Global, NL), puis la 3 (NTT America, US) EN DERNIER ; la 40 (grillée) jamais',
    JSON.stringify(ordre) === JSON.stringify([1, 41, 2, 4, 3]), JSON.stringify(ordre));
  verifier('B6. … cloud_ip_reserver prend aussi la française d\'abord (la 1)', Number(await choix(U(1), null, 'cloud_ip_reserver')) === 1);
  const rangs = (await c.query(`SELECT public.cloud_ip_rang_operateur(x::jsonb) AS r FROM unnest(ARRAY[
    '{"operateur":{"rang":0}}', '{"operateur":{"rang":2}}', '{"operateur":{"rang":"2"}}', '{"operateur":{"rang":7}}', '{"operateur":{"rang":1.5}}', '{}', NULL]) x`)).rows.map((x) => x.r);
  verifier('B6. cloud_ip_rang_operateur : 0 et 2 lus ; texte, hors bornes, décimal, absent, NULL → 1 (inconnu, au milieu)', JSON.stringify(rangs) === '[0,2,1,1,1,1,1]', JSON.stringify(rangs));
  await c.query(`UPDATE public.cloud_ips SET refus = '{}' WHERE id = 3`);
  ordre = await suiteDesChoix();
  verifier('B6. l\'opérateur passe AVANT le refus non prouvé : la 3 sans refus reste après les françaises au refus Beebs non prouvé',
    JSON.stringify(ordre) === JSON.stringify([1, 41, 2, 4, 3]), JSON.stringify(ordre));
  await c.query(`UPDATE public.cloud_ips SET refus = '{"beebs":{"prouvee":true}}' WHERE id = 1`);
  ordre = await suiteDesChoix();
  verifier('B6. … mais un refus PROUVÉ reste le dernier recours, après l\'IP atypique (inchangé) : 41, 2, 4, 3, puis la 1',
    JSON.stringify(ordre) === JSON.stringify([41, 2, 4, 3, 1]), JSON.stringify(ordre));
  await c.query(`UPDATE public.cloud_ips SET refus = ${REFUS_BEEBS} WHERE id IN (1, 3)`);
  const ipsB6 = await ipsJs();
  const jsB6 = [];
  for (const u of [U(301), U(302), U(303), U(304), U(305), U(306)]) {
    const x = regles.choisirIp(ipsB6, { userId: u, nature: 'essai', maintenant: Date.now() });
    if (!x) break;
    jsB6.push(Number(x.id));
    ipsB6.find((y) => y.id === x.id).etat = 'attribuee_essai';
  }
  verifier('B6. le miroir JS (choisirIp) donne la même suite : 1, 41, 2, 4, 3', JSON.stringify(jsB6) === JSON.stringify([1, 41, 2, 4, 3]), JSON.stringify(jsB6));

  // B5. LE MIROIR JS ET LA GARDE, 300 pools tirés au hasard (santé comprise)
  let graine = 19;
  const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
  const tirer = (n) => Math.floor(hasard() * n);
  let attribEgaux = 0, attribTotal = 0, gardesEgales = 0, proprietes = 0, achatsDemandes = 0, achatsRegle = 0, grilleesVues = 0;
  let choixEgaux = 0, choixTotal = 0, choixNonVides = 0, avantEgaux = 0, avantTotal = 0, rangsVus = 0;
  const divergences = [];
  const SANTES = [null, null, { verdict: 'saine', saine_le: new Date().toISOString(), le: new Date().toISOString() }, { verdict: 'suspecte', le: new Date().toISOString(), suspecte_le: new Date().toISOString(), echecs: ['ebay'] },
    { verdict: 'grillee', le: new Date().toISOString(), grillee_le: new Date().toISOString(), echecs: ['ebay'] }, { verdict: 'inconnue', le: new Date().toISOString() }];
  for (let k = 0; k < 300; k++) {
    await c.query(`TRUNCATE public.cloud_ip_commandes, public.cloud_attente, public.cloud_ip_evenements RESTART IDENTITY; DELETE FROM public.cloud_ips; DELETE FROM public.profiles;`);
    const profils = [];
    for (let i = 0; i < tirer(12); i++) {
      const t = hasard(); const pid = U(100 + i); profils.push(pid);
      if (t < 0.3) await c.query(`INSERT INTO public.profiles (id, is_cloud) VALUES ($1, true)`, [pid]);
      else if (t < 0.5) await c.query(`INSERT INTO public.profiles (id, cloud_essai_debut, cloud_essai_fin) VALUES ($1, now() - interval '2 days', now() + interval '5 days')`, [pid]);
      else await c.query(`INSERT INTO public.profiles (id) VALUES ($1)`, [pid]);
    }
    const libres = [...profils];
    for (let i = 0; i < tirer(14); i++) {
      let etat = ['achetee', 'disponible', 'disponible', 'disponible', 'attribuee_essai', 'attribuee_client', 'repos', 'rebut', 'expiree'][tirer(9)];
      let user = null;
      if (etat.startsWith('attribuee')) { if (libres.length) user = libres.splice(tirer(libres.length), 1)[0]; else etat = 'disponible'; }
      const jours = tirer(38) - 3 + 0.5;
      const refus = [{}, {}, {}, { beebs: { prouvee: false, le: '2026-11-03T00:00:00Z' } }, { vinted: { prouvee: true } }][tirer(5)];
      const reserve = hasard() < 0.15 && profils.length ? profils[tirer(profils.length)] : null;
      const s0 = SANTES[tirer(SANTES.length)];
      const sante = s0 ? { ...s0, ...(hasard() < 0.7 ? { operateur: { rang: tirer(3) } } : {}) } : null;
      if (sante?.operateur) rangsVus++;
      if (sante?.verdict === 'grillee') grilleesVues++;
      await c.query(`INSERT INTO public.cloud_ips (commande, ip, etat, user_id, dernier_user_id, attributions, expire_le, liberee_le, repos_fin, purge_prouvee_le, refus,
          reserve_pour, reserve_jusqu_au, rebut_critere, rebut_le, sante)
        VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7::float8 * 86400),
          CASE WHEN $3 = 'repos' THEN now() - make_interval(secs => $12::float8 * 86400) END, CASE WHEN $3 = 'repos' THEN now() + make_interval(secs => $8::float8 * 86400) END,
          CASE WHEN $3 = 'repos' AND $8::float8 < 0 THEN now() - interval '1 hour' END, $9::jsonb, $10,
          CASE WHEN $10::uuid IS NULL THEN NULL ELSE now() + interval '20 minutes' END,
          CASE WHEN $3 = 'rebut' THEN 'manuel' END, CASE WHEN $3 = 'rebut' THEN now() END, $11::jsonb)`,
      [`h${k}-${i}`, `10.${k % 250}.${i}.1`, etat, user, user ?? (profils.length ? profils[tirer(profils.length)] : null), tirer(8), jours, tirer(9) - 2 + 0.5,
        JSON.stringify(refus), reserve, sante ? JSON.stringify(sante) : null, 7.5 + hasard() * 2]);
    }
    for (let i = 0, n = tirer(4); i < n && i < profils.length; i++) await c.query(`INSERT INTO public.cloud_attente (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [profils[i]]);
    for (let i = 0, n = tirer(3); i < n; i++) {
      await c.query(`INSERT INTO public.cloud_ip_commandes (nature, quantite, statut, prix_usd) VALUES ('achat', $1, $2, 4)`, [1 + tirer(2), ['demandee', 'en_cours', 'livree'][tirer(3)]]);
    }
    const marge = tirer(6);
    await regler('cloud_ip_marge', marge);
    const etatK = await etatPool();
    const ips = await ipsJs();
    // Le miroir de cloud_ip_attribuable
    const users = [null, ...profils.slice(0, 3)];
    const sql = (await c.query(`SELECT i.id, u.id AS u, n.n AS nature, public.cloud_ip_attribuable(i, u.id, n.n) AS a FROM public.cloud_ips i
      CROSS JOIN (SELECT unnest($1::uuid[]) AS id UNION ALL SELECT NULL) u CROSS JOIN (VALUES ('essai'), ('client')) n(n)`, [users.filter(Boolean)])).rows;
    for (const l of sql) {
      attribTotal++;
      const js = regles.ipAttribuable(ips.find((x) => Number(x.id) === Number(l.id)), { nature: l.nature, userId: l.u ?? null, maintenant: Date.now() });
      // (le SQL rend NULL — pas false — pour une IP réservée à un autre quand p_user est NULL : un WHERE le lit « non », comme le JS)
      if (js === (l.a === true)) attribEgaux++; else if (divergences.length < 3) divergences.push({ k, id: l.id, u: l.u, nature: l.nature, js, sql: l.a });
    }
    // La garde : miroir, et « un achat que le plan demande passe toujours », dans les deux règles
    for (const sainesSeulement of [false, true]) {
      const plan = regles.planDuJour({ ips, lambda: 0.5, enAttente: etatK.en_attente, commandesEnCours: Number(etatK.commandes_en_cours), marge,
        comptesSansPlace: etatK.comptes_sans_place, sainesSeulement, maintenant: Date.now() });
      const q = Math.max(plan.aCommander, 1);
      const g = await garde(q);
      const js = regles.gardePour(plan.garde, q);
      if (!sainesSeulement) { if (js && js.comptees === g.comptees && js.borne === g.borne && js.ok === g.ok) gardesEgales++; else if (divergences.length < 6) divergences.push({ k, js, g }); }
      if (plan.aCommander > 0) {
        if (sainesSeulement) achatsRegle++; else achatsDemandes++;
        if ((await garde(plan.aCommander)).ok === true) proprietes++; else if (divergences.length < 6) divergences.push({ k, sainesSeulement, aCommander: plan.aCommander });
      } else proprietes++;
    }
    // (07/11 soir) L'attribution : le miroir JS (choisirIp) = cloud_ip_attribuer ; puis, sans santé, le choix d'avant (corps de la prod).
    const comptes = [U(999), ...profils.slice(0, 2)];
    for (const u of comptes) for (const nature of ['essai', 'client']) {
      choixTotal++;
      const js = regles.choisirIp(ips, { userId: u, nature, maintenant: Date.now() })?.id ?? null;
      const sqlId = await choix(u, nature);
      if (sqlId != null) choixNonVides++;
      if (Number(js) === Number(sqlId) || (js == null && sqlId == null)) choixEgaux++; else if (divergences.length < 8) divergences.push({ k, u, nature, js, sql: sqlId });
    }
    await c.query('UPDATE public.cloud_ips SET sante = NULL');
    for (const u of comptes) for (const nature of ['essai', 'client']) {
      avantTotal++;
      const a = await choix(u, nature, 'cloud_ip_attribuer_avant'); const b = await choix(u, nature);
      if (String(a) === String(b)) avantEgaux++; else if (divergences.length < 8) divergences.push({ k, u, nature, avant: a, apres: b });
    }
    if (String(await choix(comptes[0], null, 'cloud_ip_reserver_avant')) === String(await choix(comptes[0], null, 'cloud_ip_reserver'))) avantEgaux++;
    else if (divergences.length < 8) divergences.push({ k, reserver: true });
    avantTotal++;
  }
  verifier(`B5. le miroir JS (regles.ipAttribuable) = cloud_ip_attribuable sur 300 pools, santé comprise (${attribEgaux}/${attribTotal}, ${grilleesVues} IP grillées tirées)`,
    attribEgaux === attribTotal && attribTotal > 3000 && grilleesVues > 100, JSON.stringify(divergences));
  verifier(`B5. le miroir JS (regles.gardeNombre) = cloud_ip_garde_nombre (${gardesEgales}/300)`, gardesEgales === 300, JSON.stringify(divergences));
  verifier(`B5. le miroir JS (regles.choisirIp) = cloud_ip_attribuer, opérateurs compris (${choixEgaux}/${choixTotal} choix, ${choixNonVides} non vides, ${rangsVus} IP au rang relevé)`,
    choixEgaux === choixTotal && choixNonVides > 600 && rangsVus > 200, JSON.stringify(divergences));
  verifier(`B5. sans santé : cloud_ip_attribuer et cloud_ip_reserver = les corps de la prod, choix à choix (${avantEgaux}/${avantTotal})`,
    avantEgaux === avantTotal && avantTotal > 1500, JSON.stringify(divergences));
  verifier(`B5. « un achat que le plan demande passe toujours la garde » : règle d'aujourd'hui (${achatsDemandes} achats) ET « saines d'abord » (${achatsRegle}) — 600/600`,
    proprietes === 600 && achatsDemandes > 30 && achatsRegle > 30, JSON.stringify(divergences));

  // ── C. L'INVERSE ─────────────────────────────────────────────────────────────────────────────────────────────
  await c.query(ETAT);
  await c.query(`UPDATE public.cloud_ips SET sante = '{"verdict":"grillee","le":"2026-11-07T17:40:00Z"}' WHERE id = 40`);
  await c.query(lire(INVERSE));
  for (const f of ['cloud_ip_attribuable', 'cloud_ip_garde_nombre', 'cloud_ip_attribuer', 'cloud_ip_reserver']) {
    const corps = (await un(`SELECT pg_get_functiondef(p.oid) AS d FROM pg_proc p WHERE proname = $1`, [f])).d.replace(/\r\n/g, '\n').trim();
    verifier(`C. INVERSE : ${f} = le corps de la prod, mot pour mot`, corps === lire(`${FIX}/${f}.sql`).trim());
  }
  verifier('C. INVERSE : cloud_ip_sante_noter et cloud_ip_rang_operateur retirées, la colonne sante et sa contrainte retirées, les deux réglages retirés',
    (await un(`SELECT count(*)::int AS n FROM pg_proc WHERE proname IN ('cloud_ip_sante_noter', 'cloud_ip_rang_operateur')`)).n === 0
    && (await un(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'cloud_ips' AND column_name = 'sante'`)).n === 0
    && (await un(`SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'cloud_ips_sante_lisible'`)).n === 0
    && (await un(`SELECT count(*)::int AS n FROM public.coin_config WHERE key IN ('cloud_ip_sante_controle', 'cloud_ip_renouveler_saines_seulement')`)).n === 0);
  verifier('C. INVERSE : attribuable, garde et état du pool = AVANT (l\'IP 40 redevient attribuable)',
    (await attribuables()) === avantAttrib && JSON.stringify(await garde(0)) === JSON.stringify(avantGarde)
    && (await etatPool()).attribuables_essai === avantEtat.attribuables_essai);
  await c.query(lire(MIGRATION));
  verifier('C. la migration se rejoue après l\'inverse', (await noter(1, SAINE())).ok === true);
} catch (e) {
  verifier('banc', false, e.stack ?? e.message);
} finally {
  await c.end();
  if (embarque) { await embarque.pg.stop(); rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(echecs ? `✗ ${echecs} échec(s)` : '✓ essai complet');
process.exit(echecs ? 1 : 0);
