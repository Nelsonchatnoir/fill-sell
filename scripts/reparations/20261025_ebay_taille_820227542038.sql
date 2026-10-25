-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 25/10 (N5) — ÉTAPE 2 : LA TAILLE DE L'ANNONCE eBAY 820227542038 REMISE À « M » (NON LANCÉE)
-- ═══════════════════════════════════════════════════════════════════════════
-- Annonce 820227542038 (job 9f678d8b, fiche 1791722670101, voie API) : Taille en ligne « Gants de ski enfant »
-- (seconde passe de l'IA, le mot recopié du titre) ; la fiche et le job disent « M ». Le contexte, la règle et le
-- circuit : voir l'étape 1, scripts/reparations/20261025_ebay_taille_820227542038_LECTURE.sql (lecture à blanc),
-- à jouer AVANT, et dont la réponse (moins de 2 h, pg_net la garde quelques heures) est la sauvegarde.
-- Gardes : la fiche au stock (quantité 1), aucune vente, aucune commande ; le job tel que l'étape 1 l'a vu ; la
-- sauvegarde complète de l'offre et de l'article (relue par le worker) avant l'écriture ; le worker n'écrit que
-- si l'annonce n'a pas bougé depuis (empreinte) et que la Taille en ligne est toujours « Gants de ski enfant ».
-- L'écriture : Taille = la taille de la fiche passée par la règle du dépôt sur la grille du rayon 57885 (« M »),
-- PUT de l'article seulement (l'offre n'est pas touchée), relecture de l'annonce publique (Browse) notée dans
-- platform_fields.revision_annonce. Même numéro, rien de republié ni décompté (aucun quota).
-- Appel du worker par la base (net.http_post, x-cron-secret lu par public.cron_secret(), jamais écrit). Aucun mail.
-- Lire ensuite : SELECT status_code, content FROM net._http_response WHERE id = <requete_ecriture>;
-- Inverse : scripts/reparations/20261025_ebay_taille_820227542038_INVERSE.sql (l'article et l'offre sauvegardés,
-- réécrits tels quels par le mode restaurer).
BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TABLE public._backup_2510_ebay_taille_gants (
  listing_id text PRIMARY KEY, job_id uuid NOT NULL, offer_id text NOT NULL, sku text NOT NULL,
  offre jsonb NOT NULL, article jsonb NOT NULL, browse jsonb, empreinte text NOT NULL,
  job_platform_fields jsonb, requete_lecture bigint NOT NULL, sauvegarde_le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_2510_ebay_taille_gants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2510_ebay_taille_gants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public._backup_2510_ebay_taille_gants TO service_role;   -- le worker la relit avant d'écrire

-- La lecture à blanc de l'étape 1 : la plus récente, réussie, pour CETTE annonce (le contenu n'est lu en JSON
-- qu'après le filtre texte : une autre réponse de pg_net peut ne pas être du JSON).
WITH brut AS MATERIALIZED (
  SELECT r.id, r.content FROM net._http_response r
   WHERE r.status_code = 200 AND r.created > now() - interval '2 hours'
     AND r.content LIKE '%"dry_run":true%' AND r.content LIKE '%"annonce":"820227542038"%' AND r.content LIKE '%"sauvegarde"%'
), lu AS (
  SELECT b.id, b.content::jsonb AS c FROM brut b ORDER BY b.id DESC LIMIT 1
)
INSERT INTO public._backup_2510_ebay_taille_gants (listing_id, job_id, offer_id, sku, offre, article, browse, empreinte, job_platform_fields, requete_lecture)
SELECT '820227542038', j.id, lu.c -> 'sauvegarde' ->> 'offer_id', lu.c -> 'sauvegarde' ->> 'sku',
       lu.c -> 'sauvegarde' -> 'offre', lu.c -> 'sauvegarde' -> 'article', lu.c -> 'sauvegarde' -> 'browse',
       lu.c -> 'sauvegarde' ->> 'empreinte', j.platform_fields, lu.id
  FROM lu JOIN public.cross_post_jobs j ON j.id = '9f678d8b-fc7d-4a81-8380-8239e9dbac95'
 WHERE (lu.c ->> 'ok')::boolean
   AND lu.c -> 'changements' -> 0 ->> 'de' = 'Gants de ski enfant' AND lu.c -> 'changements' -> 0 ->> 'vers' = 'M';

DO $$
BEGIN
  IF (SELECT count(*) FROM public._backup_2510_ebay_taille_gants
       WHERE listing_id = '820227542038' AND offer_id = '308185393011' AND sku = 'fs-1791722670101'
         AND article ? 'product' AND article -> 'product' -> 'aspects' -> 'Taille' ->> 0 = 'Gants de ski enfant'
         AND length(empreinte) = 64) <> 1 THEN
    RAISE EXCEPTION 'sauvegarde : la lecture à blanc de l''étape 1 (moins de 2 h) est attendue — rien n''est fait';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventaire i WHERE i.id = 1791722670101 AND i.statut = 'stock' AND coalesce(i.quantite, 1) = 1)
     OR EXISTS (SELECT 1 FROM public.ventes v WHERE v.inventaire_id = 1791722670101)
     OR EXISTS (SELECT 1 FROM public.plateforme_commandes pc WHERE pc.inventaire_id = 1791722670101)
     OR NOT EXISTS (SELECT 1 FROM public.cross_post_jobs c WHERE c.id = '9f678d8b-fc7d-4a81-8380-8239e9dbac95'
                      AND c.status = 'published' AND c.voie = 'api' AND c.platform_fields ->> 'taille' = 'M') THEN
    RAISE EXCEPTION 'fiche ou job : état inattendu — rien n''est fait';
  END IF;
END $$;

-- L'écriture, par le worker (après le COMMIT : pg_net envoie la requête quand la transaction est validée).
SELECT net.http_post(
  url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/ebay-api-worker',
  headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
  body := jsonb_build_object('action', 'reviser_annonce', 'dry_run', false, 'taille', true,
            'job_id', '9f678d8b-fc7d-4a81-8380-8239e9dbac95', 'taille_actuelle', 'M',
            'aspect_en_ligne', 'Gants de ski enfant', 'table_sauvegarde', '_backup_2510_ebay_taille_gants',
            'empreinte_attendue', (SELECT empreinte FROM public._backup_2510_ebay_taille_gants WHERE listing_id = '820227542038')),
  timeout_milliseconds := 120000) AS requete_ecriture;
COMMIT;
