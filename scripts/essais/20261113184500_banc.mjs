// LE BANC de la migration 20261113184500_ebay_site_attente_jamais_expiree (13/11/2026, étape 4 L0, décision D9 de Nico :
// « AUCUNE tâche close ») — SUR UN POSTGRES JETABLE (embedded-postgres sur le poste), jamais la prod.
//   node scripts/essais/20261113184500_banc.mjs
// Décor : cross_post_jobs, inventaire et coin_reservations réduits aux colonnes que lit expire_publish_reservations ;
// republish_ts_safe et compte_en_pause_antirobot tels qu'en prod (pg_get_functiondef du 13/11) ; settle_publish_reservation
// neutre (aucune réservation « held » au parc depuis le 02/09). La définition d'AVANT est l'inverse (la prod du 13/11).
// Étapes : A. AVANT — la tâche eBay en attente de son site depuis 15 jours est FERMÉE (« attente_14j ») : le défaut ;
// B. MIGRATION — elle reste (ligne pas réécrite), à 31 jours aussi ; vendu / déjà en ligne la ferment toujours ; les autres
// attentes de plus de 14 jours, un autre site que eBay et le filet des 30 jours : inchangés ; seul le CASE a changé ;
// C. INVERSE — la définition de la prod revient à l'octet près, le défaut aussi ; D. MIGRATION rejouée — B de nouveau.
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
export const MIGRATION = 'supabase/migrations/20261113184500_ebay_site_attente_jamais_expiree.sql';
export const INVERSE = 'supabase/rollbacks/20261113184500_ebay_site_attente_jamais_expiree_INVERSE.sql';
const MD5_PROD = '6e03144a9eaaf0ec4bedfff20171df79';

const U = 'c7c382b7-0000-4000-8000-000000000001'; // préfixe du compte eBay UK c7c382b7 (id d'essai)
const V = '9ea76b27-0000-4000-8000-000000000002'; // préfixe du compte eBay US 9ea76b27
const J = (n) => `0000000${n}-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
// Les tâches : [id, user, inventaire, platform, action, status, âge (jours), platform_fields, listing_url]
const ATTENTE = `{"needs_user_source":"ebay_site_etranger","ebay_site_attente":{"site":"UK","geste":"attendre"},"hors_quota":true}`;
const TACHES = [
  [J(1), U, 101, 'ebay', 'publish', 'needs_user', 15, ATTENTE, null],                       // attente du site, 15 j (fc9fe66d)
  [J(2), U, 102, 'ebay', 'publish', 'needs_user', 31, ATTENTE, null],                       // attente du site, 31 j
  [J(3), U, 103, 'ebay', 'publish', 'needs_user', 15, ATTENTE, null],                       // attente, article VENDU
  [J(4), V, 104, 'ebay', 'publish', 'needs_user', 15, `{"needs_user_source":"ebay_compte_a_finir"}`, null], // autre attente eBay
  [J(5), V, 105, 'vinted', 'publish', 'needs_user', 15, ATTENTE, null],                     // même source, pas eBay
  [J(6), V, 106, 'ebay', 'publish', 'pending', 31, '{}', null],                             // filet des 30 jours
  [J(7), U, 107, 'ebay', 'publish', 'needs_user', 2, ATTENTE, null],                        // attente récente
  [J(8), U, 108, 'ebay', 'publish', 'needs_user', 15, ATTENTE, null],                       // attente, déjà en ligne ailleurs
  [J(9), U, 108, 'ebay', 'publish', 'published', 20, '{}', 'https://www.ebay.fr/itm/300000000008'],
];

const PRELUDE = String.raw`
CREATE TABLE public.inventaire (id bigint PRIMARY KEY, statut text);
CREATE TABLE public.coin_reservations (id uuid PRIMARY KEY, status text, created_at timestamptz DEFAULT now(), unit_price integer, expired_at timestamptz);
CREATE TABLE public.cross_post_jobs (
  id uuid PRIMARY KEY, user_id uuid NOT NULL, inventaire_id bigint, platform text, action text, status text, error text,
  platform_fields jsonb, listing_url text, platform_listing_id text, published_at timestamptz, sold_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), reservation_id uuid, reservation_settled_at timestamptz);
CREATE FUNCTION public.settle_publish_reservation(p_reservation uuid, p_mode text, p_amount integer DEFAULT NULL, p_reason text DEFAULT NULL)
 RETURNS void LANGUAGE sql AS $f$ SELECT NULL::void $f$;
-- Tels qu'en prod (pg_get_functiondef, 13/11).
CREATE OR REPLACE FUNCTION public.republish_ts_safe(p_pf jsonb, p_key text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (p_pf ->> p_key)::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION public.compte_en_pause_antirobot(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM cross_post_jobs j
     WHERE j.user_id = p_user AND j.platform = 'vinted' AND j.status = 'pending'
       AND j.platform_fields ? 'attente_antirobot_compte');
$function$;
`;

async function decor(c) {
  await c.query('TRUNCATE public.cross_post_jobs, public.inventaire, public.coin_reservations');
  for (const [, , inv] of TACHES) await c.query('INSERT INTO public.inventaire (id, statut) VALUES ($1, $2) ON CONFLICT DO NOTHING', [inv, inv === 103 ? 'vendu' : 'stock']);
  for (const [id, u, inv, p, a, s, jours, pf, url] of TACHES) {
    await c.query(`INSERT INTO public.cross_post_jobs (id, user_id, inventaire_id, platform, action, status, platform_fields, listing_url, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, now() - make_interval(days => $9))`, [id, u, inv, p, a, s, pf, url, jours]);
  }
}

export async function demarrer(port) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-ebay-site-attente-'));
  const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await base.initialise(); await base.start();
  const c = new pg.Client({ connectionString: `postgres://postgres:banc@127.0.0.1:${port}/postgres` });
  await c.connect(); c.on('notice', () => {});
  await c.query(PRELUDE);
  const arreter = async () => { await c.end().catch(() => {}); await base.stop().catch(() => {}); try { rmSync(dossier, { recursive: true, force: true }); } catch { /* temp */ } };
  return { c, arreter };
}

const etat = async (c) => {
  const r = (await c.query(`SELECT id::text, status, platform_fields #>> '{expiree_sans_reservation,motif}' motif, xmin::text x FROM public.cross_post_jobs ORDER BY id`)).rows;
  return Object.fromEntries(r.map((l) => [l.id, l]));
};
const definition = async (c) => (await c.query(`SELECT pg_get_functiondef('public.expire_publish_reservations'::regproc) d`)).rows[0].d;
const md5 = async (c) => (await c.query(`SELECT md5(pg_get_functiondef('public.expire_publish_reservations'::regproc)) h`)).rows[0].h;

async function tourAvant(c, ok, prefixe) {
  await decor(c);
  const x0 = await etat(c);
  const r = (await c.query('SELECT public.expire_publish_reservations() r')).rows[0].r;
  const e = await etat(c);
  ok(r.sans_reservation === 7, `${prefixe} : 7 fermetures, dont les deux attentes du site eBay`, r);
  ok(e[J(1)].status === 'cancelled' && e[J(1)].motif === 'attente_14j', `${prefixe} : l'attente du site eBay (15 j) est FERMÉE « attente_14j » — le défaut`, e[J(1)]);
  ok(e[J(2)].status === 'cancelled', `${prefixe} : à 31 j aussi`, e[J(2)]);
  ok(e[J(7)].status === 'needs_user' && e[J(7)].x === x0[J(7)].x, `${prefixe} : l'attente récente (2 j) n'est pas touchée`);
}

async function tourMigration(c, ok, prefixe) {
  await decor(c);
  const x0 = await etat(c);
  const r = (await c.query('SELECT public.expire_publish_reservations() r')).rows[0].r;
  const e = await etat(c);
  ok(e[J(1)].status === 'needs_user' && e[J(1)].x === x0[J(1)].x, `${prefixe} : l'attente du site eBay (15 j) RESTE — ligne pas réécrite (xmin identique)`, e[J(1)]);
  ok(e[J(2)].status === 'needs_user' && e[J(2)].x === x0[J(2)].x, `${prefixe} : à 31 j aussi (ni « attente_14j » ni « filet_30j »)`, e[J(2)]);
  ok(e[J(3)].status === 'cancelled' && e[J(3)].motif === 'article_vendu', `${prefixe} : article VENDU → fermée quand même (« article_vendu », règle commune)`, e[J(3)]);
  ok(e[J(8)].status === 'cancelled' && e[J(8)].motif === 'deja_en_ligne', `${prefixe} : déjà en ligne sur eBay → fermée quand même (« deja_en_ligne »)`, e[J(8)]);
  ok(e[J(4)].status === 'cancelled' && e[J(4)].motif === 'attente_14j', `${prefixe} : une autre attente eBay (« compte à finir », 15 j) : inchangée (fermée « attente_14j »)`, e[J(4)]);
  ok(e[J(5)].status === 'cancelled' && e[J(5)].motif === 'attente_14j', `${prefixe} : la même source sur une autre plateforme : inchangée (fermée)`, e[J(5)]);
  ok(e[J(6)].status === 'cancelled' && e[J(6)].motif === 'filet_30j', `${prefixe} : une publication eBay en file depuis 31 j : inchangée (« filet_30j »)`, e[J(6)]);
  ok(e[J(7)].status === 'needs_user' && e[J(7)].x === x0[J(7)].x, `${prefixe} : l'attente récente n'est pas touchée`);
  ok(r.sans_reservation === 5, `${prefixe} : 5 fermetures (vendu, déjà en ligne, autre attente, autre plateforme, 30 j) au lieu de 7 avant`, r);
}

const principal = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (principal) {
  let n = 0, ko = 0;
  const ok = (cond, msg, d) => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 700)}`}`); } };
  const { c, arreter } = await demarrer(58000 + Math.floor(Math.random() * 2000));
  try {
    console.log('A. AVANT — la prod du 13/11 (la définition de l\'inverse)');
    await c.query(lire(INVERSE));
    const hA = await md5(c);
    ok(hA === MD5_PROD, `A : pg_get_functiondef identique à la prod (md5 ${MD5_PROD})`, hA);
    const defA = await definition(c);
    await tourAvant(c, ok, 'A');

    console.log('B. MIGRATION');
    await c.query(lire(MIGRATION));
    const defB = await definition(c);
    const lignesA = defA.split('\n'), lignesB = defB.split('\n');
    const ajoutees = lignesB.filter((l) => !lignesA.includes(l));
    ok(lignesA.every((l) => lignesB.includes(l)) && ajoutees.length === 5 && ajoutees.some((l) => /needs_user_source' = 'ebay_site_etranger' THEN NULL/.test(l)),
      'B : seules 5 lignes ajoutées (3 de commentaire + le WHEN) ; aucune ligne de la prod retirée', ajoutees);
    const dr = (await c.query(`SELECT prosecdef s, proowner::regrole::text o FROM pg_proc WHERE proname = 'expire_publish_reservations'`)).rows[0];
    ok(dr.s === true && dr.o === 'postgres', 'B : SECURITY DEFINER et propriétaire gardés', dr);
    await tourMigration(c, ok, 'B');

    console.log('C. INVERSE');
    await c.query(lire(INVERSE));
    ok(await md5(c) === MD5_PROD, 'C : la définition de la prod revient à l\'octet près');
    await tourAvant(c, ok, 'C');

    console.log('D. MIGRATION rejouée');
    await c.query(lire(MIGRATION));
    await tourMigration(c, ok, 'D');
  } finally { await arreter(); }
  console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ''}`);
  process.exit(ko ? 1 : 0);
}
