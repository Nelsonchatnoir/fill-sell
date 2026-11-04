-- INVERSE de 20261104_cloud_retour_avant_1223_nico.sql : IP 2, 39, 40 et la ligne cloud_postes reviennent à leur état
-- sauvegardé (_backup_0411_cloud_retour) ; les lignes Vinted, Leboncoin, Depop écrites au coffre par
-- outils/restaurer-coffre-profil.mjs partent (le coffre redevient celui d'après la purge : la session FillSell seule).
-- L'orchestrateur ARRÊTÉ pendant l'inverse ; le profil neuf p-f44b5917-4a22e14524a7 se reprend dans
-- archives/0411-beebs/p-essai-1340/.
BEGIN;
DO $$
DECLARE b jsonb;
BEGIN
  IF (SELECT count(*) FROM public._backup_0411_cloud_retour WHERE quoi = 'cloud_ips') <> 3 THEN RAISE EXCEPTION 'sauvegarde incomplète'; END IF;
  FOR b IN SELECT ligne FROM public._backup_0411_cloud_retour WHERE quoi = 'cloud_ips' LOOP
    UPDATE public.cloud_ips SET etat = b ->> 'etat', user_id = NULLIF(b ->> 'user_id', '')::uuid, dernier_user_id = NULLIF(b ->> 'dernier_user_id', '')::uuid,
           derniere_origine = b ->> 'derniere_origine', reserve_pour = NULLIF(b ->> 'reserve_pour', '')::uuid,
           reserve_jusqu_au = NULLIF(b ->> 'reserve_jusqu_au', '')::timestamptz, attribuee_le = NULLIF(b ->> 'attribuee_le', '')::timestamptz,
           liberee_le = NULLIF(b ->> 'liberee_le', '')::timestamptz, repos_fin = NULLIF(b ->> 'repos_fin', '')::timestamptz,
           purge_preuve = b -> 'purge_preuve', purge_prouvee_le = NULLIF(b ->> 'purge_prouvee_le', '')::timestamptz,
           refus = COALESCE(b -> 'refus', '{}'::jsonb), maj_le = now()
     WHERE id = (b ->> 'id')::bigint;
  END LOOP;
  SELECT ligne INTO b FROM public._backup_0411_cloud_retour WHERE quoi = 'cloud_postes';
  UPDATE public.cloud_postes SET details = b -> 'details' WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  DELETE FROM public.cloud_coffre WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND plateforme IN ('vinted', 'leboncoin', 'depop');
END $$;
SELECT (SELECT string_agg(id || ':' || etat || ':' || coalesce(left(user_id::text, 8), '-'), ' ' ORDER BY id) FROM public.cloud_ips WHERE id IN (2, 39, 40)) AS ips;
COMMIT;
