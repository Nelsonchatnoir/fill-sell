-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE de supabase/migrations/20261107200000_cloud_ref_close.sql — la prod d'avant, à l'identique : aucun corps de
-- fonction existant n'a été réécrit par la migration (elle n'AJOUTE qu'une table, une fonction de déclencheur et un
-- déclencheur) ; l'inverse les retire, dans l'ordre (déclencheur, fonction, table).
-- ⚠ La table des références closes est PERDUE : la relire avant si besoin
--   (SELECT * FROM public.cloud_refs_closes) ; les neutralisations restent au journal
--   (stores_notifications_journal, type « CLOUD_REF_CLOSE »).
-- Après l'inverse : npx supabase migration repair --linked --status reverted 20261107200000
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

DROP TRIGGER IF EXISTS profiles_zz_cloud_ref_close ON public.profiles;
DROP FUNCTION IF EXISTS public.profiles_cloud_ref_close();
DROP TABLE IF EXISTS public.cloud_refs_closes;
