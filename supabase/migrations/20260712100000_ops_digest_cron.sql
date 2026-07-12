-- ops-digest : cron quotidien à 08:50 UTC (10 min avant l'email-tunnel de 9h).
-- Appelle l'edge function ops-digest qui n'envoie un email à support@fillsell.app
-- que s'il y a au moins une anomalie dans cross_post_jobs (failed 24h, processing
-- bloqué > 15 min, delete non terminé > 24 h, veille Beebs unavailable < 7 j).
--
-- Même mécanique que email-tunnel-daily : header x-cron-secret uniquement
-- (pas de query param ni d'Authorization dans pg_net, cf. CLAUDE.md), et la
-- fonction doit être déployée avec --no-verify-jwt.

SELECT cron.schedule(
  'ops-digest-daily',
  '50 8 * * *',
  $cron_body$
  SELECT net.http_post(
    url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/ops-digest',
    headers := '{"Content-Type":"application/json","x-cron-secret":"fs-cron-2026-tunnel"}'::jsonb,
    body    := '{"trigger":"daily_cron"}'::jsonb
  );
  $cron_body$
);
