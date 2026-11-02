-- (02/11 12:58, demande de Nico : « test PROPRE sur Beebs ») Deuxième IP de remplacement : celle de 12:37
-- (185.134.192.253, pool id 4) a pris « Accès temporairement restreint » de Beebs dès sa première visite — signalée.
-- IP neuve : IPRoyal 87277471, ISP Dedicated, Lille, 24 h (solde insuffisant pour 30 jours), 2,60 $, 176.103.180.12
-- (plage différente des deux précédentes), pool id 5, contrôle d'entrée passé 12:58 (FR, aucune liste). Même mécanique
-- que 20261102_cloud_ip_remplacement_nico.sql. Inverse : 20261102_cloud_ip_remplacement_2_nico_INVERSE.sql.
BEGIN;
CREATE TABLE public._backup_0211_cloud_ip_2 AS SELECT * FROM public.cloud_ips WHERE id IN (4, 5);
ALTER TABLE public._backup_0211_cloud_ip_2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0211_cloud_ip_2 FROM PUBLIC, anon, authenticated;
UPDATE public.cloud_ips SET reserve_pour = 'f44b5917-bccc-4431-ba41-f40571a2ed18', reserve_jusqu_au = now() + interval '30 minutes', maj_le = now()
 WHERE id = 5 AND etat = 'disponible' AND user_id IS NULL;
SELECT public.cloud_ip_signaler(4, 'blocage_anti_robot', jsonb_build_object('plateforme', 'beebs',
  'constat', 'Accès temporairement restreint dès la première visite (12:37)', 'decision', 'Nico, 02/11 12:55'));
SELECT id, ip, etat, user_id FROM public.cloud_ips WHERE id IN (4, 5) ORDER BY id;
COMMIT;
