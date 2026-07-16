-- handler-watch : cron toutes les 3 minutes.
-- ⚠️ À N'APPLIQUER QU'APRÈS le déploiement de la fonction handler-watch :
--    supabase functions deploy handler-watch --no-verify-jwt
-- Même mécanique qu'ops-digest : header x-cron-secret uniquement (pas de query
-- param ni d'Authorization dans pg_net, cf. CLAUDE.md).
--
-- La fonction n'envoie un email QUE s'il y a un incident hors cooldown : un
-- tick « propre » ne coûte qu'une requête cross_post_jobs sur 30 min glissantes.

SELECT cron.schedule(
  'handler-watch-3min',
  '*/3 * * * *',
  $cron_body$
  SELECT net.http_post(
    url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/handler-watch',
    headers := '{"Content-Type":"application/json","x-cron-secret":"fs-cron-2026-tunnel"}'::jsonb,
    body    := '{"trigger":"handler_watch_cron"}'::jsonb
  );
  $cron_body$
);
