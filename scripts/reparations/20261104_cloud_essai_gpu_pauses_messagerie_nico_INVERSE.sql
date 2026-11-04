-- INVERSE de 20261104_cloud_essai_gpu_pauses_messagerie_nico.sql : pause et mémoire remises telles que sauvegardées, sur les
-- lignes que rien n'a rebloquées depuis (un blocage neuf garde sa propre pause).
BEGIN;
UPDATE public.messagerie_releves r
   SET pause_jusqu_au = (b.ligne ->> 'pause_jusqu_au')::timestamptz, bloque_le = (b.ligne ->> 'bloque_le')::timestamptz
  FROM public._backup_0411_essai_gpu_pauses b
 WHERE r.user_id = (b.ligne ->> 'user_id')::uuid AND r.platform = b.ligne ->> 'platform' AND r.bloque_le IS NULL;
SELECT string_agg(platform || ':' || coalesce(to_char(pause_jusqu_au AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI'), 'sans pause'), ' ' ORDER BY platform) AS releves
  FROM public.messagerie_releves WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
COMMIT;
