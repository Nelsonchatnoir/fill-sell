-- INVERSE de 20261102_cloud_ip_remplacement_2b_nico.sql : lignes 2 et 5 du pool remises comme juste avant (sauvegarde
-- _backup_0211_cloud_ip_3 : le compte sur l'id 2).
BEGIN;
UPDATE public.cloud_ips c SET etat = b.etat, user_id = b.user_id, attributions = b.attributions, dernier_user_id = b.dernier_user_id,
  derniere_origine = b.derniere_origine, attribuee_le = b.attribuee_le, reserve_pour = b.reserve_pour, reserve_jusqu_au = b.reserve_jusqu_au,
  liberee_le = b.liberee_le, repos_fin = b.repos_fin, maj_le = now()
  FROM public._backup_0211_cloud_ip_3 b WHERE c.id = b.id;
COMMIT;
