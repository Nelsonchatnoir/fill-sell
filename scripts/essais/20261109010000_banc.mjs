// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261109010000_vendu_avant_suivi_jamais_une_vente (09/11, point 1 de
// Nico — assopmfrance « Écusson pm 123 », Leboncoin 3260078076) — jamais la prod.
//   PREUVE_PG=embarque node scripts/essais/20261109010000_banc.mjs
// Corps de la PROD relus le 09/11 (scripts/essais/fixtures/prod-0911-vendu-avant-suivi/ : republication_annonce_partie md5
// 00b2218f…, listing_designe, _ts_ou_null, leboncoin_vendu_avant_suivi) ; tables réduites aux colonnes que la fonction lit.
//   A. AVANT (corps de la prod) : les deux défauts se reproduisent — assopmfrance « vendue » (badge d'avant le suivi,
//      disparue, constat de deux relevés) ; lupilou999 « vendue » (EN LIGNE, sale_signal 'sold' de la veille) ;
//   B. APRÈS (migration, jouée deux fois) : assopmfrance « annonce_partie » ; lupilou999 NULL (se republie) ; tout le reste
//      inchangé : Jess (08/11) NULL, vente vue PENDANT le suivi « vendue » (deux branches), dépôt FillSell disparu au badge
//      « vendue », verdict du juge « vendue », importée disparue SANS constat NULL, Beebs sale_signal 'sold' « vendue » ;
//   C. l'INVERSE rend la fonction de la prod, mot pour mot (md5), et le défaut revient.
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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-vendu-avant-suivi-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port: 55452, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }) };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:banc@127.0.0.1:55452/postgres';
}

const FIX = 'scripts/essais/fixtures/prod-0911-vendu-avant-suivi';
const MIGRATION = lire('supabase/migrations/20261109010000_vendu_avant_suivi_jamais_une_vente.sql');
const INVERSE = lire('supabase/rollbacks/20261109010000_vendu_avant_suivi_jamais_une_vente_INVERSE.sql');
const MD5_PROD = '00b2218f3ded96d364f83b8f7d1aebae';
const DECOR = `
CREATE TABLE public.cross_post_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, inventaire_id bigint, platform text NOT NULL,
  action text DEFAULT 'publish', status text NOT NULL DEFAULT 'pending', platform_listing_id text, listing_url text,
  platform_fields jsonb DEFAULT '{}'::jsonb, error text, created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz, last_checked_at timestamptz, vu_en_ligne_le timestamptz);
CREATE TABLE public.annonces_plateforme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, platform text NOT NULL, listing_id text NOT NULL,
  statut_plateforme text, transaction_plateforme text, vu_le timestamptz, disparu_le timestamptz, inventaire_id bigint);
CREATE TABLE public.usage_logs (
  id bigserial PRIMARY KEY, user_id uuid, feature text, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now());
`;
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };

const client = new pg.Client({ connectionString: PG_URL });
await client.connect();
try {
  await client.query(DECOR);
  for (const f of ['_ts_ou_null', 'listing_designe', 'leboncoin_vendu_avant_suivi', 'republication_annonce_partie']) {
    await client.query(lire(`${FIX}/${f}.sql`));
  }
  const md5 = async () => (await client.query(
    "SELECT md5(replace(pg_get_functiondef('public.republication_annonce_partie(uuid,bigint,text,text)'::regprocedure), chr(13), '')) AS m")).rows[0].m;
  ok(await md5() === MD5_PROD, 'la fonction chargée est celle de la prod (md5 00b2218f…)');

  // ── Le décor : un compte par cas (le numéro d'une plateforme est unique par compte) ──
  const U = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  const job = (o) => client.query(
    `INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, platform_listing_id, listing_url, platform_fields, error, created_at, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
    [o.u, o.fiche, o.pf ?? 'leboncoin', o.action ?? 'publish', o.status ?? 'published', o.lid, o.url ?? `https://www.leboncoin.fr/ad/collection/${o.lid}`,
      JSON.stringify(o.champs ?? {}), o.error ?? null, o.cree ?? '2026-11-05T13:34:00Z', o.publie ?? '2026-11-05T13:34:00Z']);
  const annonce = (o) => client.query(
    `INSERT INTO annonces_plateforme (user_id, platform, listing_id, statut_plateforme, transaction_plateforme, vu_le, disparu_le, inventaire_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [o.u, o.pf ?? 'leboncoin', o.lid, o.statut ?? 'en_ligne', o.tr ?? null, o.vu, o.disparu ?? null, o.fiche]);
  const trace = (u, lid, transaction, avant, le) => client.query(
    "INSERT INTO usage_logs (user_id, feature, metadata, created_at) VALUES ($1, 'vente_leboncoin_transaction', $2::jsonb, $3)",
    [u, JSON.stringify({ listing_id: lid, transaction, ...(avant != null ? { avant } : {}) }), le]);
  const IMPORT = { source: 'releve', rattachement: { import: true, par: 'rapprochement' } };

  // 1. assopmfrance (le cas) : importée, « Vendu » dès la 1re lecture, lue en ligne jusqu'au 05/11 20:51, absente de deux
  //    relevés complets (constat absence_releves du 06/11 17:53), veille de l'extension « unavailable ».
  await job({ u: U(1), fiche: 1793885648177, lid: '3260078076', champs: { ...IMPORT, sale_signal: 'unavailable', unavailable_since: '2026-11-06T17:53:38Z',
    absence_releves: { le: '2026-11-06T17:53:39Z', premier: 'fa59b5f9', second: '16b274f3', listing_id: '3260078076' } } });
  await annonce({ u: U(1), fiche: 1793885648177, lid: '3260078076', tr: 'sold', vu: '2026-11-05T19:51:53Z', disparu: '2026-11-06T17:53:38Z' });
  await trace(U(1), '3260078076', 'sold', null, '2026-11-05T13:30:50Z');
  await trace(U(1), '3260078076', 'sold', 'sold', '2026-11-05T19:51:53Z');
  // 2. lupilou999 : importée, EN LIGNE (relevée le 08/11), badge d'avant le suivi, sale_signal 'sold' posé par la veille.
  await job({ u: U(2), fiche: 1792981718538, lid: '3004783150', champs: { ...IMPORT, sale_signal: 'sold', unavailable_since: '2026-10-26T06:38:00Z' } });
  await annonce({ u: U(2), fiche: 1792981718538, lid: '3004783150', tr: 'sold', vu: '2026-11-08T01:48:00Z' });
  await trace(U(2), '3004783150', 'sold', null, '2026-10-25T10:00:00Z');
  // 3. Jess (08/11) : importée, en ligne, badge d'avant le suivi, aucun sale_signal.
  await job({ u: U(3), fiche: 1794077239905, lid: '3178619102', champs: IMPORT });
  await annonce({ u: U(3), fiche: 1794077239905, lid: '3178619102', tr: 'sold', vu: '2026-11-08T22:16:00Z' });
  await trace(U(3), '3178619102', 'sold', null, '2026-11-07T19:57:00Z');
  // 4. Vente lue PENDANT le suivi (« aucune » puis « sold »), importée, en ligne : relevé ET page → toujours « vendue ».
  await job({ u: U(4), fiche: 4, lid: '3300000004', champs: { ...IMPORT, sale_signal: 'sold' } });
  await annonce({ u: U(4), fiche: 4, lid: '3300000004', tr: 'sold', vu: '2026-11-08T10:00:00Z' });
  await trace(U(4), '3300000004', 'aucune', null, '2026-11-01T10:00:00Z');
  await trace(U(4), '3300000004', 'sold', 'aucune', '2026-11-07T10:00:00Z');
  // 4b. La même, lue seulement par la page (relevé sans transaction) : « vendue ».
  await job({ u: U(14), fiche: 14, lid: '3300000014', champs: { ...IMPORT, sale_signal: 'sold' } });
  await annonce({ u: U(14), fiche: 14, lid: '3300000014', vu: '2026-11-08T10:00:00Z' });
  await trace(U(14), '3300000014', 'aucune', null, '2026-11-01T10:00:00Z');
  await trace(U(14), '3300000014', 'sold', 'aucune', '2026-11-07T10:00:00Z');
  // 5. Dépôt de FILLSELL (pas un import), « Vendu » dès la 1re lecture puis disparu : une vente après sa mise en ligne.
  await job({ u: U(5), fiche: 5, lid: '3300000005', champs: { republish_source: 'manuel' } });
  await annonce({ u: U(5), fiche: 5, lid: '3300000005', tr: 'sold', vu: '2026-11-06T10:00:00Z', disparu: '2026-11-07T10:00:00Z' });
  await trace(U(5), '3300000005', 'sold', null, '2026-11-06T10:00:00Z');
  // 6. Verdict du juge « vendue » (handler-watch) sur une importée au badge d'avant le suivi, disparue : « vendue ».
  await job({ u: U(6), fiche: 6, lid: '3300000006', champs: { ...IMPORT,
    annonce_disparue: { pose_par: 'handler-watch (annonce publiée disparue)', motif: 'vendue (relevé)', vendue: true, at: '2026-11-07T10:00:00Z' } } });
  await annonce({ u: U(6), fiche: 6, lid: '3300000006', tr: 'sold', vu: '2026-11-06T10:00:00Z', disparu: '2026-11-07T10:00:00Z' });
  await trace(U(6), '3300000006', 'sold', null, '2026-11-05T10:00:00Z');
  // 7. Importée, badge d'avant le suivi, disparue d'UN relevé seulement (aucun constat) : rien ne prouve son départ.
  await job({ u: U(7), fiche: 7, lid: '3300000007', champs: IMPORT });
  await annonce({ u: U(7), fiche: 7, lid: '3300000007', tr: 'sold', vu: '2026-11-06T10:00:00Z', disparu: '2026-11-07T10:00:00Z' });
  await trace(U(7), '3300000007', 'sold', null, '2026-11-05T10:00:00Z');
  // 8. Beebs, sale_signal 'sold' : hors Leboncoin, inchangé.
  await job({ u: U(8), fiche: 8, pf: 'beebs', lid: '3300000008', url: 'https://www.beebs.app/fr/p/3300000008', champs: { ...IMPORT, sale_signal: 'sold' } });
  // 9. Importée par un relevé PUIS republiée par FillSell sous le MÊME numéro (cas impossible chez Leboncoin, mais la règle
  //    doit pencher du côté de la vente) : un dépôt de FillSell porte le numéro → pas « née hors FillSell » → disparue « vendue ».
  await job({ u: U(9), fiche: 9, lid: '3300000009', champs: IMPORT });
  await job({ u: U(9), fiche: 9, lid: '3300000009', action: 'republish', status: 'published', champs: { republish_source: 'manuel' } });
  await annonce({ u: U(9), fiche: 9, lid: '3300000009', tr: 'sold', vu: '2026-11-06T10:00:00Z', disparu: '2026-11-07T10:00:00Z' });
  await trace(U(9), '3300000009', 'sold', null, '2026-11-05T10:00:00Z');

  const verdict = async (i, fiche, lid, pf = 'leboncoin') => (await client.query(
    'SELECT public.republication_annonce_partie($1, $2, $3, $4) AS v', [U(i), fiche, pf, lid])).rows[0].v;
  const tous = async () => ({
    assop: await verdict(1, 1793885648177, '3260078076'),
    lupi: await verdict(2, 1792981718538, '3004783150'),
    jess: await verdict(3, 1794077239905, '3178619102'),
    venteSuivi: await verdict(4, 4, '3300000004'),
    venteSuiviPage: await verdict(14, 14, '3300000014'),
    depotFillSell: await verdict(5, 5, '3300000005'),
    juge: await verdict(6, 6, '3300000006'),
    sansConstat: await verdict(7, 7, '3300000007'),
    beebs: await verdict(8, 8, '3300000008', 'beebs'),
    republieFillSell: await verdict(9, 9, '3300000009'),
    inconnu: await verdict(1, 1793885648177, null),
  });

  console.log('A. AVANT (corps de la prod)');
  const a = await tous();
  ok(a.assop === 'annonce_vendue', 'client-ca9afe24 : « vendue » (le défaut : la vente date d\'avant le suivi)');
  ok(a.lupi === 'annonce_vendue', 'client-cae7a20d : EN LIGNE et pourtant « vendue » par la page (le défaut : refus à tort)');
  ok(a.jess === null, 'Compte-essai-9 : se republie (règle du 08/11)');

  console.log('B. APRÈS (migration, jouée deux fois)');
  await client.query(MIGRATION);
  await client.query(MIGRATION);
  const b = await tous();
  ok(b.assop === 'annonce_partie', 'client-ca9afe24 : « annonce_partie » (plus en ligne, confirmé par les relevés) — toujours refusée, jamais « vendue »');
  ok(b.lupi === null, 'client-cae7a20d : en ligne, badge d\'avant le suivi → se republie');
  ok(b.jess === null, 'Compte-essai-9 : inchangé (se republie)');
  ok(b.venteSuivi === 'annonce_vendue', 'vente lue PENDANT le suivi (relevé + page) : toujours « vendue »');
  ok(b.venteSuiviPage === 'annonce_vendue', 'vente lue PENDANT le suivi, par la page seule : toujours « vendue »');
  ok(b.depotFillSell === 'annonce_vendue', 'dépôt de FillSell au badge dès sa 1re lecture, disparu : toujours « vendue »');
  ok(b.juge === 'annonce_vendue', 'verdict du juge « vendue » : inchangé');
  ok(b.sansConstat === null, 'importée disparue d\'un seul relevé (aucun constat) : rien ne prouve son départ (NULL)');
  ok(b.beebs === 'annonce_vendue', 'Beebs (sale_signal sold) : inchangé');
  ok(b.republieFillSell === 'annonce_vendue', 'numéro porté par un dépôt de FillSell : jamais « née hors FillSell »');
  ok(b.inconnu === null, 'identifiant inconnu : NULL');
  ok(await md5() !== MD5_PROD, 'la fonction a bien changé');

  console.log('C. INVERSE');
  await client.query(INVERSE);
  ok(await md5() === MD5_PROD, "l'inverse rend la fonction de la prod, mot pour mot (md5)");
  const c = await tous();
  ok(c.assop === 'annonce_vendue' && c.lupi === 'annonce_vendue', 'le défaut revient avec l\'inverse');
  await client.query(MIGRATION);
  ok((await tous()).lupi === null, 'la migration se rejoue après l\'inverse');
  console.log(`\n${n}/${n} — banc 20261109010000 vert (Postgres jetable)`);
} finally {
  await client.end();
  if (embarque) await embarque.pg.stop();
}
