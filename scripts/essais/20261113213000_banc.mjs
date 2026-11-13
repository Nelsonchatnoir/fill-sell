// LE BANC de la migration 20261113213000_plateformes_verite_action_reussie (13/11/2026, 2e réponse de Nico — DET, cas
// ed4531e2) — SUR UN POSTGRES JETABLE (embedded-postgres sur le poste), jamais la prod.
//   node scripts/essais/20261113213000_banc.mjs
// Décor : profiles, vinted_sync_runs, cross_post_jobs, usage_logs réduits aux colonnes que plateformes_verite lit (noms
// et types de prod), RLS « ses lignes » comme en prod (fonction INVOKER : elle lit sous la RLS de la personne), auth.uid()
// lu comme Supabase, rôles anon / authenticated / service_role. ebay_compte_relie_le et depop_autorise : bouchons (une
// table chacun) — la migration ne les touche pas. Les cas RÉELS (id8) sont transposés à l'heure du banc (mêmes écarts).
// Étapes : A. AVANT — la définition de PROD (l'inverse, md5 ab921e54…) ; B. MIGRATION — vente lue, retrait fait, dépôt
// 30 j, garde de 24 h, page de connexion, comptes sans choix, `preuves_action` ; et la MÊME réponse que la règle JS
// (_shared/preuve-action.js) appliquée à la réponse d'avant ; C. INVERSE — la définition de prod à l'octet ; D. MIGRATION
// rejouée (garde : déjà appliquée → passe) ; E. garde md5 : une définition de prod changée → la migration refuse.
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
export const MIGRATION = 'supabase/migrations/20261113213000_plateformes_verite_action_reussie.sql';
export const INVERSE = 'supabase/rollbacks/20261113213000_plateformes_verite_action_reussie_INVERSE.sql';
const MD5_PROD = 'ab921e5456a2f763c77b5b3ff4921506';

// Les comptes (préfixe = id8 du cas réel, suite d'essai).
const ED = 'ed4531e2-0000-4000-8000-000000000001'; // 22/10 16:30 : vente lue il y a 14 min, dépôts il y a 4 j 4 h, sonde 403
const ED13 = 'ed4531e2-0000-4000-8000-000000000013'; // 13/11 : dernière vente lue il y a 21,7 j, 400 il y a 1,5 j
const FF = 'ff1f879f-0000-4000-8000-000000000002'; // Vinted jamais connecté (400), Leboncoin lu
const D7 = '7d64bf87-0000-4000-8000-000000000003'; // 400 / 403 / jeton_absent : rien
const E7 = '7e436336-0000-4000-8000-000000000004'; // sans choix ; Depop : sonde « sans_jeton » 23 h 33 après la vente lue
const B0 = 'b0cb8def-0000-4000-8000-000000000005'; // sans choix ; Vinted utilisé, relevé sur le mur ; eBay jamais utilisé
const PG = 'a1e210f2-0000-4000-8000-000000000006'; // page de connexion vue pendant une tâche APRÈS la vente lue
const RT = '16eb79ce-0000-4000-8000-000000000007'; // retrait fait par FillSell il y a 2 h ; « déjà hors ligne » Leboncoin
const TOUS = [ED, ED13, FF, D7, E7, B0, PG, RT];

const PRELUDE = String.raw`
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT nullif(coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $f$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, extension_sessions jsonb, platform_settings jsonb, extension_last_seen_at timestamptz,
  extension_version text, extension_postes jsonb);
CREATE TABLE public.vinted_sync_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, kind text, platform text, status text,
  erreur text, finished_at timestamptz, started_at timestamptz, items_vus integer);
CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, platform text, status text, action text,
  published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), handler_build text, platform_fields jsonb);
CREATE TABLE public.usage_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, feature text, created_at timestamptz DEFAULT now(), metadata jsonb);
CREATE INDEX ON public.usage_logs (user_id, feature, created_at);
CREATE INDEX ON public.cross_post_jobs (user_id, status);
-- RLS comme en prod (lue le 13/11) : chacun ses lignes.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_lecture ON public.profiles FOR SELECT USING (id = auth.uid());
ALTER TABLE public.vinted_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "runs lisibles par leur proprietaire" ON public.vinted_sync_runs FOR SELECT USING (auth.uid() = user_id);
ALTER TABLE public.cross_post_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cross_post_jobs" ON public.cross_post_jobs TO authenticated USING ((SELECT auth.uid()) = user_id);
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own logs" ON public.usage_logs USING (auth.uid() = user_id);
GRANT SELECT ON public.profiles, public.vinted_sync_runs, public.cross_post_jobs, public.usage_logs TO authenticated, service_role;
-- Bouchons des deux fonctions lues (non touchées par la migration).
CREATE TABLE public.banc_ebay_relie (user_id uuid PRIMARY KEY, le timestamptz);
CREATE TABLE public.banc_depop_ok (user_id uuid PRIMARY KEY);
CREATE FUNCTION public.ebay_compte_relie_le(p uuid) RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$ SELECT le FROM banc_ebay_relie WHERE user_id = p $f$;
CREATE FUNCTION public.depop_autorise(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$ SELECT EXISTS (SELECT 1 FROM banc_depop_ok WHERE user_id = p) $f$;
GRANT EXECUTE ON FUNCTION public.ebay_compte_relie_le(uuid), public.depop_autorise(uuid) TO authenticated, service_role;
`;

// Les faits des cas réels, transposés (intervalles depuis l'heure du banc).
const DONNEES = String.raw`
INSERT INTO public.profiles VALUES
 ('${ED}', '{"vinted": null, "http": {"vinted": 403}, "checked_at_par_plateforme": {"vinted": "__T-5m__"}}', '{"plateformes_vendeur": ["vinted"], "plateformes_ecartees": ["ebay","leboncoin","beebs"]}', now() - interval '1 minute', '0.6.125', '{}'),
 ('${ED13}', '{"vinted": null, "http": {"vinted": 403}, "checked_at_par_plateforme": {"vinted": "__T-5m__"}}', '{"plateformes_vendeur": ["vinted"], "plateformes_ecartees": ["ebay","leboncoin","beebs"]}', now() - interval '1 day', '0.6.186', '{}'),
 ('${FF}', '{"vinted": null, "leboncoin": true, "ebay": true, "http": {"vinted": 403, "leboncoin": 200}, "checked_at_par_plateforme": {"vinted": "__T-8m__", "leboncoin": "__T-5m__"}}', '{"plateformes_vendeur": ["vinted","leboncoin","ebay"], "plateformes_ecartees": ["beebs","depop"]}', now(), '0.6.186', '{}'),
 ('${D7}', '{"vinted": null, "beebs": null, "leboncoin": true, "ebay": false, "http": {"vinted": 403, "beebs": 403}, "checked_at_par_plateforme": {"vinted": "__T-6m__", "beebs": "__T-36m__", "ebay": "__T-36m__", "leboncoin": "__T-25h__"}}', '{"plateformes_vendeur": ["vinted","beebs"], "plateformes_ecartees": []}', now(), '0.6.186', '{}'),
 ('${E7}', '{"vinted": true, "leboncoin": true, "ebay": true, "depop": false, "beebs": null, "http": {"depop": "sans_jeton", "beebs": 403, "vinted": 200}, "checked_at_par_plateforme": {"depop": "__T-8m__", "beebs": "__T-8m__", "vinted": "__T-2m__", "leboncoin": "__T-4h__", "ebay": "__T-8m__"}}', '{"plateformes_ecartees": []}', now(), '0.6.186', '{}'),
 ('${B0}', '{"vinted": null, "beebs": true, "ebay": false, "http": {"vinted": 403, "ebay": 200}, "checked_at_par_plateforme": {"vinted": "__T-20h__", "beebs": "__T-40h__", "ebay": "__T-21h__"}}', '{}', now(), '0.6.186', '{}'),
 ('${PG}', '{"vinted": false, "http": {"vinted": "login_redirect_observee"}, "checked_at_par_plateforme": {"vinted": "__T-1h__"}}', '{"plateformes_vendeur": ["vinted"]}', now(), '0.6.186', '{}'),
 ('${RT}', '{"vinted": null, "http": {"vinted": 403}, "checked_at_par_plateforme": {"vinted": "__T-5m__"}}', '{"plateformes_vendeur": ["vinted","leboncoin"]}', now(), '0.6.186', '{}');
INSERT INTO public.banc_depop_ok VALUES ('${E7}');
-- ed4531e2 (le 22/10 16:30) : dépôts réussis il y a 4 j 4 h, ventes lues il y a 4 j 3 h 47 et il y a 14 min, Leboncoin « jeton_absent ».
INSERT INTO public.cross_post_jobs (user_id, platform, status, action, published_at, created_at, handler_build) VALUES
 ('${ED}', 'vinted', 'published', 'publish', now() - interval '4 days 4 hours 8 minutes', now() - interval '4 days 4 hours 9 minutes', 'v0.6.125'),
 ('${ED}', 'vinted', 'published', 'publish', now() - interval '4 days 4 hours', now() - interval '4 days 4 hours 1 minute', 'v0.6.125'),
 ('${ED13}', 'vinted', 'published', 'publish', now() - interval '25 days 20 hours', now() - interval '25 days 21 hours', 'v0.6.125');
INSERT INTO public.usage_logs (user_id, feature, created_at, metadata) VALUES
 ('${ED}', 'releve_ventes', now() - interval '4 days 3 hours 47 minutes', '{"plateforme": "vinted", "motif": null, "lues": 2}'),
 ('${ED}', 'releve_ventes', now() - interval '4 days 3 hours 46 minutes', '{"plateforme": "leboncoin", "motif": "jeton_absent", "lues": 0}'),
 ('${ED}', 'releve_ventes', now() - interval '14 minutes', '{"plateforme": "vinted", "motif": null, "lues": 2}'),
 ('${ED13}', 'releve_ventes', now() - interval '21 days 17 hours', '{"plateforme": "vinted", "motif": null, "lues": 2}'),
 ('${ED13}', 'releve_ventes', now() - interval '1 day 12 hours', '{"plateforme": "vinted", "motif": "http_400", "lues": 0}'),
 ('${FF}', 'releve_ventes', now() - interval '5 hours 2 minutes', '{"plateforme": "vinted", "motif": "http_400", "lues": 0}'),
 ('${FF}', 'releve_ventes', now() - interval '5 hours 1 minute', '{"plateforme": "leboncoin", "motif": null, "lues": 28}'),
 ('${D7}', 'releve_ventes', now() - interval '8 hours', '{"plateforme": "vinted", "motif": "http_400", "lues": 0}'),
 ('${D7}', 'releve_ventes', now() - interval '2 days 13 hours', '{"plateforme": "vinted", "motif": "http_403", "lues": 0}'),
 ('${D7}', 'releve_ventes', now() - interval '8 hours', '{"plateforme": "leboncoin", "motif": "jeton_absent", "lues": 0}'),
 ('${E7}', 'releve_ventes', now() - interval '23 hours 41 minutes', '{"plateforme": "depop", "motif": "", "lues": 1}'),
 ('${E7}', 'releve_ventes', now() - interval '1 hour', '{"plateforme": "vinted", "motif": "", "lues": 3}'),
 ('${B0}', 'releve_ventes', now() - interval '1 day 15 hours', '{"plateforme": "leboncoin", "motif": "", "lues": 4}'),
 ('${PG}', 'releve_ventes', now() - interval '2 hours', '{"plateforme": "vinted", "motif": null, "lues": 1}'),
 ('${ED}', 'autre_chose', now(), '{"plateforme": "vinted"}');
-- ff1f879f : 3 annonces Leboncoin IMPORTÉES par un relevé (jamais un dépôt), relevés Leboncoin et eBay faits.
INSERT INTO public.cross_post_jobs (user_id, platform, status, action, published_at, created_at, handler_build)
 SELECT '${FF}', 'leboncoin', 'published', 'publish', now() - interval '5 hours 8 minutes', now() - interval '5 hours 8 minutes', 'releve-annonces' FROM generate_series(1, 3);
INSERT INTO public.vinted_sync_runs (user_id, kind, platform, status, erreur, finished_at, started_at, items_vus) VALUES
 ('${FF}', 'annonces', 'leboncoin', 'done', '[défilement] 31 en ligne', now() - interval '5 hours 40 minutes', now() - interval '5 hours 42 minutes', 36),
 ('${FF}', 'annonces', 'ebay', 'done', '[api] 0 annonce', now() - interval '5 hours 9 minutes', now() - interval '5 hours 10 minutes', 0),
-- 7e436336 : Depop relevé fait 23 h 41 avant, vente lue 5 s après ; Vinted, Leboncoin, eBay relevés faits.
 ('${E7}', 'annonces', 'depop', 'done', '[rattachement] …', now() - interval '23 hours 41 minutes 5 seconds', now() - interval '23 hours 42 minutes', 11),
 ('${E7}', 'dressing', NULL, 'done', NULL, now() - interval '20 minutes', now() - interval '22 minutes', 40),
 ('${E7}', 'annonces', 'leboncoin', 'done', '[défilement] 2 en ligne', now() - interval '45 minutes', now() - interval '46 minutes', 2),
 ('${E7}', 'annonces', 'ebay', 'done', '[défilement] 8 annonces', now() - interval '3 minutes', now() - interval '4 minutes', 8),
-- b0cb8def : Vinted — dernier relevé sur le mur ; Leboncoin et Beebs relevés faits.
 ('${B0}', 'dressing', NULL, 'failed', '[pas_connecte] [cause403] session_absente', now() - interval '20 hours 10 minutes', now() - interval '20 hours 12 minutes', 0),
 ('${B0}', 'annonces', 'leboncoin', 'done', '[défilement] 23 en ligne', now() - interval '1 day 15 hours', now() - interval '1 day 15 hours 1 minute', 23),
 ('${B0}', 'annonces', 'beebs', 'done', '[défilement] 2 annonces', now() - interval '1 day 15 hours', now() - interval '1 day 15 hours 2 minutes', 2);
INSERT INTO public.cross_post_jobs (user_id, platform, status, action, published_at, created_at, handler_build, platform_fields) VALUES
 ('${E7}', 'depop', 'published', 'publish', now() - interval '70 hours 37 minutes', now() - interval '70 hours 40 minutes', 'v0.6.186', NULL),
 ('${B0}', 'vinted', 'published', 'publish', now() - interval '50 days', now() - interval '50 days', 'v0.6.90', NULL),
 ('${B0}', 'beebs', 'published', 'publish', now() - interval '50 days', now() - interval '50 days', 'v0.6.90', NULL),
 ('${RT}', 'vinted', 'deleted', 'delete', NULL, now() - interval '2 hours 2 minutes', 'v0.6.186', jsonb_build_object('retrait_par', 'fillsell', 'processing_since', to_char((now() - interval '2 hours') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
 ('${RT}', 'leboncoin', 'deleted', 'delete', NULL, now() - interval '1 hour', 'v0.6.186', jsonb_build_object('retrait_par', 'annonce_deja_hors_ligne', 'processing_since', to_char((now() - interval '58 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
-- Un AUTRE compte a une vente Vinted lue : jamais comptée chez ff1f879f (la fonction lit SES lignes, sous SA RLS).
 ('${PG}', 'leboncoin', 'published', 'publish', now() - interval '1 hour', now() - interval '1 hour', 'v0.6.186', NULL);
`;

const quand = (s) => {
  const m = /^T-(\d+)([mh])$/.exec(s);
  return new Date(Date.now() - Number(m[1]) * (m[2] === 'm' ? 60_000 : 3_600_000)).toISOString();
};

export async function demarrer(port) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-verite-action-'));
  const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await base.initialise(); await base.start();
  const c = new pg.Client({ connectionString: `postgres://postgres:banc@127.0.0.1:${port}/postgres` });
  await c.connect(); c.on('notice', () => {});
  await c.query(PRELUDE);
  await c.query(DONNEES.replace(/__(T-\d+[mh])__/g, (_, t) => quand(t)));
  const arreter = async () => { await c.end().catch(() => {}); await base.stop().catch(() => {}); try { rmSync(dossier, { recursive: true, force: true }); } catch { /* temp */ } };
  return { c, arreter };
}

/** Un appel « depuis l'app » : rôle authenticated, session = uid. */
export async function commeClient(c, uid, sql, params = [], role = 'authenticated') {
  await c.query('BEGIN');
  try {
    await c.query(`SET LOCAL ROLE ${role}`);
    await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    const r = await c.query(sql, params);
    await c.query('COMMIT');
    return { ok: true, rows: r.rows };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    return { ok: false, erreur: e.message, code: e.code };
  }
}
const verite = async (c, uid) => {
  const r = await commeClient(c, uid, 'SELECT public.plateformes_verite($1::uuid) v', [uid]);
  return r.ok ? r.rows[0].v : { erreur: r.erreur };
};
const md5Def = async (c) => (await c.query(`SELECT md5(replace(pg_get_functiondef('public.plateformes_verite(uuid)'::regprocedure), chr(13), '')) m`)).rows[0].m;
const resume = (v) => Object.fromEntries(['vinted', 'leboncoin', 'ebay', 'beebs', 'depop'].filter((p) => v?.plateformes?.[p]).map((p) => [p, `${v.plateformes[p].etat}${v.plateformes[p].declaree ? '+' : ''}`]));

/** La règle JS (_shared/preuve-action.js) appliquée à la réponse d'AVANT, sur les MÊMES lignes du décor. */
async function regleJs(c, A, uid, vAvant) {
  const rows = async (sql) => (await c.query(sql, [uid])).rows;
  const ventes = await rows(`SELECT created_at, metadata FROM usage_logs WHERE user_id = $1 AND feature = 'releve_ventes' AND created_at > now() - interval '30 days'`);
  const jobs = await rows(`SELECT platform, action, status, published_at, created_at, handler_build, platform_fields FROM cross_post_jobs WHERE user_id = $1`);
  const runs = await rows(`SELECT kind, platform, status, items_vus, finished_at, started_at FROM vinted_sync_runs WHERE user_id = $1 AND status = 'done'`);
  const maintenant = Date.now();
  const preuves = A.preuvesActionReussie({ ventes, jobs, maintenant });
  const vide = A.choixVide(vAvant);
  const utilisees = vide ? A.plateformesUtilisees({ verite: vAvant, preuves, annonces: jobs, runs }) : null;
  return A.completerVerite(vAvant, { preuves, utilisees, maintenant });
}

const principal = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (principal) {
  let n = 0, ko = 0;
  const ok = (cond, msg, d) => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 900)}`}`); } };
  const A = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/preuve-action.js')).href);
  const { c, arreter } = await demarrer(57000 + Math.floor(Math.random() * 2000));
  try {
    console.log('A. AVANT — la définition de PROD (lue le 13/11)');
    await c.query(lire(INVERSE));
    await c.query(`GRANT EXECUTE ON FUNCTION public.plateformes_verite(uuid) TO authenticated, service_role`);
    const md5A = await md5Def(c);
    console.log(`    (md5 de la définition chargée ici : ${md5A} ; prod : ${MD5_PROD}${md5A === MD5_PROD ? ' — identiques' : ' — formatage de cette version de Postgres'})`);
    const av = {};
    for (const u of TOUS) av[u] = await verite(c, u);
    ok(av[ED].plateformes?.vinted?.etat === 'inconnue', 'A : ed4531e2 (vente lue il y a 14 min, sonde 403) → « inconnue » (le défaut)', resume(av[ED]));
    ok(av[E7].plateformes?.depop?.etat === 'a_connecter' && av[E7].plateformes?.depop?.declaree === false, 'A : 7e436336 Depop → « à connecter » (sonde 23 h 33 après la vente lue), pas déclarée', resume(av[E7]));
    ok(!('preuves_action' in av[ED]), 'A : pas de marque preuves_action');

    console.log('B. MIGRATION');
    await c.query(lire(MIGRATION));
    const ap = {};
    for (const u of TOUS) ap[u] = await verite(c, u);
    const ed = ap[ED].plateformes?.vinted;
    ok(ed?.etat === 'connectee' && ed?.source === 'vente' && ed?.motif === 'vente_lue', 'B : ed4531e2 → CONNECTÉE par la vente lue', ed);
    ok(ap[ED13].plateformes?.vinted?.etat === 'a_verifier' && ap[ED13].plateformes?.vinted?.motif === 'preuve_perimee', 'B : ed4531e2 le 13/11 (vente lue il y a 21,7 j, 400 récente) → « à vérifier », jamais « inconnue »', resume(ap[ED13]));
    ok(ap[FF].plateformes?.vinted?.etat === 'inconnue' && ap[FF].plateformes?.leboncoin?.etat === 'connectee', 'B : ff1f879f → Vinted reste « inconnue » (400 = rien ; imports de relevé ≠ dépôts) ; Leboncoin connectée', resume(ap[FF]));
    ok(ap[D7].plateformes?.vinted?.etat === 'inconnue' && ap[D7].plateformes?.beebs?.etat === 'inconnue', 'B : 7d64bf87 → rien d’inventé', resume(ap[D7]));
    const dep = ap[E7].plateformes?.depop;
    ok(dep?.etat === 'connectee' && dep?.source === 'vente', 'B : 7e436336 Depop → la GARDE de 24 h : connectée (la sonde ne contredit pas la vente lue)', dep);
    ok(dep?.declaree === true && dep?.choisie_par === 'utilisation' && ap[E7].plateformes?.beebs?.declaree === false, 'B : 7e436336 (sans choix) : Depop utilisée → déclarée « par l’utilisation » ; Beebs jamais utilisée → non', resume(ap[E7]));
    ok(ap[B0].plateformes?.vinted?.etat === 'a_connecter' && ap[B0].plateformes?.vinted?.declaree === true && ap[B0].plateformes?.ebay?.declaree === false, 'B : b0cb8def (sans choix) : Vinted utilisé, relevé sur le mur → « à connecter », déclaré ; eBay jamais utilisé → non déclaré', resume(ap[B0]));
    ok(ap[PG].plateformes?.vinted?.etat === 'a_connecter', 'B : page de connexion vue pendant une tâche APRÈS la vente lue → « à connecter » (une action ratée)', ap[PG].plateformes?.vinted);
    ok(ap[RT].plateformes?.vinted?.etat === 'connectee' && ap[RT].plateformes?.vinted?.source === 'retrait' && ap[RT].plateformes?.leboncoin?.etat === 'inconnue', 'B : retrait fait par FillSell → connectée ; « déjà hors ligne » → rien', resume(ap[RT]));
    ok(TOUS.every((u) => ap[u].preuves_action === true), 'B : la marque preuves_action (la règle JS ne relit plus rien)');
    const reparti = (await c.query(`SELECT count(*)::int n FROM usage_logs WHERE user_id = $1 AND feature = 'releve_ventes'`, [FF])).rows[0].n;
    ok(reparti === 2, 'B : aucune ligne écrite par la vérité (fonction STABLE)', reparti);
    // La MÊME réponse que la règle JS appliquée à la réponse d'avant (app et popup avant la migration).
    const diffs = [];
    for (const u of TOUS) {
      const js = await regleJs(c, A, u, av[u]);
      for (const p of ['vinted', 'leboncoin', 'ebay', 'beebs', 'depop']) {
        const s = ap[u].plateformes?.[p]; const j = js.plateformes?.[p];
        if (!s && !j) continue;
        if (s?.etat !== j?.etat || Boolean(s?.declaree) !== Boolean(j?.declaree)) diffs.push(`${u.slice(0, 8)}/${p} SQL ${s?.etat}${s?.declaree ? '+' : ''} ≠ JS ${j?.etat}${j?.declaree ? '+' : ''}`);
      }
    }
    ok(diffs.length === 0, 'B : SQL et règle JS (avant la migration) rendent le même état et le même choix, plateforme par plateforme, sur les 8 comptes', diffs);
    // Une action ratée PLUS RÉCENTE (relevé tombé sur la connexion) garde son verdict.
    await c.query(`INSERT INTO vinted_sync_runs (user_id, kind, platform, status, erreur, finished_at, started_at, items_vus) VALUES ($1, 'annonces', 'depop', 'absente', '[incomplet] Connexion Depop requise : connecte-toi à Depop sur ton ordinateur', now() - interval '5 minutes', now() - interval '6 minutes', 0)`, [E7]);
    const e7b = await verite(c, E7);
    ok(e7b.plateformes?.depop?.etat === 'a_connecter' && e7b.plateformes?.depop?.source === 'releve', 'B : 7e436336 — relevé Depop tombé sur la connexion APRÈS la vente → « à connecter » (son vrai message)', e7b.plateformes?.depop);
    await c.query(`DELETE FROM vinted_sync_runs WHERE user_id = $1 AND status = 'absente'`, [E7]);
    // Droits et RLS inchangés.
    const autre = await commeClient(c, ED, 'SELECT public.plateformes_verite($1::uuid) v', [FF]);
    ok(autre.ok && autre.rows[0].v.ok === false && autre.rows[0].v.reason === 'unauthorized', 'B : la vérité d’un AUTRE compte → refusée (inchangé)', autre);
    const dr = (await c.query(`SELECT proacl::text a, prosecdef s, provolatile v FROM pg_proc WHERE proname = 'plateformes_verite'`)).rows[0];
    ok(dr.s === false && dr.v === 's' && /authenticated=X/.test(dr.a), 'B : toujours INVOKER, STABLE, exécutable par authenticated', dr);

    console.log('C. INVERSE');
    await c.query(lire(INVERSE));
    ok(await md5Def(c) === md5A, 'C : la définition de prod, à l’octet (md5 identique à A)');
    const ci = await verite(c, ED);
    ok(ci.plateformes?.vinted?.etat === 'inconnue' && !('preuves_action' in ci), 'C : ed4531e2 retombe sur « inconnue » (comportement d’avant)', resume(ci));

    console.log('D. MIGRATION rejouée');
    await c.query(lire(MIGRATION));
    const d1 = await verite(c, ED);
    await c.query(lire(MIGRATION));
    const d2 = await verite(c, ED);
    ok(d1.plateformes?.vinted?.etat === 'connectee' && d2.plateformes?.vinted?.etat === 'connectee', 'D : appliquée, puis rejouée sans erreur (garde : déjà appliquée)');

    console.log('E. GARDE md5');
    await c.query(lire(INVERSE));
    await c.query(`CREATE OR REPLACE FUNCTION public.plateformes_verite(p_user uuid DEFAULT auth.uid()) RETURNS jsonb LANGUAGE sql STABLE AS $f$ SELECT '{}'::jsonb $f$`);
    let refus = null;
    try { await c.query(lire(MIGRATION)); } catch (e) { refus = e.message; await c.query('ROLLBACK').catch(() => {}); }
    ok(/a changé en prod/.test(refus ?? ''), 'E : une définition de prod changée depuis le 13/11 → la migration REFUSE (régénérer)', refus);
  } finally { await arreter(); }
  console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ''}`);
  process.exit(ko ? 1 : 0);
}
