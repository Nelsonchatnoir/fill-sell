-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 25/10 (N5) — ÉTAPE 2 bis : L'ÉCRITURE RELANCÉE (ordre de Nico, 25/10 ~13:05 : « Corrige l'annonce eBay
-- 820227542038 (Taille « M » au lieu de « Gants de ski enfant »), puis vérifie-la en ligne. »)
-- ═══════════════════════════════════════════════════════════════════════════
-- L'étape 2 (20261025_ebay_taille_820227542038.sql) a été jouée à 11:17:33 : la sauvegarde complète est en base
-- (_backup_2510_ebay_taille_gants, offre + article + empreinte, lus par la lecture à blanc 6894), mais le worker,
-- appelé 0,04 s après le COMMIT qui créait la table, ne la voyait pas encore (cache du schéma de PostgREST :
-- réponse 6895 « sauvegarde_absente », RIEN écrit chez eBay). Ici : la même écriture, rien d'autre — la table
-- n'est pas recréée, la sauvegarde n'est pas réécrite. Avant l'appel (script à part, quelques secondes plus tôt) :
--   NOTIFY pgrst, 'reload schema';
-- Gardes identiques à l'étape 2 : sauvegarde présente et conforme (Taille sauvée « Gants de ski enfant »,
-- empreinte de 64 caractères), fiche au stock (quantité 1), aucune vente, aucune commande, job publié par l'API
-- avec la taille « M ». Le worker n'écrit que si l'annonce n'a pas bougé depuis la sauvegarde (empreinte) et que
-- la Taille en ligne est toujours « Gants de ski enfant » ; PUT de l'article seulement, relecture publique notée
-- dans platform_fields.revision_annonce. Même numéro, rien de republié ni décompté. Aucun mail.
-- Appel par la base (net.http_post, x-cron-secret lu par public.cron_secret(), jamais écrit).
-- Lire ensuite : SELECT status_code, content FROM net._http_response WHERE id = <requete_ecriture>;
-- Inverse : scripts/reparations/20261025_ebay_taille_820227542038_INVERSE.sql.
DO $$
BEGIN
  IF (SELECT count(*) FROM public._backup_2510_ebay_taille_gants
       WHERE listing_id = '820227542038' AND offer_id = '308185393011' AND sku = 'fs-1791722670101'
         AND job_id = '9f678d8b-fc7d-4a81-8380-8239e9dbac95'
         AND article ? 'product' AND article -> 'product' -> 'aspects' -> 'Taille' ->> 0 = 'Gants de ski enfant'
         AND length(empreinte) = 64) <> 1 THEN
    RAISE EXCEPTION 'sauvegarde absente ou non conforme — rien n''est demandé';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventaire i WHERE i.id = 1791722670101 AND i.statut = 'stock' AND coalesce(i.quantite, 1) = 1)
     OR EXISTS (SELECT 1 FROM public.ventes v WHERE v.inventaire_id = 1791722670101)
     OR EXISTS (SELECT 1 FROM public.plateforme_commandes pc WHERE pc.inventaire_id = 1791722670101)
     OR NOT EXISTS (SELECT 1 FROM public.cross_post_jobs c WHERE c.id = '9f678d8b-fc7d-4a81-8380-8239e9dbac95'
                      AND c.status = 'published' AND c.voie = 'api' AND c.platform_fields ->> 'taille' = 'M'
                      AND NOT (c.platform_fields ? 'revision_annonce')) THEN
    RAISE EXCEPTION 'fiche ou job : état inattendu — rien n''est demandé';
  END IF;
END $$;

SELECT net.http_post(
  url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/ebay-api-worker',
  headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
  body := jsonb_build_object('action', 'reviser_annonce', 'dry_run', false, 'taille', true,
            'job_id', '9f678d8b-fc7d-4a81-8380-8239e9dbac95', 'taille_actuelle', 'M',
            'aspect_en_ligne', 'Gants de ski enfant', 'table_sauvegarde', '_backup_2510_ebay_taille_gants',
            'empreinte_attendue', (SELECT empreinte FROM public._backup_2510_ebay_taille_gants WHERE listing_id = '820227542038')),
  timeout_milliseconds := 120000) AS requete_ecriture;
