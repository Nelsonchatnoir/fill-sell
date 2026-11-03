CREATE OR REPLACE FUNCTION public.fiche_annonces_vivantes(p_inv bigint)
 RETURNS TABLE(platform text, listing_id text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT ap.platform, ap.listing_id FROM annonces_plateforme ap
   WHERE ap.inventaire_id = p_inv AND ap.disparu_le IS NULL
  UNION
  SELECT j.platform, COALESCE(NULLIF(j.platform_listing_id, ''), 'job:' || j.id::text) FROM cross_post_jobs j
   WHERE j.inventaire_id = p_inv AND j.action IN ('publish', 'republish') AND j.status = 'published'
  UNION
  SELECT 'vinted', i.vinted_item_id FROM inventaire i
   WHERE i.id = p_inv AND i.vinted_item_id IS NOT NULL AND i.disparu_le IS NULL;
$function$
;
CREATE OR REPLACE FUNCTION public.fiche_annonces_vivantes(p_inventaire bigint, p_platform text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT count(DISTINCT ap.listing_id)::int FROM annonces_plateforme ap
   WHERE ap.inventaire_id = p_inventaire AND ap.platform = p_platform
     AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL AND ap.ignoree_le IS NULL
     AND ap.statut_plateforme IN ('en_ligne', 'en_verification');
$function$
