-- INVERSE de 20261105_cloud_verrou_jeton_court_relance.sql : les tâches relancées reprennent l'état sauvegardé (statut,
-- erreur, platform_fields) — seulement celles qui n'ont pas bougé depuis (toujours « pending » et pas encore prises).
BEGIN;
UPDATE public.cross_post_jobs j
   SET status = b.ligne->>'status', error = b.ligne->>'error', platform_fields = b.ligne->'platform_fields'
  FROM public._backup_0511_cloud_verrou_jeton b
 WHERE j.id = (b.ligne->>'id')::uuid AND j.status = 'pending';
SELECT string_agg(left(j.id::text, 8) || ' → ' || j.status, ' ; ') AS taches
  FROM public.cross_post_jobs j WHERE j.id IN (SELECT (b.ligne->>'id')::uuid FROM public._backup_0511_cloud_verrou_jeton b);
COMMIT;
