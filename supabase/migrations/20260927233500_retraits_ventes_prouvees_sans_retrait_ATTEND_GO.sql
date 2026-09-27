-- ═══════════════════════════════════════════════════════════════════════════
-- ⛔ NON APPLIQUÉE — ATTEND LE GO DE NICO : ELLE RETIRE 4 ANNONCES EN LIGNE
-- ═══════════════════════════════════════════════════════════════════════════
-- Revue des 36 annonces encore en ligne sur une fiche « vendue » (27/09 ~23:00).
-- Quatre copies d'articles dont la vente est PROUVÉE sont toujours en vente, et
-- AUCUN retrait n'est armé (leur job de dépôt est « cancelled » alors que le
-- relevé les voit en ligne : armer_retrait_job ne part que d'un job
-- « published ») :
--
--  · ornellaracano « T-shirt Screen Stars Jean-Jacques Goldman » (1789753529785)
--      preuve : Vinted « sold » + vente enregistrée ; copie : Leboncoin 3272198784
--      (vue en ligne au relevé du 27/09 11:48).
--  · xxewwer « Bravely Default II Nintendo Switch » (1789843450625)
--      preuve : Vinted « sold » + vente ; copie : eBay 377462623400 (relevé 26/09 22:42).
--  · geronimo0550 « Pull en maille torsadée » (1788603426876003)
--      preuve : Vinted « sold » + vente ; copies : eBay 307166011580 et
--      Leboncoin 3266355658 (relevés du 26/09).
--
-- Ce que fait cette migration : le job de dépôt de chaque copie reprend son
-- statut réel (« published », le relevé la voit en ligne), puis
-- armer_retrait_job arme le retrait (chemin 'vente_prouvee_revue_2709'),
-- avec toutes ses gardes habituelles (signal de vente, retrait déjà armé…).
-- Rejeu annulé à faire juste avant le GO : 4 retraits attendus.

UPDATE cross_post_jobs j SET
  status = 'published',
  platform_fields = COALESCE(j.platform_fields, '{}'::jsonb) || jsonb_build_object(
    'statut_reel_par_releve', jsonb_build_object('le', now(), 'avant', j.status,
      'motif', 'annonce vue en ligne par le relevé, article vendu (vente prouvée)', 'par', 'migration 20260927233500'))
 WHERE j.id IN ('cc0b572a-8694-489d-aa9b-dc03ae1ce07d', '91320446-455b-4b0b-8e33-f22bb771714b',
                '1b6a838c-3f02-40ba-90d4-60f74bac6f3f', 'cf6fb54f-1b4a-4c53-8b95-25dfd19c09d2')
   AND j.status = 'cancelled';

SELECT id AS depot, armer_retrait_job(id, 'vente_prouvee_revue_2709', interval '0') AS retrait
  FROM unnest(ARRAY['cc0b572a-8694-489d-aa9b-dc03ae1ce07d', '91320446-455b-4b0b-8e33-f22bb771714b',
                    '1b6a838c-3f02-40ba-90d4-60f74bac6f3f', 'cf6fb54f-1b4a-4c53-8b95-25dfd19c09d2']::uuid[]) AS id;
