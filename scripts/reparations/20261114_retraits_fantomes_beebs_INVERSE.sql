-- INVERSE de 20261114_retraits_fantomes_beebs.sql (14/11/2026, point 4c de Nico) : remet chaque retrait clos par le
-- script dans l'état sauvegardé (statut, message, champs), seulement s'il est encore tel que le script l'a laissé
-- (deleted + deja_absente posé par lui) — jamais par-dessus une évolution postérieure.
--   npx supabase db query --linked -f scripts/reparations/20261114_retraits_fantomes_beebs_INVERSE.sql
BEGIN;
UPDATE public.cross_post_jobs j SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_1411_retraits_fantomes_beebs b
 WHERE j.id = b.id AND j.status = 'deleted'
   AND j.platform_fields -> 'deja_absente' ->> 'pose_par' = 'scripts/reparations/20261114_retraits_fantomes_beebs';
SELECT count(*) AS retraits_remis FROM public._backup_1411_retraits_fantomes_beebs;
COMMIT;
