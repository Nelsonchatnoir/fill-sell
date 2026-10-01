-- INVERSE de 20261001_marie_beebs_chemise_8xl.sql — remet le message et les
-- champs d'avant, seulement si le job n'a pas bougé depuis (toujours needs_user).
BEGIN;
SET LOCAL lock_timeout = '3s';
UPDATE cross_post_jobs j SET error = b.error_avant, platform_fields = b.platform_fields_avant
  FROM public._backup_0110_marie_beebs b
 WHERE j.id = b.job_id AND j.status = 'needs_user';
COMMIT;
