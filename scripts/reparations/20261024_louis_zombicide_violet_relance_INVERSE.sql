-- INVERSE de 20261024_louis_zombicide_violet_relance.sql : rend au job Leboncoin 8d3687d2 son état d'avant la relance
-- (sauvegarde _backup_2410_louis_zombicide) — seulement s'il n'a PAS été publié entre-temps (une annonce en ligne ne
-- se « dé-publie » pas par un script).
BEGIN;
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET status = b.status, error = b.error, platform_listing_id = b.platform_listing_id, published_at = b.published_at,
         platform_fields = b.platform_fields
    FROM (SELECT DISTINCT ON (id) * FROM public._backup_2410_louis_zombicide ORDER BY id, sauvegarde_le) b
   WHERE c.id = b.id AND c.id = '8d3687d2-6ded-4fb8-9872-ba3712e76cf8' AND c.status IN ('pending', 'failed', 'needs_user')
     AND c.listing_url IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'inverse : % job(s) rendu(s) à leur état d''avant', n;
END $$;
COMMIT;
