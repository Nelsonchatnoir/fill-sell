-- Produit par 20261107_louis_retraits_vendues_closes.mjs : RETRAIT de l'annonce vendue 3297299585 (remise 951cc7fc).
-- Lecture de la page publique juste avant : {"le":"2026-11-07T21:49:40.171Z","http":200,"status":"active","transaction":"sold","owner_type":"private","article_vendu":true,"sujet":"Rangement Noir et Gris pour 12 pots et 12 couvercles pour ya","source":"page publique leboncoin.fr/vi/3297299585.htm, onglet de Nico (lecture seule)"}
BEGIN;
WITH cible AS (
  SELECT a.*, i.titre AS titre_fiche
    FROM public.annonces_plateforme a
    JOIN public.inventaire i ON i.id = a.inventaire_id AND i.user_id = a.user_id
   WHERE a.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND a.platform = 'leboncoin' AND btrim(a.listing_id) = '3297299585'
     AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL AND i.fusionne_dans IS NULL
     AND ('{"le":"2026-11-07T21:49:40.171Z","http":200,"status":"active","transaction":"sold","owner_type":"private","article_vendu":true,"sujet":"Rangement Noir et Gris pour 12 pots et 12 couvercles pour ya","source":"page publique leboncoin.fr/vi/3297299585.htm, onglet de Nico (lecture seule)"}'::jsonb ->> 'http') = '200' AND ('{"le":"2026-11-07T21:49:40.171Z","http":200,"status":"active","transaction":"sold","owner_type":"private","article_vendu":true,"sujet":"Rangement Noir et Gris pour 12 pots et 12 couvercles pour ya","source":"page publique leboncoin.fr/vi/3297299585.htm, onglet de Nico (lecture seule)"}'::jsonb ->> 'status') = 'active' AND ('{"le":"2026-11-07T21:49:40.171Z","http":200,"status":"active","transaction":"sold","owner_type":"private","article_vendu":true,"sujet":"Rangement Noir et Gris pour 12 pots et 12 couvercles pour ya","source":"page publique leboncoin.fr/vi/3297299585.htm, onglet de Nico (lecture seule)"}'::jsonb ->> 'transaction') = 'sold'
     AND ('{"le":"2026-11-07T21:49:40.171Z","http":200,"status":"active","transaction":"sold","owner_type":"private","article_vendu":true,"sujet":"Rangement Noir et Gris pour 12 pots et 12 couvercles pour ya","source":"page publique leboncoin.fr/vi/3297299585.htm, onglet de Nico (lecture seule)"}'::jsonb ->> 'le')::timestamptz > now() - interval '15 minutes'
     AND NOT EXISTS (SELECT 1 FROM public.cross_post_jobs d
                      WHERE d.user_id = a.user_id AND d.platform = 'leboncoin' AND d.action = 'delete'
                        AND d.status IN ('pending', 'processing', 'needs_user')
                        AND public.listing_designe(a.listing_id, d.listing_url, d.platform_listing_id))
     AND EXISTS (SELECT 1 FROM public.cross_post_jobs r
                  WHERE r.id = '951cc7fc-5fb1-4698-9895-6664ece9c21d' AND r.status = 'pending'
                    AND r.platform_fields #>> '{remise_en_vente,annonce_vendue}' = '3297299585'
                    AND r.platform_fields #>> '{serie_un_par_un,exige_version}' = '9.9.9')
), crees AS (
  INSERT INTO public.cross_post_jobs
    (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
  SELECT c.user_id, c.inventaire_id, 'leboncoin', 'delete', 'pending', 'original',
         COALESCE(NULLIF(btrim(COALESCE(c.titre, '')), ''), c.titre_fiche), NULLIF(btrim(COALESCE(c.url, '')), ''), btrim(c.listing_id),
         jsonb_build_object(
           'arme_par', jsonb_build_object('chemin', 'vendue_close_avant_remise_0711', 'le', now(), 'annonce', c.id,
             'depot', c.job_id, 'remise', '951cc7fc-5fb1-4698-9895-6664ece9c21d',
             'pose_par', 'réparation 07/11 nuit (feu vert nommé de Nico : retrait des 4 annonces « Article vendu » de Louis)'),
           'preuve', 'vente_close_transaction_sold', 'lecture_avant_retrait', '{"le":"2026-11-07T21:49:40.171Z","http":200,"status":"active","transaction":"sold","owner_type":"private","article_vendu":true,"sujet":"Rangement Noir et Gris pour 12 pots et 12 couvercles pour ya","source":"page publique leboncoin.fr/vi/3297299585.htm, onglet de Nico (lecture seule)"}'::jsonb)
    FROM cible c
  RETURNING id, user_id, inventaire_id, platform_listing_id
), journal AS (
  INSERT INTO public.usage_logs (user_id, feature, metadata)
  SELECT c.user_id, 'retrait_annonces', jsonb_build_object('chemin', 'vendue_close_avant_remise_0711',
           'plateformes', jsonb_build_array('leboncoin'), 'n_annonces', 1, 'n_articles', 1,
           'article_id', c.inventaire_id::text, 'listing_id', c.platform_listing_id)
    FROM crees c
  RETURNING 1
)
INSERT INTO public._backup_0711_louis_retraits_vendues (t, cle, ligne, retrait_cree)
SELECT 'retrait', c.platform_listing_id, '{"le":"2026-11-07T21:49:40.171Z","http":200,"status":"active","transaction":"sold","owner_type":"private","article_vendu":true,"sujet":"Rangement Noir et Gris pour 12 pots et 12 couvercles pour ya","source":"page publique leboncoin.fr/vi/3297299585.htm, onglet de Nico (lecture seule)"}'::jsonb, c.id FROM crees c;
SELECT b.cle AS annonce, b.retrait_cree, j.status, j.listing_url
  FROM public._backup_0711_louis_retraits_vendues b LEFT JOIN public.cross_post_jobs j ON j.id = b.retrait_cree
 WHERE b.t = 'retrait' AND b.cle = '3297299585';
COMMIT;
