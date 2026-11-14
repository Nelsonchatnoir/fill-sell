-- INVERSE de 20261114_cloud_ip_marge_2.sql : cloud_ip_marge reprend sa valeur d'avant (3 au 13/11), lue dans la sauvegarde.
BEGIN;
UPDATE public.coin_config c SET value = b.value FROM public._backup_1411_cloud_ip_marge b WHERE c.key = b.key;
SELECT key, value FROM public.coin_config WHERE key = 'cloud_ip_marge';
COMMIT;
