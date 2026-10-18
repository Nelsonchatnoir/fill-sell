-- Inverse de supabase/migrations/20261018160000_ia_leviers_bascule.sql (18/10, chantier « zéro friction »).
-- Effet : plus aucun levier IA ne tourne (generate-listing lit une table absente → aucune ligne → l'existant seul,
-- comme avant le 18/10), plus de bascule ni de bilan des questions. Les journaux usage_logs (ia_levier,
-- ia_levier_bascule) restent.
-- Couper SANS rien supprimer : update public.ia_leviers_bascule set etat = 'eteint', depuis = now(), motif = 'coupé à la main';
-- Application :
--   npx supabase db query --linked -f supabase/rollbacks/20261018160000_ia_leviers_bascule.sql
--   npx supabase migration repair --linked --status reverted 20261018160000
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ia-leviers-6h';
DROP FUNCTION IF EXISTS public.questions_publication_bilan(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.ia_leviers_evaluer();
DROP FUNCTION IF EXISTS public.ia_levier_valeur_job(text, jsonb, text, text, text);
DROP TABLE IF EXISTS public.ia_leviers_bascule;
COMMIT;
