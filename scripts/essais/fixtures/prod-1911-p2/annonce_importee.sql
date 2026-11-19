-- Corps de PROD relu le 19/11/2026 (pg_get_functiondef annonce_importee(uuid), md5 0bb566900c9847cf49b6166bd1a70859), commentaires retirés pour le banc.
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
;
