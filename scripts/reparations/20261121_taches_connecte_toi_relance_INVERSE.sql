-- INVERSE de 20261121_taches_connecte_toi_relance.sql : les tâches relancées reprennent leur statut, leur message et leurs
-- platform_fields d'avant (sauvegarde _backup_2111_taches_connecte_toi) — seulement celles qui n'ont pas bougé depuis
-- (toujours pending et marquées « relance_connecte_toi ») : une tâche partie ou terminée garde son état.
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.cross_post_jobs j
   SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_2111_taches_connecte_toi b
 WHERE j.id = b.id AND j.status = 'pending' AND j.platform_fields ? 'relance_connecte_toi';
SELECT count(*) AS remises FROM public.cross_post_jobs j JOIN public._backup_2111_taches_connecte_toi b ON b.id = j.id
 WHERE j.status = b.status AND j.error IS NOT DISTINCT FROM b.error;
COMMIT;
