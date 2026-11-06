// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261106110000_lecture_fraiche_preuve_exacte (06/11, Nico, point 8) —
// jamais la prod (règle du 03/11).
//   PREUVE_PG=embarque node scripts/essais/20261106110000_banc.mjs
// Corps de la PROD du 06/11 (fixtures/prod-0611-lecture-fraiche : le déclencheur annonces_plateforme_transaction_leboncoin,
// leboncoin_transaction_noter, leboncoin_transaction_lue, annonce_importee, leboncoin_vendu_avant_suivi) ; bouchons pour
// signal_vente_lever / vente_transaction_annulee_leboncoin (hors sujet). Le banc REJOUE D'ABORD le défaut de Louis avec le
// corps d'avant (3297299585 « Vendu » relu frais, job edf17fe7 sale_signal = sold SANS sale_evidence : la règle n'est pas
// appelée), applique la migration, rejoue (la preuve exacte est posée), vérifie ce qui ne doit pas bouger, puis l'inverse.
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = join(ROOT, 'scripts/essais/fixtures/prod-0611-lecture-fraiche');
const lire = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-lecture-fraiche-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port: 55444, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:banc@127.0.0.1:55444/postgres';
}

const DECOR = String.raw`
CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer);
INSERT INTO public.coin_config VALUES ('ventes_leboncoin_transaction', 1);
CREATE TABLE public.inventaire (id bigint PRIMARY KEY, user_id uuid, titre text, statut text DEFAULT 'stock', quantite integer DEFAULT 1,
  plateforme text, fusionne_dans bigint);
CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, inventaire_id bigint, platform text,
  status text, action text DEFAULT 'publish', platform_listing_id text, platform_fields jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.ventes (id bigserial PRIMARY KEY, user_id uuid, inventaire_id bigint, plateforme_code text, annonce_id text, created_at timestamptz DEFAULT now());
CREATE TABLE public.annonces_plateforme (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, listing_id text,
  titre text, prix numeric, statut_plateforme text DEFAULT 'en_ligne', inventaire_id bigint, disparu_le timestamptz,
  capture jsonb, capture_le timestamptz, transaction_plateforme text, transaction_lue_le timestamptz, vu_le timestamptz DEFAULT now(), run_id uuid);
CREATE TABLE public.usage_logs (id bigserial PRIMARY KEY, user_id uuid, feature text, metadata jsonb, created_at timestamptz DEFAULT now());
CREATE OR REPLACE FUNCTION public.signal_vente_lever(j uuid, m text, d jsonb) RETURNS void LANGUAGE sql AS $f$ SELECT $f$;
CREATE OR REPLACE FUNCTION public.vente_transaction_annulee_leboncoin(v bigint, m text) RETURNS jsonb LANGUAGE sql AS $f$ SELECT '{}'::jsonb $f$;
`;
const AVANT = ['leboncoin_transaction_lue', 'annonce_importee', 'leboncoin_vendu_avant_suivi', 'leboncoin_transaction_noter',
  'annonces_plateforme_transaction_leboncoin'].map((n) => lire(join(FIX, `${n}.sql`)) + ';');
const DECLENCHEUR = `CREATE TRIGGER annonces_plateforme_transaction_leboncoin AFTER INSERT OR UPDATE OF transaction_plateforme, capture
  ON public.annonces_plateforme FOR EACH ROW WHEN ((new.platform = 'leboncoin'::text)) EXECUTE FUNCTION annonces_plateforme_transaction_leboncoin();`;
const MIGRATION = lire(join(ROOT, 'supabase/migrations/20261106110000_lecture_fraiche_preuve_exacte.sql'));
const INVERSE = lire(join(ROOT, 'supabase/rollbacks/20261106110000_lecture_fraiche_preuve_exacte_INVERSE.sql'));

const LOUIS = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
let echecs = 0, n = 0;
const ok = (c, m, d = '') => { n++; console.log(`  ${c ? '✓' : '✗'} ${m}${c || !d ? '' : `   ← ${d}`}`); if (!c) echecs++; };
const db = new pg.Client({ connectionString: PG_URL });
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const un = async (sql, p = []) => (await q(sql, p))[0] ?? {};

// Une fiche en série au stock, son dépôt FillSell publié (republication), son annonce Leboncoin déjà « Vendu » (relevé
// d'avant : transaction_lue_le il y a 2 h, une trace « plusieurs_exemplaires » de l'ancienne règle).
let suivant = 1;
async function cas({ signal = 'page', statut = 'stock', action = 'republish', source = null } = {}) {
  const f = 1791020340000 + suivant, num = String(3297299500 + suivant++);
  // L'état d'avant est posé déclencheurs coupés : en prod, l'ancienne règle a déjà joué (trace « plusieurs_exemplaires »).
  await q("SET session_replication_role = replica");
  await q(`INSERT INTO inventaire (id, user_id, titre, statut, quantite) VALUES ($1, $2, 'Rangement Noir et Gris', $3, 9999)`, [f, LOUIS, statut]);
  const pf = { ...(source ? { source } : {}) };
  if (signal === 'page') pf.sale_signal = 'sold';                                  // « Vendu » lu sur la page, sans preuve
  if (signal === 'exacte') Object.assign(pf, { sale_signal: 'sold', sale_evidence: { listing_id: num, exact: true, source: 'transaction_leboncoin' } });
  const [{ id: job }] = await q(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, platform_listing_id, platform_fields)
    VALUES ($1, $2, 'leboncoin', 'published', $3, $4, $5) RETURNING id`, [LOUIS, f, action, num, pf]);
  await q(`INSERT INTO usage_logs (user_id, feature, metadata, created_at) VALUES ($1, 'vente_leboncoin_transaction',
    jsonb_build_object('listing_id', $2::text, 'transaction', 'sold', 'avant', 'pending', 'issue', 'plusieurs_exemplaires'), now() - interval '1 day')`, [LOUIS, num]);
  const [{ id: a }] = await q(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, titre, prix, inventaire_id, transaction_plateforme,
    transaction_lue_le, capture_le, vu_le) VALUES ($1, 'leboncoin', $2, 'Rangement Noir et Gris', 7, $3, 'sold', now() - interval '2 hours',
    now() - interval '2 hours', now() - interval '2 hours') RETURNING id`, [LOUIS, num, f]);
  await q("SET session_replication_role = origin");
  return { f, num, job, a };
}
// Le relevé du matin : relit « Vendu », lecture fraîche.
const releve = (a, tx = 'sold') => q(`UPDATE annonces_plateforme SET transaction_plateforme = $2, transaction_lue_le = now(), capture_le = now(), vu_le = now() WHERE id = $1`, [a, tx]);
const preuve = async (job) => (await un(`SELECT platform_fields FROM cross_post_jobs WHERE id = $1`, [job])).platform_fields ?? {};
const traces = async (num) => (await q(`SELECT metadata->>'issue' i FROM usage_logs WHERE metadata->>'listing_id' = $1 AND created_at > now() - interval '1 minute' ORDER BY id`, [num])).map((r) => r.i);

try {
  await db.query(DECOR);
  for (const s of AVANT) await db.query(s);
  await db.query(DECLENCHEUR);

  console.log('0. AVANT (corps de prod du 06/11) : le défaut de Louis se rejoue');
  const c0 = await cas();
  await releve(c0.a);
  const p0 = await preuve(c0.job);
  ok(!p0.sale_evidence && (await traces(c0.num)).length === 0,
    '« Vendu » relu frais, job sale_signal = sold SANS preuve : la règle n\'est pas appelée, aucune preuve exacte', JSON.stringify({ p0, t: await traces(c0.num) }));

  console.log('1. La migration');
  await db.query(MIGRATION);
  ok(true, 'appliquée');

  console.log('2. APRÈS');
  const c1 = await cas();
  await releve(c1.a);
  const p1 = await preuve(c1.job);
  ok(p1.sale_evidence?.listing_id === c1.num && p1.sale_evidence?.exact === true && p1.sale_evidence?.statut === 'sold' && p1.sale_signal === 'sold',
    'le même relevé : la preuve EXACTE de la transaction est posée sur le job de CE numéro (vente au point final, remise en vente ensuite)', JSON.stringify(p1));
  ok(JSON.stringify(await traces(c1.num)) === JSON.stringify(['prouvee']) && p1.sale_evidence?.rattrapage?.regle === 'lecture_fraiche_2410',
    'trace « prouvee », marquée rattrapage par lecture fraîche (aucun mail : vente de plus de 24 h)', JSON.stringify({ t: await traces(c1.num), r: p1.sale_evidence?.rattrapage }));
  const c2 = await cas({ signal: 'exacte' });
  await releve(c2.a);
  const e2 = (await preuve(c2.job)).sale_evidence ?? {};
  ok((await traces(c2.num)).length === 0 && e2.listing_id === c2.num && e2.exact === true && Object.keys(e2).length === 3,
    'déjà prouvée EXACTEMENT (sale_evidence de ce numéro) : la règle n\'est pas rappelée, la preuve ne bouge pas');
  const c3 = await cas({ signal: 'aucun' });
  await releve(c3.a);
  ok((await preuve(c3.job)).sale_evidence?.listing_id === c3.num, 'sans aucun signal : prouvée (comme avant)');
  const c4 = await cas({ statut: 'vendu' });
  await releve(c4.a);
  ok((await traces(c4.num)).length === 0 && !(await preuve(c4.job)).sale_evidence, 'fiche déjà vendue : rien (comme avant, jamais deux ventes)');
  const c5 = await cas();
  await q(`UPDATE annonces_plateforme SET transaction_lue_le = now() - interval '3 hours', capture = '{}'::jsonb WHERE id = $1`, [c5.a]);
  ok((await traces(c5.num)).length === 0 && !(await preuve(c5.job)).sale_evidence, 'lecture pas fraîche (> 1 h) : rien (comme avant)');
  const c6 = await cas({ action: 'publish', source: 'releve' });
  await releve(c6.a);
  ok(JSON.stringify(await traces(c6.num)) === JSON.stringify(['plusieurs_exemplaires']) && !(await preuve(c6.job)).sale_evidence,
    'une VRAIE annonce importée à plusieurs unités : la règle est appelée et la laisse à la personne (« plusieurs_exemplaires »), comme voulu',
    JSON.stringify(await traces(c6.num)));
  const c7 = await cas();
  await q(`UPDATE annonces_plateforme SET statut_plateforme = 'disparue' WHERE id = $1`, [c7.a]);
  await releve(c7.a);
  ok(!(await preuve(c7.job)).sale_evidence, 'annonce plus en ligne : rien (comme avant)');

  console.log('3. L\'inverse');
  await db.query(INVERSE);
  const c8 = await cas();
  await releve(c8.a);
  ok(!(await preuve(c8.job)).sale_evidence && (await traces(c8.num)).length === 0, 'corps d\'avant rétabli (le défaut revient)');
} catch (e) {
  echecs++;
  console.error('✗ ERREUR :', e.message);
} finally {
  await db.end();
  if (embarque) { await embarque.pg.stop(); rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(`\n${n - echecs}/${n} vérifications, ${echecs} échec(s)`);
process.exit(echecs ? 1 : 0);
