-- INVERSE de supabase/migrations/20261113154000_cron_refus_journalise.sql (13/11/2026, étape 5, bloc 6 P3) : le
-- déclencheur cron_refus_journalise et sa fonction retirés. Les lignes usage_logs « cron_refuse » déjà écrites RESTENT
-- (journal : rien ne les lit sauf ops-digest, qui repasse de lui-même sur les notes des relevés porteurs). La note de
-- l'extension, la cadence et la règle des 20 h n'ont jamais été touchées.
-- À jouer : npx supabase db query --linked -f supabase/rollbacks/20261113154000_cron_refus_journalise_INVERSE.sql
--           puis npx supabase migration repair --linked --status reverted 20261113154000
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP TRIGGER IF EXISTS cron_refus_journalise ON public.vinted_sync_runs;
DROP FUNCTION IF EXISTS public.cron_refus_journaliser();
COMMIT;
