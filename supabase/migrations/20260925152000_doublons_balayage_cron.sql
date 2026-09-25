-- ═══════════════════════════════════════════════════════════════════════════
-- LE BALAYAGE DES DOUBLONS, TOUTES LES 2 MINUTES (2026-09-25)
-- ═══════════════════════════════════════════════════════════════════════════
-- La fonction edge doublons-balayage calcule les empreintes des photos qui
-- manquent pour trancher (annonces proposées, fiches importées récentes), puis
-- laisse la base décider (rapprochement_photos_decider, migration
-- 20260925151000) : rattachement ou fusion quand c'est CERTAIN, question dans
-- l'app quand c'est PROBABLE. Rien n'est jamais envoyé à une plateforme.
--
-- ⛔ IDEMPOTENTE. `cron.schedule` sur un nom existant DUPLIQUE le job (c'est
--    exactement ce qui est arrivé à handler-watch-3min) : on désinscrit
--    d'abord, sans échouer si le job n'existe pas.
-- ⛔ La fonction est déployée avec --no-verify-jwt (déclarée `false` dans
--    supabase/config.toml) et porte sa garde x-cron-secret.
-- ⛔ Chantier « rotation du secret de cron » (CLAUDE.md) : ce fichier et la
--    ligne de cron.job qu'il crée sont DEUX endroits de plus à reprendre.
-- ═══════════════════════════════════════════════════════════════════════════
DO $cron$
BEGIN
  PERFORM cron.unschedule('doublons-balayage-2min');
EXCEPTION WHEN OTHERS THEN
  NULL; -- pas encore planifié : rien à désinscrire
END;
$cron$;

SELECT cron.schedule(
  'doublons-balayage-2min',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/doublons-balayage',
    headers := '{"Content-Type":"application/json","x-cron-secret":"fs-cron-2026-tunnel"}'::jsonb,
    body    := '{"trigger":"doublons_balayage_cron"}'::jsonb
  );
  $cron$
);
