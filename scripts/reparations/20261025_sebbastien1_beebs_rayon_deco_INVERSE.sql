-- INVERSE de 20261025_sebbastien1_beebs_rayon_deco.sql : remet le job 17715aee tel qu'il était (statut, erreur,
-- platform_fields), seulement s'il n'a pas encore été repris par l'extension (encore « pending »).
BEGIN;
SET LOCAL statement_timeout = '60s';
UPDATE public.cross_post_jobs c
   SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_2510_sebbastien1_beebs_rayon b
 WHERE c.id = b.id AND c.status = 'pending';
SELECT c.id, c.status, c.platform_fields->'beebsCategoryPath' AS rayon FROM public.cross_post_jobs c
 WHERE c.id IN (SELECT id FROM public._backup_2510_sebbastien1_beebs_rayon);
COMMIT;
