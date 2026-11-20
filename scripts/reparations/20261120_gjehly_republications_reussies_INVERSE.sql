-- INVERSE de 20261120_gjehly_republications_reussies.sql : les 19 tâches reprennent statut, erreur et champs sauvegardés
-- (_backup_2011_gjehly_republications). Seules les tâches encore dans l'état posé par la réparation sont remises.
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.cross_post_jobs c
   SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_2011_gjehly_republications b
 WHERE c.id = b.id AND c.user_id = '229c7b07-51f8-4ca6-835e-6b658f819427'
   AND c.status = 'published' AND c.platform_fields ? 'reparation_2011';
SELECT left(c.id::text, 8) AS id, c.status FROM public.cross_post_jobs c
  JOIN public._backup_2011_gjehly_republications b ON b.id = c.id ORDER BY 1;
COMMIT;
