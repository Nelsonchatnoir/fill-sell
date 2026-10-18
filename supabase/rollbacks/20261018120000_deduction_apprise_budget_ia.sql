-- Inverse de supabase/migrations/20261018120000_deduction_apprise_budget_ia.sql (lot 2, 18/10).
-- Effet : plus de compteur de dépense IA (les fonctions edge retombent sur « compteur illisible » : le plafond
-- laisse passer l'essentiel et coupe le confort — cf. _shared/budget-ia.ts), plus de correspondances apprises,
-- plus de bascule ni de tâches de nuit. Les journaux usage_logs (deduction_fantome, deduction_apprise_posee) restent.
-- Couper SANS rien supprimer : update public.deduction_bascule set etat = 'eteint', depuis = now(), motif = 'coupé à la main';
-- Application :
--   npx supabase db query --linked -f supabase/rollbacks/20261018120000_deduction_apprise_budget_ia.sql
--   npx supabase migration repair --linked --status reverted 20261018120000
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('deduction-apprise-nuit', 'deduction-bascule-6h');
DROP TRIGGER IF EXISTS usage_logs_ia_depense ON public.usage_logs;
DROP TRIGGER IF EXISTS rapprochement_ia_verdicts_ia_depense ON public.rapprochement_ia_verdicts;
DROP FUNCTION IF EXISTS public.deduction_bascule_evaluer();
DROP FUNCTION IF EXISTS public.deduction_apprise_pour(text, text, text, text[]);
DROP FUNCTION IF EXISTS public.deduction_apprise_reconstruire();
DROP FUNCTION IF EXISTS public.deduction_champ_interdit(text);
DROP FUNCTION IF EXISTS public.ia_depense_etat();
DROP FUNCTION IF EXISTS public.ia_depense_noter();
DROP FUNCTION IF EXISTS public.ia_fournisseur_de(text);
DROP TABLE IF EXISTS public.deduction_bascule;
DROP TABLE IF EXISTS public.deduction_apprise;
DROP TABLE IF EXISTS public.ia_depense_jour;
COMMIT;
