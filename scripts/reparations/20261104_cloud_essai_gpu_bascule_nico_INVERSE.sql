-- INVERSE de 20261104_cloud_essai_gpu_bascule_nico.sql : le compte de Nico revient sur cloud-1 EXACTEMENT comme à la
-- bascule — profil p-f44b5917-60c90d1101a8 (resté sur le disque de cloud-1), coffre Vinted / Leboncoin / Depop tel que
-- sauvegardé (les lignes écrites par cloud-2 partent ; la session FillSell, elle, garde sa version la plus récente : ses
-- jetons tournent), IP 39. L'IP de l'essai repart au pool DISPONIBLE (jamais « au repos » : aucune purge).
-- ORDRE (sinon cloud-1 purgerait les sessions de son profil : coffre sans ses plateformes) :
--   1. cloud-2 ARRÊTÉ (docker compose stop orchestrateur : navigateur fermé, poste « eteint ») ;
--   2. ce script (remplacer :ip_neuve par l'id de l'IP de l'essai) ;
--   3. cloud-1 : COMPTES_AUTORISES=<Nico> dans .env, orchestrateur relancé.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cloud_postes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND serveur = 'cloud-2' AND etat = 'eteint') THEN
    RAISE EXCEPTION 'le poste de Nico n''est pas éteint sur cloud-2 : arrêter cloud-2 d''abord';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = :ip_neuve AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') THEN
    RAISE EXCEPTION 'IP de l''essai pas attribuée à Nico';
  END IF;
  IF (SELECT count(*) FROM public._backup_0411_essai_gpu WHERE t = 'cloud_coffre' AND ligne ->> 'plateforme' IN ('vinted', 'leboncoin', 'depop')) <> 3 THEN
    RAISE EXCEPTION 'sauvegarde du coffre incomplète';
  END IF;
  -- Le coffre de cloud-1, ligne pour ligne (même chiffré, même iv, même version de clé).
  DELETE FROM public.cloud_coffre WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
     AND plateforme IN ('vinted', 'leboncoin', 'depop', 'beebs');
  INSERT INTO public.cloud_coffre (user_id, plateforme, chiffre, iv, cle_version, connecte, maj_le)
  SELECT (b.ligne ->> 'user_id')::uuid, b.ligne ->> 'plateforme', b.ligne ->> 'chiffre', b.ligne ->> 'iv',
         (b.ligne ->> 'cle_version')::int, (b.ligne ->> 'connecte')::boolean, (b.ligne ->> 'maj_le')::timestamptz
    FROM public._backup_0411_essai_gpu b
   WHERE b.t = 'cloud_coffre' AND b.ligne ->> 'plateforme' IN ('vinted', 'leboncoin', 'depop', 'beebs');
  -- Le poste : cloud-1, son profil, ses détails d'avant (la session FillSell du moment est gardée).
  UPDATE public.cloud_postes p
     SET serveur = 'cloud-1', etat = 'eteint', conteneur = b.ligne ->> 'conteneur', maj_le = now(),
         details = (b.ligne -> 'details') || jsonb_build_object('essai_gpu', jsonb_build_object('retour_le', now()))
    FROM public._backup_0411_essai_gpu b
   WHERE b.t = 'cloud_postes' AND p.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  -- Les IP.
  UPDATE public.cloud_ips SET etat = 'disponible', user_id = NULL, liberee_le = now(), repos_fin = NULL, maj_le = now() WHERE id = :ip_neuve;
  PERFORM public.cloud_journal(:ip_neuve, 'liberation', 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid,
    jsonb_build_object('raison', 'fin de l''essai GPU, retour sur cloud-1 et l''IP 39', 'sans_repos', true));
  UPDATE public.cloud_ips SET etat = 'attribuee_client', user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18', reserve_pour = NULL, reserve_jusqu_au = NULL,
         attribuee_le = now(), liberee_le = NULL, repos_fin = NULL, maj_le = now() WHERE id = 39;
  PERFORM public.cloud_journal(39, 'retour_meme_compte', 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid, jsonb_build_object('raison', 'fin de l''essai GPU'));
END $$;
SELECT (SELECT string_agg(plateforme || ':' || connecte, ',' ORDER BY plateforme) FROM public.cloud_coffre WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') AS coffre,
       (SELECT serveur || ' ' || (details ->> 'profil') FROM public.cloud_postes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') AS poste,
       (SELECT string_agg(id || ':' || etat || ':' || coalesce(left(user_id::text, 8), '-'), ' ' ORDER BY id) FROM public.cloud_ips WHERE id IN (39, :ip_neuve)) AS ips;
COMMIT;
