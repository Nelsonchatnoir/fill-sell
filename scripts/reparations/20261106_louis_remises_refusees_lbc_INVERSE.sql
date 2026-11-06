-- INVERSE de 20261106_louis_remises_refusees_lbc.sql : les remises reprennent statut, numéro, lien, date et champs d'avant,
-- tant qu'elles n'ont pas été redéposées (pending, sans numéro).
BEGIN;
UPDATE public.cross_post_jobs j SET status = b.status, error = b.error, platform_listing_id = b.platform_listing_id, listing_url = b.listing_url,
  published_at = b.published_at, platform_fields = b.platform_fields
  FROM public._backup_0611_louis_remises b WHERE j.id = b.id AND j.status = 'pending' AND j.platform_listing_id IS NULL;
COMMIT;
