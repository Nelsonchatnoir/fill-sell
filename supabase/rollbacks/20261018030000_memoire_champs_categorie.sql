-- Inverse de supabase/migrations/20261018030000_memoire_champs_categorie.sql
-- (la mémoire « compte × catégorie » des réponses, 18/10 nuit, point 1).
-- Effet : la table et ses réponses retenues disparaissent ; l'app repose les
-- questions comme avant (le module lit une table absente = mémoire vide).
-- Application :
--   npx supabase db query --linked -f supabase/rollbacks/20261018030000_memoire_champs_categorie.sql
--   npx supabase migration repair --linked --status reverted 20261018030000
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS public.memoire_champs_categorie;
DROP FUNCTION IF EXISTS public.memoire_champs_categorie_horodater();
COMMIT;
