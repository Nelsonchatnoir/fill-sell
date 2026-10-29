// PREUVE, EN CONCURRENCE RÉELLE, de la prise de job atomique en UN appel (prendre_job, migration 20261030100000) —
// prérequis du Cloud : deux exécutants (l'extension d'un ordinateur et un poste Cloud, ou deux postes Cloud, ou deux
// exécutants d'un MÊME poste) ne prennent JAMAIS le même job.
//
//   npm i --no-save embedded-postgres@17.10.0-beta.17 pg@8.16.3
//   PREUVE_PG=embarque node scripts/cloud/preuve-prendre-job-concurrente.mjs     (Postgres 17 jetable sur le PC)
//   PREUVE_PG=postgres://…@127.0.0.1:…/postgres node scripts/cloud/preuve-prendre-job-concurrente.mjs
//
// Jamais la prod (refus si l'URL est celle de Supabase). Les quatre fonctions sont celles de la PROD, relues le
// 29/10/2026 par pg_get_functiondef (controler_job_extension md5 b1ee5606…, ecrire_statut_job_extension 61996a97…,
// reserver_jobs_extension 4f775c0e…, liberer_reservation_job_termine 727fb1ff…), recopiées dans un schéma « preuve »
// (search_path seul changé) ; prendre_job est celle de la migration, même corps.
// Ce qui est prouvé :
//   A. 16 connexions, 4 postes, appellent prendre_job sur les MÊMES 200 jobs en même temps : chaque job est pris UNE
//      fois (200 prises, 0 double), et tous finissent « processing » ;
//   B. le trou T1 existe sur le chemin d'avant (deux exécutants d'un MÊME poste : controler + ecrire depuis
//      « processing » rendent deux fois ok) — et prendre_job le ferme (0 double sur le même poste) ;
//   C. extension (reserver + controler + ecrire, le chemin d'update-job-status) ET Cloud (prendre_job) en même temps
//      sur 200 jobs : 0 job démarré par deux exécutants ;
//   D. un job arrêté par la personne, ou retenu pour la lecture de son annonce d'origine, n'est jamais pris.
import pg from 'pg';

let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-pg-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55433, persistent: false }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55433/postgres';
}

const SCHEMA = String.raw`
DROP SCHEMA IF EXISTS preuve CASCADE; CREATE SCHEMA preuve; SET search_path TO preuve, public;
CREATE TABLE preuve.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, voie text NOT NULL DEFAULT 'extension',
  status text NOT NULL DEFAULT 'pending', error text, platform_fields jsonb, handler_build text, listing_url text, platform_listing_id text, published_at timestamptz);
CREATE TABLE preuve.jobs_reservations_extension (job_id uuid PRIMARY KEY, user_id uuid, poste text, reservation uuid DEFAULT gen_random_uuid(),
  expire_le timestamptz DEFAULT now() + interval '10 minutes', commence boolean DEFAULT false, servi_n integer DEFAULT 1, premier_service timestamptz DEFAULT now());
CREATE TABLE preuve.prises (job_id uuid, executant text, voie text, le timestamptz DEFAULT clock_timestamp());

CREATE OR REPLACE FUNCTION preuve.liberer_reservation_job_termine()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'preuve', 'pg_temp'
AS $function$
BEGIN
 IF TG_OP='DELETE' THEN
  DELETE FROM jobs_reservations_extension WHERE job_id=OLD.id;
  RETURN OLD;
 END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status<>'processing' THEN
  DELETE FROM jobs_reservations_extension WHERE job_id=NEW.id;
 END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER liberer AFTER UPDATE OR DELETE ON preuve.cross_post_jobs FOR EACH ROW EXECUTE FUNCTION preuve.liberer_reservation_job_termine();

CREATE OR REPLACE FUNCTION preuve.reserver_jobs_extension(p_user uuid, p_poste text, p_jobs uuid[], p_tete uuid DEFAULT NULL::uuid)
 RETURNS uuid[] LANGUAGE plpgsql SET search_path TO 'preuve', 'pg_temp' SET statement_timeout TO '2s' SET lock_timeout TO '500ms'
AS $function$
DECLARE v_id uuid; j cross_post_jobs%ROWTYPE; r jobs_reservations_extension%ROWTYPE;
 resultat uuid[]:='{}'; v_compte boolean;
BEGIN
 IF p_user IS NULL OR nullif(p_poste,'') IS NULL OR length(p_poste)>180 THEN RETURN resultat; END IF;
 FOR v_id IN SELECT id FROM unnest(p_jobs) WITH ORDINALITY x(id,n) ORDER BY n LIMIT 100 LOOP
  SELECT * INTO j FROM cross_post_jobs WHERE id=v_id AND user_id=p_user
   AND voie='extension' AND status='pending' FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  v_compte := p_tete IS NULL OR v_id = p_tete;
  SELECT * INTO r FROM jobs_reservations_extension WHERE job_id=v_id FOR UPDATE;
  IF FOUND AND NOT r.commence AND r.expire_le>now() THEN
   IF r.poste=p_poste THEN
    IF v_compte THEN
     UPDATE jobs_reservations_extension SET servi_n=servi_n+1 WHERE job_id=v_id;
    ELSE
     UPDATE jobs_reservations_extension SET servi_n=1, premier_service=now() WHERE job_id=v_id;
    END IF;
    resultat:=array_append(resultat,v_id);
   END IF;
   CONTINUE;
  END IF;
  INSERT INTO jobs_reservations_extension(job_id,user_id,poste,servi_n,premier_service)
   VALUES(v_id,p_user,p_poste,1,now()) ON CONFLICT(job_id) DO UPDATE SET
   poste=EXCLUDED.poste,reservation=gen_random_uuid(),expire_le=now()+interval '10 minutes',commence=false,
   servi_n=CASE WHEN v_compte AND jobs_reservations_extension.poste=EXCLUDED.poste AND NOT jobs_reservations_extension.commence
     THEN jobs_reservations_extension.servi_n+1 ELSE 1 END,
   premier_service=CASE WHEN v_compte AND jobs_reservations_extension.poste=EXCLUDED.poste AND NOT jobs_reservations_extension.commence
     THEN jobs_reservations_extension.premier_service ELSE now() END;
  resultat:=array_append(resultat,v_id);
 END LOOP;
 RETURN resultat;
END;
$function$;

CREATE OR REPLACE FUNCTION preuve.controler_job_extension(p_user uuid, p_poste text, p_job uuid, p_statut text)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'preuve', 'pg_temp' SET statement_timeout TO '2s' SET lock_timeout TO '500ms'
AS $function$
DECLARE j cross_post_jobs%ROWTYPE; r jobs_reservations_extension%ROWTYPE;
BEGIN
 IF p_user IS NULL OR nullif(p_poste,'') IS NULL OR length(p_poste)>180 THEN
  RETURN jsonb_build_object('ok',false,'reason','Session de ce poste indisponible. Reconnecte FillSell.'); END IF;
 SELECT * INTO j FROM cross_post_jobs WHERE id=p_job AND user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','Job introuvable.'); END IF;
 IF j.status = 'cancelled' AND COALESCE(j.platform_fields, '{}'::jsonb) ? 'arret_utilisateur' THEN
  RETURN jsonb_build_object('ok',false,'reason','Arrêtée à ta demande : rien à faire.'); END IF;
 IF j.status = 'pending' AND COALESCE(j.platform_fields, '{}'::jsonb) ? 'attente_lecture_origine'
    AND p_statut IN ('processing', 'failed', 'needs_user', 'pending') THEN
  RETURN jsonb_build_object('ok',false,'reason','En cours de lecture de ton annonce d''origine : elle partira toute seule avec toutes ses photos. Rien à faire.'); END IF;
 IF j.status NOT IN ('pending','processing') THEN
  IF p_statut='processing' THEN RETURN jsonb_build_object('ok',false,'reason','Ce job n’est plus à exécuter. Actualise la file.'); END IF;
  RETURN jsonb_build_object('ok',true,'reservation',null,'statut',j.status);
 END IF;
 SELECT * INTO r FROM jobs_reservations_extension WHERE job_id=p_job FOR UPDATE;
 IF FOUND AND r.poste<>p_poste THEN
  RETURN jsonb_build_object('ok',false,'reason','Ce job est réservé à un autre poste. Rien à exécuter ici.'); END IF;
 IF r.job_id IS NULL THEN
  INSERT INTO jobs_reservations_extension(job_id,user_id,poste) VALUES(p_job,p_user,p_poste)
   RETURNING * INTO r;
 END IF;
 RETURN jsonb_build_object('ok',true,'reservation',r.reservation,'statut',j.status);
END;
$function$;

CREATE OR REPLACE FUNCTION preuve.ecrire_statut_job_extension(p_user uuid, p_poste text, p_job uuid, p_reservation uuid, p_avant text, p_patch jsonb)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'preuve', 'pg_temp' SET statement_timeout TO '3s' SET lock_timeout TO '1s'
AS $function$
DECLARE j cross_post_jobs%ROWTYPE; r jobs_reservations_extension%ROWTYPE; nouveau cross_post_jobs%ROWTYPE;
BEGIN
 SELECT * INTO j FROM cross_post_jobs WHERE id=p_job AND user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','Job introuvable.'); END IF;
 IF j.status IS DISTINCT FROM p_avant THEN
  RETURN jsonb_build_object('ok',false,'reason','Le job a changé entre-temps. Actualise la file.'); END IF;
 IF p_reservation IS NOT NULL THEN
  SELECT * INTO r FROM jobs_reservations_extension WHERE job_id=p_job FOR UPDATE;
  IF r.reservation IS DISTINCT FROM p_reservation OR r.poste IS DISTINCT FROM p_poste THEN
   RETURN jsonb_build_object('ok',false,'reason','La réservation de ce poste a changé. Actualise la file.'); END IF;
  IF j.status NOT IN ('pending','processing') AND p_patch->>'status'='processing' THEN
   RETURN jsonb_build_object('ok',false,'reason','Ce job a été arrêté entre-temps.'); END IF;
 ELSIF j.status IS DISTINCT FROM p_avant THEN
  RETURN jsonb_build_object('ok',false,'reason','Le job a changé entre-temps. Actualise la file.');
 END IF;
 SELECT * INTO nouveau FROM jsonb_populate_record(j,p_patch);
 UPDATE cross_post_jobs SET status=nouveau.status,error=nouveau.error,
  platform_fields=nouveau.platform_fields,handler_build=nouveau.handler_build,
  listing_url=nouveau.listing_url,platform_listing_id=nouveau.platform_listing_id,
  published_at=nouveau.published_at WHERE id=p_job;
 IF nouveau.status='processing' THEN
  UPDATE jobs_reservations_extension SET commence=true WHERE job_id=p_job AND reservation=p_reservation;
 ELSE
  DELETE FROM jobs_reservations_extension WHERE job_id=p_job AND reservation=p_reservation;
 END IF;
 RETURN jsonb_build_object('ok',true,'job',jsonb_build_object('id',p_job,'status',nouveau.status));
END;
$function$;
`;

// prendre_job : le corps de la migration, au schéma « preuve ».
const { readFileSync } = await import('node:fs');
const MIG = readFileSync(new URL('../../supabase/migrations/20261030100000_prendre_job_atomique.sql', import.meta.url), 'utf8');
const corps = MIG.slice(MIG.indexOf('create or replace function public.prendre_job'), MIG.indexOf('revoke all on function public.prendre_job'))
  .replace('public.prendre_job', 'preuve.prendre_job')
  .replace("set search_path to 'public', 'pg_temp'", "set search_path to 'preuve', 'pg_temp'")
  .replaceAll('public.controler_job_extension', 'preuve.controler_job_extension')
  .replaceAll('public.ecrire_statut_job_extension', 'preuve.ecrire_statut_job_extension')
  .replaceAll('public.cross_post_jobs', 'preuve.cross_post_jobs');

let ko = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) ko++; };
const admin = new pg.Client({ connectionString: PG_URL });
await admin.connect();
await admin.query(SCHEMA);
await admin.query(corps);
const user = (await admin.query('SELECT gen_random_uuid() u')).rows[0].u;
const connexions = async (n) => Promise.all(Array.from({ length: n }, async () => { const c = new pg.Client({ connectionString: PG_URL }); await c.connect(); await c.query('SET search_path TO preuve, public'); return c; }));
const nouveauxJobs = async (n, pf = null) => {
  await admin.query('TRUNCATE preuve.cross_post_jobs, preuve.jobs_reservations_extension, preuve.prises');
  await admin.query('INSERT INTO preuve.cross_post_jobs (user_id, platform_fields) SELECT $1, $2::jsonb FROM generate_series(1, $3)', [user, pf ? JSON.stringify(pf) : null, n]);
  return (await admin.query('SELECT id FROM preuve.cross_post_jobs ORDER BY id')).rows.map((r) => r.id);
};
const melanger = (t) => { const a = [...t]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const prendre = async (c, poste, id, executant) => {
  const r = (await c.query('SELECT preuve.prendre_job($1, $2, $3, $4) r', [user, poste, id, 'preuve'])).rows[0].r;
  if (r?.pris) await c.query('INSERT INTO preuve.prises (job_id, executant, voie) VALUES ($1, $2, $3)', [id, executant, 'prendre_job']);
  return r;
};
const voieExtension = async (c, poste, id, executant, avant = null) => {
  const ctl = (await c.query("SELECT preuve.controler_job_extension($1, $2, $3, 'processing') r", [user, poste, id])).rows[0].r;
  if (!ctl?.ok) return false;
  const e = (await c.query("SELECT preuve.ecrire_statut_job_extension($1, $2, $3, $4, $5, '{\"status\":\"processing\"}'::jsonb) e", [user, poste, id, ctl.reservation, avant ?? ctl.statut])).rows[0].e;
  if (e?.ok) await c.query('INSERT INTO preuve.prises (job_id, executant, voie) VALUES ($1, $2, $3)', [id, executant, 'extension']);
  return e?.ok === true;
};
const bilan = async () => (await admin.query("SELECT count(*)::int prises, count(DISTINCT job_id)::int jobs, (SELECT count(*)::int FROM (SELECT job_id FROM preuve.prises GROUP BY job_id HAVING count(*) > 1) d) doubles, (SELECT count(*)::int FROM preuve.cross_post_jobs WHERE status = 'processing') processing FROM preuve.prises")).rows[0];

// A. 16 connexions, 4 postes, prendre_job sur les mêmes 200 jobs, en même temps.
console.log('\nA. prendre_job — 200 jobs, 16 connexions, 4 postes, tous en même temps');
{
  const jobs = await nouveauxJobs(200);
  const cs = await connexions(16);
  const POSTES = ['cloud-A', 'cloud-B', 'bureau-C', 'cloud-D'];
  await Promise.all(cs.map((c, i) => (async () => { for (const id of melanger(jobs)) await prendre(c, POSTES[i % 4], id, `c${i}`).catch(() => null); })()));
  const b = await bilan();
  ok(b.doubles === 0, `aucun job pris deux fois (${b.doubles} double(s))`);
  ok(b.prises === 200 && b.jobs === 200, `chaque job pris UNE fois (${b.prises} prises pour ${b.jobs} jobs)`);
  ok(b.processing === 200, `les 200 jobs en « processing » (${b.processing})`);
  for (const c of cs) await c.end();
}

// B. Le trou T1 : deux exécutants d'un MÊME poste.
console.log('\nB. Deux exécutants d\'un MÊME poste (même session)');
{
  const jobs = await nouveauxJobs(50);
  const cs = await connexions(2);
  // Le chemin d'avant : le premier démarre ; le second, qui croit le job « processing » (relu), écrit depuis « processing ».
  for (const id of jobs) { await voieExtension(cs[0], 'poste-X', id, 'e1'); await voieExtension(cs[1], 'poste-X', id, 'e2', 'processing'); }
  const avant = await bilan();
  ok(avant.doubles === 50, `chemin d'avant : le trou T1 existe — ${avant.doubles} job(s) « pris » par les deux exécutants (le test le voit)`);
  const jobs2 = await nouveauxJobs(50);
  await Promise.all(cs.map((c, i) => (async () => { for (const id of melanger(jobs2)) await prendre(c, 'poste-X', id, `e${i}`).catch(() => null); })()));
  const apres = await bilan();
  ok(apres.doubles === 0 && apres.jobs === 50, `prendre_job : 0 double sur le même poste (${apres.prises} prises, ${apres.jobs} jobs)`);
  for (const c of cs) await c.end();
}

// C. Extension (réserve, contrôle, écrit) ET Cloud (prendre_job) en même temps.
console.log('\nC. Extension (chemin d\'update-job-status) et Cloud (prendre_job) en même temps');
{
  const jobs = await nouveauxJobs(200);
  const cs = await connexions(8);
  await Promise.all(cs.map((c, i) => (async () => {
    if (i < 4) {
      // Un exécutant par poste, comme dans la vraie vie (le poste = la session d'UNE extension). Deux exécutants d'un
      // même poste sur le chemin d'avant, c'est le trou T1 — prouvé en B, et fermé par prendre_job.
      const poste = `bureau-${i}`;
      for (let tour = 0; tour < 3; tour++) {
        const reserves = (await c.query('SELECT preuve.reserver_jobs_extension($1, $2, $3::uuid[]) r', [user, poste, melanger(jobs).slice(0, 100)]).catch(() => ({ rows: [{ r: [] }] }))).rows[0].r ?? [];
        for (const id of reserves) await voieExtension(c, poste, id, `ext${i}`).catch(() => false);
      }
    } else {
      for (const id of melanger(jobs)) await prendre(c, `cloud-${i % 2}`, id, `cloud${i}`).catch(() => null);
    }
  })()));
  const b = await bilan();
  const voies = (await admin.query('SELECT voie, count(*)::int n FROM preuve.prises GROUP BY voie ORDER BY voie')).rows.map((r) => `${r.voie} ${r.n}`).join(', ');
  ok(b.doubles === 0, `aucun job démarré par deux exécutants (${b.doubles} double(s) ; ${voies})`);
  ok(b.jobs === b.prises && b.processing === b.jobs, `chaque job démarré l'est par UN exécutant (${b.prises} prises, ${b.processing} en processing)`);
  for (const c of cs) await c.end();
}

// D. Arrêté par la personne, retenu pour la lecture d'origine : jamais pris.
console.log('\nD. Gardes de la prod conservées');
{
  const [arrete] = await nouveauxJobs(1, { arret_utilisateur: '2026-10-29T10:00:00Z' });
  await admin.query("UPDATE preuve.cross_post_jobs SET status = 'cancelled' WHERE id = $1", [arrete]);
  const [c] = await connexions(1);
  const r1 = await prendre(c, 'cloud-A', arrete, 'c');
  const [retenu] = await nouveauxJobs(1, { attente_lecture_origine: { plateforme: 'vinted', depuis: '2026-10-29T10:00:00Z' } });
  const r2 = await prendre(c, 'cloud-A', retenu, 'c');
  ok(r1.pris === false && /demande/.test(r1.reason), 'job arrêté à la demande de la personne : jamais pris');
  ok(r2.pris === false && /annonce d'origine/.test(r2.reason), 'job retenu pour la lecture de son annonce d\'origine : jamais pris');
  await c.end();
}

await admin.query('DROP SCHEMA preuve CASCADE');
await admin.end();
if (embarque) { await embarque.pg.stop(); try { embarque.rmSync(embarque.dossier, { recursive: true, force: true }); } catch { /* dossier temporaire */ } }
console.log(ko === 0 ? '\nPREUVE FAITE' : `\n${ko} ÉCHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
