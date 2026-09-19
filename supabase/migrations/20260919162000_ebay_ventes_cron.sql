-- ═══════════════════════════════════════════════════════════════════════════
-- SYNCHRONISATION DES VENTES — eBay, la cadence serveur
-- 2026-09-19
--
-- Une fois par jour, à 4h40 UTC — dans un creux, et à l'écart des trois autres
-- crons du petit matin (republish-purge 3h40, lens-temp-purge 3h50,
-- coins-monthly-sweep 4h15) pour ne pas les empiler.
--
-- ⛔ IDEMPOTENTE. `cron.schedule` sur un nom existant DUPLIQUE le job (c'est
--    exactement ce qui est arrivé à handler-watch-3min) : on désinscrit d'abord,
--    sans échouer si le job n'existe pas.
-- ⛔ La fonction est déployée avec --no-verify-jwt et porte sa garde
--    x-cron-secret : verify_jwt=false n'est JAMAIS « pas d'authentification »,
--    c'est « l'authentification est faite par la fonction ».
-- ═══════════════════════════════════════════════════════════════════════════
DO $cron$
BEGIN
  PERFORM cron.unschedule('ebay-ventes-sync-daily');
EXCEPTION WHEN OTHERS THEN
  NULL; -- pas encore planifié : rien à désinscrire
END;
$cron$;

SELECT cron.schedule(
  'ebay-ventes-sync-daily',
  '40 4 * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/ebay-ventes-sync',
    headers := '{"Content-Type":"application/json","x-cron-secret":"fs-cron-2026-tunnel"}'::jsonb,
    body    := '{"mode":"sync","trigger":"ebay_ventes_cron"}'::jsonb
  );
  $cron$
);
