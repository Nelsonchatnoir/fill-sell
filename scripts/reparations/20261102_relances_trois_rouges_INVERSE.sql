-- INVERSE de 20261102_relances_trois_rouges.sql : chaque tâche relancée reprend son statut, son erreur et ses
-- platform_fields d'avant (sauvegarde) — SEULEMENT si elle n'a pas démarré depuis (encore pending). Puis la sauvegarde
-- est retirée.
BEGIN;
UPDATE public.cross_post_jobs j SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_0211_relances_trois_rouges b
 WHERE j.id = b.job_id AND j.status = 'pending';
DROP TABLE public._backup_0211_relances_trois_rouges;
COMMIT;
