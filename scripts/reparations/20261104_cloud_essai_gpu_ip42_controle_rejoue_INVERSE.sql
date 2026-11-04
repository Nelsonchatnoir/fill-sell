-- INVERSE de 20261104_cloud_essai_gpu_ip42_controle_rejoue.sql : l'IP 42 revient au rebut tel que sauvegardé (si elle n'a
-- été ni contrôlée de nouveau ni attribuée entre-temps).
BEGIN;
UPDATE public.cloud_ips i SET etat = b.ligne ->> 'etat', rebut_critere = b.ligne ->> 'rebut_critere',
       rebut_le = (b.ligne ->> 'rebut_le')::timestamptz, maj_le = now()
  FROM public._backup_0411_essai_gpu_ip42 b
 WHERE i.id = 42 AND i.etat = 'achetee' AND i.user_id IS NULL;
SELECT id, host(ip) AS ip, etat FROM public.cloud_ips WHERE id = 42;
COMMIT;
