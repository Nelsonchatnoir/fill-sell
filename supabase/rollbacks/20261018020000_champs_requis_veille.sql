-- Inverse de 20261018020000_champs_requis_veille.sql (18/10, lot 3).
-- La fonction est NOUVELLE et en lecture seule : la retirer suffit. L'ops-digest
-- (v37) la lit dans un try/catch : sans elle, la section « Champs obligatoires »
-- est absente et le digest continue.
--   npx supabase db query --linked -f supabase/rollbacks/20261018020000_champs_requis_veille.sql
--   npx supabase migration repair --linked --status reverted 20261018020000
BEGIN;
DROP FUNCTION IF EXISTS public.champs_requis_veille(integer, integer);
COMMIT;
