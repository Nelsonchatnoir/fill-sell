-- INVERSE de scripts/reparations/20261025_ebay_taille_820227542038.sql : l'article et l'offre de l'annonce eBay
-- 820227542038, sauvegardés avant l'écriture (_backup_2510_ebay_taille_gants, relus en entier par le worker à
-- l'étape 1), réécrits tels quels par le worker (action reviser_annonce, mode restaurer — même circuit que
-- l'inverse de la djellaba du 24/10 et des annonces de Tessy du 11/10). La Taille en ligne redevient
-- « Gants de ski enfant » (la valeur fausse d'avant : l'inverse remet l'annonce EXACTEMENT comme elle était).
-- Le mode restaurer note aussi platform_fields.revision_rayon_annulee sur le job et y remet le rayon sauvegardé
-- (57885, inchangé). Appel par la base (x-cron-secret lu par public.cron_secret(), jamais écrit). Aucun mail.
-- Lire ensuite la réponse : SELECT status_code, content FROM net._http_response WHERE id = <requete>.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public._backup_2510_ebay_taille_gants WHERE listing_id = '820227542038') THEN
    RAISE EXCEPTION 'sauvegarde _backup_2510_ebay_taille_gants absente — rien à restaurer';
  END IF;
END $$;

SELECT net.http_post(
  url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/ebay-api-worker',
  headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
  body := jsonb_build_object('action', 'reviser_annonce', 'restaurer', true,
            'table_sauvegarde', '_backup_2510_ebay_taille_gants', 'listing_id', '820227542038'),
  timeout_milliseconds := 120000) AS requete;
