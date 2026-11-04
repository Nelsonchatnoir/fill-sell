-- INVERSE de 20261104_cloud_essai_gpu_reserve_39_nico.sql : la réservation de Nico quitte l'IP 39 et revient sur l'IP 2 telle
-- que sauvegardée (si la 39 n'a pas été attribuée entre-temps : le retour sur cloud-1 la donne au compte, ce qui lève déjà sa
-- réservation).
BEGIN;
UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL, maj_le = now()
 WHERE id = 39 AND reserve_pour = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
UPDATE public.cloud_ips i SET reserve_pour = (b.ligne ->> 'reserve_pour')::uuid, reserve_jusqu_au = (b.ligne ->> 'reserve_jusqu_au')::timestamptz, maj_le = now()
  FROM public._backup_0411_essai_gpu_reserve b
 WHERE (b.ligne ->> 'id')::bigint = 2 AND i.id = 2
   AND NOT EXISTS (SELECT 1 FROM public.cloud_ips x WHERE x.reserve_pour = (b.ligne ->> 'reserve_pour')::uuid);
SELECT string_agg(id || ':' || etat || ':' || coalesce(left(reserve_pour::text, 8), '-'), ' ' ORDER BY id) AS ips FROM public.cloud_ips WHERE id IN (2, 39);
COMMIT;
