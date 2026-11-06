// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261106120000_fiche_annonces_vivantes_vente_lbc_enregistree
// (06/11, Nico, point 5 — version ÉTROITE du 1 c, PRÉPARÉE, NON APPLIQUÉE) — jamais la prod.
//   PREUVE_PG=embarque node scripts/essais/20261106120000_banc.mjs
// Corps de la PROD du 06/11 (fixtures/prod-0611-1c-etroite + leboncoin_transaction_lue de prod-0611-lecture-fraiche).
// Ce que le compte doit dire, avant / après / inverse, sur les formes RÉELLES relevées le 06/11 (cas_reels.sql) :
//   A. série de Louis : l'annonce vendue (Achat en cours, vente ENREGISTRÉE, reçu) + l'annonce remise en vente → 2 puis 1 ;
//   B. pièce unique du STOP (jocabroc8 / manon.simon14) : deux annonces Leboncoin, l'une « Achat en cours » SANS vente
//      enregistrée → 2 et 2 (inchangé : la question et le retrait gardent leur chemin) ;
//   C. fiche vendue sur Leboncoin (reçu), une seule annonce → 1 puis 0 (sous le seuil 2 dans les deux cas) ;
//   D. vente annulée : le reçu effacé → l'annonce recompte (2) ;
//   E. le reçu d'un AUTRE compte ne compte pas ; Vinted : jamais touché ; annonce disparue : jamais comptée.
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-1c-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port: 55445, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:banc@127.0.0.1:55445/postgres';
}
const DECOR = `
CREATE TABLE public.annonces_plateforme (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, listing_id text,
  inventaire_id bigint, statut_plateforme text DEFAULT 'en_ligne', disparu_le timestamptz, retiree_le timestamptz, ignoree_le timestamptz,
  transaction_plateforme text, capture jsonb);
CREATE TABLE public.ventes_operations (user_id uuid, cle text, resultat jsonb);
`;
const AVANT = [lire('scripts/essais/fixtures/prod-0611-lecture-fraiche/leboncoin_transaction_lue.sql') + ';',
  lire('scripts/essais/fixtures/prod-0611-1c-etroite/fiche_annonces_vivantes.sql') + ';'];
const MIGRATION = lire('supabase/migrations/20261106120000_fiche_annonces_vivantes_vente_lbc_enregistree.sql');
const INVERSE = lire('supabase/rollbacks/20261106120000_fiche_annonces_vivantes_vente_lbc_enregistree_INVERSE.sql');

const U = '00000000-0000-0000-0000-00000000000a', AUTRE = '00000000-0000-0000-0000-00000000000b';
let echecs = 0, n = 0;
const ok = (c, m, d = '') => { n++; console.log(`  ${c ? '✓' : '✗'} ${m}${c || !d ? '' : `   ← ${d}`}`); if (!c) echecs++; };
const db = new pg.Client({ connectionString: PG_URL });
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const compte = async (inv, pf = 'leboncoin') => Number((await q('SELECT public.fiche_annonces_vivantes($1, $2) c', [inv, pf]))[0].c);
const annonce = (inv, num, { tx = null, pf = 'leboncoin', u = U, disparue = false } = {}) => q(`INSERT INTO annonces_plateforme
  (user_id, platform, listing_id, inventaire_id, transaction_plateforme, disparu_le) VALUES ($1, $2, $3, $4, $5, $6)`,
  [u, pf, num, inv, tx, disparue ? new Date() : null]);
const recu = (num, u = U) => q(`INSERT INTO ventes_operations (user_id, cle, resultat) VALUES ($1, 'annonce:leboncoin:' || $2, '{}')`, [u, num]);

try {
  await db.query(DECOR);
  for (const s of AVANT) await db.query(s);
  // A. série (Louis 1790184183816 : 3295398035 Achat en cours + reçu ; remise 3303253932)
  await annonce(1, '3295398035', { tx: 'pending' }); await recu('3295398035'); await annonce(1, '3303253932');
  // B. pièce unique du STOP : deux annonces, l'une « Achat en cours » SANS vente enregistrée
  await annonce(2, '3200000001', { tx: 'pending' }); await annonce(2, '3200000002');
  // C. fiche vendue sur Leboncoin, reçu, une seule annonce encore listée « Vendu »
  await annonce(3, '3200000003', { tx: 'sold' }); await recu('3200000003');
  // D. vente annulée (reçu effacé) : posée comme A, le reçu sera retiré après la migration
  await annonce(4, '3200000004', { tx: 'pending' }); await recu('3200000004'); await annonce(4, '3200000005');
  // E. reçu d'un autre compte ; Vinted ; annonce disparue
  await annonce(5, '3200000006', { tx: 'pending' }); await recu('3200000006', AUTRE); await annonce(5, '3200000007');
  await annonce(6, '10000000001', { pf: 'vinted', tx: 'pending' }); await annonce(6, '10000000002', { pf: 'vinted' });
  await annonce(7, '3200000008', { tx: 'pending', disparue: true }); await recu('3200000008'); await annonce(7, '3200000009');

  console.log('0. AVANT (prod du 06/11)');
  const avant = { A: await compte(1), B: await compte(2), C: await compte(3), D: await compte(4), E: await compte(5), V: await compte(6, 'vinted'), X: await compte(7) };
  ok(JSON.stringify(avant) === JSON.stringify({ A: 2, B: 2, C: 1, D: 2, E: 2, V: 2, X: 1 }), 'comptes de prod : série 2 (la vente suivante refusée), pièce unique 2, vendue 1', JSON.stringify(avant));
  console.log('1. La migration');
  await db.query(MIGRATION);
  ok(await compte(1) === 1, 'A. série de Louis : l\'annonce dont la vente est enregistrée ne compte plus → 1 (la vente suivante passe)');
  ok(await compte(2) === 2, 'B. pièce unique du STOP : transaction NON enregistrée → 2, inchangé');
  ok(await compte(3) === 0, 'C. fiche vendue (reçu) : 1 → 0, sous le seuil 2 avant comme après');
  await q(`DELETE FROM ventes_operations WHERE cle = 'annonce:leboncoin:3200000004'`);
  ok(await compte(4) === 2, 'D. vente annulée (reçu effacé) : l\'annonce recompte → 2');
  ok(await compte(5) === 2, 'E. le reçu d\'un AUTRE compte ne compte pas → 2');
  ok(await compte(6, 'vinted') === 2, 'E. Vinted : jamais touché → 2');
  ok(await compte(7) === 1, 'E. annonce disparue : jamais comptée (comme avant) → 1');
  console.log('2. L\'inverse');
  await db.query(INVERSE);
  ok(await compte(1) === 2 && await compte(3) === 1, 'définition de prod rétablie (série 2, vendue 1)');
  const def = (await q(`SELECT pg_get_functiondef('public.fiche_annonces_vivantes(bigint,text)'::regprocedure) d`))[0].d.replace(/\r\n/g, '\n').trim();
  ok(def === lire('scripts/essais/fixtures/prod-0611-1c-etroite/fiche_annonces_vivantes.sql').trim(), 'mot pour mot la définition de prod');
} catch (e) {
  echecs++;
  console.error('✗ ERREUR :', e.message);
} finally {
  await db.end();
  if (embarque) { await embarque.pg.stop(); rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(`\n${n - echecs}/${n} vérifications, ${echecs} échec(s)`);
process.exit(echecs ? 1 : 0);
