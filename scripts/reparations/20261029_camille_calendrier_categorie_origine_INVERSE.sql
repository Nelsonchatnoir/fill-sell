-- INVERSE de 20261029_camille_calendrier_categorie_origine.sql (lot A point 3 c) : le job revient tel qu'il était,
-- seulement s'il n'a pas avancé depuis (encore « pending », jamais pris).
BEGIN;
UPDATE public.cross_post_jobs j
   SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_2910_camille_calendrier b
 WHERE j.id = b.job_id AND j.status = 'pending';
SELECT left(j.id::text, 8) AS job, j.status, j.platform_fields->'lbcCategoryPath' AS categorie
  FROM public.cross_post_jobs j WHERE j.id = 'c82117cd-6ec7-41e4-8f75-598ef7183695';
COMMIT;
