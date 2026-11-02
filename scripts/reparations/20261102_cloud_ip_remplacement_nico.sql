-- (02/11 12:35, feu vert de Nico : « IP de remplacement IPRoyal, plafond 10 € TTC, applique-la à tout le navigateur
-- Cloud ») Beebs affiche « Accès temporairement restreint — un robot est sur le même réseau (IP 81.181.239.136) » à
-- 11:45 puis à 12:23, cookie DataDome neuf compris : c'est l'IP qui est marquée. IP neuve achetée (IPRoyal 87277315,
-- ISP Dedicated France 30 jours, 4 $, échéance 02/12/2026), ajoutée au pool (id 4), contrôle d'entrée passé (FR, aucune
-- liste). L'échange passe par les fonctions du pool : la neuve RÉSERVÉE au compte (sinon cloud_ip_attribuer prendrait
-- la disponible qui expire le plus tôt, id 1), puis l'ancienne SIGNALÉE (rebut) — cloud_ip_signaler attribue la
-- réservée. L'orchestrateur voit l'IP changer et rouvre le navigateur sur la neuve (empreinte figée : le proxy n'en est
-- pas). Inverse : 20261102_cloud_ip_remplacement_nico_INVERSE.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0211_cloud_ip AS SELECT * FROM public.cloud_ips WHERE id IN (3, 4);
ALTER TABLE public._backup_0211_cloud_ip ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0211_cloud_ip FROM PUBLIC, anon, authenticated;
UPDATE public.cloud_ips SET reserve_pour = 'f44b5917-bccc-4431-ba41-f40571a2ed18', reserve_jusqu_au = now() + interval '30 minutes', maj_le = now()
 WHERE id = 4 AND etat = 'disponible' AND user_id IS NULL;
SELECT public.cloud_ip_signaler(3, 'blocage_anti_robot', jsonb_build_object('plateforme', 'beebs',
  'constat', 'Accès temporairement restreint, IP citée (11:45, 12:23)', 'decision', 'Nico, 02/11 12:30'));
SELECT id, ip, etat, user_id, attributions FROM public.cloud_ips WHERE id IN (3, 4) ORDER BY id;
COMMIT;
