-- INVERSE de supabase/migrations/20261018010000_releves_morts_veille.sql : la fonction de
-- veille disparaît (aucune donnée, aucun cron : l'ops-digest la lit en best-effort et
-- continue sans elle). Application :
--   npx supabase db query --linked -f supabase/rollbacks/20261018010000_releves_morts_veille.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP FUNCTION IF EXISTS public.releves_morts_veille(integer, integer);
COMMIT;
