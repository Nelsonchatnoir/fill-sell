-- Inverse de 20261028_sebastien_republications_beebs.sql (depuis la sauvegarde ; jamais par-dessus une recréation faite).
BEGIN;
UPDATE public.cross_post_jobs c SET status = b.status, error = b.error, listing_url = b.listing_url,
       platform_listing_id = b.platform_listing_id, platform_fields = b.platform_fields
  FROM public._backup_2810_sebastien_republications_beebs b
 WHERE c.id = b.id AND c.platform_fields->>'republish_step' IS DISTINCT FROM 'recreated';  -- jamais par-dessus une recréation faite
COMMIT;
