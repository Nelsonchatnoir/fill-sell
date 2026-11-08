-- PREUVE SUR POSTE NEUF (08/11/2026 nuit, URGENT jade60890, ordre de Nico : « sur un poste NEUF (comme un nouveau
-- client), ouverture des pages de connexion Vinted, Leboncoin, Beebs et Depop, stables, sans boucle ; au plus un essai
-- réel par plateforme ») — compte de TEST Nicotest (hoosslocal@gmail.com, 5322fa18…), jamais un client.
-- Comme la preuve de 19:2x (20261108_nicotest_cloud_essai_serveur.sql) : l'accès Cloud servi À LA MAIN, sans paiement ;
-- son poste éteint et son coffre retirés (le prochain « Me connecter » ouvre un poste NEUF, profil vierge).
-- Sauvegardes AVANT tout changement ; inverse : 20261108n_nicotest_preuve_sso_INVERSE.sql (à lancer après la preuve).
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0811n_nicotest AS
  SELECT 'profil'::text AS quoi, to_jsonb(p) - 'platform_settings' AS ligne, p.platform_settings, now() AS sauvegarde_le
    FROM public.profiles p WHERE p.id = '5322fa18-c194-458b-a222-7ee4093c4968'
  UNION ALL
  SELECT 'poste', to_jsonb(c), NULL, now() FROM public.cloud_postes c WHERE c.user_id = '5322fa18-c194-458b-a222-7ee4093c4968'
  UNION ALL
  SELECT 'coffre', to_jsonb(k), NULL, now() FROM public.cloud_coffre k WHERE k.user_id = '5322fa18-c194-458b-a222-7ee4093c4968'
  UNION ALL
  SELECT 'ip', to_jsonb(i), NULL, now() FROM public.cloud_ips i;
REVOKE ALL ON public._backup_0811n_nicotest FROM PUBLIC, anon, authenticated;
ALTER TABLE public._backup_0811n_nicotest ENABLE ROW LEVEL SECURITY;

-- 1. Poste NEUF : la session FillSell du poste éteint révoquée, le poste éteint et le coffre retirés.
SELECT public.cloud_session_revoquer('5322fa18-c194-458b-a222-7ee4093c4968', p.session_fillsell_id)
  FROM public.cloud_postes p WHERE p.user_id = '5322fa18-c194-458b-a222-7ee4093c4968' AND p.session_fillsell_id IS NOT NULL;
DELETE FROM public.cloud_coffre WHERE user_id = '5322fa18-c194-458b-a222-7ee4093c4968'
  AND EXISTS (SELECT 1 FROM public._backup_0811n_nicotest WHERE quoi = 'profil');
DELETE FROM public.cloud_postes WHERE user_id = '5322fa18-c194-458b-a222-7ee4093c4968' AND etat = 'eteint'
  AND EXISTS (SELECT 1 FROM public._backup_0811n_nicotest WHERE quoi = 'profil');

-- 2. L'accès Cloud servi à la main (le déclencheur rend à Nicotest SON IP au repos, « retour même compte »).
UPDATE public.profiles
   SET cloud_ref = NULL, is_cloud = true
 WHERE id = '5322fa18-c194-458b-a222-7ee4093c4968'
   AND is_cloud IS NOT TRUE
   AND EXISTS (SELECT 1 FROM public._backup_0811n_nicotest WHERE quoi = 'profil');

SELECT p.is_cloud, p.cloud_voie, (public.cloud_etat(p.id) ->> 'etat') AS etat,
       (SELECT jsonb_agg(jsonb_build_object('id', i.id, 'etat', i.etat)) FROM public.cloud_ips i WHERE i.user_id = p.id) AS ip,
       (SELECT count(*) FROM public.cloud_postes WHERE user_id = p.id) AS postes,
       (SELECT count(*) FROM public._backup_0811n_nicotest) AS lignes_sauvegardees
  FROM public.profiles p WHERE p.id = '5322fa18-c194-458b-a222-7ee4093c4968';
COMMIT;
