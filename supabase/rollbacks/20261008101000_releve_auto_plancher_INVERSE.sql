-- INVERSE de 20261008101000_releve_auto_plancher.sql, version révisée (08/10/2026)
-- Retire la garde du veilleur ; la table des refus est gardée (journal).
BEGIN;
DROP TRIGGER IF EXISTS garde_releve_veilleur_cause ON public.vinted_sync_runs;
DROP FUNCTION IF EXISTS public.garde_releve_veilleur_cause();
DROP FUNCTION IF EXISTS public.releve_veilleur_decision(uuid, text);
-- À la main si besoin : DROP TABLE public.releves_auto_refuses;
COMMIT;
