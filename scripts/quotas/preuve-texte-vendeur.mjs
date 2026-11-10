// PREUVE, SUR UN POSTGRES JETABLE, de la migration 20261110170000_annonces_texte_vendeur_hors_quota (règle de Nico du
// 10/11/2026 : une rédaction qui reprend le titre ET la description du vendeur ne compte pas dans les annonces).
//
//   PREUVE_PG=embarque node scripts/quotas/preuve-texte-vendeur.mjs   (Postgres jetable sur le PC)
//
// Jamais la prod (refus si l'URL est celle de Supabase). Les fonctions « avant » sont celles de la PROD
// (scripts/quotas/fixtures/prod-1011-texte-vendeur.sql, lue le 10/11) ; les dépendances de spend_coins_for_generate
// (palier, cycle, garde-fou du jour, auth) sont des bouchons à valeur fixe : on ne prouve QUE ce qui change.
//   A. Le décompte, avant / après, sur les mêmes lignes : seule la passe légère sort ; tout le reste est identique.
//   B. Le guichet (spend_coins_for_generate) : la passe légère n'ouvre plus la « régénération sous 24 h ».
//   C. Le fichier de migration s'applique tel quel ; l'inverse rend les définitions de prod à l'octet près.
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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-texte-vendeur-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55441, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55441/postgres';
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const PROD = lire('./fixtures/prod-1011-texte-vendeur.sql');
const MIGRATION = lire('../../supabase/migrations/20261110170000_annonces_texte_vendeur_hors_quota.sql');
const INVERSE = lire('../../supabase/rollbacks/20261110170000_annonces_texte_vendeur_hors_quota_INVERSE.sql');

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
-- Bouchons : palier Free à 5 annonces, cycle commencé il y a 10 jours, aucun garde-fou du jour.
CREATE OR REPLACE FUNCTION public.jauge_annonces_plafond(u uuid, t text) RETURNS integer LANGUAGE sql AS $f$ SELECT 5 $f$;
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

// Une ligne generate_listing : `tv` = [titre du vendeur, description du vendeur] (null = clés absentes), il y a `h` heures.
async function ligne(user, { inv = null, tv = null, h = 48, source = null, feature = 'generate_listing', meta = {} } = {}) {
  const m = { ...meta };
  if (inv != null) m.inventaire_id = String(inv);
  if (tv) { m.texte_vendeur_titre = tv[0]; m.texte_vendeur_description = tv[1]; m.texte_vendeur_origine = 'vinted_sync'; }
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
  const empreinteProd = await empreinte();

  // ── Le décor : un compte par cas ─────────────────────────────────────────────────────────────────────────────
  const V = U(1);     // Vanessa : 5 passes légères (imports Vinted), rien d'autre
  for (let i = 1; i <= 5; i++) await ligne(V, { inv: 100 + i, tv: [true, true], h: 30 + i });
  const R = U(2);     // 5 vraies rédactions (texte de l'IA) + 2 scans Lens (1 unifié, 1 non) + 1 Lens unifié porté
  for (let i = 1; i <= 5; i++) await ligne(R, { inv: 200 + i, tv: [false, false], h: 30 + i });
  await ligne(R, { feature: 'lens', meta: { unifie: true } });
  await ligne(R, { feature: 'lens' });
  await ligne(R, { source: 'lens_unifie' });
  const M = U(3);     // cas mixtes : titre seul du vendeur, description seule, lignes d'avant le 21/09 (sans clés)
  await ligne(M, { inv: 301, tv: [true, false] });
  await ligne(M, { inv: 302, tv: [false, true] });
  await ligne(M, { inv: 303 });
  await ligne(M, { tv: [true, true] });           // item_data marqué vendeur (sans id)
  const D = U(4);     // la dédup 24 h
  await ligne(D, { inv: 401, tv: [false, false], h: 5 }); await ligne(D, { inv: 401, tv: [false, false], h: 4 });   // IA puis IA : 1
  await ligne(D, { inv: 402, tv: [true, true], h: 5 });   await ligne(D, { inv: 402, tv: [false, false], h: 4 });   // légère puis IA
  await ligne(D, { inv: 403, tv: [false, false], h: 5 }); await ligne(D, { inv: 403, tv: [true, true], h: 4 });     // IA puis légère : 1
  const G = U(5);     // le guichet : 5 passes légères, puis une demande sur l'article 501 (sa passe légère a 2 h)
  for (let i = 1; i <= 5; i++) await ligne(G, { inv: 500 + i, tv: [true, true], h: i === 1 ? 2 : 30 + i });
  const H = U(6);     // le guichet : 5 vraies rédactions (quota plein), demande sur l'une d'elles (régénération 24 h)
  for (let i = 1; i <= 5; i++) await ligne(H, { inv: 600 + i, tv: [false, false], h: i === 1 ? 2 : 30 + i });
  const L = U(7);     // le guichet : 4 vraies rédactions + la passe légère de l'article 701 il y a 2 h, puis 1 vraie
  for (let i = 2; i <= 5; i++) await ligne(L, { inv: 700 + i, tv: [false, false], h: 30 + i });
  await ligne(L, { inv: 701, tv: [true, true], h: 2 });
  await ligne(L, { inv: 799, tv: [false, false], h: 1 });

  console.log('A. Le décompte — AVANT (définition de prod)');
  const avant = {};
  for (const [nom, u] of Object.entries({ V, R, M, D, G, H, L })) avant[nom] = await compte(u);
  ok(avant.V === 5, `Vanessa : 5 passes légères comptées en prod (5 sur 5 — le défaut)`, `lu ${avant.V}`);
  ok(avant.R === 7, `5 rédactions IA + 1 Lens non unifié + 1 Lens unifié porté = 7`, `lu ${avant.R}`);
  const gAvant = await guichet(G, 501);
  ok(gAvant.allowed === true && gAvant.regen === true, `guichet d'avant : passe légère de 501 il y a 2 h → « régénération » ouverte`, JSON.stringify(gAvant));

  console.log('A. Le décompte — APRÈS (le fichier de migration, tel quel)');
  await q(MIGRATION);
  const apres = {};
  for (const [nom, u] of Object.entries({ V, R, M, D, G, H, L })) apres[nom] = await compte(u);
  ok(apres.V === 0, `Vanessa : 0 sur 5 — ses 5 annonces lui reviennent`, `lu ${apres.V}`);
  ok(apres.R === avant.R, `vraies rédactions et scans Lens : identiques (${apres.R})`, `avant ${avant.R}, après ${apres.R}`);
  ok(apres.M === 3, `titre seul du vendeur, description seule, ligne sans clés : comptent (3) ; item_data vendeur : non`, `lu ${apres.M}`);
  ok(avant.M === 4, `(avant : les 4 comptaient)`, `lu ${avant.M}`);
  ok(apres.D === 3, `dédup 24 h : IA+IA = 1 ; légère puis IA = 1 (la vraie compte) ; IA puis légère = 1 → 3`, `lu ${apres.D}`);
  ok(avant.D === 3, `(avant : 1 + 1 + 1 = 3, mais la passe légère comptait à la place de la vraie rédaction)`, `lu ${avant.D}`);

  console.log('B. Le guichet (spend_coins_for_generate)');
  const g = await guichet(G, 502);
  ok(g.allowed === true && g.regen === false, `5 passes légères : une vraie rédaction passe (0 consommée sur 5)`, JSON.stringify(g));
  const g501 = await guichet(G, 501);
  ok(g501.allowed === true && g501.regen === false, `la passe légère de 501 n'ouvre plus la « régénération » : la vraie rédaction passe au quota`, JSON.stringify(g501));
  const h = await guichet(H, 601);
  ok(h.allowed === true && h.regen === true, `quota plein de vraies rédactions : la régénération sous 24 h passe, comme avant`, JSON.stringify(h));
  const h2 = await guichet(H, 699);
  ok(h2.allowed === false && h2.reason === 'quota_annonces_atteint' && h2.consommes === 5, `quota plein : un nouvel article est refusé, comme avant`, JSON.stringify(h2));
  ok(apres.L === 5, `4 vraies + 1 passe légère + 1 vraie = 5 comptées`, `lu ${apres.L}`);
  const l = await guichet(L, 701);
  ok(l.allowed === false && l.reason === 'quota_annonces_atteint', `article 701 (passe légère il y a 2 h), quota plein : la vraie rédaction est refusée — avant, elle passait gratuitement`, JSON.stringify(l));

  console.log('C. L\'inverse');
  ok((await empreinte()) !== empreinteProd, `la migration a bien changé les deux fonctions`);
  await q(INVERSE);
  ok((await empreinte()) === empreinteProd, `l'inverse rend les définitions de prod à l'octet près`);
  ok((await compte(V)) === 5, `après l'inverse : Vanessa revient à 5 (le comportement de prod d'avant)`);
} catch (e) {
  echecs++;
  console.error('ERREUR :', e.message);
} finally {
  await client.end().catch(() => {});
  if (embarque) { await embarque.pg.stop().catch(() => {}); try { embarque.rmSync(embarque.dossier, { recursive: true, force: true }); } catch { /* rien */ } }
}
console.log(`\n${n - echecs}/${n} ${echecs ? '— ROUGE' : '— vert'}`);
process.exit(echecs ? 1 : 0);
