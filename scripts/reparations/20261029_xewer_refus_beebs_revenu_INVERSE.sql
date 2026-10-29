-- INVERSE de 20261029_xewer_refus_beebs_revenu.sql (lot A point 8 — G6) : la tâche revient telle qu'elle était,
-- seulement si elle est encore « failed ».
BEGIN;
UPDATE public.cross_post_jobs j
   SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_2910_xewer_refus_beebs b
 WHERE j.id = b.job_id AND j.status = 'failed';
SELECT left(j.id::text, 8) AS job, j.status FROM public.cross_post_jobs j WHERE j.id = '6a38d0b6-ac74-4650-af2c-5454f3d86b4f';
COMMIT;
