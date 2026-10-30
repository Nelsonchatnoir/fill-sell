-- INVERSE : Nico repasse en option OFFERTE (seulement s'il n'a ni option payée ni essai en cours).
BEGIN;
UPDATE public.profiles SET is_cloud = true, cloud_canal = 'offert'
 WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND is_cloud IS NULL AND cloud_canal IS NULL;
SELECT is_cloud, cloud_canal, public.cloud_etat(id) ->> 'etat' AS etat FROM public.profiles WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
COMMIT;
