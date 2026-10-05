-- NETTOYAGE / INVERSE de 20261005_essai_soir_publication_vente_retrait_nico.sql
-- (compte de Nico). À passer UNE FOIS l'essai lu :
--   1. l'annonce Vinted de test (vendue par l'essai) est retirée par le chemin
--      normal (armer_retrait_job), comme toute annonce : le job repasse
--      'published' le temps d'armer son retrait ;
--   2. la vente de test et son opération sont effacées ;
--   3. la fiche de test reste « vendu » jusqu'au retrait constaté, puis est
--      supprimée (dernière étape, à la main, une fois le retrait relu).
-- Aucune autre ligne n'est touchée : tout est filtré sur la fiche 1791300000510
-- et sur la clé de vente « manuel:essai-0510-soir ».

-- 1) Retrait de l'annonce Vinted de test.
UPDATE public.cross_post_jobs SET status = 'published', sold_at = NULL,
       platform_fields = platform_fields - 'vente_operation_cle'
 WHERE inventaire_id = 1791300000510 AND platform = 'vinted' AND action = 'publish' AND status = 'sold';
SELECT public.armer_retrait_job(j.id, 'essai_0510_soir_fin', '0 seconds') AS retrait_vinted
  FROM public.cross_post_jobs j
 WHERE j.inventaire_id = 1791300000510 AND j.platform = 'vinted' AND j.action = 'publish' AND j.status = 'published';

-- 2) La vente de test.
DELETE FROM public.ventes
 WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND inventaire_id = 1791300000510;
DELETE FROM public.ventes_operations
 WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND cle = 'manuel:essai-0510-soir';

-- 3) (après le retrait relu) la fiche de test :
-- DELETE FROM public.inventaire WHERE id = 1791300000510 AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
