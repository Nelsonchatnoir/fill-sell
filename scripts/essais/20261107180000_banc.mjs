// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261107180000_cloud_ip_marge_garde_nombre (07/11, décisions de Nico :
// « IP toujours d'avance », « plus de plafond en dollars », la capacité mesurée) — jamais la prod.
//   PREUVE_PG=embarque node scripts/essais/20261107180000_banc.mjs
// Corps de la PROD du 07/11 (scripts/essais/fixtures/prod-0711-ip-garde/) ; décor = l'état relu en prod le 07/11 : Nico
// client sur l'IP 42, 7 IP « disponible » au refus Beebs non prouvé (la 39 réservée à Nico), 2 expirées, achats auto à 0,
// renouvellement auto à 1, plafond 60 $, stock minimum 2.
//   A. AVANT : le plafond en dollars bloque un achat ET le renouvellement de l'IP d'un client payant — le défaut ;
//   B. APRÈS : la marge en base ; la garde du NOMBRE (un achat), jamais sur une prolongation ; l'anti-boucle des
//      prolongations ; plus aucun dollar ; l'attente et les essais élargissent la borne ; le repos, le refus prouvé, l'IP
//      usée ou qui expire bientôt ne comptent pas ; DEUX SERVEURS EN MÊME TEMPS (deux connexions, le verrou) ;
//      cloud_pool_etat ; le MIROIR JS (regles.gardeNombre) égal au SQL et « un achat que le plan demande passe toujours »
//      sur 300 pools tirés au hasard ; la capacité mesurée (cloud_capacite_mesures → capaciteMesuree) ;
//   C. l'INVERSE rend la règle d'avant.
import pg from 'pg';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as regles from '../../supabase/functions/_shared/cloud-pool.js';
import { capaciteMesuree } from '../../serveur-cloud/src/flotte.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-ip-garde-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port: 55448, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:banc@127.0.0.1:55448/postgres';
}

const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Un décor réduit aux colonnes que lisent les fonctions de la prod (types et défauts relus le 07/11).
const DECOR = String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer, updated_at timestamptz DEFAULT now());
CREATE TABLE public.profiles (id uuid PRIMARY KEY, is_cloud boolean DEFAULT false, cloud_essai_debut timestamptz,
  cloud_essai_fin timestamptz, cloud_essai_arrete boolean DEFAULT false);
CREATE TABLE public.cloud_ips (id bigserial PRIMARY KEY, fournisseur text DEFAULT 'iproyal', commande text, ip inet, port integer,
  pays text DEFAULT 'FR', etat text NOT NULL DEFAULT 'achetee', user_id uuid, dernier_user_id uuid, reserve_pour uuid,
  reserve_jusqu_au timestamptz, liberee_le timestamptz, repos_fin timestamptz, purge_prouvee_le timestamptz,
  expire_le timestamptz NOT NULL, attributions integer NOT NULL DEFAULT 0, rebut_critere text, rebut_le timestamptz,
  maj_le timestamptz DEFAULT now(), refus jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE UNIQUE INDEX cloud_ips_un_titulaire ON public.cloud_ips (user_id) WHERE user_id IS NOT NULL;
CREATE TABLE public.cloud_ip_evenements (id bigserial PRIMARY KEY, ip_id bigint NOT NULL, le timestamptz NOT NULL DEFAULT now(),
  nature text NOT NULL, user_id uuid, details jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE public.cloud_attente (user_id uuid PRIMARY KEY, demande_le timestamptz DEFAULT now());
CREATE TABLE public.cloud_postes (user_id uuid PRIMARY KEY, serveur text, etat text NOT NULL DEFAULT 'eteint');
CREATE TABLE public.cloud_ip_commandes (id bigserial PRIMARY KEY, fournisseur text NOT NULL DEFAULT 'iproyal', commande text,
  quantite integer NOT NULL CHECK (quantite >= 1 AND quantite <= 50),
  statut text NOT NULL DEFAULT 'demandee' CHECK (statut IN ('demandee', 'en_cours', 'livree', 'echec', 'remboursee')),
  prix_usd numeric, go_par text, demandee_le timestamptz NOT NULL DEFAULT now(), livree_le timestamptz,
  details jsonb NOT NULL DEFAULT '{}'::jsonb, nature text NOT NULL DEFAULT 'achat' CHECK (nature IN ('achat', 'prolongation')),
  ip_id bigint REFERENCES public.cloud_ips (id));
CREATE TABLE public.cloud_mesures (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, serveur text NOT NULL,
  le timestamptz NOT NULL DEFAULT now(), hote jsonb NOT NULL DEFAULT '{}'::jsonb, comptes jsonb NOT NULL DEFAULT '{}'::jsonb);
`;
const PROD = ['cloud_ts', 'cloud_param', 'cloud_journal', 'cloud_ip_refus_prouve', 'cloud_ip_attribuable', 'cloud_ip_depenses_mois',
  'cloud_ip_depense_ouvrir', 'cloud_ip_depense_fermer', 'cloud_pool_etat'];
const FIX = 'scripts/essais/fixtures/prod-0711-ip-garde';
const presentes = new Set(readdirSync(join(ROOT, FIX)).map((f) => f.replace(/\.sql$/, '')));
const MIGRATION = 'supabase/migrations/20261107180000_cloud_ip_marge_garde_nombre.sql';
const INVERSE = 'supabase/rollbacks/20261107180000_cloud_ip_marge_garde_nombre_INVERSE.sql';
const REFUS_BEEBS = `'{"beebs":{"le":"2026-11-03T12:00:00Z","prouvee":false}}'::jsonb`;
const ETAT = String.raw`
TRUNCATE public.cloud_ip_commandes, public.cloud_ip_evenements, public.cloud_attente, public.cloud_postes RESTART IDENTITY;
DELETE FROM public.cloud_ips; DELETE FROM public.profiles; DELETE FROM public.coin_config;
INSERT INTO public.coin_config (key, value) VALUES ('cloud_ip_achat_max', 10), ('cloud_ip_achats_auto', 0), ('cloud_ip_budget_mensuel_usd', 60),
  ('cloud_ip_refus_revisite_jours', 14), ('cloud_ip_renouvellement_auto', 1), ('cloud_ip_rotation', 0), ('cloud_ip_stock_min', 2),
  ('cloud_places_seuil', 2), ('cloud_serveurs_auto', 0);
INSERT INTO public.profiles (id, is_cloud) VALUES ('${NICO}', true);
INSERT INTO public.profiles (id) SELECT ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid FROM generate_series(1, 20) n;
INSERT INTO public.cloud_ips (id, commande, ip, etat, user_id, dernier_user_id, attributions, expire_le) VALUES
  (42, 'c42', '198.51.100.42', 'attribuee_client', '${NICO}', '${NICO}', 1, now() + interval '27 days');
INSERT INTO public.cloud_ips (id, commande, ip, etat, attributions, expire_le, reserve_pour, reserve_jusqu_au, refus) VALUES
  (39, 'c39', '198.51.100.39', 'disponible', 1, now() + interval '26 days', '${NICO}', now() + interval '26 days', ${REFUS_BEEBS});
INSERT INTO public.cloud_ips (id, commande, ip, etat, attributions, expire_le, refus)
  SELECT 30 + n, 'c' || (30 + n), ('198.51.100.' || (30 + n))::inet, 'disponible', 0, now() + interval '21 days' + n * interval '1 day', ${REFUS_BEEBS}
    FROM generate_series(1, 6) n;
INSERT INTO public.cloud_ips (id, commande, ip, etat, attributions, expire_le) VALUES
  (5, 'c5', '198.51.100.5', 'expiree', 2, now() - interval '4 days'), (6, 'c6', '198.51.100.6', 'expiree', 2, now() - interval '4 days');
SELECT setval('public.cloud_ips_id_seq', 1000);
INSERT INTO public.cloud_ip_commandes (nature, quantite, statut, prix_usd, go_par, demandee_le) VALUES
  ('achat', 1, 'livree', 4, 'automatique (cloud_ip_achats_auto)', now() - interval '1 minute'),
  ('achat', 1, 'livree', 4, 'automatique (cloud_ip_achats_auto)', now() - interval '1 minute'),
  ('achat', 1, 'livree', 4, 'accord écrit de Nico : une IP neuve', now() - interval '1 minute');
`;

const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
let echecs = 0;
const verifier = (nom, cond, detail = '') => { console.log(`${cond ? '✓' : '✗'} ${nom}${!cond && detail !== '' ? ` — ${detail}` : ''}`); if (!cond) echecs++; };
const un = async (q, p, cl = c) => (await cl.query(q, p)).rows[0];
const ouvrir = async (nature, quantite, prix, ip = null, details = {}, cl = c) =>
  (await un('SELECT public.cloud_ip_depense_ouvrir($1, $2, $3, $4, $5::jsonb) AS r', [nature, quantite, prix, ip, JSON.stringify(details)], cl)).r;
const garde = async (q = 0) => (await un('SELECT public.cloud_ip_garde_nombre($1) AS g', [q])).g;
const etatPool = async () => (await un('SELECT public.cloud_pool_etat() AS e')).e;
const regler = (cle, v) => c.query(`INSERT INTO public.coin_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [cle, v]);
const lignesCommandes = async () => Number((await un('SELECT count(*) AS n FROM public.cloud_ip_commandes')).n);
const ipsJs = async () => (await c.query(`SELECT id, etat, user_id, dernier_user_id, expire_le, attributions, reserve_pour, reserve_jusqu_au, repos_fin, refus
  FROM public.cloud_ips`)).rows.map((i) => ({ ...i, expire_le: i.expire_le?.toISOString(), reserve_jusqu_au: i.reserve_jusqu_au?.toISOString() ?? null,
  repos_fin: i.repos_fin?.toISOString() ?? null, user_id: i.user_id ?? null }));

try {
  for (const f of PROD) if (!presentes.has(f)) throw new Error(`fixture absente : ${f}`);
  await c.query(DECOR);
  for (const f of PROD) await c.query(`${lire(`${FIX}/${f}.sql`)};`);
  await c.query(ETAT);

  // ── A. AVANT — la prod du 07/11 ──────────────────────────────────────────────────────────────────────────────
  await c.query('BEGIN');
  await regler('cloud_ip_achats_auto', 1);
  await c.query(`INSERT INTO public.cloud_ip_commandes (nature, quantite, statut, prix_usd, demandee_le) VALUES ('prolongation', 11, 'livree', 44, now() - interval '1 minute')`);
  let r = await ouvrir('achat', 1, 4);
  verifier('A. AVANT : 56 $ dépensés ce mois, un achat de 4 $ passe (60 ≤ 60)', r.ok === true, JSON.stringify(r));
  r = await ouvrir('achat', 1, 4);
  verifier('A. AVANT : le suivant est refusé « plafond » (64 > 60 $)', r.ok === false && r.raison === 'plafond', JSON.stringify(r));
  r = await ouvrir('prolongation', 1, 4, 42, { commande: 'c42', ips: [42] });
  verifier('A. AVANT : et le RENOUVELLEMENT de l\'IP de Nico (client payant) aussi — le défaut', r.ok === false && r.raison === 'plafond', JSON.stringify(r));
  await c.query('ROLLBACK');

  // ── B. LA MIGRATION (deux fois : idempotente) ─────────────────────────────────────────────────────────────────
  await c.query(lire(MIGRATION));
  await c.query(lire(MIGRATION));
  verifier('B0. la migration passe deux fois (idempotente)', true);
  const coin = Object.fromEntries((await c.query(`SELECT key, value FROM public.coin_config`)).rows.map((l) => [l.key, l.value]));
  verifier('B0. coin_config : cloud_ip_marge = 3, cloud_ip_paiement_carte = 0 (le solde), cloud_capacite_alerte_pct = 80',
    coin.cloud_ip_marge === 3 && coin.cloud_ip_paiement_carte === 0 && coin.cloud_capacite_alerte_pct === 80, JSON.stringify(coin));
  verifier('B0. cloud_ip_stock_min (2) et cloud_ip_budget_mensuel_usd (60) laissés en base pour l\'orchestrateur d\'avant',
    coin.cloud_ip_stock_min === 2 && coin.cloud_ip_budget_mensuel_usd === 60);
  const droits = (await un(`SELECT (SELECT proacl::text FROM pg_proc WHERE proname = 'cloud_ip_garde_nombre') AS g,
    (SELECT proacl::text FROM pg_proc WHERE proname = 'cloud_capacite_mesures') AS m`));
  verifier('B0. fonctions neuves : service_role seul (ni PUBLIC, ni anon, ni authenticated)',
    /service_role=X/.test(droits.g) && /service_role=X/.test(droits.m) && !/(^|[{,])=X|anon|authenticated/.test(`${droits.g}${droits.m}`), JSON.stringify(droits));

  // B1. L'état de la prod : 1 client + 7 IP d'avance → au-dessus de la borne : aucun achat
  let g = await garde(1);
  verifier('B1. état du 07/11 : comptées 9 (IP 42 + 7 disponibles + 1 demandée) pour une borne de 4 (1 compte + marge 3) → refus',
    g.comptees === 9 && g.borne === 4 && g.ok === false && g.vivantes === 8 && g.comptes === 1, JSON.stringify(g));
  await regler('cloud_ip_achats_auto', 1);
  const avantB1 = await lignesCommandes();
  r = await ouvrir('achat', 1, 4);
  verifier('B1. cloud_ip_depense_ouvrir(achat) : « garde_nombre », la garde rendue, AUCUNE ligne au registre',
    r.ok === false && r.raison === 'garde_nombre' && r.garde?.borne === 4 && (await lignesCommandes()) === avantB1, JSON.stringify(r));

  // B2. Une prolongation n'est jamais bornée par le nombre ; l'anti-boucle
  r = await ouvrir('prolongation', 1, 4, 42, { commande: 'c42', ips: [42] });
  verifier('B2. renouvellement de l\'IP 42 de Nico : PASSE alors que le nombre est au-dessus de la borne', r.ok === true && r.garde === null, JSON.stringify(r));
  const prol1 = r.id;
  r = await ouvrir('prolongation', 1, 4, 42, { commande: 'c42', ips: [42] });
  verifier('B2. la même commande une 2e fois en moins de 15 jours : « prolongation_recente » (anti-boucle)', r.ok === false && r.raison === 'prolongation_recente', JSON.stringify(r));
  r = await ouvrir('prolongation', 1, 4, null, { commande: 'c42' });
  verifier('B2. … reconnue aussi par le seul numéro de commande', r.ok === false && r.raison === 'prolongation_recente', JSON.stringify(r));
  await un(`SELECT public.cloud_ip_depense_fermer($1, 'echec') AS f`, [prol1]);
  r = await ouvrir('prolongation', 1, 4, 42, { commande: 'c42', ips: [42] });
  verifier('B2. la première ÉCHOUÉE : la reprise passe', r.ok === true, JSON.stringify(r));
  r = await ouvrir('prolongation', 1, 4, 31, { commande: 'c31', ips: [31] });
  verifier('B2. une autre commande : passe', r.ok === true, JSON.stringify(r));
  await c.query(`UPDATE public.cloud_ip_commandes SET demandee_le = now() - interval '16 days' WHERE details ->> 'commande' = 'c42'`);
  r = await ouvrir('prolongation', 1, 4, 42, { commande: 'c42', ips: [42] });
  verifier('B2. 16 jours plus tard : la prolongation suivante passe', r.ok === true, JSON.stringify(r));
  await regler('cloud_ip_renouvellement_auto', 0);
  r = await ouvrir('prolongation', 1, 4, 33, { commande: 'c33' });
  verifier('B2. interrupteur du renouvellement à 0 : « interrupteur_coupe » (inchangé)', r.ok === false && r.raison === 'interrupteur_coupe', JSON.stringify(r));
  await regler('cloud_ip_renouvellement_auto', 1);

  // B3. Plus de dollars : 1 000 $ dépensés ce mois, la marge se reconstitue ; la boucle bute sur le nombre
  await c.query(`UPDATE public.cloud_ips SET etat = 'expiree', reserve_pour = NULL, reserve_jusqu_au = NULL WHERE etat = 'disponible'`);
  await c.query(`INSERT INTO public.cloud_ip_commandes (nature, quantite, statut, prix_usd) VALUES ('prolongation', 50, 'livree', 1000)`);
  verifier('B3. 1 000 $ et plus dépensés ce mois (cloud_ip_depenses_mois)', Number((await un('SELECT public.cloud_ip_depenses_mois() AS d')).d) >= 1000);
  r = await ouvrir('achat', 3, 12, null, { paiement: 'solde' });
  verifier('B3. pool vide, 1 client, marge 3 : l\'achat de 3 IP PASSE (comptées 4 = borne 4) — aucun plafond en dollars',
    r.ok === true && r.garde?.comptees === 4 && r.garde?.borne === 4, JSON.stringify(r));
  verifier('B3. le registre garde la ligne « demandee » et le moyen de paiement dans details',
    (await un(`SELECT details ->> 'paiement' AS p, statut FROM public.cloud_ip_commandes WHERE id = $1`, [r.id])).p === 'solde');
  r = await ouvrir('achat', 1, 4);
  verifier('B3. une 4e IP alors que 3 sont EN COMMANDE : « garde_nombre » (la boucle d\'achat bute)', r.ok === false && r.raison === 'garde_nombre'
    && r.garde.en_commande === 3 && r.garde.comptees === 5, JSON.stringify(r));

  // B4. L'attente et les essais élargissent la borne
  await c.query(`INSERT INTO public.cloud_attente (user_id) VALUES ($1), ($2)`, [U(1), U(2)]);
  r = await ouvrir('achat', 2, 8);
  verifier('B4. 2 personnes en attente (futurs comptes) : borne 6 → 2 IP de plus passent', r.ok === true && r.garde.borne === 6 && r.garde.comptees === 6, JSON.stringify(r));
  await c.query(`UPDATE public.profiles SET cloud_essai_debut = now() - interval '1 day', cloud_essai_fin = now() + interval '6 days' WHERE id = $1`, [U(3)]);
  g = await garde(1);
  verifier('B4. un essai en cours sans IP : un compte de plus dans la borne (7), 1 IP de plus passe', g.comptes === 2 && g.borne === 7 && g.ok === true, JSON.stringify(g));
  await c.query(`UPDATE public.profiles SET cloud_essai_debut = now() - interval '8 days', cloud_essai_fin = now() - interval '1 day' WHERE id = $1`, [U(3)]);
  await c.query(`INSERT INTO public.cloud_ips (commande, ip, etat, user_id, dernier_user_id, attributions, expire_le) VALUES ('cg', '203.0.113.50', 'attribuee_essai', $1, $1, 1, now() + interval '9 days')`, [U(3)]);
  g = await garde(0);
  verifier('B4. essai fini, IP gardée pendant la grâce : le titulaire compte une fois (IP comptée, compte compté)', g.comptes === 2 && g.vivantes === 2, JSON.stringify(g));

  // B5. Ce que la garde ne compte jamais (sous-ensemble du plan) : repos, refus prouvé, usée, échéance proche
  const avantB5 = await garde(0);
  await c.query(`INSERT INTO public.cloud_ips (commande, ip, etat, dernier_user_id, attributions, expire_le, repos_fin, refus) VALUES
    ('r1', '203.0.113.60', 'repos', $1, 1, now() + interval '25 days', now() + interval '6 days', '{}'),
    ('r2', '203.0.113.61', 'disponible', NULL, 0, now() + interval '25 days', NULL, '{"beebs":{"prouvee":true}}'),
    ('r3', '203.0.113.62', 'disponible', NULL, 6, now() + interval '25 days', NULL, '{}'),
    ('r4', '203.0.113.63', 'disponible', NULL, 0, now() + interval '9 days', NULL, '{}'),
    ('r5', '203.0.113.64', 'rebut', NULL, 0, now() + interval '25 days', NULL, '{}')`, [U(9)]);
  g = await garde(0);
  verifier('B5. repos, refus PROUVÉ, IP usée, IP qui expire dans 9 jours, rebut : aucune ne compte', g.vivantes === avantB5.vivantes, `${JSON.stringify(avantB5)} → ${JSON.stringify(g)}`);
  await c.query(`INSERT INTO public.cloud_ips (commande, ip, etat, attributions, expire_le) VALUES ('r6', '203.0.113.65', 'achetee', 0, now() + interval '30 days')`);
  verifier('B5. une IP livrée (« achetee », 30 jours) compte tout de suite', (await garde(0)).vivantes === avantB5.vivantes + 1);

  // B6. L'interrupteur des achats tient toujours
  await regler('cloud_ip_achats_auto', 0);
  r = await ouvrir('achat', 1, 4);
  verifier('B6. cloud_ip_achats_auto = 0 : « interrupteur_coupe » avant toute garde', r.ok === false && r.raison === 'interrupteur_coupe', JSON.stringify(r));
  await regler('cloud_ip_achats_auto', 1);
  r = await ouvrir('achat', 0, 4);
  verifier('B6. quantité 0 : « prix_ou_quantite_illisible » (inchangé)', r.ok === false && r.raison === 'prix_ou_quantite_illisible');

  // B7. DEUX SERVEURS EN MÊME TEMPS : le verrou de la dépense, le second voit la ligne du premier
  await c.query(`DELETE FROM public.cloud_ip_commandes WHERE nature = 'achat' AND statut = 'demandee'`);
  await c.query(`DELETE FROM public.cloud_ips WHERE commande LIKE 'r%' OR commande = 'cg'`);
  await c.query(`DELETE FROM public.cloud_attente`);
  g = await garde(0);
  const place = g.borne - g.comptees;
  const s1 = new pg.Client({ connectionString: PG_URL }); const s2 = new pg.Client({ connectionString: PG_URL });
  await s1.connect(); await s2.connect();
  try {
    await s1.query('BEGIN');
    const r1 = await ouvrir('achat', place, 4 * place, null, {}, s1);
    let fini = false;
    const p2 = ouvrir('achat', 1, 4, null, {}, s2).then((x) => { fini = true; return x; });
    await new Promise((ok) => setTimeout(ok, 400));
    verifier(`B7. serveur 1 ouvre ${place} IP (jusqu'à la borne) sans valider ; serveur 2 ATTEND le verrou`, r1.ok === true && fini === false, JSON.stringify(r1));
    await s1.query('COMMIT');
    const r2 = await p2;
    verifier('B7. serveur 1 valide → serveur 2 voit sa ligne et refuse « garde_nombre » : jamais deux achats pour un manque', r2.ok === false && r2.raison === 'garde_nombre', JSON.stringify(r2));
    await c.query(`DELETE FROM public.cloud_ip_commandes WHERE id = $1`, [r1.id]);
    await s1.query('BEGIN');
    const r3 = await ouvrir('achat', place, 4 * place, null, {}, s1);
    const p4 = ouvrir('achat', place, 4 * place, null, {}, s2);
    await new Promise((ok) => setTimeout(ok, 200));
    await s1.query('ROLLBACK');
    const r4 = await p4;
    verifier('B7. serveur 1 annule (mort entre les deux) → serveur 2 passe : le verrou sérialise, il ne bloque pas à tort', r3.ok === true && r4.ok === true, JSON.stringify([r3, r4]));
    await c.query(`DELETE FROM public.cloud_ip_commandes WHERE id = $1`, [r4.id]);
  } finally { await s1.end(); await s2.end(); }

  // B8. cloud_pool_etat
  const e = await etatPool();
  verifier('B8. cloud_pool_etat : « marge », « garde », « paiement_carte » ajoutés ; « budget_mensuel_usd » et « stock_min » retirés',
    e.marge === 3 && e.garde?.borne != null && e.paiement_carte === 0 && !('budget_mensuel_usd' in e) && !('stock_min' in e), JSON.stringify(e));
  const clesAvant = ['par_etat', 'attribuables_essai', 'attribuables_essai_sans_refus_prouve', 'reservees', 'repos_prets_48h', 'purges_en_retard',
    'en_attente', 'attente_max_h', 'comptes_sans_place', 'postes', 'commandes_en_cours', 'echeances_3j', 'rebuts_24h', 'essais_7j',
    'refus_non_prouves', 'refus_prouves', 'depenses_mois_usd', 'achats_auto', 'renouvellement_auto'];
  verifier('B8. … toutes les autres clés d\'avant sont là', clesAvant.every((k) => k in e), clesAvant.filter((k) => !(k in e)).join(', '));

  // B9. LE MIROIR JS ET LA PROPRIÉTÉ « un achat que le plan demande passe toujours » — 300 pools tirés au hasard
  let graine = 7;
  const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
  const tirer = (n) => Math.floor(hasard() * n);
  let egaux = 0, proprietes = 0, achatsDemandes = 0, gardeBloque = 0, divergences = [];
  for (let k = 0; k < 300; k++) {
    await c.query(`TRUNCATE public.cloud_ip_commandes, public.cloud_attente RESTART IDENTITY; DELETE FROM public.cloud_ips; DELETE FROM public.profiles;`);
    const nProfils = tirer(12);
    const profils = [];
    for (let i = 0; i < nProfils; i++) {
      const t = hasard();
      const id = U(100 + i);
      profils.push(id);
      if (t < 0.3) await c.query(`INSERT INTO public.profiles (id, is_cloud) VALUES ($1, true)`, [id]);
      else if (t < 0.5) await c.query(`INSERT INTO public.profiles (id, cloud_essai_debut, cloud_essai_fin) VALUES ($1, now() - interval '2 days', now() + interval '5 days')`, [id]);
      else if (t < 0.6) await c.query(`INSERT INTO public.profiles (id, cloud_essai_debut, cloud_essai_fin) VALUES ($1, now() - interval '8 days', now() - interval '1 day')`, [id]);
      else await c.query(`INSERT INTO public.profiles (id) VALUES ($1)`, [id]);
    }
    const libres = [...profils];
    const nIps = tirer(14);
    for (let i = 0; i < nIps; i++) {
      let etat = ['achetee', 'disponible', 'disponible', 'attribuee_essai', 'attribuee_client', 'repos', 'rebut', 'expiree'][tirer(8)];
      let user = null;
      if (etat.startsWith('attribuee')) { if (libres.length) user = libres.splice(tirer(libres.length), 1)[0]; else etat = 'disponible'; }
      const jours = tirer(38) - 3 + 0.5;
      const refus = [{}, {}, {}, { beebs: { prouvee: false } }, { vinted: { prouvee: true } }][tirer(5)];
      const reserve = hasard() < 0.15 && profils.length ? profils[tirer(profils.length)] : null;
      await c.query(`INSERT INTO public.cloud_ips (commande, ip, etat, user_id, dernier_user_id, attributions, expire_le, repos_fin, refus, reserve_pour, reserve_jusqu_au)
        VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7::float8 * 86400), CASE WHEN $3 = 'repos' THEN now() + make_interval(secs => $8::float8 * 86400) END, $9::jsonb, $10,
                CASE WHEN $10::uuid IS NULL THEN NULL ELSE now() + interval '20 minutes' END)`,
      [`h${k}-${i}`, `10.${k % 250}.${i}.1`, etat, user, user ?? (profils.length ? profils[tirer(profils.length)] : null), tirer(8), jours, tirer(9) - 1 + 0.5,
        JSON.stringify(refus), reserve]);
    }
    for (let i = 0, n = tirer(4); i < n && i < profils.length; i++) await c.query(`INSERT INTO public.cloud_attente (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [profils[i]]);
    for (let i = 0, n = tirer(4); i < n; i++) {
      await c.query(`INSERT INTO public.cloud_ip_commandes (nature, quantite, statut, prix_usd) VALUES ($1, $2, $3, 4)`,
        [['achat', 'achat', 'prolongation'][tirer(3)], 1 + tirer(3), ['demandee', 'en_cours', 'livree', 'echec'][tirer(4)]]);
    }
    const marge = tirer(6);
    await regler('cloud_ip_marge', marge);
    const etatK = await etatPool();
    const ips = await ipsJs();
    const plan = regles.planDuJour({ ips, lambda: 0.5, enAttente: etatK.en_attente, commandesEnCours: Number(etatK.commandes_en_cours), marge,
      comptesSansPlace: etatK.comptes_sans_place, maintenant: Date.now() });
    const q = Math.max(plan.aCommander, 1);
    const sql = await garde(q);
    const js = regles.gardePour(plan.garde, q);
    if (js && js.comptees === sql.comptees && js.borne === sql.borne && js.ok === sql.ok) egaux++;
    else if (divergences.length < 3) divergences.push({ k, js, sql });
    if (plan.aCommander > 0) {
      achatsDemandes++;
      const legit = await garde(plan.aCommander);
      if (legit.ok === true) proprietes++; else if (divergences.length < 3) divergences.push({ k, plan: plan.aCommander, legit });
    } else proprietes++;
    if ((await garde(1)).ok === false) gardeBloque++;
  }
  verifier(`B9. le miroir JS (regles.gardeNombre) = le SQL (cloud_ip_garde_nombre) sur 300 pools au hasard (${egaux}/300)`, egaux === 300, JSON.stringify(divergences));
  verifier(`B9. « un achat que le plan demande passe toujours » : ${achatsDemandes} pools où le plan achète, garde OK à chaque fois`, proprietes === 300 && achatsDemandes > 30, JSON.stringify(divergences));
  verifier(`B9. … et la garde arrête bien un achat de trop (${gardeBloque} pools où une IP de plus serait refusée)`, gardeBloque > 30);

  // B10. La capacité mesurée (cloud_capacite_mesures → capaciteMesuree, flotte.js)
  const mesure = (n, { memCompte = 1300, socle = 2500, cpu = 0.07, puce = 0.001, signes = null } = {}) => {
    const comptes = {};
    for (let i = 0; i < n; i++) comptes[U(500 + i)] = { mem_max_mo: memCompte, mem_med_mo: memCompte - 100, oom: 0, ...(signes && i === 0 ? { signes } : {}) };
    const utilisee = socle + n * memCompte;
    return { hote: { mem_total_mo: 64076, mem_dispo_min_mo: 64076 - utilisee, mem_utilisee_max_pct: Math.round(1000 * utilisee / 64076) / 10,
      cpu_p95_pct: cpu, puce_p95_pct: puce, navigateurs_max: n }, comptes };
  };
  const remplir = async (serveur, n, opts = {}, fenetres = 288) => {
    await c.query(`DELETE FROM public.cloud_mesures WHERE serveur = $1`, [serveur]);
    const m = mesure(n, opts);
    await c.query(`INSERT INTO public.cloud_mesures (serveur, le, hote, comptes)
      SELECT $1, now() - make_interval(mins => 5 * g), $2::jsonb, $3::jsonb FROM generate_series(0, $4 - 1) g`, [serveur, JSON.stringify(m.hote), JSON.stringify(m.comptes), fenetres]);
  };
  const lireMesures = async (serveur) => (await un('SELECT public.cloud_capacite_mesures($1, 24) AS m', [serveur])).m;
  const CFG = { depart: 15, plafond: 30, theorique: 30, avance: 5 };
  await remplir('cloud-2', 1, { memCompte: 845, cpu: 0.072 });
  let m = await lireMesures('cloud-2');
  const nMemAttendu = Math.floor(1 + Math.min(0.7 * 64076 - (2500 + 845), (64076 - 2500 - 845) - 6144) / 845);
  verifier(`B10. cloud-2 aujourd'hui (1 compte, 845 Mo) : 288 fenêtres, n_mem ${m.n_mem} = ${nMemAttendu}, n_cpu ${m.n_cpu} = ⌊60/0,072⌋`,
    m.fenetres === 288 && m.comptes_max === 1 && m.n_mem === nMemAttendu && m.n_cpu === Math.floor(60 / 0.072) && m.graves_7j === 0, JSON.stringify(m));
  let cap = capaciteMesuree({ ...CFG, actuelle: 15, comptesServis: 1, mesures: m });
  verifier('B10. … la capacité reste 15 (1 + 5 comptes d\'avance < 15), atteignable 30 (plafond)', cap.capacite === 15 && cap.atteignable === 30, JSON.stringify(cap));
  await remplir('cloud-2', 14, { memCompte: 1300, cpu: 21 });
  m = await lireMesures('cloud-2');
  cap = capaciteMesuree({ ...CFG, actuelle: 15, comptesServis: 14, mesures: m });
  verifier('B10. 14 vrais comptes mesurés sur 24 h, mémoire et processeur sains : la capacité MONTE seule à 19 (14 + 5)', cap.capacite === 19 && cap.raison === 'mesures_hausse', JSON.stringify({ m, cap }));
  await remplir('cloud-2', 14, { memCompte: 1300, cpu: 45 });
  m = await lireMesures('cloud-2');
  cap = capaciteMesuree({ ...CFG, actuelle: 19, comptesServis: 14, mesures: m });
  verifier(`B10. processeur p95 à 45 % pour 14 comptes : projection ⌊14 × 60 / 45⌋ = 18 → la capacité redescend à 18 (jamais sous les 14 servis)`,
    m.n_cpu === 18 && cap.capacite === 18 && cap.raison === 'mesures_baisse', JSON.stringify({ m, cap }));
  await remplir('cloud-2', 14, { memCompte: 1300, cpu: 21, signes: { restriction: 1 } });
  m = await lireMesures('cloud-2');
  cap = capaciteMesuree({ ...CFG, actuelle: 15, comptesServis: 14, mesures: m });
  verifier('B10. une restriction sur 7 jours : AUCUNE hausse (retenue), la capacité reste 15', m.graves_7j > 0 && cap.capacite === 15 && cap.raison === 'retenue_signes', JSON.stringify(cap));
  await remplir('cloud-2', 1, {}, 60);
  cap = capaciteMesuree({ ...CFG, actuelle: 15, comptesServis: 1, mesures: await lireMesures('cloud-2') });
  verifier('B10. 5 h de mesures seulement : rien ne bouge (mesures insuffisantes)', cap.capacite === 15 && cap.raison === 'mesures_insuffisantes', JSON.stringify(cap));
  m = await lireMesures('cloud-9');
  verifier('B10. un serveur sans mesure : 0 fenêtre, aucune projection', m.fenetres === 0 && m.n_mem == null, JSON.stringify(m));

  // ── C. L'INVERSE ─────────────────────────────────────────────────────────────────────────────────────────────
  await c.query(lire(INVERSE));
  await c.query(`TRUNCATE public.cloud_ip_commandes RESTART IDENTITY`);
  await regler('cloud_ip_achats_auto', 1);
  await c.query(`INSERT INTO public.cloud_ip_commandes (nature, quantite, statut, prix_usd) VALUES ('prolongation', 50, 'livree', 1000)`);
  r = await ouvrir('achat', 1, 4);
  verifier('C. INVERSE : le plafond en dollars revient (« plafond » à 1 000 $ dépensés)', r.ok === false && r.raison === 'plafond', JSON.stringify(r));
  const fonctions = (await c.query(`SELECT proname FROM pg_proc WHERE proname IN ('cloud_ip_garde_nombre', 'cloud_capacite_mesures')`)).rows;
  verifier('C. INVERSE : cloud_ip_garde_nombre et cloud_capacite_mesures retirées', fonctions.length === 0, JSON.stringify(fonctions));
  const eInv = await etatPool();
  verifier('C. INVERSE : cloud_pool_etat d\'avant (budget_mensuel_usd, stock_min ; ni marge ni garde)', 'budget_mensuel_usd' in eInv && 'stock_min' in eInv && !('garde' in eInv) && !('marge' in eInv));
  const coinInv = Object.fromEntries((await c.query(`SELECT key, value FROM public.coin_config`)).rows.map((l) => [l.key, l.value]));
  verifier('C. INVERSE : marge, paiement par carte, seuil 80 % retirés ; stock minimum et plafond restés', !('cloud_ip_marge' in coinInv) && !('cloud_ip_paiement_carte' in coinInv)
    && !('cloud_capacite_alerte_pct' in coinInv) && coinInv.cloud_ip_stock_min === 2 && coinInv.cloud_ip_budget_mensuel_usd === 60, JSON.stringify(coinInv));
  for (const f of ['cloud_ip_depense_ouvrir', 'cloud_pool_etat']) {
    const corps = (await un(`SELECT pg_get_functiondef(p.oid) AS d FROM pg_proc p WHERE proname = $1`, [f])).d.replace(/\r\n/g, '\n').trim();
    verifier(`C. INVERSE : ${f} = le corps de la prod, mot pour mot`, corps === lire(`${FIX}/${f}.sql`).trim());
  }
  await c.query(lire(MIGRATION));
  verifier('C. la migration se rejoue après l\'inverse', Boolean((await garde(0)).borne != null));
} catch (e) {
  verifier('banc', false, e.stack ?? e.message);
} finally {
  await c.end();
  if (embarque) { await embarque.pg.stop(); rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(echecs ? `✗ ${echecs} échec(s)` : '✓ essai complet');
process.exit(echecs ? 1 : 0);
