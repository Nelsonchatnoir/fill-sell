-- INVERSE de 20261025_glowik_beebs_relance.sql : remet le job 6d95f4eb tel qu'il était, seulement s'il n'a pas encore
-- été repris par l'extension (pending ou étape a_capturer sans capture neuve).
BEGIN;
SET LOCAL statement_timeout = '60s';
UPDATE public.cross_post_jobs c
   SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_2510_glowik_beebs b
 WHERE c.id = b.id AND c.status = 'pending' AND NOT (c.platform_fields ? 'deleted_at');
SELECT c.id, c.status, c.platform_fields->>'republish_step' AS etape FROM public.cross_post_jobs c
 WHERE c.id IN (SELECT id FROM public._backup_2510_glowik_beebs);
COMMIT;
