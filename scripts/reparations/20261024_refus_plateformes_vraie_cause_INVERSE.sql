-- Inverse de 20261024_refus_plateformes_vraie_cause.sql : les 4 jobs reprennent exactement leur ligne sauvegardée
-- (statut, motif, champs, lien, numéro), seulement s'ils portent encore la marque de la réparation.
BEGIN;
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE m integer;
BEGIN
  UPDATE public.cross_post_jobs c SET status = b.status, error = b.error, platform_fields = b.platform_fields,
         listing_url = b.listing_url, platform_listing_id = b.platform_listing_id
    FROM public._backup_2410_refus_plateformes b
   WHERE c.id = b.id AND c.platform_fields ? 'reparation_2410_refus';
  GET DIAGNOSTICS m = ROW_COUNT;
  RAISE NOTICE 'inverse : % ligne(s) rendues', m;
END $$;
COMMIT;
