-- INVERSE de 20261103_gjehly_programmation_heritee.sql : les tâches ENCORE en attente reprennent leur platform_fields
-- d'avant (marque « programmée » héritée comprise). Une tâche déjà servie ou publiée n'est jamais touchée.
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.cross_post_jobs c SET platform_fields = b.platform_fields
  FROM public._backup_0311_gjehly_programmation b
 WHERE c.id = b.id AND c.status = 'pending' AND c.platform_fields ? 'programmation_heritee_levee';
COMMIT;
