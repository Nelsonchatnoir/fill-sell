-- Inverse de 20261028_depop_polo_ebay_airmax.sql (depuis les sauvegardes).
BEGIN;
UPDATE public.cross_post_jobs j SET error = b.error, platform_fields = b.platform_fields
  FROM public._backup_2810_polo_vendeur_depop b WHERE j.id = b.id;
UPDATE public.cross_post_jobs j SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_2810_ebay_arretee_mataich b WHERE j.id = b.id;
COMMIT;
