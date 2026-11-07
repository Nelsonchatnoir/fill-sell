// PREUVE, SUR UN POSTGRES JETABLE, de la migration 20261107140000_annonce_vendue_jamais_en_ligne (07/11, point 1) :
//   1. une annonce PRISE PAR UNE VENTE (transaction lue « pending »/« sold », vente enregistrée, job « sold », job publié
//      avec sale_signal 'sold') ne compte jamais comme « en ligne » : trancher_publications_sans_lien (deux boucles,
//      fiche et compte relié), depot_jamais_en_ligne_refermer (autre annonce de la fiche), article_en_ligne_ailleurs ;
//   2. une VRAIE annonce en ligne de la fiche (sans vente) ferme toujours le dépôt comme avant (pas de doublon) ;
//   3. la règle de rejugement : un dépôt clos à tort (vente prouvée AVANT la clôture, dépôt jamais vu, aucune annonce
//      non vendue en ligne) passe « failed » avec le motif vrai, une fois ; sinon il n'est pas touché ;
//   4. « rien n'est vendu » ne s'écrit plus sur une remise en vente ;
//   5. l'inverse rend les trois définitions de prod à l'identique (md5) et retire les aides.
//
//   PREUVE_PG=embarque node scripts/preuve-annonce-vendue-jamais-en-ligne.mjs   (Postgres jetable sur le PC)
//
// Jamais la prod. Les définitions de départ sont celles de PROD du 07/11 (portées par l'inverse, mot pour mot).
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-annonce-vendue-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55451, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55451/postgres';
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = lire('../supabase/migrations/20261107140000_annonce_vendue_jamais_en_ligne.sql');
const INVERSE = lire('../supabase/rollbacks/20261107140000_annonce_vendue_jamais_en_ligne_INVERSE.sql');

// Le banc : les colonnes lues par ces fonctions, et leurs dépendances (définitions de prod du 07/11, sauf trois
// bouchons dits comme tels : releve_preuve_absence, refund_publish_unconfirmed, fonctions Beebs non exercées).
const BANC = String.raw`
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE TABLE cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, inventaire_id bigint, platform text,
  action text, status text, error text, platform_fields jsonb, platform_listing_id text, listing_url text, price numeric,
  published_at timestamptz, created_at timestamptz DEFAULT now(), sold_at timestamptz, vu_en_ligne_le timestamptz, reservation_id uuid);
CREATE TABLE annonces_plateforme (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, listing_id text,
  url text, photo_url text, statut_plateforme text, inventaire_id bigint, job_id uuid, run_id uuid, vu_le timestamptz DEFAULT now(),
  disparu_le timestamptz, retiree_le timestamptz, ignoree_le timestamptz, transaction_plateforme text, capture jsonb,
  created_at timestamptz DEFAULT now(), UNIQUE (user_id, platform, listing_id));
CREATE TABLE vinted_sync_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, kind text, status text,
  started_at timestamptz, finished_at timestamptz, vinted_user_id text, erreur text, items_vus int, total_entries int);
CREATE TABLE ventes_operations (user_id uuid, cle text, PRIMARY KEY (user_id, cle));
CREATE TABLE inventaire (id bigint PRIMARY KEY, user_id uuid, photos jsonb, fusionne_dans bigint);
CREATE TABLE photo_empreintes (url text, dhash text);
CREATE TABLE fiches_liees_comptes (fiche_a bigint, fiche_b bigint, user_a uuid, user_b uuid);
CREATE TABLE comptes_lies (user_a uuid, user_b uuid);
CREATE TABLE sync_import_ecartes (user_id uuid, motif text);
CREATE TABLE rendus (job uuid, le timestamptz DEFAULT now());
CREATE OR REPLACE FUNCTION public.refund_publish_unconfirmed(p_job uuid) RETURNS jsonb LANGUAGE plpgsql AS $f$
BEGIN INSERT INTO rendus(job) VALUES (p_job); RETURN jsonb_build_object('rembourse', 0, 'raison', 'banc'); END $f$;
CREATE OR REPLACE FUNCTION public.releve_preuve_absence(p_run uuid) RETURNS boolean LANGUAGE sql AS $f$
  SELECT EXISTS (SELECT 1 FROM vinted_sync_runs r WHERE r.id = p_run AND r.status = 'done' AND r.kind = 'annonces'
                  AND coalesce(r.items_vus, 0) > 0 AND r.finished_at IS NOT NULL) $f$;
CREATE OR REPLACE FUNCTION public.beebs_preuve_jamais_en_ligne(uuid, text, timestamptz, numeric, jsonb, uuid) RETURNS jsonb LANGUAGE sql AS $f$ SELECT NULL::jsonb $f$;
CREATE OR REPLACE FUNCTION public.beebs_message_jamais_en_ligne(jsonb, boolean, text) RETURNS text LANGUAGE sql AS $f$ SELECT 'beebs' $f$;
CREATE OR REPLACE FUNCTION public.comptes_sont_lies(p_a uuid, p_b uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public' AS $function$
  select exists (select 1 from public.comptes_lies c where c.user_a = least(p_a, p_b) and c.user_b = greatest(p_a, p_b))
$function$;
CREATE OR REPLACE FUNCTION public.leboncoin_transaction_lue(p_colonne text, p_capture jsonb)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN nullif(btrim(p_colonne), '') IS NOT NULL THEN left(lower(btrim(p_colonne)), 40)
    WHEN jsonb_typeof(p_capture -> 'attributs_bruts') = 'array' THEN coalesce(
      (SELECT left(lower(btrim(e ->> 'value')), 40) FROM jsonb_array_elements(p_capture -> 'attributs_bruts') e
        WHERE e ->> 'key' = 'transaction_status' AND nullif(btrim(e ->> 'value'), '') IS NOT NULL LIMIT 1),
      'aucune')
    ELSE NULL END;
$function$;
-- Définitions de PROD du 07/11 (pg_get_functiondef).
CREATE OR REPLACE FUNCTION public._ts_ou_null(p text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN RETURN NULL; END IF;
  RETURN p::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END
$function$
;
CREATE OR REPLACE FUNCTION public.annonce_id_de_job(p_listing_id text, p_listing_url text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(
    NULLIF(btrim(p_listing_id), ''),
    substring(p_listing_url from '/itm/([0-9]+)'),
    substring(p_listing_url from '/items/([0-9]+)'),
    substring(p_listing_url from '/([0-9]{6,})(?:[/?#]|$)')
  );
$function$
;
CREATE OR REPLACE FUNCTION public.annonce_id_depuis_url(p_platform text, p_url text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE lower(COALESCE(p_platform, ''))
    WHEN 'leboncoin' THEN substring(COALESCE(p_url, '') from '/(\d{6,})(?:[/?#]|$)')
    WHEN 'beebs'     THEN substring(COALESCE(p_url, '') from '/p/(\d+)(?:[-/?#]|$)')
    WHEN 'opla'      THEN substring(COALESCE(p_url, '') from '(art_[A-Za-z0-9_-]+)')
    WHEN 'depop'     THEN substring(COALESCE(p_url, '') from '/products/([A-Za-z0-9_]+-[A-Za-z0-9-]*[A-Za-z0-9])')  -- (18/10) « _ » admis : pseudo du vendeur (thard_733-…)
    WHEN 'ebay'      THEN substring(COALESCE(p_url, '') from '/itm/(?:[^/?#]*/)?(\d{9,})')
    ELSE NULL END
$function$
;
CREATE OR REPLACE FUNCTION public.annonce_id_job(p_platform text, p_url text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case lower(coalesce(p_platform, ''))
    when 'vinted' then substring(coalesce(p_url, '') from '/items/(\d+)')
    else public.annonce_id_depuis_url(p_platform, p_url)
  end;
$function$
;
CREATE OR REPLACE FUNCTION public.boutique_partagee_compte_relie(p_user uuid, p_autre uuid, p_platform text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(p_platform, '') not in ('', 'vinted')
     and public.comptes_sont_lies(p_user, p_autre)
     and exists (select 1 from public.sync_import_ecartes e
                  where e.user_id in (p_user, p_autre) and e.motif = 'compte_relie:' || p_platform)
$function$
;

CREATE OR REPLACE FUNCTION public.jumelle_occupe_plateformes(p_user uuid, p_fiche bigint)
 RETURNS TABLE(platform text, listing_id text, url text, statut text, compte uuid, fiche bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  with p as (
    select f.fiche_b as fiche, f.user_b as compte from public.fiches_liees_comptes f where f.fiche_a = p_fiche and f.user_a = p_user
    union
    select f.fiche_a, f.user_a from public.fiches_liees_comptes f where f.fiche_b = p_fiche and f.user_b = p_user
  ), vivantes as (
    select a.platform, a.listing_id, a.url, a.statut_plateforme as statut, p.compte, p.fiche, 1 as rang
      from p
      join public.inventaire i on i.id = p.fiche and i.user_id = p.compte and i.fusionne_dans is null
      join public.annonces_plateforme a on a.user_id = p.compte and a.inventaire_id = p.fiche
       and a.disparu_le is null and a.statut_plateforme in ('en_ligne', 'en_verification')
  )
  select distinct on (v.platform) v.platform, v.listing_id, v.url, v.statut, v.compte, v.fiche
    from vivantes v
   where public.boutique_partagee_compte_relie(p_user, v.compte, v.platform)
   order by v.platform, v.rang, v.listing_id
$function$;
`;

const client = new pg.Client({ connectionString: PG_URL });
await client.connect();
let ok = 0, ko = 0;
const verifier = (cond, msg) => { if (cond) { ok++; console.log('  ✓', msg); } else { ko++; console.log('  ✗', msg); } };
const q = async (sql, args = []) => (await client.query(sql, args)).rows;
const md5 = (s) => createHash('md5').update(s.replace(/\r/g, '')).digest('hex');
const defs = async () => Object.fromEntries((await q(`SELECT p.proname, pg_get_functiondef(p.oid) d FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('trancher_publications_sans_lien','depot_jamais_en_ligne_refermer','article_en_ligne_ailleurs')`)).map((r) => [r.proname, md5(r.d)]));

try {
  await client.query(BANC);
  // Départ = la prod du 07/11 (l'inverse porte ses définitions mot pour mot ; ses DROP IF EXISTS ne trouvent rien).
  await client.query(INVERSE);
  const avant = await defs();
  verifier(Object.keys(avant).length === 3, 'départ : les trois définitions de prod sont posées');

  await client.query(MIGRATION);
  await client.query(MIGRATION); // rejouable
  verifier(true, 'la migration s\'applique, deux fois de suite');

  const U = '11111111-1111-1111-1111-111111111111', V = '22222222-2222-2222-2222-222222222222';
  const ins = async (table, o) => {
    const k = Object.keys(o);
    return (await q(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, Object.values(o)))[0];
  };
  const h = (n) => new Date(Date.now() - n * 3600_000).toISOString();
  const R1 = (await ins('vinted_sync_runs', { user_id: U, platform: 'leboncoin', kind: 'annonces', status: 'done', started_at: h(6), finished_at: h(5.9), items_vus: 400, total_entries: 400 })).id;
  const R2 = (await ins('vinted_sync_runs', { user_id: U, platform: 'leboncoin', kind: 'annonces', status: 'done', started_at: h(0.2), finished_at: h(0.1), items_vus: 400, total_entries: 400 })).id;
  for (const f of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) await ins('inventaire', { id: f, user_id: U, photos: '[]' });
  await ins('inventaire', { id: 109, user_id: V, photos: '[]' });

  // A. Louis : la vendue « active » sous transaction pending ; la remise, jamais vue → refus (failed), jamais « en ligne ailleurs ».
  await ins('cross_post_jobs', { user_id: U, inventaire_id: 1, platform: 'leboncoin', action: 'republish', status: 'sold', platform_listing_id: '3297400164', sold_at: h(20), published_at: h(200) });
  await ins('annonces_plateforme', { user_id: U, platform: 'leboncoin', listing_id: '3297400164', url: 'https://www.leboncoin.fr/ad/electromenager/3297400164', statut_plateforme: 'en_ligne', inventaire_id: 1, transaction_plateforme: 'pending' });
  const A = await ins('cross_post_jobs', { user_id: U, inventaire_id: 1, platform: 'leboncoin', action: 'publish', status: 'published', platform_listing_id: '3303702852', published_at: h(12), platform_fields: JSON.stringify({ remise_en_vente: { annonce_vendue: '3297400164' } }) });
  // B. Une VRAIE annonce en ligne de la fiche (sans transaction) : clôture « en ligne ailleurs » comme avant.
  await ins('annonces_plateforme', { user_id: U, platform: 'leboncoin', listing_id: '3000000002', url: 'https://www.leboncoin.fr/ad/x/3000000002', statut_plateforme: 'en_ligne', inventaire_id: 2, transaction_plateforme: 'aucune' });
  const B = await ins('cross_post_jobs', { user_id: U, inventaire_id: 2, platform: 'leboncoin', action: 'publish', status: 'published', platform_listing_id: '3300000002', published_at: h(12), platform_fields: '{}' });
  // L. Dépôt AVEC lien (deuxième boucle), fiche dont la seule autre annonce est vendue (vente enregistrée) → failed.
  await ins('annonces_plateforme', { user_id: U, platform: 'leboncoin', listing_id: '3000000011', url: 'https://www.leboncoin.fr/ad/x/3000000011', statut_plateforme: 'en_ligne', inventaire_id: 11, transaction_plateforme: 'aucune' });
  await ins('ventes_operations', { user_id: U, cle: 'annonce:leboncoin:3000000011' });
  const L = await ins('cross_post_jobs', { user_id: U, inventaire_id: 11, platform: 'leboncoin', action: 'publish', status: 'published', platform_listing_id: '3300000011', listing_url: 'https://www.leboncoin.fr/ad/x/3300000011', published_at: h(12), platform_fields: '{}' });
  // C. Clos à tort hier (vente prouvée AVANT la clôture), jamais vu → rejugé « failed ».
  await ins('cross_post_jobs', { user_id: U, inventaire_id: 3, platform: 'leboncoin', action: 'republish', status: 'sold', platform_listing_id: '3298491503', sold_at: h(30), published_at: h(200) });
  await ins('annonces_plateforme', { user_id: U, platform: 'leboncoin', listing_id: '3298491503', url: 'https://www.leboncoin.fr/ad/x/3298491503', statut_plateforme: 'en_ligne', inventaire_id: 3, transaction_plateforme: 'sold' });
  const clos = (ann, le, extra = {}) => JSON.stringify({ remise_en_vente: { annonce_vendue: ann }, depot_jamais_en_ligne: { le, issue: 'article_en_ligne_ailleurs', premier: R1, second: R2, identifiants: [extra.id ?? '3303792394'], annonce_en_ligne: ann } });
  const C = await ins('cross_post_jobs', { user_id: U, inventaire_id: 3, platform: 'leboncoin', action: 'publish', status: 'cancelled', platform_listing_id: '3303792394', published_at: h(9), error: "Ce dépôt n'a jamais été retrouvé dans tes annonces Leboncoin, mais ton article y est en ligne sous l'annonce 3298491503 : rien à refaire, rien n'est vendu.", platform_fields: clos('3298491503', h(5)) });
  // D. Vente APRÈS la clôture (la clôture était juste à son heure) → pas touché.
  await ins('cross_post_jobs', { user_id: U, inventaire_id: 4, platform: 'leboncoin', action: 'publish', status: 'sold', platform_listing_id: '3000000004', sold_at: h(1), published_at: h(200) });
  await ins('annonces_plateforme', { user_id: U, platform: 'leboncoin', listing_id: '3000000004', statut_plateforme: 'en_ligne', inventaire_id: 4, transaction_plateforme: 'pending' });
  const D = await ins('cross_post_jobs', { user_id: U, inventaire_id: 4, platform: 'leboncoin', action: 'publish', status: 'cancelled', platform_listing_id: '3300000004', published_at: h(9), platform_fields: clos('3000000004', h(5), { id: '3300000004' }) });
  // E. Le dépôt a été vu par un relevé (sous un autre statut) → pas touché.
  await ins('cross_post_jobs', { user_id: U, inventaire_id: 5, platform: 'leboncoin', action: 'publish', status: 'sold', platform_listing_id: '3000000005', sold_at: h(30), published_at: h(200) });
  await ins('annonces_plateforme', { user_id: U, platform: 'leboncoin', listing_id: '3300000005', statut_plateforme: 'inconnu', inventaire_id: 5 });
  const E = await ins('cross_post_jobs', { user_id: U, inventaire_id: 5, platform: 'leboncoin', action: 'publish', status: 'cancelled', platform_listing_id: '3300000005', published_at: h(9), platform_fields: clos('3000000005', h(5), { id: '3300000005' }) });
  // F. Une autre annonce NON vendue de la fiche est réellement en ligne → la clôture tient (pas de doublon).
  await ins('cross_post_jobs', { user_id: U, inventaire_id: 6, platform: 'leboncoin', action: 'publish', status: 'sold', platform_listing_id: '3000000006', sold_at: h(30), published_at: h(200) });
  await ins('annonces_plateforme', { user_id: U, platform: 'leboncoin', listing_id: '3000000066', statut_plateforme: 'en_ligne', inventaire_id: 6, transaction_plateforme: 'aucune' });
  const F = await ins('cross_post_jobs', { user_id: U, inventaire_id: 6, platform: 'leboncoin', action: 'publish', status: 'cancelled', platform_listing_id: '3300000006', published_at: h(9), platform_fields: clos('3000000006', h(5), { id: '3300000006' }) });
  // G. depot_jamais_en_ligne_refermer : un « failed » dont la seule autre annonce est vendue reste « failed » ;
  //    un « failed » dont la fiche a une vraie annonce en ligne se ferme comme avant.
  await ins('annonces_plateforme', { user_id: U, platform: 'leboncoin', listing_id: '3000000007', statut_plateforme: 'en_ligne', inventaire_id: 7, transaction_plateforme: 'pending' });
  const G1 = await ins('cross_post_jobs', { user_id: U, inventaire_id: 7, platform: 'leboncoin', action: 'publish', status: 'failed', platform_listing_id: '3300000007', published_at: h(30), platform_fields: JSON.stringify({ depot_jamais_en_ligne: { issue: 'refus_moderation_probable', identifiants: ['3300000007'] } }) });
  await ins('annonces_plateforme', { user_id: U, platform: 'leboncoin', listing_id: '3000000008', statut_plateforme: 'en_ligne', inventaire_id: 8, transaction_plateforme: 'aucune' });
  const G2 = await ins('cross_post_jobs', { user_id: U, inventaire_id: 8, platform: 'leboncoin', action: 'publish', status: 'failed', platform_listing_id: '3300000008', published_at: h(30), platform_fields: JSON.stringify({ depot_jamais_en_ligne: { issue: 'refus_moderation_probable', identifiants: ['3300000008'] } }) });
  // I. Compte relié, boutique partagée : la fiche jumelle en ligne SOUS TRANSACTION ne compte pas ; sans, elle compte.
  await ins('comptes_lies', { user_a: U < V ? U : V, user_b: U < V ? V : U });
  await ins('sync_import_ecartes', { user_id: U, motif: 'compte_relie:leboncoin' });
  await ins('fiches_liees_comptes', { fiche_a: 9, fiche_b: 109, user_a: U, user_b: V });
  await ins('annonces_plateforme', { user_id: V, platform: 'leboncoin', listing_id: '3000000109', statut_plateforme: 'en_ligne', inventaire_id: 109, transaction_plateforme: 'pending' });

  await q('SELECT trancher_publications_sans_lien($1, $2, $3)', [U, 'leboncoin', R2]);
  const job = async (x) => (await q('SELECT status, error, platform_fields FROM cross_post_jobs WHERE id = $1', [x.id]))[0];
  console.log('1. Une annonce vendue ne compte jamais comme « en ligne »');
  const a = await job(A);
  verifier(a.status === 'failed', `A (Louis, vendue sous « pending ») : « failed », pas « cancelled » (${a.status})`);
  verifier(!/rien n['’]est vendu/i.test(a.error) && /Ta vente d'avant n'est pas touchée/.test(a.error), 'A : « Ta vente d\'avant n\'est pas touchée », jamais « rien n\'est vendu » (remise en vente)');
  verifier(!/3297400164/.test(a.error), 'A : l\'annonce vendue n\'est jamais citée comme « en ligne »');
  const l = await job(L);
  verifier(l.status === 'failed' && /Rien n'est vendu/.test(l.error), `L (dépôt avec lien, seule autre annonce : vente enregistrée) : « failed » (${l.status})`);
  console.log('2. Une vraie annonce en ligne ferme toujours le dépôt (pas de doublon)');
  const b = await job(B);
  verifier(b.status === 'cancelled' && /en ligne sous l'annonce 3000000002 : rien à refaire, rien n'est vendu\./.test(b.error), `B : « cancelled », même texte qu'avant (${b.status})`);
  console.log('3. La règle de rejugement');
  const c = await job(C);
  verifier(c.status === 'failed', `C (vente prouvée avant la clôture, jamais vu) : rejugé « failed » (${c.status})`);
  verifier(/L'annonce 3298491503, citée avant comme « en ligne », est vendue/.test(c.error) && /Ta vente de l'annonce 3298491503 n'est pas touchée/.test(c.error) && /relevés complets du/.test(c.error), 'C : le motif vrai, daté par les deux relevés');
  verifier(c.platform_fields.depot_jamais_en_ligne.issue === 'refus_moderation_probable' && c.platform_fields.depot_jamais_en_ligne.issue_avant === 'article_en_ligne_ailleurs'
    && c.platform_fields.depot_jamais_en_ligne.rejuge?.regle === 'annonce_vendue_jamais_en_ligne_0711' && !('annonce_en_ligne' in c.platform_fields.depot_jamais_en_ligne), 'C : trace (issue, issue_avant, rejuge), plus d\'« annonce_en_ligne »');
  verifier(Array.isArray(c.platform_fields.erreurs_archivees) && /rien n'est vendu/.test(c.platform_fields.erreurs_archivees[0].erreur), 'C : l\'ancien message part aux archives');
  verifier((await job(D)).status === 'cancelled', 'D (vente APRÈS la clôture) : pas touché');
  verifier((await job(E)).status === 'cancelled', 'E (dépôt vu par un relevé) : pas touché');
  verifier((await job(F)).status === 'cancelled', 'F (une annonce NON vendue de la fiche est en ligne) : pas touché — jamais de doublon');
  console.log('4. depot_jamais_en_ligne_refermer');
  verifier((await job(G1)).status === 'failed', 'G1 (seule autre annonce : sous transaction) : reste « failed »');
  const g2 = await job(G2);
  verifier(g2.status === 'cancelled' && /rien n'est vendu/.test(g2.error), 'G2 (vraie annonce en ligne) : fermé comme avant');
  console.log('5. article_en_ligne_ailleurs');
  verifier((await q('SELECT article_en_ligne_ailleurs($1, $2, $3, $4) r', [U, 'leboncoin', 1, []]))[0].r === null, 'fiche dont la seule annonce est vendue : NULL');
  verifier((await q('SELECT article_en_ligne_ailleurs($1, $2, $3, $4) r', [U, 'leboncoin', 2, []]))[0].r?.listing_id === '3000000002', 'fiche avec une vraie annonce en ligne : la rend');
  verifier((await q('SELECT article_en_ligne_ailleurs($1, $2, $3, $4) r', [U, 'leboncoin', 9, []]))[0].r === null, 'compte relié, jumelle sous transaction : NULL');
  await q(`UPDATE annonces_plateforme SET transaction_plateforme = 'aucune' WHERE listing_id = '3000000109'`);
  verifier((await q('SELECT article_en_ligne_ailleurs($1, $2, $3, $4) r', [U, 'leboncoin', 9, []]))[0].r?.issue === 'en_ligne_par_compte_relie', 'compte relié, jumelle sans transaction : « en_ligne_par_compte_relie »');
  console.log('6. Idempotence, aide, phrase');
  const rendusAvant = Number((await q('SELECT count(*) n FROM rendus'))[0].n);
  const r2 = (await q('SELECT trancher_publications_sans_lien($1, $2, $3) r', [U, 'leboncoin', R2]))[0].r;
  verifier(r2.rejuges?.rejuges === 0 && Number((await q('SELECT count(*) n FROM rendus'))[0].n) === rendusAvant, 'second passage : rien de rejugé, rien de rendu deux fois');
  verifier((await q(`SELECT annonce_prise_par_une_vente($1, 'leboncoin', '3297400164') a, annonce_prise_par_une_vente($1, 'leboncoin', '3000000002') b, annonce_prise_par_une_vente($1, 'leboncoin', '') c`, [U]))
    .every((r) => r.a === true && r.b === false && r.c === false), 'annonce_prise_par_une_vente : vendue vrai, en ligne faux, vide faux');
  await ins('cross_post_jobs', { user_id: U, inventaire_id: 10, platform: 'leboncoin', action: 'publish', status: 'published', platform_listing_id: '3000000010', platform_fields: JSON.stringify({ sale_signal: 'sold' }) });
  verifier((await q(`SELECT annonce_prise_par_une_vente($1, 'leboncoin', '3000000010') a`, [U]))[0].a === true, 'job publié avec sale_signal « sold » : pris par une vente');
  verifier((await q(`SELECT phrase_rien_vendu('{"remise_en_vente":{}}'::jsonb, true) a, phrase_rien_vendu('{}'::jsonb, false) b`))
    .every((r) => r.a === "Ta vente d'avant n'est pas touchée" && r.b === "rien n'est vendu"), 'phrase_rien_vendu : remise / sinon');
  const droits = await q(`SELECT has_function_privilege('anon', 'public.annonce_prise_par_une_vente(uuid,text,text)', 'EXECUTE') a,
    has_function_privilege('authenticated', 'public.depots_clos_sur_annonce_vendue_rejuger(uuid,text,uuid)', 'EXECUTE') b`);
  verifier(droits[0].a === false && droits[0].b === false, 'aides fermées aux clients (anon, authenticated)');
  console.log('7. L\'inverse');
  await client.query(INVERSE);
  const apres = await defs();
  verifier(['trancher_publications_sans_lien', 'depot_jamais_en_ligne_refermer', 'article_en_ligne_ailleurs'].every((n) => apres[n] === avant[n]), 'les trois définitions de prod reviennent à l\'identique (md5)');
  verifier((await q(`SELECT count(*) n FROM pg_proc WHERE proname IN ('annonce_prise_par_une_vente','phrase_rien_vendu','depots_clos_sur_annonce_vendue_rejuger')`))[0].n === '0', 'les trois aides sont retirées');
} catch (e) {
  ko++; console.error('ERREUR', e.message);
} finally {
  await client.end();
  if (embarque) { await embarque.pg.stop(); try { embarque.rmSync(embarque.dossier, { recursive: true, force: true }); } catch { /* */ } }
}
console.log(`\n${ok} vérifiés, ${ko} en échec`);
process.exit(ko ? 1 : 0);
