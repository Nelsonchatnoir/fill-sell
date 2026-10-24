-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 24/10 (décision 6 de Nico) — LA DJELLABA DE SÉBASTIEN RANGÉE DANS « VÊTEMENTS TRADITIONNELS »
-- ═══════════════════════════════════════════════════════════════════════════
-- Annonce eBay 366745645547 (job 12854dbb, fiche 1792419778337023, « Djellaba traditionnelle marocaine homme / unisexe
-- - Marron brodée ») : rangée en 3001 « Homme : vêtements › Costumes » par le catalogue Vinted (catalog_vinted).
-- La règle d'abord (tous les comptes) : ebay-api-worker v95 joue la règle des vêtements traditionnels avant toute
-- suggestion d'eBay (_shared/ebay-rayon-traditionnel.js, selftest ebay-rayon-traditionnel).
-- Le circuit : eBay est hors republication depuis le 17/09 ; un rayon faux d'une annonce eBay en ligne se corrige
-- par le circuit « ranger une annonce en ligne dans le rayon de la règle d'aujourd'hui » (décision de Nico du 11/10,
-- annonces de Tessy) : même numéro, vues et favoris gardés, rien de republié ni de décompté (aucun quota).
-- Lecture à blanc faite (requête pg_net 19125, 24/10 10:29) : en ligne, 0 vendu, 1 disponible, 3001 → 155253
-- (« Vêtements, accessoires › Déguisements, occasions spéciales › Vêtements traditionnels, du monde › Asie du
-- Sud-Ouest/Moyen-Orient »), état inchangé, aucun critère obligatoire, article non réécrit.
-- Gardes : la fiche au stock, aucune vente, aucune commande ; la sauvegarde complète de l'offre et de l'article
-- (relue par le worker) avant l'écriture ; le worker n'écrit que si l'annonce n'a pas bougé depuis (empreinte).
-- Appel du worker par la base (net.http_post, x-cron-secret lu par public.cron_secret(), jamais écrit).
-- Aucun mail. Inverse : scripts/reparations/20261024_djellaba_ebay_rayon_INVERSE.sql (l'offre et l'article
-- sauvegardés, réécrits tels quels).
BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TABLE public._backup_2410_ebay_djellaba (
  listing_id text PRIMARY KEY, job_id uuid NOT NULL, offer_id text NOT NULL, sku text NOT NULL,
  offre jsonb NOT NULL, article jsonb NOT NULL, browse jsonb, empreinte text NOT NULL,
  job_platform_fields jsonb, sauvegarde_le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_2410_ebay_djellaba ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_ebay_djellaba FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public._backup_2410_ebay_djellaba TO service_role;   -- le worker la relit avant d'écrire

INSERT INTO public._backup_2410_ebay_djellaba (listing_id, job_id, offer_id, sku, offre, article, browse, empreinte, job_platform_fields)
SELECT '366745645547', c.id, x.s ->> 'offer_id', x.s ->> 'sku', x.s -> 'offre', x.s -> 'article', x.s -> 'browse', x.s ->> 'empreinte', c.platform_fields
  FROM (SELECT r.content::jsonb -> 'sauvegarde' AS s FROM net._http_response r WHERE r.id = 19125 AND r.status_code = 200) x
  JOIN public.cross_post_jobs c ON c.id = '12854dbb-a4ea-4a91-ac6e-89961e326953';

DO $$
BEGIN
  IF (SELECT count(*) FROM public._backup_2410_ebay_djellaba
       WHERE listing_id = '366745645547' AND empreinte = 'f2f260835d605e6b243ab9f783d611b996400edd3906db97ec73b087ed55d089'
         AND offre ->> 'categoryId' = '3001' AND article ? 'product') <> 1 THEN
    RAISE EXCEPTION 'sauvegarde : la lecture à blanc 19125 attendue — rien n''est fait';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventaire i WHERE i.id = 1792419778337023 AND i.statut = 'stock' AND coalesce(i.quantite, 1) = 1)
     OR EXISTS (SELECT 1 FROM public.ventes v WHERE v.inventaire_id = 1792419778337023)
     OR EXISTS (SELECT 1 FROM public.plateforme_commandes pc WHERE pc.inventaire_id = 1792419778337023)
     OR NOT EXISTS (SELECT 1 FROM public.cross_post_jobs c WHERE c.id = '12854dbb-a4ea-4a91-ac6e-89961e326953'
                      AND c.status = 'published' AND c.platform_fields ->> 'ebayCategoryId' = '3001') THEN
    RAISE EXCEPTION 'fiche ou job : état inattendu — rien n''est fait';
  END IF;
END $$;

-- L'écriture, par le worker (après le COMMIT : pg_net envoie la requête quand la transaction est validée).
SELECT net.http_post(
  url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/ebay-api-worker',
  headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
  body := jsonb_build_object('action', 'reviser_annonce', 'rayon_regle', true, 'dry_run', false,
            'job_id', '12854dbb-a4ea-4a91-ac6e-89961e326953', 'rayon_actuel', '3001', 'pf_resolution', '{}'::jsonb,
            'categorie_attendue', '155253', 'table_sauvegarde', '_backup_2410_ebay_djellaba',
            'empreinte_attendue', (SELECT empreinte FROM public._backup_2410_ebay_djellaba WHERE listing_id = '366745645547')),
  timeout_milliseconds := 120000) AS requete_ecriture;
COMMIT;
