-- INVERSE de 20261026_relance_52b5ec71_supercard.sql : remet 52b5ec71 tel qu'il était (needs_user, pause
-- lbc_moderation, message, platform_fields), SEULEMENT s'il n'a pas été repris depuis (encore pending, rien publié).
BEGIN;
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET status = b.status, error = b.error, platform_fields = b.platform_fields
    FROM public._backup_2610_relance_52b5ec71 b
   WHERE c.id = b.id AND c.id = '52b5ec71-997c-400c-ae56-2e04b893256d'
     AND c.status = 'pending' AND c.platform_listing_id IS NULL AND NOT (c.platform_fields ? 'processing_since');
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% job(s) remis', n;
END $$;
SELECT c.id, c.status, c.platform_fields->>'needs_user_source' AS source FROM public.cross_post_jobs c
 WHERE c.id = '52b5ec71-997c-400c-ae56-2e04b893256d';
COMMIT;
