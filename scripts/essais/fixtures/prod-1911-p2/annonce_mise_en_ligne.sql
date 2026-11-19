-- Corps de PROD relu le 19/11/2026 (pg_get_functiondef annonce_mise_en_ligne(uuid), md5 7c2cf65f53fd8031bc275b73b4b95f4a), commentaires retirés pour le banc.
CREATE OR REPLACE FUNCTION public.annonce_mise_en_ligne(p_job uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(LEAST(
           (SELECT min(LEAST(a.publiee_le, a.created_at)) FROM public.annonces_plateforme a
             WHERE a.user_id = j.user_id AND a.platform = j.platform
               AND a.listing_id = NULLIF(btrim(COALESCE(j.platform_listing_id, '')), '')),
           (SELECT min(LEAST(a.publiee_le, a.created_at)) FROM public.annonces_plateforme a
             WHERE a.user_id = j.user_id AND a.platform = j.platform AND a.job_id = j.id
               AND NULLIF(btrim(COALESCE(j.platform_listing_id, '')), '') IS NULL),
           CASE WHEN j.platform = 'vinted' AND NULLIF(btrim(COALESCE(j.platform_listing_id, '')), '') IS NOT NULL THEN
             (SELECT min(s.captured_at) FROM public.vinted_listing_snapshots s
               WHERE s.user_id = j.user_id AND s.vinted_item_id = btrim(j.platform_listing_id)) END,
           j.published_at, j.created_at), j.created_at)
    FROM public.cross_post_jobs j WHERE j.id = p_job;
$function$
;
