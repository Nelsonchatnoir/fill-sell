-- INVERSE de 20261025_erreurs_de_notre_fait.sql : rend aux 4 lignes leur statut, leur message et leurs champs d'avant
-- (sauvegarde _backup_2510_erreurs_de_notre_fait), seulement si rien ne les a touchées depuis la réparation.
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.cross_post_jobs c
   SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_2510_erreurs_de_notre_fait b
 WHERE c.id = b.id
   AND (c.platform_fields ? 'clos_par_reparation' OR c.platform_fields ? 'requalifie_par'
        OR c.platform_fields #>> '{article_vendu,pose_par}' = 'scripts/reparations/20261025_erreurs_de_notre_fait.sql');
SELECT left(c.id::text, 8) AS job, c.status, left(c.error, 70) AS message FROM public.cross_post_jobs c
 WHERE c.id IN (SELECT id FROM public._backup_2510_erreurs_de_notre_fait);
COMMIT;
