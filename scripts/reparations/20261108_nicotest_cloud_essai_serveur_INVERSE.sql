-- FIN DU TEST (inverse de 20261108_nicotest_cloud_essai_serveur.sql) : l'accès Cloud de Nicotest retiré, sa référence
-- Apple remise, son profil (cloud_voie, platform_settings) remis tel que sauvegardé, et l'IP prêtée remise EXACTEMENT
-- dans l'état d'avant le test (disponible, mêmes compteurs : le prêt n'a servi qu'au test, aucun repos de 7 jours, aucun
-- achat d'IP déclenché). À lancer APRÈS la fermeture du poste par l'orchestrateur (compte inactif).
BEGIN;
-- 1. Le compte n'est plus Cloud (le déclencheur met l'IP au repos ; l'étape 3 la remet comme avant).
UPDATE public.profiles SET is_cloud = false
 WHERE id = '5322fa18-c194-458b-a222-7ee4093c4968' AND is_cloud IS TRUE;
-- 2. Le profil tel qu'avant le test.
UPDATE public.profiles p
   SET cloud_ref = b.cloud_ref, cloud_canal = b.cloud_canal, cloud_voie = b.cloud_voie, platform_settings = b.platform_settings
  FROM public._backup_0811_nicotest_cloud b
 WHERE p.id = b.id;
-- 3a. (relu pendant le test) cloud_ip_attribuer a rendu à Nicotest SA propre IP du 07/11 (id 2, au repos : « retour même
--     compte », événement 130), pas une IP disponible. Son état d'avant, relu dans cloud_ip_evenements (116, 118) : au
--     repos depuis la libération du 07/11 18:12:00.059812 UTC, fin du repos à J+7, 1 attribution, origine « essai ».
UPDATE public.cloud_ips
   SET etat = 'repos', user_id = NULL, attribuee_le = '2026-11-07T17:51:06.01244+00:00',
       liberee_le = '2026-11-07T18:12:00.059812+00:00', repos_fin = '2026-11-14T18:12:00.059812+00:00',
       attributions = 1, derniere_origine = 'essai', dernier_user_id = '5322fa18-c194-458b-a222-7ee4093c4968', maj_le = now()
 WHERE id = 2 AND (user_id = '5322fa18-c194-458b-a222-7ee4093c4968' OR (user_id IS NULL AND dernier_user_id = '5322fa18-c194-458b-a222-7ee4093c4968'));
-- 3b. L'IP prêtée si elle venait des disponibles : la ligne d'avant le test.
UPDATE public.cloud_ips i
   SET etat = b.etat, user_id = b.user_id, attribuee_le = b.attribuee_le, liberee_le = b.liberee_le, repos_fin = b.repos_fin,
       attributions = b.attributions, derniere_origine = b.derniere_origine, dernier_user_id = b.dernier_user_id,
       reserve_pour = b.reserve_pour, reserve_jusqu_au = b.reserve_jusqu_au, maj_le = now()
  FROM public._backup_0811_ips_essai b
 WHERE i.id = b.id AND i.etat <> 'disponible'
   AND (i.user_id = '5322fa18-c194-458b-a222-7ee4093c4968' OR i.dernier_user_id = '5322fa18-c194-458b-a222-7ee4093c4968');
SELECT p.is_cloud, p.cloud_voie, p.cloud_ref IS NOT NULL AS ref_remise, (public.cloud_etat(p.id) ->> 'etat') AS etat,
       (SELECT count(*) FROM public.cloud_ips WHERE user_id = p.id) AS ip_attribuees,
       (SELECT count(*) FROM public.cloud_ips WHERE etat = 'disponible') AS ips_disponibles
  FROM public.profiles p WHERE p.id = '5322fa18-c194-458b-a222-7ee4093c4968';
COMMIT;
