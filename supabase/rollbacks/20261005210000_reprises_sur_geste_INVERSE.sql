-- INVERSE de supabase/migrations/20261005210000_reprises_sur_geste.sql (05/10).
-- La migration n'ajoute qu'un trigger et sa fonction : l'inverse les retire.
BEGIN;
DROP TRIGGER IF EXISTS garde_reprise_sans_geste ON public.vinted_sync_runs;
DROP FUNCTION IF EXISTS public.garde_reprise_sans_geste();
COMMIT;
