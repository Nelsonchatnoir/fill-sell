-- (04/11 soir, ordre de Nico pendant l'essai GPU) L'IP 39 (176.103.182.215, celle du RETOUR sur cloud-1) RÉSERVÉE au compte
-- de Nico jusqu'à son échéance : personne d'autre ne peut la recevoir (cloud_ip_attribuable) ni la visiter
-- (cloud_ip_a_visiter écarte les IP réservées). ⚠ Une seule réservation par compte (index cloud_ips_une_reservation) : celle
-- de l'IP 2 (185.134.194.88, réservée à Nico depuis le 02/11) est levée pour la poser sur la 39.
-- Inverse : 20261104_cloud_essai_gpu_reserve_39_nico_INVERSE.sql (la réservation revient sur l'IP 2).
BEGIN;
CREATE TABLE public._backup_0411_essai_gpu_reserve AS
  SELECT now() AS le, to_jsonb(i.*) AS ligne FROM public.cloud_ips i WHERE i.id IN (2, 39);
ALTER TABLE public._backup_0411_essai_gpu_reserve ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0411_essai_gpu_reserve FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = 39 AND etat = 'disponible' AND user_id IS NULL AND reserve_pour IS NULL) THEN
    RAISE EXCEPTION 'IP 39 pas disponible et libre de réservation';
  END IF;
  UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL, maj_le = now()
   WHERE reserve_pour = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  UPDATE public.cloud_ips SET reserve_pour = 'f44b5917-bccc-4431-ba41-f40571a2ed18', reserve_jusqu_au = expire_le, maj_le = now()
   WHERE id = 39;
  PERFORM public.cloud_journal(39, 'reservation', 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid,
    jsonb_build_object('raison', 'IP du retour sur cloud-1, réservée pendant l''essai GPU (ordre de Nico, 04/11 soir)', 'levee_sur', 2));
END $$;
SELECT string_agg(id || ':' || etat || ':' || coalesce(left(reserve_pour::text, 8), '-') || ':' || coalesce(to_char(reserve_jusqu_au AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI'), '-'), ' ' ORDER BY id) AS ips
  FROM public.cloud_ips WHERE id IN (2, 39);
COMMIT;
