-- Tests de 20261023110000_retenue_lecture_origine_au_demarrage (assemblés par 20261023110000_generer.sh, ROLLBACK).
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
do $$
declare
  thierry uuid := 'c2175e91-3854-4a66-8388-e28810166a3e';
  v_job uuid; v_job2 uuid; v_poste text; r jsonb;
begin
  -- Un job Vinted de Thierry encore en file, réservé à son poste (servi à 11:23)
  select j.id, x.poste into v_job, v_poste from cross_post_jobs j join jobs_reservations_extension x on x.job_id = j.id
   where j.user_id = thierry and j.platform = 'vinted' and j.status = 'pending' order by j.created_at desc limit 1;
  select j.id into v_job2 from cross_post_jobs j join jobs_reservations_extension x on x.job_id = j.id and x.poste = v_poste
   where j.user_id = thierry and j.platform = 'vinted' and j.status = 'pending' and j.id <> v_job order by j.created_at desc limit 1;
  insert into _r values ('0 deux jobs en file réservés au même poste', v_job is not null and v_job2 is not null and v_poste is not null, coalesce(v_job::text, 'null'));
  -- Sans retenue : la prise en charge passe (comme avant)
  r := public.controler_job_extension(thierry, v_poste, v_job2, 'processing');
  insert into _r values ('A1 sans retenue : processing accepté (inchangé)', (r ->> 'ok')::boolean, r::text);
  -- Retenue posée (lecture de l'annonce d'origine)
  update cross_post_jobs set platform_fields = coalesce(platform_fields, '{}'::jsonb)
     || jsonb_build_object('attente_lecture_origine', jsonb_build_object('depuis', now(), 'plateforme', 'ebay', 'manque', jsonb_build_array('photos')))
   where id = v_job;
  r := public.controler_job_extension(thierry, v_poste, v_job, 'processing');
  insert into _r values ('B1 retenue : processing REFUSÉ (le job ne démarre pas)', not (r ->> 'ok')::boolean and r ->> 'reason' like 'En cours de lecture%', r::text);
  r := public.controler_job_extension(thierry, v_poste, v_job, 'failed');
  insert into _r values ('B2 retenue : failed refusé (aucune erreur écrite)', not (r ->> 'ok')::boolean, r::text);
  r := public.controler_job_extension(thierry, v_poste, v_job, 'needs_user');
  insert into _r values ('B3 retenue : needs_user refusé', not (r ->> 'ok')::boolean, r::text);
  r := public.controler_job_extension(thierry, v_poste, v_job, 'pending');
  insert into _r values ('B4 retenue : ré-armement pending refusé', not (r ->> 'ok')::boolean, r::text);
  r := public.controler_job_extension(thierry, v_poste, v_job, 'published');
  insert into _r values ('B5 ⛔ un résultat réel (published) n''est jamais refusé', (r ->> 'ok')::boolean, r::text);
  r := public.controler_job_extension(thierry, v_poste, v_job, 'dry_run_completed');
  insert into _r values ('B6 ⛔ dry_run_completed non plus', (r ->> 'ok')::boolean, r::text);
  -- Retenue levée (get-pending-jobs, fiche complète) : repart
  update cross_post_jobs set platform_fields = platform_fields - 'attente_lecture_origine' where id = v_job;
  r := public.controler_job_extension(thierry, v_poste, v_job, 'processing');
  insert into _r values ('C1 retenue levée : processing accepté', (r ->> 'ok')::boolean, r::text);
  -- Un job déjà en cours n'est jamais arrêté par la retenue
  update cross_post_jobs set status = 'processing', platform_fields = platform_fields
     || jsonb_build_object('attente_lecture_origine', jsonb_build_object('depuis', now())) where id = v_job2;
  r := public.controler_job_extension(thierry, v_poste, v_job2, 'published');
  insert into _r values ('D1 job déjà en cours : va au bout (published accepté)', (r ->> 'ok')::boolean, r::text);
  r := public.controler_job_extension(thierry, v_poste, v_job2, 'failed');
  insert into _r values ('D2 job déjà en cours : son échec réel s''écrit', (r ->> 'ok')::boolean, r::text);
end $$;
select essai, ok, left(coalesce(detail, ''), 160) detail from _r order by essai;
select count(*) filter (where ok) || ' / ' || count(*) as bilan from _r;
