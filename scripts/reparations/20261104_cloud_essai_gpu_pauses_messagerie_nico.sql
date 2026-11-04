-- (04/11 soir, ordre de Nico) LES PAUSES DE MESSAGERIE NÉES SUR cloud-1 NE TIENNENT PLUS SUR cloud-2 : la règle neuve (un
-- changement de machine ou d'IP repart sans les pauses de l'ancienne ; une résolution réussie lève la pause), appliquée au
-- compte de Nico pour ce qui précède son déploiement. Visées : les lignes de messagerie_releves bloquées AVANT la bascule
-- (18:34:29) — Leboncoin (403 de cloud-1 à 17:02:37, pause jusqu'au 05/11 17:02:37) et Beebs (bloque_le 04/11 02:45, pause
-- échue : sa seule mémoire ferait passer un prochain blocage à 24 h). Pause ET mémoire effacées.
-- Inverse : 20261104_cloud_essai_gpu_pauses_messagerie_nico_INVERSE.sql.
BEGIN;
CREATE TABLE public._backup_0411_essai_gpu_pauses AS
  SELECT now() AS le, to_jsonb(r.*) AS ligne FROM public.messagerie_releves r
   WHERE r.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND r.bloque_le < '2026-11-04 18:34:29+01';
ALTER TABLE public._backup_0411_essai_gpu_pauses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0411_essai_gpu_pauses FROM PUBLIC, anon, authenticated;
UPDATE public.messagerie_releves SET pause_jusqu_au = NULL, bloque_le = NULL
 WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND bloque_le < '2026-11-04 18:34:29+01';
SELECT (SELECT count(*) FROM public._backup_0411_essai_gpu_pauses) AS sauvegardees,
       (SELECT string_agg(platform || ':' || coalesce(to_char(pause_jusqu_au AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI'), 'sans pause'), ' ' ORDER BY platform)
          FROM public.messagerie_releves WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') AS releves;
COMMIT;
