// PREUVE, SUR UN POSTGRES JETABLE, de la migration 20261105110000_releves_rouverts_republication_partie (05/11,
// décisions de Nico) :
//   1. 'reprise_connexion' et 'serveur:levee_antirobot' passent la garde des relevés comme relevés de VEILLE (ils
//      n'importent rien : releve_est_geste inchangée) ; rien d'autre n'est ouvert ;
//   2. spend_coins_and_republish refuse, AVANT tout décompte, une annonce qu'on sait partie (vendue sur sa plateforme,
//      ou absente établie que rien n'a revue) — la règle de republish_planifiee_candidats, un seul juge :
//      republication_annonce_partie() ; une annonce saine ou revue depuis passe comme avant ;
//   3. l'inverse rend les deux définitions de prod à l'identique (md5) et retire l'aide.
//
//   PREUVE_PG=embarque node scripts/preuve-releves-rouverts-republication-partie.mjs   (Postgres 17 jetable sur le PC)
//
// Jamais la prod. Les définitions de départ sont celles lues EN PROD le 05/11 (pg_get_functiondef) : l'inverse les
// porte mot pour mot (releve_est_veille, spend_coins_and_republish), les dépendances sont recopiées ci-dessous.
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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-releves-rouverts-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55448, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55448/postgres';
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = lire('../supabase/migrations/20261105110000_releves_rouverts_republication_partie.sql');
const INVERSE = lire('../supabase/rollbacks/20261105110000_releves_rouverts_republication_partie_INVERSE.sql');
// md5 des définitions de prod du 05/11, lues SANS les retours chariot.
const MD5_VEILLE_PROD = '3c9435a12577af8631b2c32d2f66a597';
const MD5_SCAR_PROD = '534784e42ff7fc5573dade28d1061155';

// Dépendances de spend_coins_and_republish jusqu'au refus — définitions de PROD du 05/11 (pg_get_functiondef).
const DEPENDANCES = String.raw`
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
$function$;
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
$function$;
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
$function$;
CREATE OR REPLACE FUNCTION public.listing_designe(p_listing text, p_url text, p_pid text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- Un identifiant explicite contradictoire interdit le repli sur l'URL.
  -- On lit le segment d'annonce, jamais un nombre dans le titre ou la requête.
  SELECT length(btrim(coalesce(p_listing,''))) >= 4 AND
    CASE WHEN nullif(btrim(p_pid),'') IS NOT NULL THEN btrim(p_listing)=btrim(p_pid)
    ELSE btrim(p_listing)=coalesce(
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/items/([0-9]+)(?:-|/|$)'),
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/ad/[^/]+/([0-9]+)(?:-|/|$)'),
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/itm/(?:[^/]+/)?([0-9]+)(?:/|$)'),
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/p/([0-9]+)(?:-|/|$)'),
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/(?:product|article)/(art_[A-Za-z0-9_-]+)(?:/|$)'), '') END;
$function$;
CREATE OR REPLACE FUNCTION public.version_cle(p_version text)
 RETURNS integer[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_version ~ '^\d+(\.\d+)*$' then string_to_array(p_version, '.')::int[]
    else null
  end;
$function$;
`;

const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
let ko = 0, n = 0;
const ok = (cond, msg, detail) => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${detail ? `\n      ${String(detail).slice(0, 600)}` : ''}`); } };
const U = '447d920c-976a-4d8f-aff4-a2998050358c';
const AUTRE = '11111111-2222-4333-8444-555555555555';
const poser = async (declencheur, kind = 'annonces') => (await c.query(
  `INSERT INTO public.vinted_sync_runs (user_id, kind, status, platform, declencheur, queued_at) VALUES ($1, $2, 'queued', 'leboncoin', $3, now()) RETURNING id`,
  [U, kind, declencheur])).rowCount;
const md5De = async (sig) => (await c.query(`SELECT md5(replace(pg_get_functiondef($1::regprocedure), chr(13), '')) AS m`, [sig])).rows[0].m;
const SIG_VEILLE = 'public.releve_est_veille(text)';
const SIG_SCAR = 'public.spend_coins_and_republish(bigint,text,text,numeric,text)';

// Un article Leboncoin publié par FillSell, et un témoin d'arrêt : une republication DÉJÀ en file sur l'article. La
// fonction s'arrête alors sur « republish_en_cours » — le contrôle qui suit immédiatement l'endroit du refus neuf :
// avant la migration, elle y arrive en passant la vente sans la voir ; après, elle refuse avant.
let invSuivant = 1000;
async function article({ signal = null, depuis = null, vuLe = null, transaction = null, disparue = false } = {}) {
  const inv = invSuivant++;
  const lid = String(3293617000 + inv);
  await c.query(`INSERT INTO public.inventaire (id, user_id, statut, titre) VALUES ($1, $2, 'stock', 'Playmobil')`, [inv, U]);
  const pf = {};
  if (signal) pf.sale_signal = signal;
  if (depuis) pf.unavailable_since = depuis;
  await c.query(`INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, status, action, title, listing_url, platform_listing_id, published_at, created_at, platform_fields)
    VALUES ($1, $2, 'leboncoin', 'published', 'publish', 'Playmobil', $3, $4, now() - interval '10 days', now() - interval '10 days', $5)`,
    [U, inv, `https://www.leboncoin.fr/ad/jeux_jouets/${lid}`, lid, pf]);
  if (disparue) {
    await c.query(`INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, status, action, title, platform_listing_id, created_at, platform_fields)
      VALUES ($1, $2, 'leboncoin', 'cancelled', 'republish', 'Playmobil', $3, now() - interval '4 days', jsonb_build_object('annonce_disparue', jsonb_build_object('at', (now() - interval '4 days')::text)))`, [U, inv, lid]);
  }
  await c.query(`INSERT INTO public.annonces_plateforme (user_id, platform, listing_id, url, vu_le, transaction_plateforme) VALUES ($1, 'leboncoin', $2, $3, $4, $5)`,
    [U, lid, `https://www.leboncoin.fr/ad/jeux_jouets/${lid}`, vuLe ?? new Date(Date.now() - 5 * 86400_000).toISOString(), transaction]);
  await c.query(`INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, status, action, title, created_at) VALUES ($1, $2, 'leboncoin', 'pending', 'republish', 'Playmobil', now())`, [U, inv]);
  return { inv, lid };
}
const republier = async (inv) => {
  await c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: U, role: 'authenticated' })]);
  const { rows: [r] } = await c.query(`SELECT public.spend_coins_and_republish($1, NULL, 'manuel', NULL, 'leboncoin') AS r`, [inv]);
  return r.r;
};
const compte = async () => (await c.query(`SELECT (SELECT count(*) FROM public.cross_post_jobs)::int AS j, (SELECT count(*) FROM public.coin_ledger)::int AS l`)).rows[0];

try {
  // ── L'état de PROD (05/11) ──
  await c.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;
    DO $$ BEGIN CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
      SELECT nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid $f$;
    GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    CREATE TABLE public.vinted_sync_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
      kind text NOT NULL DEFAULT 'dressing', status text NOT NULL DEFAULT 'running', declencheur text,
      queued_at timestamptz, platform text NOT NULL DEFAULT 'vinted');
    CREATE TABLE public.coin_wallets (user_id uuid PRIMARY KEY, included_balance integer DEFAULT 0, purchased_balance integer DEFAULT 0);
    CREATE TABLE public.coin_config (key text PRIMARY KEY, value bigint);
    CREATE TABLE public.coin_ledger (id bigserial PRIMARY KEY, user_id uuid, delta integer, included_after integer, purchased_after integer, kind text, metadata jsonb, created_at timestamptz DEFAULT now());
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, is_premium boolean DEFAULT false, is_pro boolean DEFAULT false, is_business boolean DEFAULT true,
      is_comped boolean DEFAULT false, extension_last_seen_at timestamptz, extension_version text, lang text, platform_settings jsonb DEFAULT '{}');
    CREATE TABLE public.inventaire (id bigint PRIMARY KEY, user_id uuid, statut text, titre text, photos jsonb, quantite integer, fusionne_dans bigint, prix_vente numeric);
    CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, inventaire_id bigint, platform text, status text,
      photo_option text, bulk_batch_id uuid, title text, description text, price numeric, photos jsonb, platform_listing_id text,
      generated_at timestamptz, published_at timestamptz, error text, created_at timestamptz DEFAULT now(), listing_url text,
      last_checked_at timestamptz, sold_at timestamptz, platform_fields jsonb DEFAULT '{}', action text, handler_build text,
      reservation_id uuid, reservation_settled_at timestamptz, voie text, vu_en_ligne_le timestamptz);
    CREATE TABLE public.annonces_plateforme (id bigserial PRIMARY KEY, user_id uuid, platform text, listing_id text, url text, vu_le timestamptz,
      transaction_plateforme text);
    INSERT INTO public.coin_config VALUES ('republication_multi_ouverte', 1);
    INSERT INTO public.profiles (id, extension_last_seen_at, extension_version, lang) VALUES ('${U}', now(), '0.6.172', 'fr');`);
  await c.query(DEPENDANCES);
  // Deux portes de la voie AUTOMATIQUE (p_source = 'auto') : jamais prises ici (appels « manuel »), mais PL/pgSQL
  // résout la fonction de l'expression même quand la première moitié du AND est fausse — des bouchons suffisent.
  await c.query(`CREATE FUNCTION public.republish_planifiee_pf_ouverte(text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
    CREATE FUNCTION public.compte_en_pause_antirobot(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT false';`);
  await c.query(`CREATE OR REPLACE FUNCTION public.releve_est_geste(p_declencheur text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(p_declencheur, '') ~ '^(bouton|bouton_distant|app)(:redemande)?$'
$function$`);
  await c.query(INVERSE); // = releve_est_veille et spend_coins_and_republish de prod, mot pour mot
  await c.query(`CREATE OR REPLACE FUNCTION public.garde_releve_sans_geste()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.kind NOT IN ('dressing', 'annonces') THEN RETURN NEW; END IF;
  IF releve_est_geste(NEW.declencheur) OR releve_est_veille(NEW.declencheur) THEN RETURN NEW; END IF;
  RAISE LOG 'garde_releve_sans_geste : relevé % % refusé (user %, déclencheur %) — un relevé d''import ne part que sur « Synchroniser »',
    NEW.kind, COALESCE(NEW.platform, 'vinted'), NEW.user_id, COALESCE(NEW.declencheur, '(aucun)');
  RETURN NULL;
END;
$function$`);
  await c.query(`CREATE TRIGGER garde_releve_sans_geste BEFORE INSERT ON public.vinted_sync_runs FOR EACH ROW EXECUTE FUNCTION garde_releve_sans_geste()`);

  const cas = {
    vendue_signal: await article({ signal: 'sold' }),
    vendue_releve: await article({ transaction: 'sold' }),
    partie: await article({ signal: 'unavailable', depuis: new Date(Date.now() - 2 * 86400_000).toISOString() }),
    revue_depuis: await article({ signal: 'unavailable', depuis: new Date(Date.now() - 2 * 86400_000).toISOString(), vuLe: new Date(Date.now() - 3600_000).toISOString() }),
    disparue: await article({ disparue: true }),
    saine: await article(),
  };

  console.log('\n1. AVANT (prod du 05/11)');
  ok(await md5De(SIG_VEILLE) === MD5_VEILLE_PROD, `releve_est_veille identique à la prod (md5 ${MD5_VEILLE_PROD})`, await md5De(SIG_VEILLE));
  ok(await md5De(SIG_SCAR) === MD5_SCAR_PROD, `spend_coins_and_republish identique à la prod (md5 ${MD5_SCAR_PROD})`, await md5De(SIG_SCAR));
  ok(await poser('reprise_connexion') === 0 && await poser('reprise_connexion', 'dressing') === 0, 'reprise_connexion : avalé sans un mot (annonces et dressing)');
  ok(await poser('serveur:levee_antirobot', 'dressing') === 0, 'serveur:levee_antirobot : avalé sans un mot');
  for (const k of ['vendue_signal', 'vendue_releve', 'partie', 'disparue']) {
    const r = await republier(cas[k].inv);
    ok(r.reason === 'republish_en_cours', `${k} : la fonction passe l'annonce partie sans la voir (va jusqu'au témoin : ${r.reason})`, JSON.stringify(r));
  }

  console.log('\n2. LA MIGRATION, appliquée en entier');
  await c.query(MIGRATION);
  ok(await poser('reprise_connexion') === 1 && await poser('reprise_connexion', 'dressing') === 1, 'reprise_connexion : écrit (annonces et dressing)');
  ok(await poser('serveur:levee_antirobot', 'dressing') === 1, 'serveur:levee_antirobot : écrit');
  const { rows: [g] } = await c.query(`SELECT public.releve_est_geste('reprise_connexion') OR public.releve_est_geste('serveur:levee_antirobot') AS geste`);
  ok(g.geste === false, "aucun des deux n'est un geste : ils n'importent rien (releve_est_geste inchangée)");
  for (const d of ['cron', 'veilleur', 'serveur:retrait_introuvable', 'serveur:retrait_sans_numero', 'serveur:verif_redepot',
    'serveur:quotidien_api', 'serveur:lecture_origine', 'serveur:introuvable_a_confirmer', 'controle_blocage_lbc', 'bouton', 'bouton_distant', 'app', 'app:redemande']) {
    ok(await poser(d) === 1, `${d} : passe, comme avant`);
  }
  for (const d of [null, '', 'serveur', 'reprise', 'reprise_connexion:redemande', 'serveur:levee_antirobot:redemande', 'serveur:premier_releve', 'serveur:reprise_absente']) {
    ok(await poser(d) === 0, `${JSON.stringify(d)} : toujours refusé (la règle du 05/10 reste pour tout le reste)`);
  }
  const { rows: [f] } = await c.query(`SELECT provolatile FROM pg_proc WHERE oid = '${SIG_VEILLE}'::regprocedure`);
  ok(f.provolatile === 'i', 'releve_est_veille toujours IMMUTABLE');

  const avant = await compte();
  const attendu = { vendue_signal: 'annonce_vendue', vendue_releve: 'annonce_vendue', partie: 'annonce_partie', disparue: 'annonce_partie' };
  for (const [k, motif] of Object.entries(attendu)) {
    const r = await republier(cas[k].inv);
    ok(r.allowed === false && r.reason === 'annonce_introuvable' && r.motif === motif && r.annonce === cas[k].lid,
      `${k} : refusée à la source (${r.reason} / ${r.motif}) — « ${r.message} »`, JSON.stringify(r));
  }
  for (const k of ['revue_depuis', 'saine']) {
    const r = await republier(cas[k].inv);
    ok(r.reason === 'republish_en_cours', `${k} : passe comme avant (jusqu'au témoin : ${r.reason})`, JSON.stringify(r));
  }
  const apres = await compte();
  ok(apres.j === avant.j && apres.l === avant.l, 'aucun job créé, aucune ligne de décompte pendant les refus', `${JSON.stringify(avant)} → ${JSON.stringify(apres)}`);

  // Le juge seul, sans le témoin d'arrêt : mêmes réponses, et un identifiant inconnu ou d'un autre compte n'est jamais « parti ».
  const juge = async (u, inv, lid) => (await c.query(`SELECT public.republication_annonce_partie($1, $2, 'leboncoin', $3) AS m`, [u, inv, lid])).rows[0].m;
  ok(await juge(U, cas.vendue_signal.inv, cas.vendue_signal.lid) === 'annonce_vendue', 'juge : vendue (signal du dépôt)');
  ok(await juge(U, cas.saine.inv, cas.saine.lid) === null, 'juge : saine → rien');
  ok(await juge(U, cas.vendue_signal.inv, null) === null && await juge(U, cas.vendue_signal.inv, '  ') === null, 'juge : identifiant absent → rien');
  ok(await juge(AUTRE, cas.vendue_signal.inv, cas.vendue_signal.lid) === null, "juge : l'annonce d'un AUTRE compte n'est jamais lue");
  ok(await juge(U, cas.vendue_releve.inv, ` ${cas.vendue_releve.lid} `) === 'annonce_vendue', 'juge : identifiant entouré de blancs → même réponse');
  // Les droits : jamais appelable par un client ; la fonction de l'app (SECURITY DEFINER) l'appelle.
  await c.query('SET ROLE authenticated');
  let refuse = false;
  try { await c.query(`SELECT public.republication_annonce_partie('${U}', 1, 'leboncoin', '1')`); } catch (e) { refuse = /permission denied/.test(e.message); }
  await c.query('RESET ROLE');
  ok(refuse, "republication_annonce_partie : refusée à un client connecté (aucune lecture d'un autre compte par RPC)");
  await c.query(`GRANT EXECUTE ON FUNCTION public.spend_coins_and_republish(bigint,text,text,numeric,text) TO authenticated`);
  await c.query('SET ROLE authenticated');
  let rClient = null;
  try { rClient = await republier(cas.partie.inv); } catch (e) { rClient = { erreur: e.message }; }
  await c.query('RESET ROLE');
  ok(rClient?.motif === 'annonce_partie', "appelée par l'app (client connecté), spend_coins_and_republish refuse bien", JSON.stringify(rClient));

  console.log("\n3. L'INVERSE : les définitions de prod, mot pour mot");
  await c.query(INVERSE);
  ok(await md5De(SIG_VEILLE) === MD5_VEILLE_PROD, 'releve_est_veille revenue à la prod');
  ok(await md5De(SIG_SCAR) === MD5_SCAR_PROD, 'spend_coins_and_republish revenue à la prod');
  const { rows: [h] } = await c.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'republication_annonce_partie'`);
  ok(h.n === 0, "l'aide est retirée");
  ok(await poser('reprise_connexion') === 0, 'reprise_connexion de nouveau refusé');
  await c.query(MIGRATION);
  ok((await republier(cas.vendue_releve.inv)).motif === 'annonce_vendue', 'la migration se rejoue sans erreur (CREATE OR REPLACE, idempotente)');
} catch (e) {
  ko++; console.log(`  ✗ ERREUR : ${e.message}`);
} finally {
  await c.end().catch(() => {});
  if (embarque) { await embarque.pg.stop().catch(() => {}); embarque.rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — migration prouvée sur un Postgres jetable`);
process.exit(ko ? 1 : 0);
