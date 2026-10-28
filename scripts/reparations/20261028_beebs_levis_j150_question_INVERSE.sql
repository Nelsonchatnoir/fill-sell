-- Inverse de 20261028_beebs_levis_j150_question.sql
BEGIN;
UPDATE public.cross_post_jobs c SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_2810_beebs_levis_j150 b WHERE c.id = b.id;
COMMIT;
