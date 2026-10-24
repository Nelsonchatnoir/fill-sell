-- INVERSE de 20261024_short_remise_vinted_categorie.sql : rend au job 6c02755d son état d'avant (sauvegarde
-- _backup_2410_short_remise_categorie) — seulement s'il n'a pas été publié entre-temps.
BEGIN;
SET LOCAL statement_timeout = '60s';
UPDATE public.cross_post_jobs c
   SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM (SELECT DISTINCT ON (id) * FROM public._backup_2410_short_remise_categorie ORDER BY id, sauvegarde_le) b
 WHERE c.id = b.id AND c.id = '6c02755d-bf19-48be-9cc2-285a02d6e565' AND c.status IN ('pending', 'failed', 'needs_user') AND c.listing_url IS NULL;
COMMIT;
