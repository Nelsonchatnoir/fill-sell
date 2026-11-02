-- INVERSE de 20261102_cloud_ip_remplacement_nico.sql : les deux lignes du pool reprennent leur état d'avant (sauvegarde
-- _backup_0211_cloud_ip). Le navigateur repart sur 81.181.239.136 au tour suivant du planificateur.
BEGIN;
UPDATE public.cloud_ips c SET etat = b.etat, user_id = b.user_id, reserve_pour = b.reserve_pour, reserve_jusqu_au = b.reserve_jusqu_au,
  attributions = b.attributions, dernier_user_id = b.dernier_user_id, derniere_origine = b.derniere_origine,
  attribuee_le = b.attribuee_le, liberee_le = b.liberee_le, rebut_critere = b.rebut_critere, rebut_le = b.rebut_le, maj_le = now()
  FROM public._backup_0211_cloud_ip b WHERE c.id = b.id;
COMMIT;
