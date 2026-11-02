-- (02/11 13:30, décision de Nico, choix « b ») Le navigateur PRINCIPAL du compte de Nico revient sur 81.181.239.136
-- (pool id 3 : mise au rebut à 12:35 pour Beebs seule ; payée jusqu'au 29/11 ; Vinted, Leboncoin, Depop y passaient).
-- L'IP de 24 h (176.103.180.12, id 5) est rendue au pool et expire le 03/11 (pas de prolongation). 185.134.194.88 (id 2,
-- jamais attribuée) est RÉSERVÉE au compte pour le navigateur isolé de Beebs (dernier essai). Aucune tâche en cours au
-- moment de la bascule (relu). Inverse : 20261102_cloud_ip_retour_81_nico_INVERSE.sql.
BEGIN;
CREATE TABLE public._backup_0211_cloud_ip_4 AS SELECT * FROM public.cloud_ips WHERE id IN (2, 3, 5);
ALTER TABLE public._backup_0211_cloud_ip_4 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0211_cloud_ip_4 FROM PUBLIC, anon, authenticated;
UPDATE public.cloud_ips SET etat = 'disponible', user_id = NULL, liberee_le = now(), maj_le = now()
 WHERE id = 5 AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
UPDATE public.cloud_ips SET etat = 'attribuee_client', user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18',
       dernier_user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18', derniere_origine = 'client', attribuee_le = now(),
       rebut_critere = NULL, rebut_le = NULL, liberee_le = NULL, repos_fin = NULL, reserve_pour = NULL, reserve_jusqu_au = NULL, maj_le = now()
 WHERE id = 3 AND etat = 'rebut';
UPDATE public.cloud_ips SET reserve_pour = 'f44b5917-bccc-4431-ba41-f40571a2ed18', reserve_jusqu_au = expire_le, maj_le = now()
 WHERE id = 2 AND etat = 'disponible' AND user_id IS NULL;
SELECT public.cloud_journal(3, 'retour_meme_compte', 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid,
  jsonb_build_object('nature', 'client', 'par', 'réparation 02/11 13:30 (choix b de Nico)'));
SELECT id, ip, etat, user_id IS NOT NULL AS a_nico, reserve_pour IS NOT NULL AS reservee FROM public.cloud_ips WHERE id IN (2, 3, 5) ORDER BY id;
COMMIT;
