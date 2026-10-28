-- Inverse de 20261028_retraits_beebs_thecloset.sql (depuis la sauvegarde).
BEGIN;
UPDATE public.cross_post_jobs c SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_2810_retraits_beebs_thecloset b WHERE c.id = b.id;
COMMIT;
