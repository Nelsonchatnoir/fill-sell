-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261119180000_rappel_encore_en_ligne (19/11/2026, terminal t5)
-- ═══════════════════════════════════════════════════════════════════════════
-- Retire le réveil, les trois fonctions, l'index partiel et la clé de l'interrupteur. Aucune donnée réécrite (les traces
-- usage_logs « rappel_encore_en_ligne » restent : elles ne pilotent rien sans la règle).
-- Appliquer : npx supabase db query --linked -f supabase/rollbacks/20261119180000_rappel_encore_en_ligne_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'push-rappels-encore-en-ligne';
DROP FUNCTION IF EXISTS public.encore_en_ligne_a_relancer_existe();
DROP FUNCTION IF EXISTS public.encore_en_ligne_mes_questions();
DROP FUNCTION IF EXISTS public.encore_en_ligne_questions(uuid, integer);
DROP INDEX IF EXISTS public.cross_post_jobs_pending_removal_idx;
DELETE FROM public.coin_config WHERE key = 'rappel_encore_en_ligne_actif';
COMMIT;
