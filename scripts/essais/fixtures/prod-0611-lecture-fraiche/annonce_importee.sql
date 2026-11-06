CREATE OR REPLACE FUNCTION public.annonce_importee(p_job uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT COALESCE(j.platform_fields ->> 'source', '') = 'releve'
        OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true'
      FROM public.cross_post_jobs j WHERE j.id = p_job), false);
$function$
