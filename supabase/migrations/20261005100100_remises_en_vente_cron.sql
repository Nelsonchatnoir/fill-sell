-- ═══════════════════════════════════════════════════════════════════════════
-- Remise en vente après une vente partielle — le cron (05/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- Sépare la MISE EN ROUTE de la règle (20261005100000) : la file existe et se
-- remplit à chaque vente ; ce cron la traite toutes les 5 min (20 au plus par
-- tour, tour sauté si veille_cpu > 50 %). Mesure d'un tour manuel (compte de
-- Nico) : voir docs/reprise/terminal-problemes-0510.md.
-- ⚠️ À appliquer sur GO de Nico : le premier tour rattrape aussi les fiches
-- déjà dans cet état (10 fiches Vinted de Louis au 05/10).
-- Inverse : SELECT cron.unschedule('remises-en-vente-5min');
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'remises-en-vente-5min') THEN
    PERFORM cron.schedule('remises-en-vente-5min', '*/5 * * * *', 'SELECT public.remises_en_vente_tick(20)');
  END IF;
END $$;
