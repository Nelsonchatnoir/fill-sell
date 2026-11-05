// (05/11 soir, lot « Ouverture du Cloud », point 10) PREUVE DU JOURNAL DES ÉTAPES D'UNE REPUBLICATION, SUR UN POSTGRES
// JETABLE : la migration 20261105230000_journal_etapes_republication.sql, avec les définitions EXACTES de la production
// (lues en lecture seule : pg_get_functiondef) de reserver_jobs_extension, controler_job_extension,
// ecrire_statut_job_extension et prendre_job — les deux chemins par lesquels l'ordinateur et le Cloud écrivent un job.
// Attendu : une entrée par étape franchie (création, statut, republish_step), à l'heure du serveur ; rien de plus sur
// une écriture qui ne franchit rien ; un client ne peut ni effacer ni réécrire le journal ; 30 entrées au plus ; l'état
// noté est l'état FINAL (après les autres déclencheurs BEFORE) ; publications et retraits non touchés ; coût mesuré.
//
//   node scripts/preuve-journal-etapes-republication.mjs     (Postgres 17 embarqué, port 55462 ; rien ne touche la prod)
import pg from 'pg';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const MIGRATION = join(RACINE, 'supabase/migrations/20261105230000_journal_etapes_republication.sql');
const INVERSE = join(RACINE, 'supabase/rollbacks/20261105230000_journal_etapes_republication_INVERSE.sql');
const FONCTIONS = ['controler_job_extension', 'ecrire_statut_job_extension', 'prendre_job', 'reserver_jobs_extension'];

function lireProd(sql) {
  const dossier = mkdtempSync(join(tmpdir(), 'fs-journal-lecture-'));
  const fichier = join(dossier, 'q.sql');
  writeFileSync(fichier, sql);
  const r = spawnSync(`npx supabase db query --linked --read-only -f "${fichier}" -o json`, { cwd: RACINE, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  rmSync(dossier, { recursive: true, force: true });
  if (r.status !== 0) { console.error(`lecture de prod impossible : ${(r.stderr || '').slice(-300)}`); process.exit(2); }
  const j = JSON.parse(r.stdout);
  return j.rows ?? Object.values(j).find(Array.isArray) ?? [];
}

// ── 1. La production, en lecture seule : les fonctions d'écriture des jobs et les déclencheurs BEFORE ──
const defs = lireProd(`SELECT p.proname, pg_get_functiondef(p.oid) AS d FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN (${FONCTIONS.map((f) => `'${f}'`).join(', ')});`);
if (defs.length !== FONCTIONS.length) { console.error(`définitions lues : ${defs.length}/${FONCTIONS.length}`); process.exit(2); }
const declencheurs = lireProd(`SELECT t.tgname, (t.tgtype & 2) <> 0 AS avant FROM pg_trigger t
  WHERE t.tgrelid = 'public.cross_post_jobs'::regclass AND NOT t.tgisinternal;`);

// ── 2. La base jetable ──
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const dossier = mkdtempSync(join(tmpdir(), 'fs-journal-'));
const embarque = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55462, persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} });
await embarque.initialise();
await embarque.start();
const URL_PG = 'postgres://postgres:preuve@127.0.0.1:55462/postgres';
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d !== undefined ? `\n      ${JSON.stringify(d).slice(0, 700)}` : ''}`); } };
try {
  const db = new pg.Client({ connectionString: URL_PG });
  await db.connect();
  await db.query(`
    CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY, user_id uuid NOT NULL, voie text NOT NULL DEFAULT 'extension',
      action text NOT NULL DEFAULT 'publish', platform text NOT NULL DEFAULT 'leboncoin', inventaire_id bigint,
      status text NOT NULL DEFAULT 'pending', error text, platform_fields jsonb, handler_build text, listing_url text,
      platform_listing_id text, published_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE TABLE public.jobs_reservations_extension (job_id uuid PRIMARY KEY, user_id uuid NOT NULL, poste text NOT NULL,
      reservation uuid NOT NULL DEFAULT gen_random_uuid(), expire_le timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
      commence boolean NOT NULL DEFAULT false, servi_n integer NOT NULL DEFAULT 1, premier_service timestamptz NOT NULL DEFAULT now());`);
  for (const f of FONCTIONS) await db.query(defs.find((x) => x.proname === f).d);
  // Un déclencheur BEFORE qui change le statut, nommé comme ceux de la prod (il passe AVANT zz_…) : le journal doit noter
  // l'état FINAL de l'écriture.
  await db.query(`
    CREATE FUNCTION public.cross_post_jobs_essai_change_statut() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.platform_fields->>'forcer_needs_user' = 'oui' THEN NEW.status := 'needs_user'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER cross_post_jobs_essai_change_statut BEFORE UPDATE OF status, platform_fields ON public.cross_post_jobs
      FOR EACH ROW EXECUTE FUNCTION public.cross_post_jobs_essai_change_statut();`);
  await db.query(readFileSync(MIGRATION, 'utf8'));

  const U = '00000000-0000-4000-8000-0000000000aa';
  const id = (k) => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`;
  const journal = async (k) => (await db.query(`SELECT platform_fields->'journal_etapes' AS j FROM public.cross_post_jobs WHERE id = $1`, [id(k)])).rows[0]?.j ?? null;
  const etapes = (j) => (j ?? []).map((e) => `${e.etape}/${e.statut}`);
  const ins = (k, action, pf = null, extra = {}) => db.query(
    `INSERT INTO public.cross_post_jobs (id, user_id, action, platform, platform_fields, voie) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id(k), U, action, extra.platform ?? 'leboncoin', pf, extra.voie ?? 'extension']);

  // ── 3. Création ──
  await ins(1, 'republish', { republish_step: 'a_capturer', republish_platform: 'leboncoin' });
  let j1 = await journal(1);
  ok(JSON.stringify(etapes(j1)) === JSON.stringify(['a_capturer/pending']), 'création d’une republication : une entrée « a_capturer / pending »', j1);
  ok(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(j1?.[0]?.le ?? ''), 'heure du serveur, en UTC lisible (Date.parse)', j1?.[0]?.le);
  await ins(2, 'publish', { foo: 1 });
  await ins(3, 'delete', null);
  ok((await journal(2)) === null && (await journal(3)) === null, 'publication et retrait : aucun journal (déclencheur limité aux republications)');

  // ── 4. Le chemin de l'ordinateur : réservation → contrôle → écriture compare-and-set (définitions de prod) ──
  const reserver = async (k, poste) => (await db.query(`SELECT public.reserver_jobs_extension($1, $2, $3::uuid[], NULL) AS r`, [U, poste, [id(k)]])).rows[0].r;
  const controler = async (k, poste, statut) => (await db.query(`SELECT public.controler_job_extension($1, $2, $3, $4) AS r`, [U, poste, id(k), statut])).rows[0].r;
  const ecrire = async (k, poste, reservation, avant, patch) => (await db.query(`SELECT public.ecrire_statut_job_extension($1, $2, $3, $4, $5, $6::jsonb) AS r`,
    [U, poste, id(k), reservation, avant, JSON.stringify(patch)])).rows[0].r;
  const pfDe = async (k) => (await db.query(`SELECT platform_fields AS p FROM public.cross_post_jobs WHERE id = $1`, [id(k)])).rows[0].p;
  await reserver(1, 'pc');
  let ctl = await controler(1, 'pc', 'processing');
  ok(ctl?.ok && ctl.statut === 'pending', 'contrôle de prod : la tâche est à l’ordinateur', ctl);
  // L'extension écrit platform_fields ENTIER (jsonb_populate_record) depuis SA copie, sans le journal.
  let w = await ecrire(1, 'pc', ctl.reservation, 'pending', { status: 'processing', platform_fields: { republish_step: 'a_capturer', republish_platform: 'leboncoin', processing_since: 'x' } });
  ok(w?.ok, 'écriture de prod pending → processing acceptée', w);
  j1 = await journal(1);
  ok(JSON.stringify(etapes(j1)) === JSON.stringify(['a_capturer/pending', 'a_capturer/processing']), 'prise par l’ordinateur notée, journal gardé malgré une copie SANS journal', j1);
  ctl = await controler(1, 'pc', 'processing');
  w = await ecrire(1, 'pc', ctl.reservation, 'processing', { platform_fields: { ...(await pfDe(1)), work_window_state: { at: 'battement' } } });
  ok(w?.ok && etapes(await journal(1)).length === 2, 'écriture sans étape franchie (battement) : aucune entrée de plus', await journal(1));
  w = await ecrire(1, 'pc', ctl.reservation, 'processing', { platform_fields: { ...(await pfDe(1)), republish_step: 'captured', republish_snapshot: { captured_at: 'client' } } });
  j1 = await journal(1);
  ok(w?.ok && etapes(j1).at(-1) === 'captured/processing', 'copie faite : « captured / processing » noté', j1);
  // Une copie ANCIENNE du client (journal d'une entrée, puis un journal forgé) ne réécrit rien.
  await db.query(`UPDATE public.cross_post_jobs SET platform_fields = $2::jsonb WHERE id = $1`, [id(1), JSON.stringify({ ...(await pfDe(1)), journal_etapes: [{ etape: 'recreated', statut: 'published', le: '2020-01-01T00:00:00.000Z' }] })]);
  ok(JSON.stringify(await journal(1)) === JSON.stringify(j1), 'journal forgé par un client : ignoré, celui de la ligne reste', await journal(1));
  await db.query(`UPDATE public.cross_post_jobs SET platform_fields = $2::jsonb WHERE id = $1`, [id(1), JSON.stringify({ republish_step: 'deleted', deleted_at: 'client' })]);
  const j1b = await journal(1);
  ok(etapes(j1b).length === etapes(j1).length + 1 && etapes(j1b).at(-1) === 'deleted/processing' && JSON.stringify(j1b.slice(0, -1)) === JSON.stringify(j1),
    'objet NEUF écrit par un client (sans journal) : historique repris de la ligne + « deleted » noté', j1b);
  await db.query(`UPDATE public.cross_post_jobs SET status = 'published', platform_fields = platform_fields || '{"republish_step":"recreated"}'::jsonb WHERE id = $1`, [id(1)]);
  ok(etapes(await journal(1)).at(-1) === 'recreated/published', 'remise en ligne : « recreated / published » noté (étape ET statut dans la même écriture = une entrée)', await journal(1));
  const t = (await journal(1)).map((e) => Date.parse(e.le));
  ok(t.every((x, i) => Number.isFinite(x) && (i === 0 || x >= t[i - 1])), 'heures croissantes, toutes lisibles');
  await db.query(`UPDATE public.cross_post_jobs SET status = status, platform_fields = platform_fields WHERE id = $1`, [id(1)]);
  ok(etapes(await journal(1)).length === 5, 'réécriture à l’identique : rien de plus', await journal(1));

  // ── 5. Le chemin du Cloud : prise atomique prendre_job (définition de prod) ──
  await ins(4, 'republish', { republish_step: 'a_capturer' }, { platform: 'vinted', voie: 'extension' });
  await reserver(4, 'cloud');
  const pris = (await db.query(`SELECT public.prendre_job($1, 'cloud', $2, 'cloud-build') AS r`, [U, id(4)])).rows[0].r;
  ok(pris?.pris === true, 'prendre_job de prod : la tâche est prise par le Cloud', pris);
  ok(JSON.stringify(etapes(await journal(4))) === JSON.stringify(['a_capturer/pending', 'a_capturer/processing']), 'prise par le Cloud notée de la même façon', await journal(4));

  // ── 6. L'état FINAL : un autre déclencheur BEFORE change le statut ──
  await db.query(`UPDATE public.cross_post_jobs SET status = 'pending', platform_fields = platform_fields || '{"forcer_needs_user":"oui"}'::jsonb WHERE id = $1`, [id(4)]);
  const j4 = await journal(4);
  ok(etapes(j4).at(-1) === 'a_capturer/needs_user', 'le journal note l’état FINAL (needs_user posé par un autre déclencheur BEFORE), jamais « pending »', j4);

  // ── 7. Borne : 30 entrées, les plus récentes ──
  await ins(5, 'republish', { republish_step: 'a_capturer' });
  for (let i = 0; i < 40; i++) await db.query(`UPDATE public.cross_post_jobs SET status = $2 WHERE id = $1`, [id(5), i % 2 ? 'pending' : 'processing']);
  const j5 = await journal(5);
  ok(j5.length === 30 && j5.at(-1).statut === 'pending' && j5[0].statut === 'processing', '41 passages : 30 entrées gardées, les plus récentes', { n: j5.length, premier: j5[0], dernier: j5.at(-1) });

  // ── 8. Ordre des déclencheurs en PRODUCTION : zz_… passe après tous les BEFORE existants ──
  const avants = declencheurs.filter((d) => d.avant === true || d.avant === 't').map((d) => d.tgname).sort();
  const nom = 'zz_journal_etapes_republication';
  ok(avants.length > 10 && avants.every((x) => x < nom), `prod : ${avants.length} déclencheurs BEFORE, tous avant « ${nom} » (ordre alphabétique)`, avants.filter((x) => x >= nom));

  // ── 9. Coût : 5 000 écritures d'une republication, avec et sans le déclencheur ──
  await ins(6, 'republish', { republish_step: 'captured', work_window_state: { at: 0 } });
  const mesurer = async () => {
    const t0 = process.hrtime.bigint();
    await db.query(`DO $$ BEGIN FOR i IN 1..5000 LOOP UPDATE public.cross_post_jobs SET platform_fields = platform_fields || jsonb_build_object('work_window_state', jsonb_build_object('at', i)) WHERE id = '${id(6)}'; END LOOP; END $$;`);
    return Number(process.hrtime.bigint() - t0) / 1e6;
  };
  const avec = await mesurer();
  await db.query(readFileSync(INVERSE, 'utf8'));
  const sans = await mesurer();
  const parEcriture = (avec - sans) / 5000;
  ok(parEcriture < 0.05, `coût mesuré : ${(avec / 5000 * 1000).toFixed(1)} µs par écriture avec, ${(sans / 5000 * 1000).toFixed(1)} µs sans → ${(parEcriture * 1000).toFixed(1)} µs de plus (< 50 µs)`);
  // ── 10. L'inverse : plus de déclencheur, le journal écrit reste inerte ──
  const avantInverse = await journal(1);
  await db.query(`UPDATE public.cross_post_jobs SET status = 'pending' WHERE id = $1`, [id(1)]);
  ok(JSON.stringify(await journal(1)) === JSON.stringify(avantInverse), 'après l’inverse : plus rien noté, le journal déjà écrit reste tel quel');
  const reste = (await db.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'zz_journal_etapes_republication'`)).rows[0].n
    + (await db.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'journal_etapes_republication'`)).rows[0].n;
  ok(reste === 0, 'l’inverse retire le déclencheur et sa fonction');
  await db.end();
} finally {
  await embarque.stop().catch(() => {});
  rmSync(dossier, { recursive: true, force: true });
}
console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
