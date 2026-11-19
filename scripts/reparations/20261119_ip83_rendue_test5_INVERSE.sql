-- INVERSE de 20261119_ip83_rendue_test5.sql : l'essai du compte de test 08918381 reprend (cloud_essai_arrete remis à sa
-- valeur sauvegardée). Le déclencheur profiles_cloud_pool lui attribue alors une IP par le chemin normal
-- (cloud_ip_attribuer : une IP attribuable du stock, pas forcément la 83, qui est au repos).
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.profiles p SET cloud_essai_arrete = (b.ligne ->> 'cloud_essai_arrete')::boolean
  FROM public._backup_1911_ip83_test5 b
 WHERE b.quoi = 'profil' AND p.id = (b.ligne ->> 'id')::uuid;
SELECT id, etat, user_id FROM public.cloud_ips WHERE user_id = '08918381-0177-4296-bc8c-3a30f14d0f27' OR id = 83;
COMMIT;
