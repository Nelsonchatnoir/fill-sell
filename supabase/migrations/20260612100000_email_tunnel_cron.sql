-- Email tunnel daily cron at 09:00 UTC
--
-- BEFORE running this migration:
--   1. Dashboard → Database → Extensions → enable pg_cron
--   2. Dashboard → Edge Functions → Secrets → add CRON_SECRET = fs-cron-2026-tunnel
--
-- Then apply via: supabase db push  (or run in SQL editor)

SELECT cron.schedule(
  'email-tunnel-daily',
  '0 9 * * *',
  $cron_body$
  SELECT net.http_post(
    url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/email-tunnel',
    headers := '{"Content-Type":"application/json","x-cron-secret":"fs-cron-2026-tunnel"}'::jsonb,
    body    := '{"trigger":"daily_cron"}'::jsonb
  );
  $cron_body$
);
