-- 08/11/2026 soir — ordre de Nico (« prouve-le sans moi ») : un poste Cloud NEUF pour le compte de TEST Nicotest, SANS
-- achat (accès donné à la main pour le test, aucun paiement, rien de compté), pour rejouer le cas du client
-- (« Me connecter » ouvert pendant que le planificateur démarre le poste) sur cloud-2 avec la correction 304369a.
-- Compte : Nicotest 5322fa18-c194-458b-a222-7ee4093c4968 (jamais un client, jamais un compte de relecture).
-- Ce qui change, pour la durée du test seulement :
--   · profiles.cloud_ref mis de côté (la référence Apple close de l'essai du 07/11 : le déclencheur
--     profiles_zz_cloud_ref_close refuserait sinon tout rallumage) et is_cloud = true → cloud_etat « paye » ;
--   · le déclencheur profiles_cloud_pool attribue UNE IP du pool (chemin normal, comme un nouveau client).
-- Sauvegardes : public._backup_0811_nicotest_cloud (la ligne du profil), public._backup_0811_ips_essai (les IP
-- disponibles avant le test). Fin du test : 20261108_nicotest_cloud_essai_serveur_INVERSE.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0811_nicotest_cloud AS
  SELECT id, is_cloud, cloud_ref, cloud_canal, cloud_voie, platform_settings, now() AS sauvegarde_le
    FROM public.profiles WHERE id = '5322fa18-c194-458b-a222-7ee4093c4968';
REVOKE ALL ON public._backup_0811_nicotest_cloud FROM PUBLIC, anon, authenticated;
ALTER TABLE public._backup_0811_nicotest_cloud ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public._backup_0811_ips_essai AS
  SELECT i.*, now() AS sauvegarde_le FROM public.cloud_ips i WHERE i.etat = 'disponible';
REVOKE ALL ON public._backup_0811_ips_essai FROM PUBLIC, anon, authenticated;
ALTER TABLE public._backup_0811_ips_essai ENABLE ROW LEVEL SECURITY;
UPDATE public.profiles
   SET cloud_ref = NULL, is_cloud = true
 WHERE id = '5322fa18-c194-458b-a222-7ee4093c4968'
   AND is_cloud IS NOT TRUE
   AND EXISTS (SELECT 1 FROM public._backup_0811_nicotest_cloud b WHERE b.id = '5322fa18-c194-458b-a222-7ee4093c4968');
SELECT p.is_cloud, p.cloud_voie, (public.cloud_etat(p.id) ->> 'etat') AS etat,
       (SELECT jsonb_agg(jsonb_build_object('id', i.id, 'etat', i.etat)) FROM public.cloud_ips i WHERE i.user_id = p.id) AS ip
  FROM public.profiles p WHERE p.id = '5322fa18-c194-458b-a222-7ee4093c4968';
COMMIT;
