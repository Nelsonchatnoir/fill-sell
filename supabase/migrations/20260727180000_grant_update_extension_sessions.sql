-- 403 sur reportPlatformSessions (extension, build 2d341ee) : le GRANT UPDATE
-- de authenticated sur public.profiles est scopé par colonnes et
-- extension_sessions (ajoutée le 2026-07-27 pour l'onboarding) n'y figurait
-- pas. La policy RLS « update own profile » (auth.uid() = id) est correcte et
-- suffisante côté lignes ; depuis le breaking change Supabase de mai 2026, le
-- GRANT colonne est requis en plus. Additif strict : aucune autre colonne,
-- aucun DROP, aucune policy modifiée.
-- Appliquée en prod le 2026-07-27 (grant_update_extension_sessions_to_authenticated).
GRANT UPDATE (extension_sessions) ON public.profiles TO authenticated;
