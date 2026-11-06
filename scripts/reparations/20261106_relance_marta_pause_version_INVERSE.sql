-- INVERSE de 20261106_relance_marta_pause_version.sql : la tâche 2fd83d73 reprend statut, message et champs d'avant,
-- tant qu'elle n'est pas repartie (status pending).
BEGIN;
UPDATE public.cross_post_jobs j SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_0611_relance_marta b WHERE j.id = b.id AND j.status = 'pending';
COMMIT;
