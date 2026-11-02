-- Inverse de 20261102160000_signal_compte.sql : retire le signal « rien n'a changé pour ce compte ».
-- Le poll (get-pending-jobs) relit tout quand signal_poll n'existe pas ou rend NULL : rien d'autre à défaire.
BEGIN;
DROP TRIGGER IF EXISTS cross_post_jobs_compte_signal ON public.cross_post_jobs;
DROP TRIGGER IF EXISTS profiles_compte_signal ON public.profiles;
DROP TRIGGER IF EXISTS coin_config_signal ON public.coin_config;
DROP FUNCTION IF EXISTS public.signal_poll(uuid);
DROP FUNCTION IF EXISTS public.cross_post_jobs_compte_signal();
DROP FUNCTION IF EXISTS public.profiles_compte_signal();
DROP FUNCTION IF EXISTS public.coin_config_signal();
DROP FUNCTION IF EXISTS public.compte_signal_ajuster(uuid, text, int);
DROP TABLE IF EXISTS public.compte_signal;
DROP TABLE IF EXISTS public.signal_global;
COMMIT;
