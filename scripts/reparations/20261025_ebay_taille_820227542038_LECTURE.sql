-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 25/10 (N5) — ÉTAPE 1 : LA LECTURE À BLANC (rien n'est écrit, ni chez eBay ni en base)
-- ═══════════════════════════════════════════════════════════════════════════
-- Annonce eBay 820227542038 (job 9f678d8b, fiche 1791722670101 « Gants de ski Quechua enfant noir doublure
-- polaire », voie API, publiée le 11/10 à 14:46) : en ligne avec Taille = « Gants de ski enfant » — la réponse de
-- la seconde passe de l'IA (le mot recopié du titre), posée dans ebayAspects et lue AVANT la taille de la fiche.
-- La fiche dit « M » (attributs.taille, saisie manuelle), le job aussi (platform_fields.taille).
-- La règle d'abord (tous les comptes) : _shared/ebay-aspects-ia.ts (une taille est une liste fermée pour l'IA,
-- jamais de seconde passe) et _shared/ebay-publication.ts (assemblerAspects : la personne, la fiche, puis la liste).
-- Le circuit : ebay-api-worker, action reviser_annonce, mode taille (03/10) — la taille de la fiche passée par la
-- règle du dépôt sur la grille eBay du rayon, PUT de l'article, relecture de l'annonce publique ; même numéro,
-- rien de republié ni décompté. `aspect_en_ligne` (25/10) : la Taille EN LIGNE attendue — le worker relit
-- l'annonce entière (en vente, la nôtre, invendue, cette Taille-là) et rend la sauvegarde complète (offre,
-- article, empreinte) qui conditionne l'écriture (étape 2) et l'inverse.
-- Prérequis : ebay-api-worker déployé avec le mode `aspect_en_ligne` (lot du 25/10).
-- Appel par la base (net.http_post, x-cron-secret lu par public.cron_secret(), jamais écrit). Aucun mail.
-- Lire ensuite la réponse (ok, changements « Gants de ski enfant » → « M », sauvegarde.empreinte) :
--   SELECT id, status_code, left(content, 600) FROM net._http_response WHERE id = <requete_lecture>;
-- puis jouer l'étape 2 : scripts/reparations/20261025_ebay_taille_820227542038.sql.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cross_post_jobs c
                  WHERE c.id = '9f678d8b-fc7d-4a81-8380-8239e9dbac95' AND c.platform = 'ebay' AND c.voie = 'api'
                    AND c.status = 'published' AND c.platform_listing_id = '820227542038'
                    AND c.platform_fields ->> 'taille' = 'M'
                    AND c.platform_fields -> 'ebayAspects' ->> 'Taille' = 'Gants de ski enfant'
                    AND c.platform_fields -> 'ebay_api' ->> 'offer_id' = '308185393011') THEN
    RAISE EXCEPTION 'job 9f678d8b : état inattendu — rien n''est demandé';
  END IF;
END $$;

SELECT net.http_post(
  url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/ebay-api-worker',
  headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
  body := jsonb_build_object('action', 'reviser_annonce', 'dry_run', true, 'taille', true,
            'job_id', '9f678d8b-fc7d-4a81-8380-8239e9dbac95', 'taille_actuelle', 'M',
            'aspect_en_ligne', 'Gants de ski enfant'),
  timeout_milliseconds := 120000) AS requete_lecture;
