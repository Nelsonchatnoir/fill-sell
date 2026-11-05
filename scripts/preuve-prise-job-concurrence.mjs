// (05/11 soir, lot « Ouverture du Cloud », point 13 — décision i de Nico) PREUVE DE CONCURRENCE DE LA PRISE DE JOB, SUR UN
// POSTGRES JETABLE, avec les définitions EXACTES de la production (lues en lecture seule : pg_get_functiondef) de
// reserver_jobs_extension, controler_job_extension, ecrire_statut_job_extension et prendre_job.
// Deux postes d'un même compte (l'ordinateur « pc » et le Cloud « cloud ») se disputent 40 tâches, en même temps, par
// 16 connexions chacun, plusieurs tours : l'ordinateur par le chemin de l'extension (réservation → contrôle → écriture
// compare-and-set pending → processing), le Cloud par la prise atomique (prendre_job). Attendu : chaque tâche passe
// « processing » UNE seule fois, par UN seul poste, et le poste perdant ne l'écrit jamais.
//
//   node scripts/preuve-prise-job-concurrence.mjs            (Postgres 17 embarqué, port 55461 ; rien ne touche la prod)
import pg from 'pg';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const FONCTIONS = ['controler_job_extension', 'ecrire_statut_job_extension', 'prendre_job', 'reserver_jobs_extension'];

// ── 1. Les définitions de prod (lecture seule) ──
const dossierLecture = mkdtempSync(join(tmpdir(), 'fs-prise-job-lecture-'));
const fichierSql = join(dossierLecture, 'defs.sql');
writeFileSync(fichierSql, `SELECT p.proname, pg_get_functiondef(p.oid) AS d FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN (${FONCTIONS.map((f) => `'${f}'`).join(', ')});`);
const lecture = spawnSync(`npx supabase db query --linked --read-only -f "${fichierSql}" -o json`, { cwd: RACINE, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
rmSync(dossierLecture, { recursive: true, force: true });
if (lecture.status !== 0) { console.error(`lecture des définitions de prod impossible : ${(lecture.stderr || '').slice(-300)}`); process.exit(2); }
const defs = JSON.parse(lecture.stdout).rows;
if (defs.length !== FONCTIONS.length) { console.error(`définitions lues : ${defs.length}/${FONCTIONS.length}`); process.exit(2); }

// ── 2. La base jetable ──
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const dossier = mkdtempSync(join(tmpdir(), 'fs-prise-job-'));
const embarque = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55461, persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} });
await embarque.initialise();
await embarque.start();
const URL_PG = 'postgres://postgres:preuve@127.0.0.1:55461/postgres';
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d !== undefined ? `\n      ${JSON.stringify(d).slice(0, 600)}` : ''}`); } };
try {
  const admin = new pg.Client({ connectionString: URL_PG });
  await admin.connect();
  await admin.query(`
    CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY, user_id uuid NOT NULL, voie text NOT NULL DEFAULT 'extension',
      status text NOT NULL DEFAULT 'pending', error text, platform_fields jsonb, handler_build text, listing_url text,
      platform_listing_id text, published_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE TABLE public.jobs_reservations_extension (job_id uuid PRIMARY KEY, user_id uuid NOT NULL, poste text NOT NULL,
      reservation uuid NOT NULL DEFAULT gen_random_uuid(), expire_le timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
      commence boolean NOT NULL DEFAULT false, servi_n integer NOT NULL DEFAULT 1, premier_service timestamptz NOT NULL DEFAULT now());`);
  for (const f of FONCTIONS) await admin.query(defs.find((x) => x.proname === f).d);
  const U = '00000000-0000-4000-8000-0000000000aa';
  const N = 40;
  const ids = Array.from({ length: N }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
  for (const id of ids) await admin.query(`INSERT INTO public.cross_post_jobs (id, user_id) VALUES ($1, $2)`, [id, U]);

  // ── 3. La course ──
  const pris = [];          // { job, poste, chemin }
  const refus = [];
  async function connexions(k) { const l = []; for (let i = 0; i < k; i++) { const c = new pg.Client({ connectionString: URL_PG }); await c.connect(); l.push(c); } return l; }
  const pcs = await connexions(16), clouds = await connexions(16);
  const melanger = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  async function cheminPc(c) {
    // L'extension : la file réservée (get-pending-jobs), puis pour chaque tâche le contrôle et l'écriture compare-and-set.
    const { rows } = await c.query(`SELECT public.reserver_jobs_extension($1, 'pc', $2::uuid[], NULL) AS r`, [U, melanger(ids)]);
    for (const job of melanger(rows[0].r ?? [])) {
      const ctl = (await c.query(`SELECT public.controler_job_extension($1, 'pc', $2, 'processing') AS r`, [U, job]).catch((e) => ({ rows: [{ r: { ok: false, reason: e.message } }] }))).rows[0].r;
      if (!ctl?.ok || ctl.statut !== 'pending') { refus.push(['pc', job, ctl?.reason ?? ctl?.statut]); continue; }
      const w = (await c.query(`SELECT public.ecrire_statut_job_extension($1, 'pc', $2, $3, 'pending', $4::jsonb) AS r`,
        [U, job, ctl.reservation, JSON.stringify({ status: 'processing', platform_fields: { executant: 'pc' } })]).catch((e) => ({ rows: [{ r: { ok: false, reason: e.message } }] }))).rows[0].r;
      if (w?.ok) pris.push({ job, poste: 'pc', chemin: 'extension' }); else refus.push(['pc', job, w?.reason]);
    }
  }
  async function cheminCloud(c) {
    // Le Cloud : la file réservée, puis la prise atomique prendre_job.
    const { rows } = await c.query(`SELECT public.reserver_jobs_extension($1, 'cloud', $2::uuid[], NULL) AS r`, [U, melanger(ids)]);
    for (const job of melanger([...(rows[0].r ?? []), ...melanger(ids).slice(0, 5)])) {
      const r = (await c.query(`SELECT public.prendre_job($1, 'cloud', $2, 'cloud-build') AS r`, [U, job]).catch((e) => ({ rows: [{ r: { pris: false, reason: e.message } }] }))).rows[0].r;
      if (r?.pris) pris.push({ job, poste: 'cloud', chemin: 'prendre_job' }); else refus.push(['cloud', job, r?.reason]);
    }
  }
  for (let tour = 0; tour < 3; tour++) {
    await Promise.all([...pcs.map((c) => cheminPc(c)), ...clouds.map((c) => cheminCloud(c))]);
  }
  for (const c of [...pcs, ...clouds]) await c.end();

  // ── 4. Le verdict ──
  const parJob = new Map();
  for (const p of pris) parJob.set(p.job, [...(parJob.get(p.job) ?? []), p.poste]);
  const doubles = [...parJob.entries()].filter(([, l]) => l.length > 1);
  ok(doubles.length === 0, `aucune tâche prise deux fois (${pris.length} prises réussies pour ${N} tâches, ${refus.length} refus propres)`, doubles.slice(0, 3));
  const { rows: fin } = await admin.query(`SELECT j.id, j.status, j.platform_fields->>'executant' AS exe, r.poste FROM public.cross_post_jobs j
    LEFT JOIN public.jobs_reservations_extension r ON r.job_id = j.id`);
  ok(fin.every((j) => j.status === 'processing'), `les ${N} tâches sont « processing » (aucune perdue)`, fin.filter((j) => j.status !== 'processing').slice(0, 3));
  const incoherents = fin.filter((j) => !parJob.has(j.id) || parJob.get(j.id)[0] !== j.exe || j.poste !== j.exe);
  ok(incoherents.length === 0, 'chaque tâche porte l’exécutant QUI l’a prise, et sa réservation est à ce même poste', incoherents.slice(0, 3));
  const parPoste = { pc: pris.filter((p) => p.poste === 'pc').length, cloud: pris.filter((p) => p.poste === 'cloud').length };
  ok(parPoste.pc + parPoste.cloud === N, `répartition : ordinateur ${parPoste.pc}, Cloud ${parPoste.cloud} (somme = ${N})`);
  const raisons = [...new Set(refus.map((r) => String(r[2] ?? '').slice(0, 60)))];
  ok(raisons.every((r) => /réservé à un autre poste|déjà en cours|a changé|plus à exécuter|réservation|^processing$|null|lock|undefined/i.test(r)), 'les refus sont ceux des gardes (autre poste, déjà en cours, a changé)', raisons.slice(0, 6));
  await admin.end();
} finally {
  await embarque.stop().catch(() => {});
  rmSync(dossier, { recursive: true, force: true });
}
console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
