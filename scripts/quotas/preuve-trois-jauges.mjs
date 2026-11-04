// PREUVE, SUR UN POSTGRES JETABLE, de la migration 20261104000000_trois_jauges_interrupteur (décisions de Nico du
// 03/11/2026 : 3 jauges, garde-fous par jour, Lens du Business, derrière coin_config.grille_trois_jauges).
//
//   PREUVE_PG=embarque node scripts/quotas/preuve-trois-jauges.mjs   (Postgres 17 jetable sur le PC)
//
// Jamais la prod (refus si l'URL est celle de Supabase). Les fonctions sont celles de la PROD
// (scripts/quotas/fixtures/prod-0311-trois-jauges.sql, lue le 03/11 ; upgrade_monthly_grant & co viennent de la
// fixture du 03/11 soir) ; le décor est celui de preuve-cycle-remontees.mjs, plus ce que la publication demande.
//   A. Interrupteur à 0 : chaque fonction rend EXACTEMENT ce qu'elle rendait (même transaction, même now()).
//   B. Interrupteur à 1 : la grille, les compteurs, les garde-fous, le Lens du Business, la compatibilité.
//   C. L'inverse rend les définitions de prod, à l'empreinte près.
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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-jauges-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55439, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55439/postgres';
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Le décor de la preuve du 03/11 (mêmes tables réduites, mêmes bouchons), repris tel quel.
const ancien = lire('./preuve-cycle-remontees.mjs');
const DECOR_ANCIEN = ancien.slice(ancien.indexOf('const DECOR = String.raw`') + 'const DECOR = String.raw`'.length, ancien.indexOf('`;\n\nconst U = '));
const DECOR_PLUS = String.raw`
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ebay_voie_api boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS beta_flags jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.cross_post_jobs ADD COLUMN IF NOT EXISTS reservation_id uuid;
-- Comme en prod (lu le 03/11) : une tâche sans action est une publication, sans statut est en attente.
ALTER TABLE public.cross_post_jobs ALTER COLUMN action SET DEFAULT 'publish', ALTER COLUMN status SET DEFAULT 'pending';
CREATE TABLE public.platform_health (platform text PRIMARY KEY, paused boolean, message_fr text, message_en text);
CREATE TABLE public.ebay_accounts (user_id uuid PRIMARY KEY, revoked_at timestamptz, fulfillment_policy_id text,
  payment_policy_id text, return_policy_id text, seller_state jsonb);
CREATE TABLE public.coin_reservations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, amount integer,
  unit_price integer, from_included integer, from_purchased integer, job_count integer, photo_option text);
CREATE TABLE public.fiches_liees_comptes (fiche_a bigint, fiche_b bigint);
CREATE OR REPLACE FUNCTION public.lbc_adresse_hors_france(u uuid) RETURNS boolean LANGUAGE sql AS $f$ SELECT false $f$;
CREATE OR REPLACE FUNCTION public.jumelle_occupe_plateformes(u uuid, f bigint) RETURNS TABLE(platform text)
  LANGUAGE sql AS $f$ SELECT NULL::text WHERE false $f$;
CREATE OR REPLACE FUNCTION public.annonce_id_de_job(a text, b text) RETURNS text LANGUAGE sql AS $f$ SELECT COALESCE(a, b) $f$;
CREATE OR REPLACE FUNCTION public.messagerie_beta(u uuid) RETURNS boolean LANGUAGE sql AS $f$ SELECT false $f$;
INSERT INTO public.coin_config (key, value) VALUES
  ('price_generate', 0), ('price_ia_light', 0), ('price_ia_advanced', 0), ('price_lens_overflow', 0),
  ('price_original', 0), ('price_per_platform', 0), ('bordereaux_vinted_tous', 1)
ON CONFLICT (key) DO NOTHING;
`;

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let echecs = 0, n = 0;
const ok = (c, m, d = '') => { n++; console.log(`  ${c ? '✓' : '✗'} ${m}${c || !d ? '' : `   ← ${d}`}`); if (!c) echecs++; };

const client = new pg.Client({ connectionString: PG_URL });
await client.connect();
const q = async (sql, params = []) => {
  try { return (await client.query(sql, params)).rows; } catch (e) { e.message += ` — dans : ${sql.trim().slice(0, 140).replace(/\s+/g, ' ')}`; throw e; }
};
const un = async (sql, params = []) => (await q(sql, params))[0];
const comme = (sub, role = 'authenticated') => client.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify(sub ? { sub, role } : {})]);
const jours = (j) => `now() + interval '${j} days'`;
const interrupteur = (v) => q(`UPDATE public.coin_config SET value = $1 WHERE key = 'grille_trois_jauges'`, [v]);
const json = (o) => JSON.stringify(o);

// Les comptes témoins : palier, grant il y a 10 jours, échéance dans 20.
async function compte(id, palier, { override = null } = {}) {
  await q(`INSERT INTO public.profiles (id, is_premium, is_pro, is_business, is_comped) VALUES ($1, $2, $3, $4, false)`,
    [id, palier !== 'free', palier === 'pro' || palier === 'business', palier === 'business']);
  await q(`INSERT INTO public.coin_wallets (user_id, included_balance, next_grant_at, grant_anchor_day) VALUES ($1, 0, ${jours(20)}, 20)`, [id]);
  await q(`INSERT INTO public.coin_ledger (user_id, delta, included_after, purchased_after, kind, ref, metadata, created_at)
           VALUES ($1::uuid, 0, 0, 0, 'grant_monthly', 'g0:' || $1::uuid::text, jsonb_build_object('tier', $2::text), ${jours(-10)})`, [id, palier]);
  if (override != null) await q(`INSERT INTO public.quotas_par_compte (user_id, quota_annonces) VALUES ($1, $2)`, [id, override]);
}
// Des tâches : n lignes d'une action, d'un statut, créées il y a `ilYa` jours.
async function taches(id, action, nb, { statut = 'published', publiee = true, ilYa = 2, champs = '{}', build = null, pf = 'vinted', inv = null } = {}) {
  if (!nb) return;
  await q(`INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, created_at, published_at, platform_fields, handler_build)
           SELECT $1, $8, $7, $2, $3, now() - ($4::text || ' days')::interval,
                  CASE WHEN $5 THEN now() - ($4::text || ' days')::interval END, $6::jsonb, $9
             FROM generate_series(1, $10)`, [id, action, statut, String(ilYa), publiee, champs, pf, inv, build, nb]);
}
// Chaque rédaction porte une fiche à elle (sinon la règle « même fiche sous 24 h » la dédoublonnerait).
let fiche = 900000;
async function annonces(id, nb, { lens = 0, ilYa = 2 } = {}) {
  if (nb) await q(`INSERT INTO public.usage_logs (user_id, feature, metadata, created_at)
           SELECT $1, 'generate_listing', jsonb_build_object('inventaire_id', ($4::integer + g)::text), now() - ($2::text || ' days')::interval FROM generate_series(1, $3) g`,
    [id, String(ilYa), nb, fiche]);
  fiche += nb;
  if (lens) await q(`INSERT INTO public.usage_logs (user_id, feature, metadata, created_at)
           SELECT $1, 'lens', '{}'::jsonb, now() - ($2::text || ' days')::interval FROM generate_series(1, $3)`, [id, String(ilYa), lens]);
}
const article = (id, inv) => q(`INSERT INTO public.inventaire (id, user_id, photos, titre, statut) VALUES ($1::bigint, $2, '["https://x/1.jpg"]', 'Article ' || $1::bigint::text, 'en_vente')`, [inv, id]);
const job = (inv, pf, champs = {}) => ({ inventaire_id: String(inv), platform: pf, title: 'Titre', description: 'Desc', price: '35', photos: ['https://x/1.jpg'], platform_fields: champs });

// Les appels, chacun sous l'identité du compte ; une écriture se défait (SAVEPOINT) sauf demande contraire.
let dansTx = false;
async function appel(id, sql, params = [], { garder = false } = {}) {
  await comme(id);
  if (!garder) await q(dansTx ? 'SAVEPOINT s' : 'BEGIN');
  try {
    const r = await un(sql, params);
    return r.r;
  } finally {
    if (!garder) await q(dansTx ? 'ROLLBACK TO SAVEPOINT s' : 'ROLLBACK');
    await comme(null);
  }
}
// Pour comparer avant / après : les identifiants tirés au hasard (tâche créée) ne disent rien de la règle.
const sansIds = (o) => JSON.stringify(o, (k, v) => (k === 'job_id' || k === 'reservation_id' ? '<id>' : v));
const etat = (id) => appel(id, `SELECT public.quotas_etat() AS r`);
const publier = (id, jobs, o) => appel(id, `SELECT public.spend_coins_and_publish('original', $1::jsonb) AS r`, [json(jobs)], o);
const republier = (id, inv, source = 'manuel') => appel(id, `SELECT public.spend_coins_and_republish($1::bigint, $2, $3, NULL, 'vinted') AS r`, [inv, String(inv), source]);
const rediger = (id, inv = null) => appel(id, `SELECT public.spend_coins_for_generate($1, $2::bigint) AS r`, [id, inv]);
const scanner = (id, unifie = false) => appel(id, `SELECT public.spend_coins_for_lens($1, $2) AS r`, [id, unifie]);
const planif = (id) => appel(id, `SELECT public.republish_planifiee_etat('vinted') AS r`);
const place = async (id) => (await un(`SELECT public.remise_en_vente_place($1) AS r`, [id])).r;
const freeEtat = async (id) => (await un(`SELECT public.quota_republication_free_etat($1) AS r`, [id])).r;
const bord = async (id) => (await un(`SELECT public.bordereaux_ouverts_pour($1, 'vinted') AS r`, [id])).r;

const F = U(1), P = U(2), R = U(3), B = U(4), BO = U(5), F2 = U(6);
// Tout ce que l'app et l'extension lisent ou appellent, pour un compte : la « photo » comparée avant / après.
async function photo(id, inv) {
  return {
    etat: await etat(id), free: await freeEtat(id), place: await place(id), planif: await planif(id), bord: await bord(id),
    rediger: await rediger(id), regen: await rediger(id, inv), scan: await scanner(id), scanUnifie: await scanner(id, true),
    publier: await publier(id, [job(inv, 'leboncoin'), job(inv, 'beebs')]), republier: await republier(id, inv),
  };
}

try {
  await q('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await q(DECOR_ANCIEN);
  await q(DECOR_PLUS);
  await q(lire('./fixtures/prod-0311-cycle-remontees.sql'));
  await q(lire('./fixtures/prod-0311-trois-jauges.sql'));
  const NOMS = ['quotas_etat', 'quota_republication_free_etat', 'spend_coins_for_generate', 'spend_coins_for_lens',
    'spend_coins_and_publish', 'spend_coins_and_republish', 'republish_planifiee_etat', 'remise_en_vente_place'];
  const empreintes = async () => Object.fromEntries((await q(`SELECT p.proname AS n, md5(pg_get_functiondef(p.oid)) AS m FROM pg_proc p
    JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = ANY($1)`, [NOMS])).map((r) => [r.n, r.m]));
  const empreintesProd = await empreintes();

  // Les comptes : un Free, un Premium, un Pro, deux Business (dont un avec le réglage de 1 000 annonces), un Free neuf.
  await compte(F, 'free'); await compte(P, 'premium'); await compte(R, 'pro'); await compte(B, 'business');
  await compte(BO, 'business', { override: 1000 }); await compte(F2, 'free');
  for (const [id, inv] of [[F, 11], [P, 12], [R, 13], [B, 14], [BO, 15], [F2, 16]]) await article(id, inv);
  // Free : 3 annonces, 1 Lens, 20 publications (+ celles qui ne comptent jamais), 12 remontées.
  await annonces(F, 3, { lens: 1 });
  await taches(F, 'publish', 20);
  await taches(F, 'publish', 4, { statut: 'cancelled', publiee: false });            // annulées jamais publiées
  await taches(F, 'publish', 2, { statut: 'failed', publiee: false });               // échouées
  await taches(F, 'publish', 3, { build: 'sync-dressing 0.6.169' });                  // synchro / import
  await taches(F, 'publish', 2, { champs: '{"hors_quota": true}' });                  // hors quota
  await taches(F, 'delete', 5);                                                        // retraits
  await taches(F, 'publish', 6, { ilYa: 15 });                                         // avant le cycle
  await taches(F, 'republish', 12);
  await annonces(P, 22, { lens: 4 }); await taches(P, 'publish', 187); await taches(P, 'republish', 1412);
  await annonces(R, 64); await taches(R, 'publish', 380); await taches(R, 'republish', 6000);
  await annonces(B, 250, { lens: 12 }); await taches(B, 'publish', 900); await taches(B, 'republish', 700);
  await annonces(BO, 350); await taches(BO, 'publish', 40);

  // ── A. INTERRUPTEUR À 0 : RIEN NE CHANGE ─────────────────────────────────
  console.log('A. Interrupteur à 0 : chaque fonction rend exactement ce qu’elle rendait');
  await q('BEGIN'); dansTx = true;
  const avant = {};
  for (const [id, inv] of [[F, 11], [P, 12], [R, 13], [B, 14], [BO, 15], [F2, 16]]) avant[id] = await photo(id, inv);
  await q(lire('../../supabase/migrations/20261104000000_trois_jauges_interrupteur.sql'));
  ok((await un(`SELECT value FROM public.coin_config WHERE key = 'grille_trois_jauges'`)).value === 0, 'la migration pose l’interrupteur à 0');
  const apres = {};
  for (const [id, inv] of [[F, 11], [P, 12], [R, 13], [B, 14], [BO, 15], [F2, 16]]) apres[id] = await photo(id, inv);
  for (const [nom, id] of [['Free', F], ['Premium', P], ['Pro', R], ['Business', B], ['Business réglé à 1 000', BO], ['Free neuf', F2]]) {
    for (const k of Object.keys(avant[id])) {
      ok(sansIds(avant[id][k]) === sansIds(apres[id][k]), `${nom} · ${k} : identique`, `${json(avant[id][k]).slice(0, 160)} ≠ ${json(apres[id][k]).slice(0, 160)}`);
    }
  }
  await q('COMMIT'); dansTx = false;
  ok((await un(`SELECT public.garde_fou_jour($1, 'publications', 5000) AS r`, [B])).r === null, 'garde-fou à 0 : jamais rien, même à 5 000 publications');
  ok(avant[B].etat.annonces.plafond === 300 && avant[BO].etat.annonces.plafond === 1000, 'rappel : aujourd’hui, Business 300 et le réglage du compte (1 000) comptent');

  // ── B. INTERRUPTEUR À 1 : LA GRILLE ─────────────────────────────────────
  console.log('B. Interrupteur à 1 : la grille à 3 jauges');
  await interrupteur(1);
  let e = await etat(F);
  ok(e.grille === 'trois_jauges' && e.annonces.plafond === 5 && e.annonces_mode === 'mensuel', 'Free : 5 annonces', json(e.annonces));
  ok(e.publications.plafond === 50 && e.publications.consommes === 20 && e.publications.restantes === 30,
    'Free : publications 20 / 50 (annulées, échouées, synchro, hors quota, retraits, avant le cycle : jamais comptés)', json(e.publications));
  ok(e.republication.plafond === 30 && e.republication.faites === 12 && e.republication.restantes === 18, 'Free : remontées 12 / 30', json(e.republication));
  ok(e.lens === null, 'Free : pas de compteur Lens à part (Lens compte dans les annonces)');
  e = await etat(P);
  ok(e.annonces.plafond === 40 && e.publications.plafond === 400 && e.publications.consommes === 187 && e.republication.plafond === 1500 && e.republication.faites === 1412,
    'Premium : 40 annonces, 187 / 400 publications, 1 412 / 1 500 remontées', json(e));
  e = await etat(R);
  ok(e.annonces.plafond === 120 && e.publications.plafond === 1200 && e.republication.mode === 'illimite', 'Pro : 120 annonces, 1 200 publications, remontées illimitées', json(e.republication));
  e = await etat(B);
  ok(e.annonces.plafond === null && e.annonces_mode === 'illimite' && e.publications.mode === 'illimite' && e.publications.plafond === null && e.republication.mode === 'illimite',
    'Business : annonces, publications et remontées illimitées', json(e));
  ok(e.lens && e.lens.plafond === 600 && e.lens.consommes === 12 && e.lens.restantes === 588, 'Business : Lens 12 / 600', json(e.lens));
  e = await etat(BO);
  ok(e.annonces.plafond === null, 'Business réglé à 1 000 : illimité, le réglage du compte ne le bride plus', json(e.annonces));
  ok(e.retouches && avant[B].etat.retouches.plafond === (await etat(B)).retouches.plafond, 'retouches IA : inchangées (compteur à part)');

  // Publications : le refus, avant tout débit, avec un message que l'app actuelle affiche déjà.
  await taches(F2, 'publish', 49);
  let r = await publier(F2, [job(16, 'vinted'), job(16, 'leboncoin')]);
  ok(r.allowed === false && r.reason === 'quota_publications_atteint' && r.restantes === 1 && r.demandees === 2 && /Il te reste 1 publication ce mois-ci/.test(r.message),
    'Free à 49 / 50, 2 plateformes : refus, « il te reste 1 publication »', json(r));
  r = await publier(F2, [job(16, 'vinted')]);
  ok(r.allowed === true, 'Free à 49 / 50, 1 plateforme : passe', json(r));
  await taches(F2, 'publish', 1);
  r = await publier(F2, [job(16, 'beebs')]);
  ok(r.allowed === false && r.reason === 'quota_publications_atteint' && /Tes 50 publications du mois sont faites : elles reviennent le \d\d\/\d\d\./.test(r.message),
    'Free à 50 / 50 : « Tes 50 publications du mois sont faites : elles reviennent le JJ/MM »', json(r));
  ok((await un(`SELECT count(*)::int AS c FROM public.cross_post_jobs WHERE user_id = $1 AND platform = 'beebs'`, [F2])).c === 0, '… et aucune tâche n’a été créée');
  r = await publier(F, [job(11, 'vinted', { hors_quota: true, lbc: 1 })], { garder: true });
  const pose = await un(`SELECT platform_fields AS f FROM public.cross_post_jobs WHERE user_id = $1 AND inventaire_id = 11 AND platform = 'vinted' AND action = 'publish' ORDER BY created_at DESC LIMIT 1`, [F]);
  ok(r.allowed === true && pose && !('hors_quota' in pose.f) && pose.f.lbc === 1, 'un appel de l’app ne pose jamais lui-même « hors quota » (le reste des champs est gardé)', json({ r, pose }));
  ok((await etat(F)).publications.consommes === 21, '… et cette publication compte (21)');

  // Garde-fou du jour : publications (Business).
  await taches(B, 'publish', 1998, { ilYa: 0 });
  r = await publier(B, [job(14, 'vinted'), job(14, 'leboncoin')]);
  ok(r.allowed === true, 'Business à 1 998 publications aujourd’hui + 2 : passe (2 000)', json(r));
  await taches(B, 'publish', 1, { ilYa: 0 });
  r = await publier(B, [job(14, 'vinted'), job(14, 'leboncoin')]);
  ok(r.allowed === false && r.reason === 'garde_fou_jour' && r.jauge === 'publications' && r.garde === 2000 && /Pause de sécurité jusqu'à minuit : tu as fait 1 999 publications aujourd'hui/.test(r.message),
    'Business à 1 999 + 2 : pause de sécurité, message honnête, aucune offre', json(r));
  ok(r.reprise_le && new Date(r.reprise_le) > new Date(), '… avec l’heure de reprise (minuit, heure de Paris)');

  // Remontées.
  await taches(F2, 'republish', 30);
  r = await republier(F2, 16);
  ok(r.allowed === false && r.reason === 'plafond_republication_free' && r.plafond === 30, 'Free : 30 remontées faites → le mur du Free (plafond 30)', json(r));
  r = await republier(P, 12);
  ok(r.reason !== 'plafond_republication_mensuel', 'Premium à 1 412 / 1 500 : pas de mur', json(r));
  await taches(P, 'republish', 88);
  r = await republier(P, 12);
  ok(r.allowed === false && r.reason === 'plafond_republication_mensuel' && r.plafond === 1500, 'Premium à 1 500 : le mur des remontées (le vrai mur Premium côté app)', json(r));
  r = await republier(R, 13);
  ok(r.reason !== 'plafond_republication_mensuel' && r.reason !== 'garde_fou_jour', 'Pro à 6 000 remontées dans le cycle : illimité, aucun mur', json(r));
  await taches(R, 'republish', 2000, { ilYa: 0 });
  r = await republier(R, 13);
  ok(r.allowed === false && r.reason === 'garde_fou_jour' && r.jauge === 'remontees' && /2 000 remontées aujourd'hui/.test(r.message), 'Pro à 2 000 remontées aujourd’hui : pause de sécurité', json(r));
  ok((await place(R)).place === true && (await place(P)).place === false, 'remise en vente : Pro illimité (place), Premium à 1 500 (pas de place)');
  ok((await planif(R)).quota == null, 'republication planifiée : plus de quota mensuel pour le Pro');

  // Annonces et Lens.
  r = await rediger(F);
  ok(r.allowed === true, 'Free à 3 / 5 annonces : la rédaction passe');
  await annonces(F, 1, { ilYa: 0 });
  r = await rediger(F);
  ok(r.allowed === false && r.reason === 'quota_annonces_atteint' && r.plafond === 5, 'Free à 5 / 5 : quota_annonces_atteint (comme aujourd’hui)', json(r));
  r = await scanner(F);
  ok(r.allowed === false && r.reason === 'quota_annonces_atteint', '… et un scan Lens aussi (il compte dans les annonces)', json(r));
  await annonces(B, 799, { ilYa: 0 });
  r = await rediger(B);
  ok(r.allowed === true, 'Business à 799 annonces aujourd’hui : la rédaction passe');
  await annonces(B, 1, { ilYa: 0 });
  r = await rediger(B);
  ok(r.allowed === false && r.reason === 'pro_daily_cap_reached' && r.garde_fou === true && r.cap === 800 && /Pause de sécurité/.test(r.message),
    'Business à 800 : pause de sécurité, sous le code que generate-listing relaie déjà avec son message', json(r));
  await q(`INSERT INTO public.usage_logs (user_id, feature, metadata, created_at) VALUES ($1, 'generate_listing', '{"inventaire_id": "14"}', now() - interval '2 hours')`, [B]);
  r = await rediger(B, 14);
  ok(r.allowed === true, '… mais la régénération du même article sous 24 h passe, comme toujours', json(r));
  await q(`DELETE FROM public.usage_logs WHERE user_id = $1 AND created_at > now() - interval '1 hour'`, [B]);
  await q(`INSERT INTO public.usage_logs (user_id, feature, metadata) SELECT $1, 'lens', '{"unifie": true}' FROM generate_series(1, 587)`, [B]);
  r = await scanner(B, true);
  ok(r.allowed === true, 'Business à 599 scans Lens : le scan passe');
  await q(`INSERT INTO public.usage_logs (user_id, feature, metadata) VALUES ($1, 'lens', '{"unifie": true}')`, [B]);
  r = await scanner(B, true);
  ok(r.allowed === false && r.reason === 'quota_scan_atteint' && r.jauge === 'lens' && r.plafond === 600 && /Tes 600 scans Lens du mois sont faits : ils reviennent le \d\d\/\d\d\. Tout le reste continue, sans limite\./.test(r.message),
    'Business à 600 : Lens arrêté, sous le code que lens-analysis relaie déjà ; le message dit que le reste continue', json(r));
  r = await rediger(B);
  ok(r.allowed === true, '… et la rédaction IA du Business continue');
  ok((await bord(P)) === false && (await bord(R)) === true && (await bord(B)) === true && (await bord(F)) === false, 'bordereaux : Pro et Business seulement (inchangé depuis le 24/10)');

  // Retour arrière par l'interrupteur.
  await interrupteur(0);
  e = await etat(B);
  ok(e.annonces.plafond === 300 && !('grille' in e) && !('publications' in e), 'interrupteur remis à 0 : Business revient à 300, plus aucune clé neuve dans quotas_etat');
  ok((await publier(F2, [job(16, 'beebs')])).allowed === true, '… et la publication n’est plus comptée');

  // ── D. LA REMISE À ZÉRO, AUSSI POUR LES PAYANTS (20261104140000, demande de Nico du 04/11) ──
  console.log('D. La date de remise à zéro, aussi pour les payants (20261104140000)');
  const avantD = { etat: await etat(P), rep: await republier(P, 12) };
  const empreintesM1 = await empreintes();
  await q(lire('../../supabase/migrations/20261104140000_remise_le_payants.sql'));
  ok(sansIds(await etat(P)) === sansIds(avantD.etat) && sansIds(await republier(P, 12)) === sansIds(avantD.rep),
    'interrupteur à 0 : quotas_etat et le refus du Premium à 1 500, identiques', json(avantD));
  await interrupteur(1);
  for (const [nom, id] of [['Free', F], ['Premium', P], ['Pro', R], ['Business', B]]) {
    const x = await etat(id);
    const w = await un(`SELECT next_grant_at AS n FROM public.coin_wallets WHERE user_id = $1`, [id]);
    ok(x.remise_le != null && new Date(x.remise_le).getTime() === new Date(w.n).getTime(), `${nom} : quotas_etat rend la remise à zéro du cycle (coin_wallets.next_grant_at)`, json(x.remise_le));
  }
  const rp = await republier(P, 12);
  const wp = await un(`SELECT next_grant_at AS n FROM public.coin_wallets WHERE user_id = $1`, [P]);
  ok(rp.reason === 'plafond_republication_mensuel' && rp.remise_le != null && new Date(rp.remise_le).getTime() === new Date(wp.n).getTime(),
    'Premium à 1 500 : le refus porte la date du mur (« Attendre le JJ/MM »)', json(rp));
  await interrupteur(0);
  await q(lire('../../supabase/rollbacks/20261104140000_remise_le_payants_INVERSE.sql'));
  const apresInverseD = await empreintes();
  ok(['quotas_etat', 'spend_coins_and_republish'].every((k) => apresInverseD[k] === empreintesM1[k]),
    'inverse : les 2 fonctions retrouvent leur définition du 04/11, à l’empreinte près', json({ empreintesM1, apresInverseD }));

  // ── C. L'INVERSE ────────────────────────────────────────────────────────
  console.log('C. L’inverse');
  await q(lire('../../supabase/rollbacks/20261104000000_trois_jauges_interrupteur_INVERSE.sql'));
  const apresInverse = await empreintes();
  ok(NOMS.every((k) => apresInverse[k] === empreintesProd[k]), 'les 8 fonctions retrouvent leur définition de prod, à l’empreinte près', json({ empreintesProd, apresInverse }));
  ok((await un(`SELECT count(*)::int AS c FROM pg_proc WHERE proname IN ('jauges_actives', 'garde_fou_jour', 'publications_du_cycle', 'jauge_annonces_plafond')`)).c === 0, 'les fonctions neuves ont disparu');
  ok((await un(`SELECT count(*)::int AS c FROM public.coin_config WHERE key LIKE 'jauge\_%' OR key LIKE 'garde\_jour\_%' OR key = 'grille_trois_jauges'`)).c === 0, 'les clés neuves aussi');
} catch (err) {
  echecs++;
  console.error('ERREUR', err.message);
  try { await q('ROLLBACK'); } catch { /* rien */ }
} finally {
  await client.end();
  if (embarque) { await embarque.pg.stop(); try { embarque.rmSync(embarque.dossier, { recursive: true, force: true }); } catch { /* rien */ } }
}
console.log(`\n${n - echecs}/${n} ${echecs ? `— ${echecs} ÉCHEC(S)` : 'OK'}`);
process.exit(echecs ? 1 : 0);
