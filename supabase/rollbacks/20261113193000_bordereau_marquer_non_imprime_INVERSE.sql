-- INVERSE de supabase/migrations/20261113193000_bordereau_marquer_non_imprime.sql (13/11/2026, lot NU — I3) : la RPC
-- bordereau_marquer_non_imprime retirée, puis les colonnes non_imprime_le et imprime_avant (la trace des retraits et les dates
-- retirées sont perdues ; imprime_le, le marquage et sa RPC restent tels quels — une copie marquée non imprimée reste « pas
-- encore imprimée »). L'app ne montre plus le geste (non_imprime_le illisible) : aucun écran cassé après l'inverse.
-- ⚠️ À jouer AVANT l'inverse de 20261113153000 si les deux sont rendues.
-- À jouer : npx supabase db query --linked -f supabase/rollbacks/20261113193000_bordereau_marquer_non_imprime_INVERSE.sql
--           puis npx supabase migration repair --linked --status reverted 20261113193000
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP FUNCTION IF EXISTS public.bordereau_marquer_non_imprime(uuid[], boolean);
ALTER TABLE public.bordereaux_copies DROP COLUMN IF EXISTS non_imprime_le;
ALTER TABLE public.bordereaux_copies DROP COLUMN IF EXISTS imprime_avant;
NOTIFY pgrst, 'reload schema';
COMMIT;
