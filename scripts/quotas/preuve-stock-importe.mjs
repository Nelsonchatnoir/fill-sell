// PREUVE, SUR UN POSTGRES JETABLE, de la migration 20261121010000_stock_importe_hors_quota (règle de Nico du
// 21/11/2026 : le stock existant — un article importé d'une plateforme — ne compte JAMAIS dans le quota d'annonces,
// même quand sa description d'origine est vide ou non lue).
//
//   PREUVE_PG=embarque node scripts/quotas/preuve-stock-importe.mjs   (Postgres jetable sur le PC)
//
// Jamais la prod (refus si l'URL est celle de Supabase). La fonction « avant » est celle de la PROD
// (scripts/quotas/fixtures/prod-2111-stock-importe.sql, md5 6e2f60f0… lu le 21/11) ; spend_coins_for_generate est celle
// de la prod (migration 20261111230000, md5 4cb2f80f… identique à la prod), INCHANGÉE ; ses dépendances (palier, cycle,
// garde-fou du jour, auth) sont des bouchons à valeur fixe : on ne prouve QUE ce qui change.
//   A. Le décompte, avant / après, sur les mêmes lignes : seuls les articles importés sortent ; tout le reste est identique.
//   B. Le guichet (spend_coins_for_generate, inchangé) lit le nouveau décompte : une vraie création passe ou est refusée
//      sur les seules vraies créations.
//   C. Le fichier de migration s'applique tel quel ; l'inverse rend la définition de prod à l'octet près.
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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-stock-importe-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55443, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55443/postgres';
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const PROD = lire('./fixtures/prod-2111-stock-importe.sql');
const MIGRATION = lire('../../supabase/migrations/20261121010000_stock_importe_hors_quota.sql');
const INVERSE = lire('../../supabase/rollbacks/20261121010000_stock_importe_hors_quota_INVERSE.sql');
// Le guichet de prod (inchangé par la migration) : extrait de la migration du 11/11, identique à la prod (md5 4cb2f80f…).
const M1111 = lire('../../supabase/migrations/20261111230000_essai_cloud_seul_droits_pro.sql');
const iG = M1111.lastIndexOf('CREATE OR REPLACE FUNCTION public.spend_coins_for_generate');
const GUICHET = M1111.slice(iG, M1111.indexOf('$function$;', iG)) + '$function$;';

const DECOR = String.raw`
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $f$ SELECT NULL::text $f$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $f$ SELECT NULL::uuid $f$;
CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE public.usage_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, feature text, metadata jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.coin_config (key text PRIMARY KEY, value numeric);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, is_premium boolean DEFAULT false, is_pro boolean DEFAULT false, is_business boolean DEFAULT false, is_comped boolean DEFAULT false);
CREATE TABLE public.inventaire (id bigint PRIMARY KEY, user_id uuid);
CREATE TABLE public.coin_wallets (user_id uuid PRIMARY KEY, included_balance integer DEFAULT 0, purchased_balance integer DEFAULT 0, next_grant_at timestamptz, updated_at timestamptz);
CREATE TABLE public.coin_ledger (user_id uuid, delta integer, included_after integer, purchased_after integer, kind text, metadata jsonb);
-- Bouchons : 5 annonces au palier, cycle commencé il y a 10 jours, aucun garde-fou du jour.
CREATE OR REPLACE FUNCTION public.jauge_annonces_plafond(u uuid, t text) RETURNS integer LANGUAGE sql AS $f$ SELECT 5 $f$;
CREATE OR REPLACE FUNCTION public.palier_de(u uuid) RETURNS text LANGUAGE sql AS $f$ SELECT 'pro'::text $f$;
CREATE OR REPLACE FUNCTION public.debut_cycle_quotas(u uuid) RETURNS timestamptz LANGUAGE sql AS $f$ SELECT now() - interval '10 days' $f$;
CREATE OR REPLACE FUNCTION public.garde_fou_jour(u uuid, j text, a integer) RETURNS jsonb LANGUAGE sql AS $f$ SELECT NULL::jsonb $f$;
CREATE OR REPLACE FUNCTION public.upgrade_monthly_grant(u uuid, t text, x text, y text) RETURNS void LANGUAGE sql AS $f$ SELECT $f$;
INSERT INTO public.coin_config VALUES ('price_generate', 0), ('quotas_annonces_depuis', 0);
`;

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let echecs = 0, n = 0;
const ok = (c, m, d = '') => { n++; console.log(`  ${c ? '✓' : '✗'} ${m}${c || !d ? '' : `   ← ${d}`}`); if (!c) echecs++; };

const client = new pg.Client({ connectionString: PG_URL });
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;
const un = async (sql, params = []) => (await q(sql, params))[0];

// Une ligne generate_listing : `o` = texte_vendeur_origine (undefined = clé absente), `tv` = [titre, description] du
// vendeur (null = clés absentes), `inv` = inventaire_id (null = corps item_data), il y a `h` heures.
async function ligne(user, { inv = null, o, tv = [false, false], h = 48, source = null, feature = 'generate_listing', meta = {} } = {}) {
  const m = { ...meta };
  if (inv != null) m.inventaire_id = String(inv);
  if (tv) { m.texte_vendeur_titre = tv[0]; m.texte_vendeur_description = tv[1]; }
  if (o !== undefined) m.texte_vendeur_origine = o;
  if (source) m.source = source;
  await q(`INSERT INTO public.usage_logs (user_id, feature, metadata, created_at) VALUES ($1, $2, $3::jsonb, now() - ($4::text || ' hours')::interval)`,
    [user, feature, JSON.stringify(m), String(h)]);
}
const compte = async (user) => (await un(`SELECT public.quota_annonces_consommees($1, now() - interval '10 days') AS c`, [user])).c;
const guichet = async (user, inv = null) => (await un(`SELECT public.spend_coins_for_generate($1, $2) AS r`, [user, inv])).r;
const empreinte = async () => (await q(`SELECT p.proname, md5(pg_get_functiondef(p.oid)) m FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
  WHERE s.nspname = 'public' AND p.proname IN ('quota_annonces_consommees','spend_coins_for_generate') ORDER BY 1`)).map((r) => `${r.proname}:${r.m}`).join(' ');

try {
  await q(DECOR);
  await q(PROD);
  await q(GUICHET);
  const eP = await empreinte();
  ok(eP.includes('quota_annonces_consommees:6e2f60f0c9fd6d67797f182e81d84f86') && eP.includes('spend_coins_for_generate:4cb2f80f99735a654b470ee6df9f72a9'),
    'décor : les deux définitions de PROD, à l\'octet près (md5 de pg_get_functiondef)', eP);

  // ── Le décor : un compte par cas ─────────────────────────────────────────────────────────────────────────────
  const M = U(1);     // 0c97dc8b : 5 imports Vinted au titre du vendeur mais SANS sa description (lecture non faite)
  for (let i = 1; i <= 5; i++) await ligne(M, { inv: 100 + i, o: 'vinted_sync', tv: [true, false], h: 30 + i });
  const I = U(2);     // un import par plateforme, textes de l'IA (rien du vendeur) : Leboncoin, Beebs, eBay, Depop, Opla
  for (const [k, p] of ['leboncoin', 'beebs', 'ebay', 'depop', 'opla'].entries()) await ligne(I, { inv: 200 + k, o: `releve_${p}`, tv: [false, false] });
  const C = U(3);     // les VRAIES créations : fiche neuve (origine nulle), corps item_data, scan Lens unifié porté, Lens seul
  await ligne(C, { inv: 301, o: null });
  await ligne(C, { inv: 302 });                                   // ligne d'avant le 21/09 : sans clés
  await ligne(C, { o: null, source: 'lens_unifie', tv: null });   // scan unifié (item_data, sans id)
  await ligne(C, { feature: 'lens', tv: null });                  // scan non unifié : 1
  await ligne(C, { feature: 'lens', tv: null, meta: { unifie: true } });   // scan unifié : porté par sa ligne
  const F = U(4);     // les faux amis : un corps item_data qui SE DIT importé (pas de fiche), une origine inconnue
  await ligne(F, { o: 'vinted_sync' });                           // sans inventaire_id : compte
  await ligne(F, { inv: 401, o: 'releve_' });                     // « releve_ » sans plateforme : compte
  await ligne(F, { inv: 402, o: 'relevez_leboncoin' });           // pas un relevé : compte
  await ligne(F, { inv: 403, o: 'lens' });                        // fiche Lens : compte
  const P = U(5);     // la passe légère du 10/11 : inchangée (hors quota avant comme après)
  await ligne(P, { inv: 501, o: 'vinted_sync', tv: [true, true] });
  await ligne(P, { inv: 502, o: null, tv: [true, true] });        // saisie au stock, texte du vendeur : hors quota (10/11)
  const D = U(6);     // la dédup 24 h des vraies créations : inchangée
  await ligne(D, { inv: 601, o: null, h: 5 }); await ligne(D, { inv: 601, o: null, h: 4 });   // IA puis IA : 1
  await ligne(D, { inv: 602, o: 'vinted_sync', h: 5 }); await ligne(D, { inv: 602, o: 'vinted_sync', h: 4 }); // importé x2 : 0
  const G = U(7);     // le guichet : 5 imports sans description (le cas de 0c97dc8b), puis une vraie création
  for (let i = 1; i <= 5; i++) await ligne(G, { inv: 700 + i, o: 'vinted_sync', tv: [true, false], h: 30 + i });
  const H = U(8);     // le guichet : 5 vraies créations (quota plein) + 3 imports, puis une nouvelle vraie création
  for (let i = 1; i <= 5; i++) await ligne(H, { inv: 800 + i, o: null, h: 30 + i });
  for (let i = 1; i <= 3; i++) await ligne(H, { inv: 810 + i, o: 'releve_leboncoin', h: 20 + i });

  const comptes = { M, I, C, F, P, D, G, H };
  console.log('A. Le décompte — AVANT (définition de prod)');
  const avant = {};
  for (const [nom, u] of Object.entries(comptes)) avant[nom] = await compte(u);
  ok(avant.M === 5, '0c97dc8b : 5 imports sans description comptés en prod (5 sur 5 — le défaut)', `lu ${avant.M}`);
  ok(avant.I === 5, 'un import par plateforme, texte de l\'IA : 5 comptés en prod', `lu ${avant.I}`);
  ok(avant.C === 4, 'vraies créations : fiche neuve + ligne sans clés + Lens unifié + Lens seul = 4', `lu ${avant.C}`);
  const gAvant = await guichet(G, 799);
  ok(gAvant.allowed === false && gAvant.reason === 'quota_annonces_atteint', 'guichet d\'avant : 5 imports → une vraie création REFUSÉE (le défaut)', JSON.stringify(gAvant));

  console.log('A. Le décompte — APRÈS (le fichier de migration, tel quel)');
  await q(MIGRATION);
  const apres = {};
  for (const [nom, u] of Object.entries(comptes)) apres[nom] = await compte(u);
  ok(apres.M === 0, '0c97dc8b : 0 sur 5 — le stock existant ne compte jamais, même sans sa description', `lu ${apres.M}`);
  ok(apres.I === 0, 'Leboncoin, Beebs, eBay, Depop, Opla importés : 0', `lu ${apres.I}`);
  ok(apres.C === avant.C, `vraies créations (fiche neuve, item_data, scans Lens) : identiques (${apres.C})`, `avant ${avant.C}, après ${apres.C}`);
  ok(apres.F === 4 && avant.F === 4, 'faux amis (item_data qui se dit importé, « releve_ » seul, « relevez_… », fiche Lens) : comptent, avant comme après (4)', `avant ${avant.F}, après ${apres.F}`);
  ok(apres.P === 0 && avant.P === 0, 'passe légère du 10/11 : hors quota avant comme après', `avant ${avant.P}, après ${apres.P}`);
  ok(apres.D === 1 && avant.D === 2, 'dédup 24 h : IA+IA = 1 (inchangé) ; l\'import compté 1 avant, 0 après', `avant ${avant.D}, après ${apres.D}`);

  console.log('B. Le guichet (spend_coins_for_generate, inchangé) lit le nouveau décompte');
  const g = await guichet(G, 799);
  ok(g.allowed === true && g.regen === false, '5 imports sans description : une vraie création passe (0 consommée sur 5)', JSON.stringify(g));
  ok(apres.H === 5 && avant.H === 8, 'quota plein de vraies créations : 5 (les 3 imports ne comptent plus ; avant 8)', `avant ${avant.H}, après ${apres.H}`);
  const h = await guichet(H, 899);
  ok(h.allowed === false && h.reason === 'quota_annonces_atteint' && h.consommes === 5, 'quota plein de vraies créations : une nouvelle création est refusée, comme avant (5 sur 5)', JSON.stringify(h));
  await ligne(H, { inv: 899, o: null, h: 2 });
  const hr = await guichet(H, 899);
  ok(hr.allowed === true && hr.regen === true, 'la régénération sous 24 h d\'une vraie création : passe sans compter, comme avant', JSON.stringify(hr));
  ok((await compte(H)) === 6, '… et cette vraie création compte (6)', `lu ${await compte(H)}`);

  console.log('C. L\'inverse');
  const eM = await empreinte();
  ok(eM !== eP && eM.includes('spend_coins_for_generate:4cb2f80f99735a654b470ee6df9f72a9'), 'la migration change quota_annonces_consommees, et elle seule');
  await q(INVERSE);
  ok((await empreinte()) === eP, 'l\'inverse rend la définition de prod à l\'octet près');
  ok((await compte(M)) === 5, 'après l\'inverse : 0c97dc8b revient à 5 (le comportement de prod d\'avant)');
} catch (e) {
  echecs++;
  console.error('ERREUR :', e.message);
} finally {
  await client.end().catch(() => {});
  if (embarque) { await embarque.pg.stop().catch(() => {}); try { embarque.rmSync(embarque.dossier, { recursive: true, force: true }); } catch { /* rien */ } }
}
console.log(`\n${n - echecs}/${n} ${echecs ? '— ROUGE' : '— vert'}`);
process.exit(echecs ? 1 : 0);
