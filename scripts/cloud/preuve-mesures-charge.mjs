// PREUVE, SUR UN POSTGRES JETABLE, de la migration 20261106210000 (06/11/2026 soir : la charge mesurée en réel, lue à
// chaque « check news ») :
//   PREUVE_PG=embarque node scripts/cloud/preuve-mesures-charge.mjs   (Postgres 17 jetable sur le PC)
// Jamais la prod. La mesure envoyée est celle que l'agent fillsell-mesure.py a rendue sur cloud-2 le 06/11 vers 18:45
// (mode --essai, rien envoyé) ; le reste est un décor réduit aux colonnes lues.
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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-mesures-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55440, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55440/postgres';
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = lire('../../supabase/migrations/20261106210000_cloud_mesures_charge.sql');
const INVERSE = lire('../../supabase/rollbacks/20261106210000_cloud_mesures_charge_INVERSE.sql');
const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
const AUTRE = '11111111-2222-4333-8444-555555555555';
const HOTE = { points: 6, navigateurs_max: 1, cpu_moy_pct: 0.082, cpu_p95_pct: 0.118, charge1_max: 0.14, mem_total_mo: 64076,
  mem_dispo_min_mo: 61417, mem_utilisee_max_pct: 4.1, puce_moy_pct: 0.0, puce_p95_pct: 0.0 };
const COMPTE = { mem_med_mo: 1261, mem_max_mo: 1269, nonrec_med_mo: 828, cpu_moy_fils: 0.009, cpu_max_fils: 0.021, puce_moy_pct: 0.0,
  puce_max_pct: 0.0, bride_part: 0.167, oom: 0 };

const DECOR = String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE public.cloud_postes (user_id uuid PRIMARY KEY, serveur text, etat text, details jsonb DEFAULT '{}'::jsonb, maj_le timestamptz);
CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, status text, action text, platform text,
  created_at timestamptz DEFAULT now(), published_at timestamptz, platform_fields jsonb DEFAULT '{}'::jsonb, handler_build text);
INSERT INTO public.cloud_postes VALUES ('${NICO}', 'cloud-2', 'actif', '{}', now()), ('${AUTRE}', 'cloud-2', 'actif', '{}', now());
`;
const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
let echecs = 0;
const verifier = (nom, cond, detail = '') => { console.log(`${cond ? '✓' : '✗'} ${nom}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) echecs++; };
const un = async (q, p) => (await c.query(q, p)).rows[0];
const noter = (hote, comptes, serveur = 'cloud-2') => c.query(`SELECT public.cloud_mesure_noter($1, $2::jsonb, $3::jsonb)`, [serveur, JSON.stringify(hote), JSON.stringify(comptes)]);
const refuse = async (f) => { try { await f(); return false; } catch { return true; } };
const job = (u, status, debut, finS, build = 'x+d426d23-cloud · v0.6.169', action = 'republish') => c.query(
  `INSERT INTO public.cross_post_jobs (user_id, status, action, platform, published_at, platform_fields, handler_build)
   VALUES ($1, $2, $6, 'vinted', CASE WHEN $4::int IS NULL THEN NULL ELSE $3::timestamptz + make_interval(secs => $4::int) END,
           jsonb_build_object('processing_since', $3::text), $5)`, [u, status, debut, finS, build, action]);

try {
  await c.query(DECOR);
  await c.query(MIGRATION); await c.query(MIGRATION);
  verifier('migration appliquée deux fois sans erreur', true);
  await noter(HOTE, { [NICO]: COMPTE });
  await noter({ ...HOTE, navigateurs_max: 2, cpu_p95_pct: 3.5, mem_dispo_min_mo: 60000, mem_utilisee_max_pct: 6.4, puce_p95_pct: 1.2 },
    { [NICO]: { ...COMPTE, mem_max_mo: 1420, cpu_max_fils: 1.5, bride_part: 0.3 }, [AUTRE]: { ...COMPTE, mem_med_mo: 1500, mem_max_mo: 2100, oom: 1 } });
  verifier('deux mesures écrites (la vraie sortie de l’agent sur cloud-2)', (await un(`SELECT count(*)::int AS n FROM public.cloud_mesures`)).n === 2);
  verifier('nom de serveur illisible : refusé', await refuse(() => noter(HOTE, {}, 'Cloud 2; DROP')));
  verifier('hote qui n’est pas un objet : refusé', await refuse(() => c.query(`SELECT public.cloud_mesure_noter('cloud-2', '[1]'::jsonb, '{}'::jsonb)`)));
  verifier('mesure trop grosse : refusée', await refuse(() => noter(HOTE, Object.fromEntries(Array.from({ length: 3000 }, (_, i) => [`u${i}`, COMPTE])))));

  const maintenant = new Date().toISOString();
  await job(NICO, 'published', maintenant, 58); await job(NICO, 'published', maintenant, 120); await job(NICO, 'failed', maintenant, null);
  await job(NICO, 'needs_user', maintenant, null); await job(NICO, 'cancelled', maintenant, null);
  await job(NICO, 'published', maintenant, 30, '2026-11-01T…+b7b756c · v0.6.164');                                   // PC : pas Cloud
  await job(NICO, 'published', new Date(Date.now() - 9 * 86400e3).toISOString(), 40);                               // trop vieux
  await c.query(`INSERT INTO public.cross_post_jobs (user_id, status, platform_fields, handler_build) VALUES ($1, 'published', '{"processing_since":"pas une date"}', 'x-cloud')`, [NICO]);
  const h = await un(`SELECT * FROM public.cloud_charge_heures ORDER BY heure DESC LIMIT 1`);
  verifier('heure : hôte (2 fenêtres, 2 comptes ouverts au plus, mémoire dispo min 60 000 Mo)',
    Number(h.fenetres_5min) === 2 && h.comptes_ouverts_max === 2 && h.mem_dispo_min_mo === 60000, JSON.stringify(h));
  verifier('heure : mémoire par compte (médiane 1 261, max 2 100), oom 1, bridage max 0,3',
    Number(h.mem_par_compte_med_mo) === 1261 && h.mem_par_compte_max_mo === 2100 && Number(h.oom) === 1 && Number(h.bride_part_max) === 0.3, JSON.stringify(h));
  verifier('heure : jobs du Cloud seulement (5), 2 faits, 2 ratés (failed + needs_user), 1 annulé ; PC, vieux et date illisible écartés',
    Number(h.jobs) === 5 && Number(h.jobs_faits) === 2 && Number(h.jobs_rates) === 2 && Number(h.jobs_annules) === 1, JSON.stringify(h));
  verifier('heure : durée médiane 89 s (58 et 120), p95 117 s', Number(h.duree_med_s) === 89 && Number(h.duree_p95_s) === 117, `${h.duree_med_s} / ${h.duree_p95_s}`);
  const cs = (await c.query(`SELECT * FROM public.cloud_charge_comptes ORDER BY compte`)).rows;
  const n = cs.find((r) => r.compte === NICO), a = cs.find((r) => r.compte === AUTRE);
  verifier('par compte : Nico (2 fenêtres, mémoire max 1 420, 5 jobs dont 2 ratés), l’autre (1 fenêtre, oom 1, aucun job)',
    Number(n?.fenetres_5min) === 2 && n?.mem_max_mo === 1420 && Number(n?.jobs) === 5 && Number(n?.jobs_rates) === 2
    && Number(a?.fenetres_5min) === 1 && Number(a?.oom) === 1 && Number(a?.jobs) === 0, JSON.stringify(cs));

  await c.query(`INSERT INTO public.cloud_mesures (serveur, le) SELECT 'cloud-2', now() - interval '31 days' - make_interval(mins => g) FROM generate_series(1, 70) g`);
  await c.query(`INSERT INTO public.cloud_mesures (serveur, le) VALUES ('cloud-3', now() - interval '40 days')`);
  await noter(HOTE, {});
  verifier('rétention : au plus 50 lignes échues effacées par écriture, de CE serveur seulement',
    (await un(`SELECT count(*) FILTER (WHERE serveur = 'cloud-2' AND le < now() - interval '30 days')::int AS v, count(*) FILTER (WHERE serveur = 'cloud-3')::int AS t FROM public.cloud_mesures`)).v === 20
    && (await un(`SELECT count(*)::int AS t FROM public.cloud_mesures WHERE serveur = 'cloud-3'`)).t === 1);
  await noter(HOTE, {});
  verifier('rétention : l’écriture suivante finit le travail', (await un(`SELECT count(*)::int AS v FROM public.cloud_mesures WHERE serveur = 'cloud-2' AND le < now() - interval '30 days'`)).v === 0);

  const d = await un(`SELECT has_table_privilege('authenticated', 'public.cloud_mesures', 'SELECT') AS t,
      has_table_privilege('anon', 'public.cloud_charge_heures', 'SELECT') AS v1, has_table_privilege('authenticated', 'public.cloud_charge_comptes', 'SELECT') AS v2,
      has_function_privilege('authenticated', 'public.cloud_mesure_noter(text, jsonb, jsonb)', 'EXECUTE') AS f,
      has_function_privilege('service_role', 'public.cloud_mesure_noter(text, jsonb, jsonb)', 'EXECUTE') AS s,
      (SELECT relrowsecurity FROM pg_class WHERE relname = 'cloud_mesures') AS rls`);
  verifier('droits : rien pour anon / authenticated, service_role écrit, RLS active', !d.t && !d.v1 && !d.v2 && !d.f && d.s && d.rls, JSON.stringify(d));
  const opt = (await c.query(`SELECT relname, reloptions FROM pg_class WHERE relname IN ('cloud_jobs_mesures','cloud_charge_heures','cloud_charge_comptes')`)).rows;
  verifier('vues en security_invoker (jamais les droits du propriétaire)', opt.length === 3 && opt.every((r) => String(r.reloptions).includes('security_invoker=on')), JSON.stringify(opt));

  await c.query(INVERSE); await c.query(INVERSE);
  verifier('INVERSE (deux fois) : table, vues, fonction retirées',
    (await un(`SELECT count(*)::int AS n FROM pg_class WHERE relname IN ('cloud_mesures','cloud_jobs_mesures','cloud_charge_heures','cloud_charge_comptes')`)).n === 0
    && (await un(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'cloud_mesure_noter'`)).n === 0);
  verifier('INVERSE : cloud_postes et cross_post_jobs intacts', (await un(`SELECT count(*)::int AS n FROM public.cross_post_jobs`)).n === 8);
  await c.query(MIGRATION);
  verifier('migration rejouée après l’inverse', (await un(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'cloud_mesure_noter'`)).n === 1);
} catch (e) {
  echecs++;
  console.log(`✗ ERREUR : ${e.message}`);
} finally {
  await c.end();
  if (embarque) { await embarque.pg.stop(); embarque.rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(echecs ? `\n${echecs} échec(s)` : '\nTOUT VERT');
process.exit(echecs ? 1 : 0);
