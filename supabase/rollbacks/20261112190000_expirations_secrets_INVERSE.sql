-- INVERSE de 20261112190000_expirations_secrets : retire le cron puis la table (rien d'autre ne la lit).
-- Puis : npx supabase migration repair --linked --status reverted 20261112190000 --yes
-- (le secret Apple posé dans la configuration auth reste : il est valable jusqu'au 11/05/2027 19:33.)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expirations-secrets-jour') THEN PERFORM cron.unschedule('expirations-secrets-jour'); END IF;
END $$;
DROP TABLE IF EXISTS public.expirations_secrets;
