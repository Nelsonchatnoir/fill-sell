-- Inverse de supabase/migrations/20261018040000_ia_questions_cache.sql (cache des questions IA, 18/10 nuit, point 5).
-- Effet : le cache disparaît ; les fonctions edge reposent chaque question à l'IA comme avant (table absente = pas de
-- cache, jamais une erreur). Éteindre d'abord l'interrupteur suffit à tout arrêter sans rien supprimer :
--   update coin_config set value = 0 where key in ('ia_cache_categorie', 'ia_cache_aspects', 'ia_aspects_groupes');
-- Application :
--   npx supabase db query --linked -f supabase/rollbacks/20261018040000_ia_questions_cache.sql
--   npx supabase migration repair --linked --status reverted 20261018040000
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS public.ia_questions_cache;
DELETE FROM public.coin_config WHERE key IN ('ia_cache_categorie', 'ia_cache_aspects', 'ia_aspects_groupes');
COMMIT;
