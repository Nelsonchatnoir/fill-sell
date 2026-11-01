-- INVERSE de 20261101180000_cloud_voie_drapeau.sql — à jouer APRÈS avoir remis get-pending-jobs dans sa version
-- d'avant (elle lit profiles.cloud_voie : sans la colonne, sa lecture des postes échouerait).
SET lock_timeout = '5s';
ALTER TABLE public.profiles DROP COLUMN IF EXISTS cloud_voie;
