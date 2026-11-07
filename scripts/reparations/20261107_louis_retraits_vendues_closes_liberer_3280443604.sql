-- Produit par 20261107_louis_retraits_vendues_closes.mjs : LIBÉRATION de la remise 886605bf (annonce vendue 3280443604 retirée).
-- Lecture de la page publique juste avant : {"le":"2026-11-07T21:46:32.448Z","http":410,"status":null,"h1":"Cette annonce est désactivée","source":"page publique leboncoin.fr/vi/3280443604.htm, onglet de Nico (lecture seule)"}
BEGIN;
UPDATE public.cross_post_jobs j
   SET platform_fields = (j.platform_fields - 'serie_un_par_un') || jsonb_build_object('serie_sortie', jsonb_build_object(
         'le', now(), 'marqueur', j.platform_fields -> 'serie_un_par_un', 'lecture_vendue_hors_ligne', '{"le":"2026-11-07T21:46:32.448Z","http":410,"status":null,"h1":"Cette annonce est désactivée","source":"page publique leboncoin.fr/vi/3280443604.htm, onglet de Nico (lecture seule)"}'::jsonb,
         'motif', 'annonce vendue 3280443604 retirée par FillSell (vente close) et relue hors ligne',
         'pose_par', 'réparation 07/11 nuit (feu vert nommé de Nico : retrait des vendues closes, la remise part seule)'))
 WHERE j.id = '886605bf-8aaa-42d2-98ed-75b56756a5ae' AND j.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND j.status = 'pending'
   AND j.platform_fields #>> '{remise_en_vente,annonce_vendue}' = '3280443604'
   AND ('{"le":"2026-11-07T21:46:32.448Z","http":410,"status":null,"h1":"Cette annonce est désactivée","source":"page publique leboncoin.fr/vi/3280443604.htm, onglet de Nico (lecture seule)"}'::jsonb ->> 'http') IN ('410', '404') AND ('{"le":"2026-11-07T21:46:32.448Z","http":410,"status":null,"h1":"Cette annonce est désactivée","source":"page publique leboncoin.fr/vi/3280443604.htm, onglet de Nico (lecture seule)"}'::jsonb ->> 'le')::timestamptz > now() - interval '15 minutes'
   AND EXISTS (SELECT 1 FROM public.annonces_plateforme a
                WHERE a.user_id = j.user_id AND a.platform = 'leboncoin' AND btrim(a.listing_id) = '3280443604'
                  AND a.retiree_le IS NOT NULL);
SELECT left(j.id::text, 8) AS remise, j.status, j.platform_fields ? 'serie_un_par_un' AS encore_en_serie,
       j.platform_fields #>> '{serie_sortie,le}' AS liberee_le
  FROM public.cross_post_jobs j WHERE j.id = '886605bf-8aaa-42d2-98ed-75b56756a5ae';
COMMIT;
