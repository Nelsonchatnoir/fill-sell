-- (02/11 13:00) Suite de 20261102_cloud_ip_remplacement_2_nico.sql : cloud_ip_attribuer n'a PAS pris l'IP réservée de
-- 24 h (176.103.180.12, id 5 : écartée par cloud_ip_attribuable, échéance trop proche) et a donné au compte la
-- disponible suivante, 185.134.194.88 (id 2, même plage que l'IP bloquée par Beebs). Demande de Nico : SON test sur une
-- IP qui n'a jamais vu Beebs → l'id 2 revient au pool tel qu'il était (jamais attribuée), l'id 5 est attribuée au compte
-- (« client »), hors de la règle d'échéance, pour ce test de 24 h. Inverse : …_2b_nico_INVERSE.sql.
BEGIN;
CREATE TABLE public._backup_0211_cloud_ip_3 AS SELECT * FROM public.cloud_ips WHERE id IN (2, 5);
ALTER TABLE public._backup_0211_cloud_ip_3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0211_cloud_ip_3 FROM PUBLIC, anon, authenticated;
UPDATE public.cloud_ips SET etat = 'disponible', user_id = NULL, attributions = GREATEST(attributions - 1, 0), dernier_user_id = NULL,
       derniere_origine = NULL, attribuee_le = NULL, maj_le = now()
 WHERE id = 2 AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
UPDATE public.cloud_ips SET etat = 'attribuee_client', user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18', attributions = attributions + 1,
       dernier_user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18', derniere_origine = 'client', attribuee_le = now(),
       reserve_pour = NULL, reserve_jusqu_au = NULL, liberee_le = NULL, repos_fin = NULL, maj_le = now()
 WHERE id = 5 AND etat = 'disponible' AND user_id IS NULL;
SELECT public.cloud_journal(5, 'attribution', 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid,
  jsonb_build_object('nature', 'client', 'par', 'réparation 02/11 13:00 (IP de 24 h, test Beebs de Nico)'));
SELECT id, ip, etat, user_id FROM public.cloud_ips WHERE id IN (2, 5) ORDER BY id;
COMMIT;
