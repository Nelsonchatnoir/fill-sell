-- INVERSE de 20261102_cloud_ip_retour_81_nico.sql : lignes 2, 3 et 5 du pool comme juste avant (sauvegarde
-- _backup_0211_cloud_ip_4 : le compte sur 176.103.180.12).
BEGIN;
UPDATE public.cloud_ips c SET etat = b.etat, user_id = b.user_id, dernier_user_id = b.dernier_user_id, derniere_origine = b.derniere_origine,
  attribuee_le = b.attribuee_le, rebut_critere = b.rebut_critere, rebut_le = b.rebut_le, liberee_le = b.liberee_le, repos_fin = b.repos_fin,
  reserve_pour = b.reserve_pour, reserve_jusqu_au = b.reserve_jusqu_au, maj_le = now()
  FROM public._backup_0211_cloud_ip_4 b WHERE c.id = b.id;
COMMIT;
