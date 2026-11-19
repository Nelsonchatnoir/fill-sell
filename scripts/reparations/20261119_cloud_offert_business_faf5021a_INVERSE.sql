-- INVERSE de 20261119_cloud_offert_business_faf5021a.sql : remet les colonnes Cloud du compte faf5021a telles que la
-- sauvegarde les a lues (public._backup_1911_cloud_offert_business). À ne jouer qu'avec l'abonnement Stripe remis sur
-- « Business + Cloud » (sinon le recalcul Stripe suivant couperait le Cloud : canal stripe sans Cloud chez Stripe).
BEGIN;
UPDATE public.profiles p
   SET is_cloud = b.is_cloud, cloud_canal = b.cloud_canal, cloud_ref = b.cloud_ref, cloud_formule = b.cloud_formule,
       cloud_periode_fin = b.cloud_periode_fin, cloud_arret_fin_periode = b.cloud_arret_fin_periode, beta_flags = b.beta_flags
  FROM public._backup_1911_cloud_offert_business b
 WHERE p.id = b.id AND p.id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
SELECT is_cloud, cloud_canal, cloud_ref, cloud_formule FROM public.profiles WHERE id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
COMMIT;
