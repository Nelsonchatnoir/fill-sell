// PREUVE, SUR UN POSTGRES JETABLE, des migrations du 03/11/2026 (décisions de Nico, cas nadegemarcelin78) :
//   20261103233000_paiement_meme_palier_cycle_neuf — un paiement du même palier ouvre toujours un cycle neuf, sans
//     double crédit (proration, rejeu) ; le recalcul des comptes déjà dans ce cas ;
//   20261103234000_remontees_faites_ou_en_cours — Premium / Pro : seules les remontées faites ou en cours comptent.
//
//   PREUVE_PG=embarque node scripts/quotas/preuve-cycle-remontees.mjs   (Postgres 17 jetable sur le PC ;
//   embedded-postgres et pg déjà dans node_modules — sinon : npm i --no-save embedded-postgres@17.10.0-beta.17 pg@8.16.3)
//
// Jamais la prod (refus si l'URL est celle de Supabase). Les fonctions touchées sont celles de la PROD
// (scripts/quotas/fixtures/prod-0311-cycle-remontees.sql, pg_get_functiondef du 03/11) ; le reste est un bouchon qui ne
// décide de rien d'autre que ce que le test règle. Chaque cas tourne AVANT (définitions de prod : le défaut doit se
// reproduire) puis APRÈS les migrations.
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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-cycle-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55438, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55438/postgres';
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Le décor : rôles, auth.uid(), tables réduites à leurs colonnes utiles, bouchons.
const DECOR = String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $f$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$
  SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') $f$;

CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, is_premium boolean, is_pro boolean, is_business boolean, is_comped boolean,
  monthly_grant_override integer, created_at timestamptz DEFAULT now() - interval '90 days',
  stripe_customer_id text, apple_original_transaction_id text, google_purchase_token text,
  extension_last_seen_at timestamptz DEFAULT now(), extension_version text DEFAULT '0.6.169', lang text DEFAULT 'fr',
  platform_settings jsonb DEFAULT '{}'::jsonb);
CREATE TABLE public.coin_wallets (user_id uuid PRIMARY KEY, included_balance integer NOT NULL DEFAULT 0,
  purchased_balance integer NOT NULL DEFAULT 0, included_granted_month text, updated_at timestamptz DEFAULT now(),
  next_grant_at timestamptz, grant_anchor_day integer, reserved_balance integer NOT NULL DEFAULT 0);
CREATE TABLE public.coin_ledger (id bigserial PRIMARY KEY, user_id uuid NOT NULL, delta integer NOT NULL,
  included_after integer NOT NULL, purchased_after integer NOT NULL, kind text NOT NULL, ref text, metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX coin_ledger_ref_unique ON public.coin_ledger (ref) WHERE ref IS NOT NULL;
CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, inventaire_id bigint,
  platform text, action text, status text, photo_option text, title text, description text, price numeric, photos jsonb,
  listing_url text, platform_listing_id text, platform_fields jsonb DEFAULT '{}'::jsonb, handler_build text,
  published_at timestamptz, created_at timestamptz DEFAULT now(), error text);
CREATE TABLE public.inventaire (id bigint PRIMARY KEY, user_id uuid, photos jsonb, titre text, statut text,
  vinted_account_id text, fusionne_dans bigint);
CREATE TABLE public.usage_logs (id bigserial PRIMARY KEY, user_id uuid, feature text, metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now());
CREATE TABLE public.remises_en_vente (id bigserial PRIMARY KEY, user_id uuid, statut text, traite_le timestamptz, job_vendu uuid);
CREATE TABLE public.quotas_par_compte (user_id uuid PRIMARY KEY, quota_annonces integer);
CREATE TABLE public.republish_creneaux (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text,
  debut timestamptz, fin timestamptz, statut text, prevues integer, sautes jsonb, boutique text);

CREATE OR REPLACE FUNCTION public.version_cle(v text) RETURNS integer[] LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE WHEN v ~ '^\d+\.\d+\.\d+' THEN string_to_array(substring(v from '^\d+\.\d+\.\d+'), '.')::integer[] END $f$;
CREATE OR REPLACE FUNCTION public.republish_planifiee_pf_ouverte(p text) RETURNS boolean LANGUAGE sql AS $f$ SELECT true $f$;
CREATE OR REPLACE FUNCTION public.compte_en_pause_antirobot(u uuid) RETURNS boolean LANGUAGE sql AS $f$ SELECT false $f$;
CREATE OR REPLACE FUNCTION public.republish_planifiee_reglage(u uuid, p text) RETURNS jsonb LANGUAGE sql AS $f$ SELECT NULL::jsonb $f$;
CREATE OR REPLACE FUNCTION public.republish_minuit_local(f text) RETURNS timestamptz LANGUAGE sql AS $f$
  SELECT (date_trunc('day', now() AT TIME ZONE f) AT TIME ZONE f) $f$;
CREATE OR REPLACE FUNCTION public.republish_planifiee_plateformes() RETURNS text[] LANGUAGE sql AS $f$
  SELECT ARRAY['vinted', 'leboncoin', 'beebs', 'depop'] $f$;
CREATE OR REPLACE FUNCTION public.republish_planifiee_annonces_en_ligne(u uuid, p text) RETURNS integer LANGUAGE sql AS $f$ SELECT 0 $f$;
CREATE OR REPLACE FUNCTION public.republish_boutique_connectee(u uuid) RETURNS jsonb LANGUAGE sql AS $f$ SELECT NULL::jsonb $f$;
CREATE OR REPLACE FUNCTION public.republish_boutiques(u uuid) RETURNS jsonb LANGUAGE sql AS $f$ SELECT '[]'::jsonb $f$;

INSERT INTO public.coin_config (key, value) VALUES
  ('monthly_grant_free', 50), ('monthly_grant_premium', 400), ('monthly_grant_pro', 1200), ('monthly_grant_business', 3000),
  ('quota_annonces_free', 5), ('quota_annonces_premium', 40), ('quota_annonces_pro', 120), ('quota_annonces_business', 300),
  ('quota_republication_free', 50), ('quota_republication_premium', 1500), ('quota_republication_pro', 5000),
  ('quota_republication_business', 0), ('quota_retouche_free', 0), ('quota_retouche_premium', 5),
  ('quota_retouche_pro', 20), ('quota_retouche_business', 50), ('quota_scan_free', 0), ('quota_scan_premium', 0),
  ('quota_scan_pro', 0), ('quota_scan_business', 0), ('quotas_annonces_depuis', 0), ('quotas_retouche_depuis', 0),
  ('quotas_republication_free_depuis', 0), ('price_republish', 0);
`;

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let echecs = 0, n = 0;
const ok = (c, m, d = '') => { n++; console.log(`  ${c ? '✓' : '✗'} ${m}${c || !d ? '' : `   ← ${d}`}`); if (!c) echecs++; };

const client = new pg.Client({ connectionString: PG_URL });
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;
const un = async (sql, params = []) => (await q(sql, params))[0];
const comme = (sub) => client.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify(sub ? { sub, role: 'authenticated' } : {})]);
const jours = (j) => `now() + interval '${j} days'`;

// Un compte payant : palier, canal, dernier grant (il y a `grantIlYa` jours), échéance interne (dans `echeance` jours).
async function compte(id, { palier = 'premium', grantIlYa = 10, echeance = 20, canal = 'stripe', comped = false, kind = 'grant_monthly' } = {}) {
  await q(`INSERT INTO public.profiles (id, is_premium, is_pro, is_business, is_comped, stripe_customer_id, google_purchase_token)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, palier !== 'free', palier === 'pro' || palier === 'business', palier === 'business', comped,
     canal === 'stripe' ? 'cus_' + id.slice(-4) : null, canal === 'google' ? 'gtok' : null]);
  await q(`INSERT INTO public.coin_wallets (user_id, included_balance, next_grant_at, grant_anchor_day) VALUES ($1, 400, ${jours(echeance)}, 20)`, [id]);
  if (grantIlYa != null) {
    await q(`INSERT INTO public.coin_ledger (user_id, delta, included_after, purchased_after, kind, ref, metadata, created_at)
             VALUES ($1::uuid, 400, 400, 0, $2, 'g0:' || $1::text, jsonb_build_object('tier', $3::text, 'source', 'payment'), ${jours(-grantIlYa)})`,
      [id, kind, palier]);
  }
}
const cycle = async (id) => (await un(`SELECT public.debut_cycle_quotas($1) AS c, (SELECT next_grant_at FROM public.coin_wallets WHERE user_id = $1) AS e,
  (SELECT count(*)::int FROM public.coin_ledger WHERE user_id = $1) AS l, (SELECT included_balance FROM public.coin_wallets WHERE user_id = $1) AS inc`, [id]));
const recent = (t, s = 120) => Math.abs(Date.now() - new Date(t).getTime()) < s * 1000;
const proche = (t, j) => Math.abs(new Date(t).getTime() - (Date.now() + j * 86400000)) < 120 * 1000;
const payer = (id, palier, finDans, source = 'payment') =>
  un(`SELECT public.upgrade_monthly_grant($1, $2, ${finDans == null ? 'NULL' : jours(finDans)}, $3) AS r`, [id, palier, source]).then((x) => x.r);

// Remontées d'un compte, dans son cycle (grant il y a 10 jours) : 3 faites, 2 faites puis remplacées (cancelled +
// published_at), 4 annulées jamais publiées, 1 échouée, 2 en cours, 1 hors quota, 1 née avant le cycle (publiée dedans),
// 1 synchro. Ancien compte (créées dans le cycle hors hors_quota) : 13. Nouveau : 3 + 2 + 2 = 7.
async function remontees(id) {
  const lignes = [
    ...Array(3).fill(`('published', ${jours(-5)}, ${jours(-5)}, '{}', NULL)`),
    ...Array(2).fill(`('cancelled', ${jours(-4)}, ${jours(-4)}, '{}', NULL)`),
    ...Array(4).fill(`('cancelled', ${jours(-3)}, NULL, '{}', NULL)`),
    `('failed', ${jours(-2)}, NULL, '{}', NULL)`,
    ...Array(2).fill(`('pending', ${jours(-1)}, NULL, '{}', NULL)`),
    `('published', ${jours(-2)}, ${jours(-2)}, '{"hors_quota": true}', NULL)`,
    `('published', ${jours(-12)}, ${jours(-9)}, '{}', NULL)`,
    `('published', ${jours(-2)}, ${jours(-2)}, '{}', 'sync-dressing 0.6.169')`,
  ];
  await q(`INSERT INTO public.cross_post_jobs (user_id, platform, action, status, created_at, published_at, platform_fields, handler_build)
           SELECT $1, 'vinted', 'republish', s, c, p, f::jsonb, h FROM (VALUES ${lignes.join(', ')}) AS v(s, c, p, f, h)`, [id]);
}
const etat = async (id) => { await comme(id); const r = await un(`SELECT public.quotas_etat() AS e`); await comme(null); return r.e; };
const planif = async (id) => { await comme(id); const r = await un(`SELECT public.republish_planifiee_etat('vinted') AS e`); await comme(null); return r.e; };
const republier = async (id, item) => {
  await comme(id);
  const r = await un(`SELECT public.spend_coins_and_republish($1::bigint, $2, 'manuel', NULL, 'vinted') AS r`, [Number(item), item]);
  await comme(null);
  return r.r;
};

try {
  await q('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await q(DECOR);
  await q(lire('./fixtures/prod-0311-cycle-remontees.sql'));

  // ── AVANT : les définitions de PROD reproduisent le défaut ───────────────
  console.log('A. AVANT (définitions de prod) : le défaut se reproduit');
  await compte(U(1), { grantIlYa: 17, echeance: 4 });
  let r = await payer(U(1), 'premium', 31);
  let c = await cycle(U(1));
  ok(r.granted === false && r.reason === 'no_upgrade_needed', 'paiement du même palier 4 jours avant l’échéance : rien de crédité', JSON.stringify(r));
  ok(proche(c.e, 31) && !recent(c.c) && c.l === 1, '… échéance reportée à la fin de période, cycle NON remis à zéro (le cas nadegemarcelin78)');
  await compte(U(30), { grantIlYa: 10 }); await remontees(U(30));
  const avant30 = await etat(U(30));
  ok(avant30.republication.faites === 13, 'Premium : 13 remontées comptées (annulées jamais publiées, échouée, synchro comprises)', JSON.stringify(avant30.republication));
  ok((await planif(U(30))).faits_mois === 14, 'republication planifiée : 14 (elle ne retirait même pas hors_quota)');
  await q(`UPDATE public.coin_config SET value = 10 WHERE key = 'quota_republication_premium'`);
  ok((await un(`SELECT public.remise_en_vente_place($1) AS p`, [U(30)])).p.place === false, 'plafond Premium mis à 10 pour l’essai : la remise en vente est refusée (13 ≥ 10)');
  await q(`INSERT INTO public.inventaire (id, user_id, photos, titre, statut) VALUES (1001, $1, '["https://x/1.jpg"]', 'Robe test', 'en_vente')`, [U(30)]);
  r = await republier(U(30), '1001');
  ok(r.allowed === false && r.reason === 'plafond_republication_mensuel' && r.faites === 13, '… et la remontée aussi (plafond_republication_mensuel, 13)', JSON.stringify(r));
  await compte(U(40), { palier: 'free', grantIlYa: 10, echeance: 20 }); await remontees(U(40));
  const freeAvant = await etat(U(40));

  // Le parc à recalculer, posé AVANT la migration.
  await compte(U(51), { grantIlYa: 35, echeance: 13 });                               // nadegemarcelin78 : cycle de 48 j
  await compte(U(52), { grantIlYa: 8, echeance: 26, kind: 'grant_upgrade', canal: 'google' }); // boncoin59300 : 26/10 → 29/10
  await compte(U(53), { grantIlYa: 10, echeance: 20 });                               // ordinaire : période = grant
  await compte(U(54), { grantIlYa: 35, echeance: 13, comped: true });                 // offert : pas de « vrai paiement »
  await compte(U(55), { palier: 'free', grantIlYa: 35, echeance: 13 });              // Free : hors règle
  await compte(U(56), { grantIlYa: 20, echeance: 11 });                               // balayage (ancrage) : période ≤ grant
  await compte(U(57), { grantIlYa: 35, echeance: 13, canal: 'aucun' });               // sans canal de paiement
  const parcAvant = Object.fromEntries(await Promise.all([51, 52, 53, 54, 55, 56, 57].map(async (k) => [k, await cycle(U(k))])));

  // ── MIGRATION 1 ──────────────────────────────────────────────────────────
  console.log('B. Migration 1 (paiement du même palier = cycle neuf ; recalcul) appliquée sur la prod recopiée');
  const m1 = lire('../../supabase/migrations/20261103233000_paiement_meme_palier_cycle_neuf.sql');
  await q(m1);
  const ap = async (k) => cycle(U(k));
  let x = await ap(51);
  ok(x.l === parcAvant[51].l + 1, 'nadegemarcelin78 : une ligne grant_monthly datée du paiement');
  const paye51 = await un(`SELECT (next_grant_at - interval '1 month') AS p FROM public.coin_wallets WHERE user_id = $1`, [U(51)]);
  ok(new Date(x.c).getTime() === new Date(paye51.p).getTime(), '… son cycle repart de la date du paiement (échéance − 1 mois)', `${x.c} ≠ ${paye51.p}`);
  ok(x.inc === parcAvant[51].inc && new Date(x.e).getTime() === new Date(parcAvant[51].e).getTime(), '… solde et échéance intacts (delta 0)');
  x = await ap(52);
  ok(x.l === parcAvant[52].l + 1, 'boncoin59300 (cycle ouvert par un paiement Google remboursé, vrai paiement 3 jours après) : recalculé');
  for (const [k, m] of [[53, 'compte ordinaire'], [54, 'compte offert'], [55, 'Free'], [56, 'balayage par ancrage'], [57, 'sans canal de paiement']]) {
    x = await ap(k);
    ok(x.l === parcAvant[k].l && new Date(x.c).getTime() === new Date(parcAvant[k].c).getTime(), `${m} : intact`);
  }
  const lignesAvantRejeu = (await un(`SELECT count(*)::int AS n FROM public.coin_ledger`)).n;
  await q(m1);
  ok((await un(`SELECT count(*)::int AS n FROM public.coin_ledger`)).n === lignesAvantRejeu, 'rejouée : rien de plus (idempotente)');

  console.log('C. La règle, cas par cas (Nico : à l’heure, anticipé, proration, changement de palier)');
  await compte(U(10), { grantIlYa: 30, echeance: 1 });
  r = await payer(U(10), 'premium', 31); c = await cycle(U(10));
  ok(r.granted === true && !r.cycle_neuf && recent(c.c) && proche(c.e, 31), 'à l’heure (échéance dans 1 jour) : grant comme avant, cycle neuf, échéance = fin de période');
  await compte(U(11), { grantIlYa: 17, echeance: 4 });
  r = await payer(U(11), 'premium', 31); c = await cycle(U(11));
  ok(r.granted === true && r.cycle_neuf === true && recent(c.c) && proche(c.e, 31) && c.l === 2, 'anticipé (4 jours avant) : cycle neuf à la date du paiement, compteurs à zéro', JSON.stringify(r));
  ok(c.inc === 400, '… grant plein du palier (remplacement)');
  r = await payer(U(11), 'premium', 31); c = await cycle(U(11));
  ok(r.granted === false && c.l === 2, '… rejouée (même facture, même période) : rien de plus — pas de double crédit', JSON.stringify(r));
  await compte(U(12), { grantIlYa: 10, echeance: 20 });
  const av12 = await cycle(U(12));
  r = await payer(U(12), 'premium', 20); c = await cycle(U(12));
  ok(r.granted === false && c.l === av12.l && new Date(c.c).getTime() === new Date(av12.c).getTime(), 'proration (fin de période = échéance) : rien crédité, cycle intact');
  r = await payer(U(12), 'premium', 21.5); c = await cycle(U(12));
  ok(r.granted === false && c.l === av12.l, 'proration qui ne prolonge que de 1,5 jour : rien crédité');
  await compte(U(13), { grantIlYa: 10, echeance: 20 });
  r = await payer(U(13), 'pro', 31); c = await cycle(U(13));
  ok(r.granted === true && r.topup === true && recent(c.c) && proche(c.e, 31), 'changement de palier (Premium → Pro) : montée comme avant (grant_upgrade), cycle neuf');
  r = await payer(U(13), 'pro', 31); c = await cycle(U(13));
  ok(r.granted === false && c.l === 2, '… la facture du même passage, reçue ensuite : rien de plus');
  await compte(U(14), { grantIlYa: 35, echeance: -5 });
  r = await payer(U(14), 'premium', 26); c = await cycle(U(14));
  ok(r.granted === true && recent(c.c), 'paiement en retard (échéance passée de 5 jours) : grant comme avant');
  await compte(U(15), { grantIlYa: 10, echeance: 20 });
  r = await payer(U(15), 'premium', 20); c = await cycle(U(15));
  ok(r.granted === false && c.l === 1, 'RESTARTED Apple sans paiement (même expiration) : rien');
  await compte(U(16), { grantIlYa: 10, echeance: 20 });
  r = await payer(U(16), 'premium', null, 'lazy'); c = await cycle(U(16));
  ok(r.granted === false && c.l === 1 && proche(c.e, 20), 'appel « lazy » des dépenses (sans période) : inchangé');
  await compte(U(17), { grantIlYa: 10, echeance: 20 });
  await q(`INSERT INTO public.coin_ledger (user_id, delta, included_after, purchased_after, kind, ref, metadata)
           VALUES ($1::uuid, 0, 400, 0, 'grant_monthly', 'grant_monthly:' || $1::text || ':' || to_char(now(), 'YYYY-MM-DD'), '{"tier":"premium"}')`, [U(17)]);
  r = await payer(U(17), 'premium', 31); c = await cycle(U(17));
  ok(r.granted === false && r.cycle_neuf === false && proche(c.e, 31), 'grant déjà posé aujourd’hui : rien de plus, l’échéance comme avant le correctif');

  // ── MIGRATION 2 ──────────────────────────────────────────────────────────
  console.log('D. Migration 2 (remontées Premium / Pro = faites ou en cours) appliquée');
  await q(lire('../../supabase/migrations/20261103234000_remontees_faites_ou_en_cours.sql'));
  const apres30 = await etat(U(30));
  ok(apres30.republication.faites === 7, 'Premium : 7 (3 faites + 2 faites puis remplacées + 2 en cours)', JSON.stringify(apres30.republication));
  ok(apres30.republication.restantes === 3, '… restantes = 10 − 7');
  ok((await planif(U(30))).faits_mois === 7, 'republication planifiée : le même 7');
  ok((await un(`SELECT public.remise_en_vente_place($1) AS p`, [U(30)])).p.place === true, 'remise en vente : la place est rendue (7 < 10)');
  r = await republier(U(30), '1001');
  ok(r.allowed === true && r.job_id, 'la remontée part (spend_coins_and_republish, définition de prod + une ligne)', JSON.stringify(r));
  ok((await etat(U(30))).republication.faites === 8, '… et compte aussitôt (en cours) : 8');
  await q(`INSERT INTO public.cross_post_jobs (user_id, platform, action, status, created_at, published_at)
           SELECT $1, 'vinted', 'republish', 'published', now(), now() FROM generate_series(1, 2)`, [U(30)]);
  await q(`INSERT INTO public.inventaire (id, user_id, photos, titre, statut) VALUES (1002, $1, '["https://x/2.jpg"]', 'Pull test', 'en_vente')`, [U(30)]);
  r = await republier(U(30), '1002');
  ok(r.allowed === false && r.reason === 'plafond_republication_mensuel' && r.faites === 10, 'à 10 faites : refusée, comme avant', JSON.stringify(r));
  ok(JSON.stringify((await etat(U(40))).republication) === JSON.stringify(freeAvant.republication), 'Free : compteur identique (sa fonction n’a pas bougé)');
  const prive = await un(`SELECT has_function_privilege('authenticated', 'public.remontees_du_cycle(uuid, timestamptz)', 'EXECUTE') AS a,
                                 has_function_privilege('anon', 'public.remontees_du_cycle(uuid, timestamptz)', 'EXECUTE') AS b`);
  ok(prive.a === false && prive.b === false, 'remontees_du_cycle : fermée aux clients');
  await q(`UPDATE public.coin_config SET value = 1500 WHERE key = 'quota_republication_premium'`);

  console.log('E. Personne ne perd : le nouveau compte ne dépasse jamais l’ancien');
  const comptes = await q(`SELECT DISTINCT user_id FROM public.cross_post_jobs`);
  let monte = 0;
  for (const { user_id } of comptes) {
    const v = await un(`SELECT public.remontees_du_cycle($1, public.debut_cycle_quotas($1)) AS nouveau,
      (SELECT count(*)::int FROM public.cross_post_jobs WHERE user_id = $1 AND action = 'republish' AND created_at >= public.debut_cycle_quotas($1)
        AND NOT (COALESCE(platform_fields, '{}'::jsonb) ?| ARRAY['opla_sortie', 'hors_quota'])) AS ancien`, [user_id]);
    if (v.nouveau > v.ancien) monte++;
  }
  ok(monte === 0, `aucun compte ne monte (${comptes.length} comptes)`);
} catch (e) {
  echecs++;
  console.error('ERREUR :', e.message);
} finally {
  await client.end();
  if (embarque) { await embarque.pg.stop(); try { embarque.rmSync(embarque.dossier, { recursive: true, force: true }); } catch {} }
}
console.log(`\n${echecs === 0 ? '✓' : '✗'} preuve cycle + remontées : ${n - (echecs && n ? echecs : 0)}/${n} contrôles verts${echecs ? `, ${echecs} rouge(s)` : ''}`);
process.exit(echecs === 0 ? 0 : 1);
