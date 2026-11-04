-- (04/11 soir, essai GPU) L'IP 42 (94.194.94.68, IPRoyal 87509051, 4 $ sur accord écrit de Nico) mise au REBUT par son
-- contrôle d'entrée de 18:08:41 — 18 s après la livraison (18:08:23) : la page d'écho n'a rien rendu (ip_sortie et pays
-- vides, listes noires 0, aucune plateforme), le proxy n'était probablement pas encore actif. Le rebut coupe aussi ses
-- identifiants (cloud_proxy_identifiants) : impossible de vérifier le proxy sans la remettre « achetee ». Ce script la remet
-- « achetee » (jamais attribuée, jamais vue), pour un contrôle d'entrée REJOUÉ par le chemin normal (outils/controle-entree.mjs) ;
-- un second échec la remettra au rebut d'elle-même. Inverse : 20261104_cloud_essai_gpu_ip42_controle_rejoue_INVERSE.sql.
BEGIN;
CREATE TABLE public._backup_0411_essai_gpu_ip42 AS SELECT now() AS le, to_jsonb(i.*) AS ligne FROM public.cloud_ips i WHERE i.id = 42;
ALTER TABLE public._backup_0411_essai_gpu_ip42 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0411_essai_gpu_ip42 FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = 42 AND etat = 'rebut' AND rebut_critere = 'controle_entree'
                  AND user_id IS NULL AND dernier_user_id IS NULL AND attributions = 0 AND refus = '{}'::jsonb) THEN
    RAISE EXCEPTION 'IP 42 pas dans l''état attendu (rebut du contrôle d''entrée, jamais attribuée)';
  END IF;
  UPDATE public.cloud_ips SET etat = 'achetee', rebut_critere = NULL, rebut_le = NULL, maj_le = now() WHERE id = 42;
  PERFORM public.cloud_journal(42, 'signalement', NULL, jsonb_build_object('critere', 'controle_entree_rejoue',
    'details', jsonb_build_object('raison', 'contrôle d''entrée fait 18 s après la livraison : page d''écho vide, proxy pas encore actif'),
    'etat_avant', 'rebut'));
END $$;
SELECT id, host(ip) AS ip, etat FROM public.cloud_ips WHERE id = 42;
COMMIT;
