-- INVERSE de 20261101_cloud_essai48h_nico.sql : le drapeau Cloud de Nico redescend (son ordinateur reprend ses tâches),
-- son IP 81.181.239.136 part au repos par la fonction du pool (il la reprend s'il revient dans les 7 jours), la rotation
-- reprend sa valeur sauvegardée.
BEGIN;
UPDATE public.profiles SET cloud_voie = false WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
SELECT public.cloud_ip_liberer('f44b5917-bccc-4431-ba41-f40571a2ed18', 'fin_essai_48h') AS ip_liberee
 WHERE EXISTS (SELECT 1 FROM public.cloud_ips WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18');
UPDATE public.coin_config SET value = COALESCE((SELECT rotation FROM public._backup_0111_cloud_essai48h ORDER BY le LIMIT 1), 1)
 WHERE key = 'cloud_ip_rotation';
SELECT (SELECT cloud_voie FROM public.profiles WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') AS cloud_voie,
       (SELECT value FROM public.coin_config WHERE key = 'cloud_ip_rotation') AS rotation,
       (SELECT jsonb_agg(jsonb_build_object('ip', host(ip), 'etat', etat)) FROM public.cloud_ips) AS ips;
COMMIT;
