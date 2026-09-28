// Corps réel des trois RPC, tables temporaires sans triggers de production.
import fs from 'node:fs';
const migration=fs.readFileSync('supabase/migrations/20260928130523_point_c_reservation_compatible_reprise.sql','utf8');
let corps=migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.reserver_jobs_extension'),migration.indexOf('REVOKE ALL ON FUNCTION'));
corps=corps.replaceAll('FUNCTION public.','FUNCTION pg_temp.').replaceAll('search_path=public,pg_temp','search_path=pg_temp,public');
const liberation=fs.readFileSync('supabase/migrations/20260928114721_point_c_liberation_reservations.sql','utf8');
corps+='\n'+liberation.slice(liberation.indexOf('CREATE OR REPLACE FUNCTION'),liberation.indexOf('REVOKE ALL'))
 .replaceAll('public.','pg_temp.').replaceAll('search_path=public,pg_temp','search_path=pg_temp,public');
const table=migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS'),migration.indexOf('ALTER TABLE public.jobs_reservations_extension'))
 .replace('CREATE TABLE IF NOT EXISTS public.','CREATE TEMP TABLE ');
const tests=`
DO $tests$
DECLARE u uuid:='00000000-0000-4000-8000-000000000001';
 j1 uuid:='00000000-0000-4000-8000-000000000011';
 j2 uuid:='00000000-0000-4000-8000-000000000012';
 r jsonb; s jsonb; ids uuid[];
BEGIN
 INSERT INTO pg_temp.cross_post_jobs(id,user_id,platform,action,status,title,price,voie)
 VALUES(j1,u,'vinted','publish','pending','fixture',10,'extension'),
 (j2,u,'opla','publish','pending','fixture',10,'extension');
 ids:=pg_temp.reserver_jobs_extension(u,'poste-A',ARRAY[j1,j2]);
 ASSERT cardinality(ids)=2,'première réservation';
 ASSERT cardinality(pg_temp.reserver_jobs_extension(u,'poste-B',ARRAY[j1,j2]))=0,'second poste exclu';
 ASSERT cardinality(pg_temp.reserver_jobs_extension(u,'poste-A',ARRAY[j1,j2]))=2,'même poste relit les jobs non commencés sans attendre dix minutes';
 ASSERT NOT (pg_temp.controler_job_extension(u,'poste-B',j1,'processing')->>'ok')::boolean,'ancien client autre session refusé';
 r:=pg_temp.controler_job_extension(u,'poste-A',j1,'processing');
 ASSERT (r->>'ok')::boolean AND r->>'statut'='pending','ancien contrat sans jeton';
 s:=pg_temp.ecrire_statut_job_extension(u,'poste-A',j1,(r->>'reservation')::uuid,r->>'statut','{"status":"processing"}');
 ASSERT (s->>'ok')::boolean,'démarrage réservé';
 UPDATE pg_temp.jobs_reservations_extension SET expire_le=now()-interval '1 hour' WHERE job_id=j1;
 ASSERT cardinality(pg_temp.reserver_jobs_extension(u,'poste-B',ARRAY[j1]))=0,'un processing ne périme pas par TTL';
 r:=pg_temp.controler_job_extension(u,'poste-A',j1,'published');
 -- Un utilisateur annule pendant la fonction : l'ancien verdict perd.
 UPDATE pg_temp.cross_post_jobs SET status='cancelled' WHERE id=j1;
 ASSERT NOT EXISTS(SELECT 1 FROM pg_temp.jobs_reservations_extension WHERE job_id=j1),'une sortie latérale rend le verrou';
 s:=pg_temp.ecrire_statut_job_extension(u,'poste-A',j1,(r->>'reservation')::uuid,r->>'statut','{"status":"published"}');
 ASSERT NOT (s->>'ok')::boolean,'annulation concurrente conservée';
 ASSERT NOT (pg_temp.controler_job_extension(u,'poste-A',j1,'processing')->>'ok')::boolean,'aucune résurrection';
 -- Reprise explicite par le veilleur : nouvelle génération et nouveau poste.
 UPDATE pg_temp.cross_post_jobs SET status='pending' WHERE id=j1;
 ASSERT cardinality(pg_temp.reserver_jobs_extension(u,'poste-B',ARRAY[j1]))=1,'reprise autorisée';
 s:=pg_temp.ecrire_statut_job_extension(u,'poste-A',j1,(r->>'reservation')::uuid,'pending','{"status":"published"}');
 ASSERT NOT (s->>'ok')::boolean,'ancien verdict rejeté après réattribution';
 -- Réponse du poll perdue : réservation non commencée périme.
 UPDATE pg_temp.jobs_reservations_extension SET expire_le=now()-interval '1 second' WHERE job_id=j2;
 ASSERT cardinality(pg_temp.reserver_jobs_extension(u,'poste-B',ARRAY[j2]))=1,'file non commencée récupérable';
 r:=pg_temp.controler_job_extension(u,'poste-B',j2,'processing');
 ASSERT (pg_temp.ecrire_statut_job_extension(u,'poste-B',j2,(r->>'reservation')::uuid,r->>'statut','{"status":"processing"}')->>'ok')::boolean;
 r:=pg_temp.controler_job_extension(u,'poste-B',j2,'published');
 ASSERT (pg_temp.ecrire_statut_job_extension(u,'poste-B',j2,(r->>'reservation')::uuid,r->>'statut','{"status":"published"}')->>'ok')::boolean;
 ASSERT NOT EXISTS(SELECT 1 FROM pg_temp.jobs_reservations_extension WHERE job_id=j2),'réservation rendue après verdict';
 ASSERT NOT (pg_temp.controler_job_extension('00000000-0000-4000-8000-000000000002','poste-A',j2,'processing')->>'ok')::boolean,'autre compte refusé';
END;
$tests$;
SELECT 'réservation, ancien parc, expiration, annulation et reprise : réussis' AS controle;
`;
fs.writeFileSync('build/reservation-jobs-test-annule.sql',"BEGIN; SET LOCAL statement_timeout='5s';\nCREATE TEMP TABLE cross_post_jobs (LIKE public.cross_post_jobs INCLUDING DEFAULTS);\n"+table+corps+tests+'\nROLLBACK;\n');
console.log('build/reservation-jobs-test-annule.sql');
