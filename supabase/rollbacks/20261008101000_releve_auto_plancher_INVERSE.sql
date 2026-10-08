-- INVERSE de 20261008101000_releve_auto_plancher.sql (08/10/2026)
-- Retire la garde ; la table des refus et la clé de réglage sont gardées
-- (journal ; la clé à 0 coupe aussi la garde si on la remettait).
BEGIN;
DROP TRIGGER IF EXISTS garde_releve_auto_plancher ON public.vinted_sync_runs;
DROP FUNCTION IF EXISTS public.garde_releve_auto_plancher();
-- À la main si besoin : DROP TABLE public.releves_auto_refuses;
--                       DELETE FROM public.coin_config WHERE key = 'releve_auto_plancher_min';
COMMIT;
