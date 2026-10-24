-- INVERSE de 20261024_vincent_relances_mur_suppression.sql : les 4 jobs reprennent statut, erreur et platform_fields
-- de la sauvegarde — seulement s'ils sont encore « pending » à l'étape « captured » (jamais par-dessus un geste fait
-- depuis : retrait, recréation, publication).
BEGIN;
SET LOCAL statement_timeout = '60s';
UPDATE public.cross_post_jobs c
   SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_2410_vincent_relances b
 WHERE c.id = b.id AND c.status = 'pending' AND c.platform_fields ->> 'republish_step' = 'captured';
SELECT c.id, c.status FROM public.cross_post_jobs c WHERE c.id IN (SELECT id FROM public._backup_2410_vincent_relances);
COMMIT;
