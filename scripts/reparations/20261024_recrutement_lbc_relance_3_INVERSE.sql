-- INVERSE de scripts/reparations/20261024_recrutement_lbc_relance_3.sql : rend aux 3 jobs (5087eddb, 42f2e8eb, c10316c6)
-- leur état d'avant la relance (failed, « jamais en ligne », numéro mort), depuis la PREMIÈRE sauvegarde de chacun dans
-- _backup_2410_recrutement_lbc_relances — seulement pour ceux encore en file (pending / needs_user) : un redépôt fait ne
-- se défait pas ici (l'annonce existe chez Leboncoin).
BEGIN;
SET LOCAL statement_timeout = '60s';
SELECT set_config('fillsell.restauration', 'on', true);
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET status = b.status, error = b.error, platform_listing_id = b.platform_listing_id, listing_url = b.listing_url,
         published_at = b.published_at, platform_fields = b.platform_fields
    FROM (SELECT DISTINCT ON (s.id) s.* FROM public._backup_2410_recrutement_lbc_relances s
           WHERE s.id IN ('5087eddb-2eb4-458f-b377-4f0cf7a661e0', '42f2e8eb-3b4e-4104-86fa-33d22f6bfd20',
                          'c10316c6-1d06-4181-b884-cf17b224de6d')
           ORDER BY s.id, s.sauvegarde_le ASC) b
   WHERE c.id = b.id AND c.status IN ('pending', 'needs_user');
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'jobs rendus à leur état d''avant la relance : %', n;
END $$;
SELECT id, status, platform_listing_id FROM public.cross_post_jobs
 WHERE id IN ('5087eddb-2eb4-458f-b377-4f0cf7a661e0', '42f2e8eb-3b4e-4104-86fa-33d22f6bfd20', 'c10316c6-1d06-4181-b884-cf17b224de6d');
COMMIT;
