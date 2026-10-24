-- INVERSE de scripts/reparations/20261024_djellaba_ebay_rayon.sql : l'offre et l'article de l'annonce eBay
-- 366745645547, sauvegardés avant l'écriture (_backup_2410_ebay_djellaba), réécrits tels quels par le worker
-- (action reviser_annonce, mode restaurer — même circuit que l'inverse des annonces de Tessy du 11/10), puis le job
-- reprend ses champs de rayon d'avant. Appel par la base (x-cron-secret lu par public.cron_secret(), jamais écrit).
-- Lire ensuite la réponse : SELECT status_code, content FROM net._http_response WHERE id = <requete>.
SELECT net.http_post(
  url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/ebay-api-worker',
  headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
  body := jsonb_build_object('action', 'reviser_annonce', 'restaurer', true,
            'table_sauvegarde', '_backup_2410_ebay_djellaba', 'listing_id', '366745645547'),
  timeout_milliseconds := 120000) AS requete;
