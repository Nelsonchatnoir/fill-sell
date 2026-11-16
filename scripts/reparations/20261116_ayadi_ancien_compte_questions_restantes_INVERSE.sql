-- INVERSE de 20261116_ayadi_ancien_compte_questions_restantes.sql — le compte cfdfda6f (16/11/2026 soir)
-- Remet chaque tâche close par ce script dans son état sauvegardé (_backup_1611_cfdfda6f_questions_restantes : statut,
-- texte, platform_fields — la question « Vendue ? » revient), sans déclencher aucun effet (session_replication_role =
-- replica, comme les autres inverses) ; seulement les tâches encore dans l'état où le script les a mises. Compteurs de
-- tâches du compte cfdfda6f : remis à « inconnu » (le poll relit tout). La sauvegarde reste (à supprimer à la main ensuite).
-- JOUER : npx supabase db query --linked -f scripts/reparations/20261116_ayadi_ancien_compte_questions_restantes_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL session_replication_role = replica;
UPDATE public.cross_post_jobs j
   SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_1611_cfdfda6f_questions_restantes b
 WHERE j.id = b.id AND j.status = 'cancelled'
   AND j.platform_fields #>> '{compte_quitte,par}' = 'reparation_questions_restantes';
UPDATE public.compte_signal SET jobs = NULL, maj_le = now() WHERE user_id = 'cfdfda6f-d182-4974-81b2-07050fc95d37';
COMMIT;
SELECT count(*) AS remises FROM public.cross_post_jobs j JOIN public._backup_1611_cfdfda6f_questions_restantes b ON b.id = j.id
 WHERE j.status = b.status AND j.platform_fields = b.platform_fields;
