-- INVERSE de supabase/migrations/20261114170000_sessions_poste_cloud_seul.sql (14/11/2026, point 4 de Nico).
-- Retire la garde : l'extension de l'ordinateur d'un compte au Cloud actif peut de nouveau écrire extension_sessions.
-- Aucune donnée à restaurer (la garde n'écrit rien : elle ignorait des écritures).
--   npx supabase db query --linked -f supabase/rollbacks/20261114170000_sessions_poste_cloud_seul_INVERSE.sql
--   npx supabase migration repair --linked --status reverted 20261114170000
DROP TRIGGER IF EXISTS profiles_a_sessions_poste_cloud_seul ON public.profiles;
DROP FUNCTION IF EXISTS public.profiles_sessions_poste_cloud_seul();
