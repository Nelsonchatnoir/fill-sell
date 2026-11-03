CREATE OR REPLACE FUNCTION public.retrait_job_prouve(p_job uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT (COALESCE(j.platform_fields #>> '{rattachement,par}', '') = 'utilisateur'
            AND COALESCE(j.platform_fields #>> '{rattachement,motif}', '') = 'meme_article_confirme')   -- (06/10) geste « même article »
        OR (NOT EXISTS (
             SELECT 1 FROM inventaire_fusions f
              WHERE f.defait_le IS NULL AND COALESCE(f.par, '') NOT LIKE 'utilisateur%'
                AND COALESCE(f.par, '') NOT LIKE '%photo\_identique)'   -- (06/10) photo identique = preuve
                AND jsonb_typeof(f.deplacements -> 'cross_post_jobs') = 'array'
                AND (f.deplacements -> 'cross_post_jobs') ? j.id::text)
       AND (COALESCE(j.platform_fields #>> '{rattachement,par}', '') IN ('', 'utilisateur')
            OR COALESCE(j.platform_fields #>> '{rattachement,motif}', '') IN ('identifiant_depot_clos', 'photo_identique')
            OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true')
       AND (COALESCE(j.platform_fields ->> 'source', '') <> 'releve'
            OR COALESCE(j.platform_fields #>> '{rattachement,par}', '') = 'utilisateur'
            OR COALESCE(j.platform_fields #>> '{rattachement,motif}', '') IN ('identifiant_depot_clos', 'photo_identique')
            OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true'))
      FROM cross_post_jobs j WHERE j.id = p_job), false);
$function$
