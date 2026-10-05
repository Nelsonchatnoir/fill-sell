-- TEST COMPLET FillSell Cloud (05/10/2026, GO de Nico) : Nico passe en option
-- OFFERTE (aucun paiement) le temps du test — docs/cloud/test-complet.md § 3.
-- Le déclencheur profiles_cloud_pool lui attribue son IP dédiée (pool : la
-- commande IPRoyal 84458881, 94.194.94.233), l'orchestrateur (COMPTES_AUTORISES
-- = Nico seul) allume son navigateur.
-- Sauvegarde (relue le 05/10 16:05 Paris) : is_cloud NULL, cloud_canal NULL,
-- cloud_ref NULL, essai NULL/NULL, cloud_essai_arrete false, periode_fin NULL,
-- arret_fin_periode false, cloud_essai_refus NULL (is_premium, is_pro, is_comped
-- true ; is_business false — non touchés).
-- Inverse : 20261005_cloud_test_nico_offert_INVERSE.sql (l'IP part au repos,
-- l'orchestrateur purge : profil détruit, coffre vidé, session révoquée).
BEGIN;
UPDATE public.profiles
   SET is_cloud = true, cloud_canal = 'offert'
 WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
   AND is_cloud IS NULL AND cloud_canal IS NULL;
SELECT is_cloud, cloud_canal, public.cloud_etat(id) ->> 'etat' AS etat
  FROM public.profiles WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
COMMIT;
