-- INVERSE de 20261104_cloud_essai_gpu_preparatifs.sql : l'interrupteur des achats automatiques reprend sa valeur sauvegardée,
-- les refus Beebs notés le 04/11 soir sur les IP 40 et 41 partent (le journal cloud_ip_evenements garde la trace).
BEGIN;
UPDATE public.coin_config c SET value = (b.ligne ->> 'value')::int, updated_at = now()
  FROM public._backup_0411_essai_gpu_prep b WHERE b.t = 'coin_config' AND c.key = b.ligne ->> 'key';
UPDATE public.cloud_ips i SET refus = i.refus - 'beebs', maj_le = now()
  WHERE i.id IN (40, 41) AND i.refus -> 'beebs' -> 'details' ->> 'note_le' = 'essai GPU 04/11 soir (ordre de Nico)';
SELECT (SELECT value FROM public.coin_config WHERE key = 'cloud_ip_achats_auto') AS achats_auto,
       (SELECT string_agg(id || ':' || (refus ? 'beebs')::text, ' ' ORDER BY id) FROM public.cloud_ips WHERE id IN (40, 41)) AS ips;
COMMIT;
