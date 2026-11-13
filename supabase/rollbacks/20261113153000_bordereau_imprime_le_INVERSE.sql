-- INVERSE de supabase/migrations/20261113153000_bordereau_imprime_le.sql (13/11/2026, étape 5 du lot « zéro problème ») :
-- la RPC bordereau_marquer_imprime retirée, puis la colonne bordereaux_copies.imprime_le (les horodatages d'impression
-- posés depuis la migration sont perdus — ils ne servent qu'au repère « Imprimé le » de l'écran « À expédier »).
-- L'app tolère l'absence des deux (lecture À PART, appel sans effet) : aucun écran cassé après l'inverse.
-- À jouer : npx supabase db query --linked -f supabase/rollbacks/20261113153000_bordereau_imprime_le_INVERSE.sql
--           puis npx supabase migration repair --linked --status reverted 20261113153000
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP FUNCTION IF EXISTS public.bordereau_marquer_imprime(uuid[]);
ALTER TABLE public.bordereaux_copies DROP COLUMN IF EXISTS imprime_le;
NOTIFY pgrst, 'reload schema';
COMMIT;
