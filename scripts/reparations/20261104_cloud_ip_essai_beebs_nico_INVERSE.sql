-- INVERSE de 20261104_cloud_ip_essai_beebs_nico.sql : le compte de Nico revient sur l'IP 39 ; l'IP de l'essai repart au
-- pool DISPONIBLE (jamais « au repos » : aucune purge), avec son refus Beebs à noter À PART une fois les visites de contrôle
-- coupées. L'orchestrateur rouvre le navigateur sur l'IP 39. Exécution : remplacer :ip_neuve par l'id de l'IP de l'essai.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = :ip_neuve AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') THEN
    RAISE EXCEPTION 'IP de l''essai pas attribuée à Nico';
  END IF;
  UPDATE public.cloud_ips SET etat = 'disponible', user_id = NULL, liberee_le = now(), repos_fin = NULL, maj_le = now() WHERE id = :ip_neuve;
  PERFORM public.cloud_journal(:ip_neuve, 'liberation', 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid,
    jsonb_build_object('raison', 'fin de l''essai Beebs, retour sur l''IP 39', 'sans_repos', true));
  UPDATE public.cloud_ips SET etat = 'attribuee_client', user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18', reserve_pour = NULL, reserve_jusqu_au = NULL,
         attribuee_le = now(), liberee_le = NULL, repos_fin = NULL, maj_le = now() WHERE id = 39;
  PERFORM public.cloud_journal(39, 'retour_meme_compte', 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid, jsonb_build_object('raison', 'fin de l''essai Beebs'));
END $$;
SELECT string_agg(id || ':' || etat || ':' || coalesce(left(user_id::text, 8), '-'), ' ' ORDER BY id) AS ips FROM public.cloud_ips WHERE id IN (39, :ip_neuve);
COMMIT;
