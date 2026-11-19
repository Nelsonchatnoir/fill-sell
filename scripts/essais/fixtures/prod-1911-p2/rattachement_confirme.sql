-- Corps de PROD relu le 19/11/2026 (pg_get_functiondef rattachement_confirme(uuid), md5 bc3605edbc26cd60a026452698d1d1e2), commentaires retirés pour le banc.
CREATE OR REPLACE FUNCTION public.rattachement_confirme(p_job uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT (COALESCE(j.platform_fields ->> 'source', '') <> 'releve' AND (j.platform_fields -> 'rattachement') IS NULL)
        OR ((COALESCE(j.platform_fields #>> '{rattachement,par}', '') <> 'auto'
             OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true'
             OR COALESCE(j.platform_fields #>> '{rattachement,motif}', '') IN ('identifiant_depot_clos', 'photo_identique'))
       AND NOT EXISTS (
             SELECT 1 FROM inventaire_fusions f
              WHERE f.user_id = j.user_id AND f.defait_le IS NULL
                AND COALESCE(f.par, '') NOT IN ('utilisateur', 'utilisateur (doublon proposé)')
                AND COALESCE(f.par, '') NOT LIKE 'regle:identifiant%'
                AND COALESCE(f.par, '') NOT LIKE 'utilisateur:photo\_%'
                AND COALESCE(f.par, '') NOT LIKE '%photo\_identique)'
                AND jsonb_typeof(f.deplacements -> 'cross_post_jobs') = 'array'
                AND (f.deplacements -> 'cross_post_jobs') ? j.id::text
                AND f.created_at > COALESCE(
                      CASE WHEN COALESCE(j.platform_fields #>> '{rattachement,motif}', '') = 'meme_article_confirme'
                                AND COALESCE(j.platform_fields #>> '{rattachement,confirme,le}', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}'
                           THEN (j.platform_fields #>> '{rattachement,confirme,le}')::timestamptz END,
                      '-infinity'::timestamptz)))
      FROM cross_post_jobs j WHERE j.id = p_job), false);
$function$
;
