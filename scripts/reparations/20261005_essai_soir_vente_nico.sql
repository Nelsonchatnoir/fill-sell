-- ESSAI RÉEL (05/10 soir, compte de Nico) — étape 2 : la fiche de test 999 €
-- est publiée sur Vinted ET Leboncoin ; on enregistre une vente sur Vinted par
-- le chemin normal (enregistrer_vente_atomique, comme le bandeau « Vendue ? »).
-- Attendu : stock à 0, fiche « vendu », et retrait AUTOMATIQUE de la copie
-- Leboncoin (job 'delete' armé par la vente, exécuté par l'extension 0.6.99).
-- Nettoyage : 20261005_essai_soir_publication_vente_retrait_nico_INVERSE.sql
SELECT public.enregistrer_vente_atomique(
  'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid,
  'manuel:essai-0510-soir',
  1791300000510,
  j.id,
  999, 0, 1, 1, 'vinted') AS vente
  FROM public.cross_post_jobs j
 WHERE j.inventaire_id = 1791300000510 AND j.platform = 'vinted' AND j.action = 'publish' AND j.status = 'published';
