// PREUVE, EN CONCURRENCE RÉELLE, de la prise de job atomique (prérequis du
// Cloud : deux exécutants ne prennent JAMAIS le même job — un poste Cloud et
// l'extension de l'ordinateur, ou deux postes Cloud).
//
// ✅ FAITE le 05/10/2026 (Postgres 17 embarqué, embedded-postgres@17.10.0-beta.17,
//    sur le PC, données effacées après) : 5/5 — 0 double, 200 détenteurs uniques,
//    0 démarrage par deux postes, 0 démarrage sans la réservation.
//
// PGlite n'a qu'une connexion : cette preuve tourne contre un VRAI Postgres
// JETABLE (jamais la prod) — embarqué (npm i --no-save embedded-postgres pg),
// ou sur le serveur Cloud :
//   docker run -d --name pg-preuve -e POSTGRES_PASSWORD=preuve -p 127.0.0.1:55432:5432 postgres:17
//   npm i --no-save pg@8.16.3
//   PREUVE_PG=postgres://postgres:preuve@127.0.0.1:55432/postgres node scripts/cloud/preuve-reservation-concurrente.mjs
//   docker rm -f pg-preuve
//
// Les deux fonctions sont celles de la PROD, relues le 05/10/2026 par
// pg_get_functiondef (reserver_jobs_extension, ecrire_statut_job_extension) ;
// les tables réduites aux colonnes qu'elles lisent.
// Ce qui est prouvé, sur 200 jobs et 8 connexions simultanées (4 postes) :
//   · chaque job est réservé par UN seul poste à la fois ;
//   · un poste qui n'a pas la réservation ne peut pas passer le job en
//     « processing » (ecrire_statut_job_extension refuse) ;
//   · un job passé en « processing » par un poste ne l'est jamais par un autre.
import pg from 'pg';

const URL = process.env.PREUVE_PG;
if (!URL || /supabase\.co/.test(URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod).'); process.exit(2); }

const SCHEMA = `
DROP SCHEMA IF EXISTS preuve CASCADE; CREATE SCHEMA preuve; SET search_path TO preuve, public;
CREATE TABLE preuve.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, voie text NOT NULL DEFAULT 'extension',
  status text NOT NULL DEFAULT 'pending', error text, platform_fields jsonb, handler_build text, listing_url text, platform_listing_id text, published_at timestamptz);
CREATE TABLE preuve.jobs_reservations_extension (job_id uuid PRIMARY KEY, user_id uuid, poste text, reservation uuid DEFAULT gen_random_uuid(),
  expire_le timestamptz DEFAULT now() + interval '10 minutes', commence boolean DEFAULT false, servi_n integer DEFAULT 1, premier_service timestamptz DEFAULT now());
CREATE OR REPLACE FUNCTION preuve.reserver_jobs_extension(p_user uuid, p_poste text, p_jobs uuid[])
 RETURNS uuid[] LANGUAGE plpgsql SET search_path TO 'preuve', 'pg_temp' SET statement_timeout TO '2s' SET lock_timeout TO '500ms'
AS $function$
DECLARE v_id uuid; j cross_post_jobs%ROWTYPE; r jobs_reservations_extension%ROWTYPE;
 resultat uuid[]:='{}';
BEGIN
 IF p_user IS NULL OR nullif(p_poste,'') IS NULL OR length(p_poste)>180 THEN RETURN resultat; END IF;
 FOR v_id IN SELECT id FROM unnest(p_jobs) WITH ORDINALITY x(id,n) ORDER BY n LIMIT 100 LOOP
  SELECT * INTO j FROM cross_post_jobs WHERE id=v_id AND user_id=p_user
   AND voie='extension' AND status='pending' FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT * INTO r FROM jobs_reservations_extension WHERE job_id=v_id FOR UPDATE;
  IF FOUND AND NOT r.commence AND r.expire_le>now() THEN
   IF r.poste=p_poste THEN
    UPDATE jobs_reservations_extension SET servi_n=servi_n+1 WHERE job_id=v_id;
    resultat:=array_append(resultat,v_id);
   END IF;
   CONTINUE;
  END IF;
  INSERT INTO jobs_reservations_extension(job_id,user_id,poste,servi_n,premier_service)
   VALUES(v_id,p_user,p_poste,1,now()) ON CONFLICT(job_id) DO UPDATE SET
   poste=EXCLUDED.poste,reservation=gen_random_uuid(),expire_le=now()+interval '10 minutes',commence=false,
   servi_n=CASE WHEN jobs_reservations_extension.poste=EXCLUDED.poste AND NOT jobs_reservations_extension.commence
     THEN jobs_reservations_extension.servi_n+1 ELSE 1 END,
   premier_service=CASE WHEN jobs_reservations_extension.poste=EXCLUDED.poste AND NOT jobs_reservations_extension.commence
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
$function$;`;

const admin = new pg.Client({ connectionString: URL });
await admin.connect();
await admin.query(SCHEMA);
const user = (await admin.query('SELECT gen_random_uuid() u')).rows[0].u;
await admin.query('INSERT INTO preuve.cross_post_jobs (user_id) SELECT $1 FROM generate_series(1, 200)', [user]);
const jobs = (await admin.query('SELECT id FROM preuve.cross_post_jobs ORDER BY id')).rows.map((r) => r.id);

const POSTES = ['cloud-A', 'cloud-B', 'bureau-C', 'cloud-D'];
const clients = [];
for (let i = 0; i < 8; i++) {
  const c = new pg.Client({ connectionString: URL });
  await c.connect();
  await c.query('SET search_path TO preuve, public');
  clients.push({ c, poste: POSTES[i % POSTES.length] });
}

// 1. Huit connexions réservent les MÊMES 200 jobs (deux lots de 100, comme
//    get-pending-jobs), en même temps, plusieurs tours.
const pris = new Map();   // job → Set(postes qui l'ont reçu)
const lotsDeJobs = [jobs.slice(0, 100), jobs.slice(100)];
for (let tour = 0; tour < 5; tour++) {
  const lots = await Promise.all(clients.flatMap(({ c, poste }) => lotsDeJobs.map((lot) =>
    c.query('SELECT preuve.reserver_jobs_extension($1, $2, $3::uuid[]) r', [user, poste, lot]).then((x) => ({ poste, ids: x.rows[0].r ?? [] })))));
  for (const { poste, ids } of lots) for (const id of ids) { if (!pris.has(id)) pris.set(id, new Set()); pris.get(id).add(poste); }
}
const doubles = [...pris.values()].filter((s) => s.size > 1).length;
const tenus = (await admin.query('SELECT count(DISTINCT poste) n, count(*) t FROM preuve.jobs_reservations_extension')).rows[0];

// 2. Le VRAI chemin d'update-job-status, pour TOUS les postes sur TOUS les jobs,
//    en même temps : controler_job_extension (refuse un poste qui n'a pas la
//    réservation), puis ecrire_statut_job_extension avec la réservation rendue.
const reservations = new Map((await admin.query('SELECT job_id, poste FROM preuve.jobs_reservations_extension')).rows.map((r) => [r.job_id, r]));
const essais = [];
for (const { c, poste } of clients) {
  for (const id of jobs) {
    essais.push((async () => {
      const ctl = (await c.query("SELECT preuve.controler_job_extension($1, $2, $3, 'processing') r", [user, poste, id])).rows[0].r;
      if (!ctl?.ok) return { id, poste, ok: false, avait: reservations.get(id)?.poste === poste };
      const e = (await c.query("SELECT preuve.ecrire_statut_job_extension($1, $2, $3, $4, $5, '{\"status\":\"processing\"}'::jsonb) e", [user, poste, id, ctl.reservation, ctl.statut])).rows[0].e;
      return { id, poste, ok: e.ok === true, avait: reservations.get(id)?.poste === poste };
    })().catch(() => ({ id, poste, ok: false, avait: false })));
  }
}
const resultats = await Promise.all(essais);
const parJob = new Map();
for (const r of resultats) if (r.ok) parJob.set(r.id, [...(parJob.get(r.id) ?? []), r.poste]);
const deuxFois = [...parJob.values()].filter((l) => l.length > 1).length;
const volesOk = resultats.filter((r) => r.ok && !r.avait).length;
const processing = Number((await admin.query("SELECT count(*) n FROM preuve.cross_post_jobs WHERE status = 'processing'")).rows[0].n);

let ko = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) ko++; };
console.log(`\nRéservation concurrente — 200 jobs, 8 connexions, 4 postes, 5 tours`);
ok(doubles === 0, `aucun job réservé par deux postes à la fois (${doubles} double(s))`);
ok(Number(tenus.t) === 200, `chaque job a UN détenteur en base (${tenus.t} réservations, ${tenus.n} postes)`);
ok(deuxFois === 0, `aucun job passé en « processing » par deux postes (${deuxFois})`);
ok(volesOk === 0, `aucun poste sans la réservation n'a pu démarrer le job (${volesOk})`);
ok(processing === 200, `les 200 jobs démarrés, chacun par son seul détenteur (${processing})`);
for (const { c } of clients) await c.end();
await admin.query('DROP SCHEMA preuve CASCADE');
await admin.end();
console.log(ko === 0 ? '\nPREUVE FAITE' : `\n${ko} ÉCHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
