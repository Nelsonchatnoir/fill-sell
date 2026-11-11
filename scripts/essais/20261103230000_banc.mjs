// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261103230000_rattachement_jamais_de_retrait (03/11 soir, Nico) —
// jamais la prod (règle du 03/11 : plus aucun « essai à blanc » sur la prod).
//   PREUVE_PG=embarque node scripts/essais/20261103230000_banc.mjs
// Les corps touchés sont ceux de la PROD (fixtures/prod-0311-retrait-rattachement, pg_get_functiondef du 03/11 soir) ;
// le reste est un bouchon qui ne décide de rien. Le banc REJOUE D'ABORD l'incident avec les corps d'avant (le « oui »
// de JEAN-LUC à 16:19 arme le retrait), puis applique la migration, rejoue chaque cas, puis l'inverse.
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = join(ROOT, 'scripts/essais/fixtures/prod-0311-retrait-rattachement');
const lire = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-retrait-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port: 55441, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:banc@127.0.0.1:55441/postgres';
}

const DECOR = String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $f$;
CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer);
INSERT INTO public.coin_config VALUES ('ventes_leboncoin_transaction', 1);
CREATE TABLE public.inventaire (id bigint PRIMARY KEY, user_id uuid, titre text, statut text DEFAULT 'stock', quantite integer DEFAULT 1,
  plateforme text, fusionne_dans bigint, vinted_account_id text, vinted_item_id text, disparu_le timestamptz, a_verifier jsonb);
CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, inventaire_id bigint, platform text,
  status text, action text DEFAULT 'publish', photo_option text, title text, description text, price numeric, photos jsonb,
  listing_url text, platform_listing_id text, platform_fields jsonb DEFAULT '{}'::jsonb, published_at timestamptz,
  created_at timestamptz DEFAULT now(), error text, sold_at timestamptz, last_checked_at timestamptz);
CREATE TABLE public.ventes (id bigserial PRIMARY KEY, user_id uuid, inventaire_id bigint, statut text DEFAULT 'vendu', plateforme text,
  plateforme_code text, vendu_le timestamptz, date date, created_at timestamptz DEFAULT now(), annonce_id text);
CREATE TABLE public.annonces_plateforme (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, listing_id text,
  url text, titre text, prix numeric, statut_plateforme text DEFAULT 'en_ligne', inventaire_id bigint, job_id uuid, disparu_le timestamptz,
  retiree_le timestamptz, ignoree_le timestamptz, publiee_le timestamptz, created_at timestamptz DEFAULT now(), capture jsonb,
  capture_le timestamptz, transaction_plateforme text, transaction_lue_le timestamptz, vu_le timestamptz DEFAULT now(), run_id uuid,
  UNIQUE (user_id, platform, listing_id));
CREATE TABLE public.vinted_listing_snapshots (user_id uuid, vinted_item_id text, captured_at timestamptz, status text);
CREATE TABLE public.usage_logs (id bigserial PRIMARY KEY, user_id uuid, feature text, metadata jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.inventaire_fusions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, garde bigint, absorbe bigint,
  deplacements jsonb, champs_repris jsonb, par text, defait_le timestamptz, created_at timestamptz DEFAULT now());
CREATE TABLE public.inventaire_doublons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, garde bigint, absorbe bigint,
  niveau text, statut text DEFAULT 'proposee', motif text, preuves jsonb, source text, fusion_id uuid, decide_le timestamptz,
  decide_par text, created_at timestamptz DEFAULT now());
CREATE TABLE public.fiches_liees_comptes (fiche_a bigint, fiche_b bigint, user_a uuid, user_b uuid);
CREATE OR REPLACE FUNCTION public.comptes_sont_lies(a uuid, b uuid) RETURNS boolean LANGUAGE sql AS $f$ SELECT false $f$;
CREATE OR REPLACE FUNCTION public.article_vendu(p_inventaire_id bigint) RETURNS boolean LANGUAGE sql STABLE AS $f$
  SELECT EXISTS (SELECT 1 FROM public.inventaire i WHERE i.id = p_inventaire_id AND (i.statut = 'vendu' OR (i.quantite IS NOT NULL AND i.quantite <= 0))) $f$;
CREATE OR REPLACE FUNCTION public.vente_prouvee_fiche_liee(p_fiche bigint, p_platform text) RETURNS boolean LANGUAGE sql AS $f$ SELECT false $f$;
CREATE OR REPLACE FUNCTION public.opla_sortie_passee() RETURNS boolean LANGUAGE sql AS $f$ SELECT true $f$;
CREATE OR REPLACE FUNCTION public.opla_copie_a_retirer_noter(p uuid, c text) RETURNS void LANGUAGE sql AS $f$ SELECT $f$;
CREATE OR REPLACE FUNCTION public.vinted_annonce_vendue(u uuid, i text) RETURNS boolean LANGUAGE sql AS $f$ SELECT false $f$;
CREATE OR REPLACE FUNCTION public.signal_vente_lever(j uuid, m text, d jsonb) RETURNS void LANGUAGE sql AS $f$ SELECT $f$;
CREATE OR REPLACE FUNCTION public.vente_transaction_annulee_leboncoin(v bigint, m text) RETURNS jsonb LANGUAGE sql AS $f$ SELECT '{}'::jsonb $f$;
-- Bouchon de la fusion : déplace les tâches et les annonces de la fiche absorbée sur la gardée (ce que fait la vraie).
CREATE OR REPLACE FUNCTION public.inventaire_fusionner_pour(p_user uuid, p_garde bigint, p_absorbe bigint, p_par text) RETURNS jsonb
LANGUAGE plpgsql AS $f$
DECLARE v_jobs jsonb; v_ann jsonb; v_id uuid;
BEGIN
  SELECT COALESCE(jsonb_agg(id::text), '[]'::jsonb) INTO v_jobs FROM public.cross_post_jobs WHERE inventaire_id = p_absorbe;
  SELECT COALESCE(jsonb_agg(id::text), '[]'::jsonb) INTO v_ann FROM public.annonces_plateforme WHERE inventaire_id = p_absorbe;
  INSERT INTO public.inventaire_fusions (user_id, garde, absorbe, deplacements, par)
  VALUES (p_user, p_garde, p_absorbe, jsonb_build_object('cross_post_jobs', v_jobs, 'annonces_plateforme', v_ann), p_par) RETURNING id INTO v_id;
  UPDATE public.cross_post_jobs SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe;
  UPDATE public.annonces_plateforme SET inventaire_id = p_garde WHERE inventaire_id = p_absorbe;
  UPDATE public.inventaire SET fusionne_dans = p_garde WHERE id = p_absorbe;
  RETURN jsonb_build_object('ok', true, 'fusion_id', v_id, 'deplacements', jsonb_build_object('cross_post_jobs', v_jobs, 'annonces_plateforme', v_ann));
END $f$;
`;

// Les corps de PROD d'avant, et les déclencheurs tels qu'en prod le 03/11 soir (26/09 + 13:52).
const AVANT = [
  ...['annexe_retrait_job_prouve', 'annexe_fiche_annonces_vivantes', 'annexe_listing_designe'].map((n) => lire(join(FIX, `${n}.sql`)) + ';'),
  ...['armer_retrait_job_pour', 'cross_post_jobs_publie_sur_article_vendu', 'inventaire_doublon_decider', 'leboncoin_transaction_noter']
    .map((n) => lire(join(FIX, `${n}.sql`)) + ';'),
  String.raw`
CREATE OR REPLACE FUNCTION public.armer_retrait_job(p_job_id uuid, p_chemin text, p_delai interval DEFAULT '00:00:00'::interval)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$ begin return public.armer_retrait_job_pour(p_job_id, p_chemin, p_delai, false); end; $function$;
CREATE TRIGGER cross_post_jobs_publie_sur_article_vendu AFTER UPDATE OF status ON public.cross_post_jobs FOR EACH ROW
  WHEN (new.status = 'published' AND old.status IS DISTINCT FROM 'published' AND COALESCE(new.action, 'publish') IN ('publish', 'republish') AND new.inventaire_id IS NOT NULL)
  EXECUTE FUNCTION public.cross_post_jobs_publie_sur_article_vendu();
CREATE TRIGGER cross_post_jobs_inseree_sur_article_vendu AFTER INSERT ON public.cross_post_jobs FOR EACH ROW
  WHEN (new.status = 'published' AND COALESCE(new.action, 'publish') IN ('publish', 'republish') AND new.inventaire_id IS NOT NULL)
  EXECUTE FUNCTION public.cross_post_jobs_publie_sur_article_vendu();
CREATE TRIGGER cross_post_jobs_repointee_sur_article_vendu AFTER UPDATE OF inventaire_id ON public.cross_post_jobs FOR EACH ROW
  WHEN (new.status = 'published' AND new.inventaire_id IS NOT NULL AND new.inventaire_id IS DISTINCT FROM old.inventaire_id AND COALESCE(new.action, 'publish') IN ('publish', 'republish'))
  EXECUTE FUNCTION public.cross_post_jobs_publie_sur_article_vendu();`,
];

const JL = '9256e3ae-48e4-4a3a-be66-65fd2e28b418';
let echecs = 0, n = 0;
const ok = (c, m, d = '') => { n++; console.log(`  ${c ? '✓' : '✗'} ${m}${c || !d ? '' : `   ← ${d}`}`); if (!c) echecs++; };
const db = new pg.Client({ connectionString: PG_URL });
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const un = async (sql, p = []) => (await q(sql, p))[0] ?? {};
const commeUtilisateur = (u) => db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: u, role: 'authenticated' })]);
const retraits = async (inv) => Number((await un(`SELECT count(*) n FROM cross_post_jobs WHERE action = 'delete' AND inventaire_id = $1`, [inv])).n);

// Un cas JEAN-LUC : fiche Vinted VENDUE (vente Vinted du 16/09, commande lue) ; fiche importée du relevé Leboncoin en
// stock, à vérifier, avec SON annonce en ligne depuis le 29/06 (job source releve, rattachement import) ; la question.
async function casJeanLuc(gardeId, absorbeId, numero) {
  await q(`INSERT INTO inventaire (id, user_id, titre, statut, quantite, plateforme) VALUES ($1, $3, 'Perceuse TITAN 18V', 'vendu', 1, 'vinted'),
          ($2, $3, 'Perceuse TITAN 18V', 'stock', 1, 'leboncoin')`, [gardeId, absorbeId, JL]);
  await q(`INSERT INTO ventes (user_id, inventaire_id, plateforme, plateforme_code, vendu_le, date) VALUES ($1, $2, 'vinted', 'vinted', '2026-09-16 19:32+00', '2026-09-16')`, [JL, gardeId]);
  const [{ id: job }] = await q(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, platform_listing_id, listing_url, published_at, created_at, platform_fields)
     VALUES ($1, $2, 'leboncoin', 'published', $3, 'https://www.leboncoin.fr/ad/bricolage/' || $3, '2026-11-03 10:00+00', '2026-11-03 10:00+00',
             '{"source":"releve","rattachement":{"par":"rapprochement","import":true}}') RETURNING id`, [JL, absorbeId, numero]);
  await q(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, inventaire_id, job_id, publiee_le, created_at) VALUES ($1, 'leboncoin', $2, $3, $4, '2026-06-29 12:20+00', '2026-11-03 09:56+00')`, [JL, numero, absorbeId, job]);
  const [{ id: d }] = await q(`INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, motif, source, preuves) VALUES ($1, $2, $3, 'probable', 'ambigu_plusieurs', 'releve',
     jsonb_build_object('platform', 'leboncoin', 'annonce_id', (SELECT id FROM annonces_plateforme WHERE listing_id = $4))) RETURNING id`, [JL, gardeId, absorbeId, numero]);
  const annonce = (await un(`SELECT id FROM annonces_plateforme WHERE listing_id = $1`, [numero])).id;
  return { job, d, annonce };
}

try {
  await db.query(DECOR);
  for (const s of AVANT) await db.query(s);

  console.log('0. AVANT la migration (corps de prod) : l\'incident se rejoue');
  const avant = await casJeanLuc(101, 102, '3224766875');
  await commeUtilisateur(JL);
  const r0 = await un(`SELECT inventaire_doublon_decider($1, 'oui', $2) r`, [avant.d, avant.annonce]);
  ok(r0.r?.ok === true && (await retraits(101)) === 1, '« Oui, c\'est le même — retirer l\'annonce » : fusion + retrait de l\'annonce Leboncoin (16:19)', JSON.stringify(r0.r));
  ok((await un(`SELECT platform_fields->'arme_par'->>'chemin' c FROM cross_post_jobs WHERE action = 'delete' AND inventaire_id = 101`)).c === 'publie_apres_vente_serveur',
    'armé par le déclencheur de 13:52 (re-pointée), chemin publie_apres_vente_serveur — comme en prod');

  console.log('1. Application de la migration');
  await db.query(lire(join(ROOT, 'supabase/migrations/20261103230000_rattachement_jamais_de_retrait.sql')));
  const trg = (await q(`SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.cross_post_jobs'::regclass AND NOT tgisinternal ORDER BY 1`)).map((r) => r.tgname);
  ok(!trg.includes('cross_post_jobs_inseree_sur_article_vendu') && !trg.includes('cross_post_jobs_repointee_sur_article_vendu'), 'les deux déclencheurs de 13:52 sont partis', trg.join(','));
  ok(trg.includes('cross_post_jobs_publie_sur_article_vendu') && trg.includes('cross_post_jobs_lbc_vendu_avant_suivi'), 'le déclencheur de statut reste ; celui de Leboncoin est posé');

  console.log('2. COMPTE-9256E3AE : « oui » sur une fiche vendue dont l\'autre a une annonce en ligne');
  const c2 = await casJeanLuc(201, 202, '3233436490');
  const r2 = await un(`SELECT inventaire_doublon_decider($1, 'oui', $2) r`, [c2.d, c2.annonce]);
  ok(r2.r?.ok === true && r2.r?.article_a_part === true && r2.r?.retraits === 0, 'réponse : un article à part, 0 retrait', JSON.stringify(r2.r));
  ok((await retraits(201)) === 0 && (await retraits(202)) === 0, 'aucun retrait');
  const f2 = await un(`SELECT (SELECT fusionne_dans FROM inventaire WHERE id = 202) fus, (SELECT inventaire_id FROM cross_post_jobs WHERE id = $1) inv,
                              (SELECT statut FROM inventaire_doublons WHERE id = $2) st, (SELECT preuves->>'issue' FROM inventaire_doublons WHERE id = $2) issue`, [c2.job, c2.d]);
  ok(f2.fus === null && Number(f2.inv) === 202 && f2.st === 'refusee' && f2.issue === 'article_a_part_annonce_en_ligne', 'jamais réunies : l\'annonce reste sur SA fiche, la question est close', JSON.stringify(f2));
  await q(`INSERT INTO inventaire (id, user_id, titre, statut) VALUES (203, $1, 'x', 'vendu'), (204, $1, 'x', 'stock')`, [JL]);
  const d3 = (await un(`INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, motif) VALUES ($1, 203, 204, 'probable', 'titre_exact') RETURNING id`, [JL])).id;
  const r3 = await un(`SELECT inventaire_doublon_decider($1, 'oui', NULL) r`, [d3]);
  ok(r3.r?.ok === true && !r3.r?.article_a_part && Number((await un(`SELECT fusionne_dans f FROM inventaire WHERE id = 204`)).f) === 203,
    'sans annonce en ligne : la fusion d\'avant (rien à retirer)', JSON.stringify(r3.r));

  console.log('3. Rattachement, insertion, re-pointage : jamais un retrait');
  await q(`INSERT INTO inventaire (id, user_id, titre, statut) VALUES (301, $1, 'vendue', 'vendu'), (302, $1, 'stock', 'stock')`, [JL]);
  await q(`INSERT INTO ventes (user_id, inventaire_id, plateforme_code, vendu_le) VALUES ($1, 301, 'vinted', now() - interval '1 day')`, [JL]);
  await q(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, platform_listing_id, published_at, platform_fields) VALUES ($1, 301, 'leboncoin', 'published', '3300000001', now() - interval '30 days', '{"source":"releve","rattachement":{"import":true}}')`, [JL]);
  ok((await retraits(301)) === 0, 'annonce importée insérée « publiée » sur une fiche vendue : rien');
  const [{ id: j3 }] = await q(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, platform_listing_id, published_at, platform_fields) VALUES ($1, 302, 'beebs', 'published', '34280001', now() - interval '30 days', '{"source":"releve"}') RETURNING id`, [JL]);
  await q(`UPDATE cross_post_jobs SET inventaire_id = 301 WHERE id = $1`, [j3]);
  ok((await retraits(301)) === 0, 'annonce re-pointée sur une fiche vendue : rien');
  await q(`UPDATE cross_post_jobs SET status = 'failed' WHERE id = $1`, [j3]); await q(`UPDATE cross_post_jobs SET status = 'published' WHERE id = $1`, [j3]);
  ok((await retraits(301)) === 0, 'annonce importée repassée « published » sur une fiche vendue : rien');

  console.log('4. Polly (client-447d920c, 28/10) : le dépôt de FillSell refermé, vente APRÈS sa mise en ligne → retrait');
  const LS = '447d920c-976a-4d8f-aff4-a2998050358c';
  await q(`INSERT INTO inventaire (id, user_id, titre, statut, quantite, plateforme) VALUES (401, $1, 'Polly Pocket Ananas', 'vendu', 0, 'vinted')`, [LS]);
  await q(`INSERT INTO ventes (user_id, inventaire_id, plateforme, plateforme_code, date, created_at) VALUES ($1, 401, 'Leboncoin', 'leboncoin', '2026-10-24', '2026-10-24 10:11+00')`, [LS]);
  const [{ id: j4 }] = await q(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, platform_listing_id, listing_url, published_at, created_at)
     VALUES ($1, 401, 'beebs', 'failed', '34206489', 'https://www.beebs.app/fr/p/34206489', '2026-10-20 21:51+00', '2026-10-20 21:35+00') RETURNING id`, [LS]);
  await q(`UPDATE cross_post_jobs SET status = 'published' WHERE id = $1`, [j4]);
  ok((await retraits(401)) === 1, 'retrait Beebs armé, comme la réparation du 28/10');

  console.log('5. Dylan : une copie importée, la vente AVANT ou APRÈS sa mise en ligne (chemin de la vente)');
  const DY = '379aa8a7-0c37-4134-b1fd-de5e0fb7c1e4';
  await q(`INSERT INTO inventaire (id, user_id, titre, statut, plateforme) VALUES (501, $1, 'Arcanin 15/100', 'vendu', 'vinted'), (502, $1, 'Dracaufeu V 153/172', 'vendu', 'vinted')`, [DY]);
  await q(`INSERT INTO ventes (user_id, inventaire_id, plateforme_code, vendu_le, date) VALUES ($1, 501, 'vinted', '2026-10-11 14:46+00', '2026-10-11'), ($1, 502, 'vinted', NULL, '2026-11-03')`, [DY]);
  const [{ id: j5a }] = await q(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, platform_listing_id, published_at, created_at, platform_fields)
     VALUES ($1, 501, 'beebs', 'published', '34285076', '2026-11-02 20:45+00', '2026-11-02 20:45+00', '{"source":"releve","rattachement":{"import":true,"par":"rapprochement"}}') RETURNING id`, [DY]);
  await q(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, inventaire_id, job_id, created_at) VALUES ($1, 'beebs', '34285076', 501, $2, '2026-11-02 20:42+00')`, [DY, j5a]);
  const r5a = await un(`SELECT armer_retrait_job_pour($1, 'vente_article_serveur', interval '0', false) r`, [j5a]);
  const log5 = await un(`SELECT metadata FROM usage_logs WHERE feature = 'retrait_refuse_vente_avant_mise_en_ligne' AND metadata->>'job' = $1`, [j5a]);
  ok(r5a.r === null && (await retraits(501)) === 0 && log5.metadata?.chemin === 'vente_article_serveur', 'Arcanin : vendue le 11/10, carte Beebs en ligne le 02/11 → aucun retrait, la raison tracée', JSON.stringify(log5.metadata ?? {}));
  const [{ id: j5b }] = await q(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, platform_listing_id, published_at, created_at, platform_fields)
     VALUES ($1, 502, 'beebs', 'published', '34284899', '2026-11-02 20:45+00', '2026-11-02 20:45+00', '{"source":"releve","rattachement":{"import":true,"par":"rapprochement"}}') RETURNING id`, [DY]);
  await q(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, inventaire_id, job_id, created_at) VALUES ($1, 'beebs', '34284899', 502, $2, '2026-11-02 20:42+00')`, [DY, j5b]);
  const r5b = await un(`SELECT armer_retrait_job_pour($1, 'vente_article_serveur', interval '0', false) r`, [j5b]);
  ok(r5b.r !== null && (await retraits(502)) === 1, 'Dracaufeu V : vendue le 03/11, carte Beebs en ligne depuis le 02/11 → retrait (vente après la mise en ligne)');

  console.log('6. Une vente vue en retard retire toujours le dépôt de FillSell (eBay, six-points 03/11)');
  await q(`INSERT INTO inventaire (id, user_id, titre, statut, plateforme) VALUES (601, $1, 'estampe', 'vendu', 'vinted')`, [DY]);
  await q(`INSERT INTO ventes (user_id, inventaire_id, plateforme_code, vendu_le) VALUES ($1, 601, 'vinted', '2026-10-17 10:00+00')`, [DY]);
  const [{ id: j6 }] = await q(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, platform_listing_id, published_at, created_at)
     VALUES ($1, 601, 'ebay', 'published', '168700000001', '2026-10-20 10:00+00', '2026-10-20 09:50+00') RETURNING id`, [DY]);
  ok((await un(`SELECT armer_retrait_job_pour($1, 'vente_article_serveur', interval '0', false) r`, [j6])).r !== null, 'dépôt de FillSell publié après la vente réelle : retiré (l\'objet de la fiche)');

  console.log('7. Leboncoin : « Vendu » dès la première lecture d\'une annonce importée (COMPTE-9256E3AE, 18:15)');
  await q(`INSERT INTO inventaire (id, user_id, titre, statut) VALUES (701, $1, 'Scie sabre ERBAUER', 'stock'), (702, $1, 'Balance', 'stock'), (703, $1, 'Polly', 'stock')`, [JL]);
  const [{ id: j7 }] = await q(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, platform_listing_id, platform_fields) VALUES ($1, 701, 'leboncoin', 'published', '3224866836', '{"source":"releve","rattachement":{"import":true}}') RETURNING id`, [JL]);
  await q(`INSERT INTO usage_logs (user_id, feature, metadata, created_at) VALUES ($1, 'vente_leboncoin_transaction', '{"listing_id":"3224866836","transaction":"sold","avant":null,"issue":"sans_job"}', '2026-11-03 09:56:05+00')`, [JL]);
  await q(`UPDATE cross_post_jobs SET platform_fields = platform_fields || '{"sale_signal":"sold","unavailable_since":"2026-11-03T12:01:57Z","detected_price":80}' WHERE id = $1`, [j7]);
  const pf7 = (await un(`SELECT platform_fields pf FROM cross_post_jobs WHERE id = $1`, [j7])).pf;
  ok(pf7.sale_signal === undefined && pf7.unavailable_since === undefined && pf7.vendu_avant_suivi?.motif === 'leboncoin_vendu_des_la_premiere_lecture',
    'le drapeau « Vendue » de la veille est écarté dans la même écriture', JSON.stringify(pf7));
  await q(`UPDATE cross_post_jobs SET platform_fields = platform_fields || '{"sale_signal":"sold","unavailable_since":"2026-11-03T14:01:57Z"}' WHERE id = $1`, [j7]);
  const nLog7 = Number((await un(`SELECT count(*) n FROM usage_logs WHERE feature = 'vente_leboncoin_ancienne_ecartee'`)).n);
  ok(nLog7 === 1 && (await un(`SELECT platform_fields->>'sale_signal' s FROM cross_post_jobs WHERE id = $1`, [j7])).s === null, 'reposé au passage suivant : écarté encore, tracé une seule fois');
  const [{ id: j7b }] = await q(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, platform_listing_id, platform_fields) VALUES ($1, 703, 'leboncoin', 'published', '3291945630', '{"source":"releve"}') RETURNING id`, [JL]);
  await q(`INSERT INTO usage_logs (user_id, feature, metadata) VALUES ($1, 'vente_leboncoin_transaction', '{"listing_id":"3291945630","transaction":"pending","avant":"aucune"}')`, [JL]);
  await q(`UPDATE cross_post_jobs SET platform_fields = platform_fields || '{"sale_signal":"sold"}' WHERE id = $1`, [j7b]);
  ok((await un(`SELECT platform_fields->>'sale_signal' s FROM cross_post_jobs WHERE id = $1`, [j7b])).s === 'sold', 'une transition vue (sans transaction → achat en cours) : le drapeau reste');
  const [{ id: j7c }] = await q(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, platform_listing_id, platform_fields) VALUES ($1, 702, 'leboncoin', 'published', '3299999999', '{}') RETURNING id`, [JL]);
  await q(`INSERT INTO usage_logs (user_id, feature, metadata) VALUES ($1, 'vente_leboncoin_transaction', '{"listing_id":"3299999999","transaction":"sold","avant":null}')`, [JL]);
  await q(`UPDATE cross_post_jobs SET platform_fields = platform_fields || '{"sale_signal":"sold"}' WHERE id = $1`, [j7c]);
  ok((await un(`SELECT platform_fields->>'sale_signal' s FROM cross_post_jobs WHERE id = $1`, [j7c])).s === 'sold', 'une annonce déposée par FillSell : un « Vendu » reste une vente');

  console.log('8. La règle de la transaction Leboncoin (leboncoin_transaction_noter)');
  await q(`INSERT INTO inventaire (id, user_id, titre, statut) VALUES (801, $1, 'Boîte à café', 'stock'), (802, $1, 'Serviette', 'stock')`, [JL]);
  await q(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, platform_listing_id, platform_fields) VALUES ($1, 801, 'leboncoin', 'published', '3243204568', '{"source":"releve"}'), ($1, 802, 'leboncoin', 'published', '3196752135', '{}')`, [JL]);
  const [{ id: a81 }] = await q(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, inventaire_id) VALUES ($1, 'leboncoin', '3243204568', 801) RETURNING id`, [JL]);
  const [{ id: a82 }] = await q(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, inventaire_id) VALUES ($1, 'leboncoin', '3196752135', 802) RETURNING id`, [JL]);
  const n81 = await un(`SELECT leboncoin_transaction_noter($1, 'sold', NULL) r`, [a81]);
  ok(n81.r?.issue === 'vendu_avant_suivi' && (await un(`SELECT platform_fields->>'sale_signal' s FROM cross_post_jobs WHERE platform_listing_id = '3243204568'`)).s === null,
    'annonce importée lue « Vendu » à la première lecture : vendu_avant_suivi, aucune preuve', JSON.stringify(n81.r));
  const n82 = await un(`SELECT leboncoin_transaction_noter($1, 'sold', NULL) r`, [a82]);
  ok(n82.r?.issue === 'prouvee', 'annonce déposée par FillSell lue « Vendu » : la vente est prouvée (règle d\'avant)', JSON.stringify(n82.r));

  console.log('9. L\'inverse rend les corps d\'avant et les déclencheurs de 13:52');
  await db.query(lire(join(ROOT, 'supabase/rollbacks/20261103230000_rattachement_jamais_de_retrait_INVERSE.sql')));
  const trg9 = (await q(`SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.cross_post_jobs'::regclass AND NOT tgisinternal ORDER BY 1`)).map((r) => r.tgname);
  ok(trg9.includes('cross_post_jobs_inseree_sur_article_vendu') && trg9.includes('cross_post_jobs_repointee_sur_article_vendu') && !trg9.includes('cross_post_jobs_lbc_vendu_avant_suivi'), 'déclencheurs d\'avant revenus', trg9.join(','));
  const fns = (await q(`SELECT proname FROM pg_proc WHERE proname IN ('annonce_importee','annonce_mise_en_ligne','vente_instant','vente_apres_mise_en_ligne','leboncoin_vendu_avant_suivi')`)).length;
  ok(fns === 0, 'aucune fonction nouvelle ne reste');
  const corps = (await un(`SELECT pg_get_functiondef('public.armer_retrait_job_pour(uuid,text,interval,boolean)'::regprocedure) d`)).d.replace(/\r\n/g, '\n').trimEnd();
  ok(corps === lire(join(FIX, 'armer_retrait_job_pour.sql')).trimEnd(), 'armer_retrait_job_pour : le corps de prod, à l\'octet');
  for (const nom of ['cross_post_jobs_publie_sur_article_vendu', 'inventaire_doublon_decider', 'leboncoin_transaction_noter']) {
    const c = (await un(`SELECT pg_get_functiondef(p.oid) d FROM pg_proc p WHERE p.proname = $1`, [nom])).d.replace(/\r\n/g, '\n').trimEnd();
    ok(c === lire(join(FIX, `${nom}.sql`)).trimEnd(), `${nom} : le corps de prod, à l'octet`);
  }
  console.log('10. Ré-application (idempotente)');
  await db.query(lire(join(ROOT, 'supabase/migrations/20261103230000_rattachement_jamais_de_retrait.sql')));
  ok(true, 'la migration se ré-applique sans erreur');
} finally {
  await db.end().catch(() => {});
  if (embarque) { await embarque.pg.stop().catch(() => {}); try { rmSync(embarque.dossier, { recursive: true, force: true }); } catch { /* dossier temporaire */ } }
}
console.log(`\n${echecs ? '✗' : '✓'} banc 20261103230000 : ${n - echecs}/${n}`);
process.exit(echecs ? 1 : 0);

