-- 20261030100000 — (30/10, lot C partie 6) PRÉREQUIS DU CLOUD : UNE PRISE DE JOB ATOMIQUE, EN UN SEUL APPEL.
-- Appliquée sur l'autorisation de Nico (lot C : « Tu as toutes les autorisations (fonctions, migrations…) ») :
--   npx supabase db query --linked -f supabase/migrations/20261030100000_prendre_job_atomique.sql
--   npx supabase migration repair --linked --status applied 20261030100000
-- Inverse : supabase/rollbacks/20261030100000_prendre_job_atomique_INVERSE.sql (une fonction neuve : la retirer).
-- Preuve de concurrence : scripts/cloud/preuve-prendre-job-concurrente.mjs (Postgres 17 jetable, jamais la prod).
--
-- CE QUI EXISTE (relu en prod le 30/10, pg_get_functiondef) : la prise passe par trois RPC réservées à service_role —
-- reserver_jobs_extension (FOR UPDATE SKIP LOCKED + réservation par poste), controler_job_extension (FOR UPDATE ;
-- refuse un job réservé à un AUTRE poste), ecrire_statut_job_extension (compare-and-swap sous FOR UPDATE). Deux postes
-- différents ne prennent jamais le même job (preuve du 05/10 : 200 jobs, 8 connexions, 0 double).
-- LE TROU (T1, lu dans le code) : l'exclusion vaut PAR POSTE. Deux exécutants qui partagent un même poste (même session)
-- passent tous deux controler (statut « processing » rendu ok) puis ecrire(p_avant = 'processing') : le second « prend »
-- un job déjà commencé. Le Cloud n'y échappait qu'en fabriquant sa propre session.
-- RÈGLE (prendre_job) : la prise = UNE transaction — controler (ligne verrouillée) puis le passage pending → processing
-- par ecrire, et SEULEMENT depuis « pending » : un job déjà commencé n'est jamais repris, même par le même poste. Les
-- trois RPC existantes, get-pending-jobs et update-job-status ne changent pas : rien ne change pour l'extension
-- d'aujourd'hui ; c'est la porte d'entrée de l'exécutant Cloud.
create or replace function public.prendre_job(p_user uuid, p_poste text, p_job uuid, p_build text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
 set statement_timeout to '3s'
 set lock_timeout to '1s'
as $function$
declare c jsonb; r jsonb; pf jsonb;
begin
 c := public.controler_job_extension(p_user, p_poste, p_job, 'processing');
 if not coalesce((c->>'ok')::boolean, false) then
  return c || jsonb_build_object('pris', false);
 end if;
 if c->>'statut' is distinct from 'pending' then
  return jsonb_build_object('ok', false, 'pris', false, 'statut', c->>'statut',
    'reason', 'Ce job est déjà en cours : il n''est jamais repris.');
 end if;
 select coalesce(platform_fields, '{}'::jsonb) into pf from public.cross_post_jobs where id = p_job;
 r := public.ecrire_statut_job_extension(p_user, p_poste, p_job, (c->>'reservation')::uuid, 'pending',
   jsonb_build_object('status', 'processing', 'handler_build', p_build,
     'platform_fields', pf || jsonb_build_object('processing_since', now(), 'executant', left(p_poste, 180))));
 return r || jsonb_build_object('pris', coalesce((r->>'ok')::boolean, false), 'reservation', c->>'reservation');
end;
$function$;
revoke all on function public.prendre_job(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.prendre_job(uuid, text, uuid, text) to service_role;
