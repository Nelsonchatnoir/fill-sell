-- INVERSE de 20261025_chaouidz_beebs_fermeture.sql : remet le job 8a608034 tel que sauvegardé, s'il n'a pas avancé
-- depuis (toujours pending, toujours à l'étape « captured » : rien retiré entre-temps).
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.cross_post_jobs c
   SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_2510_chaouidz_fermeture b
 WHERE c.id = b.id AND c.status = 'pending' AND c.platform_fields->>'republish_step' = 'captured';
SELECT c.status, c.platform_fields->'needsUserField'->>'field_key' AS question
  FROM public.cross_post_jobs c WHERE c.id = '8a608034-6cce-4b78-b924-5e0097c1fcf3';
COMMIT;
