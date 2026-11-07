-- GESTE DE DONNÉES (07/11/2026 soir, ordre de Nico) — à lancer APRÈS l'application de la migration 20261107200000
-- (sinon la table n'existe pas : erreur, rien écrit).
-- Ferme la référence Apple 2000001262935799 : l'abonnement bac à sable (TestFlight) de Nicotest
-- (profiles.id 5322fa18-c194-458b-a222-7ee4093c4968), que Nico ne peut pas annuler chez Apple. Ses renouvellements
-- accélérés (le premier vers le 08/11 18:51) ne rallument plus jamais son Cloud (déclencheur profiles_zz_cloud_ref_close).
-- Garde : la ligne ne s'écrit que si le profil porte bien CETTE référence Apple (sinon 0 ligne). Rejouable (ON CONFLICT).
-- Sauvegarde : rien à sauvegarder (ligne neuve, aucune ligne existante modifiée). Inverse :
--   scripts/reparations/20261107_nicotest_ref_close_INVERSE.sql
-- Preuve en base, après : scripts/reparations/20261107_nicotest_ref_close_PREUVE.sql
INSERT INTO public.cloud_refs_closes (ref, canal, user_id, raison, par)
SELECT '2000001262935799', 'apple', p.id,
       'abonnement bac à sable TestFlight de Nicotest, non annulable par Nico, 07/11', 'support, ordre de Nico du 07/11'
  FROM public.profiles p
 WHERE p.id = '5322fa18-c194-458b-a222-7ee4093c4968'
   AND p.cloud_canal = 'apple' AND p.cloud_ref = '2000001262935799'
ON CONFLICT (ref) DO NOTHING
RETURNING ref, canal, user_id, raison, close_le AT TIME ZONE 'Europe/Paris' AS close_le_paris, par;
