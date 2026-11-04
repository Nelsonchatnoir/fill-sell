-- INVERSE de 20261104_cloud_beebs_ip_neuve_nico.sql : la ligne Beebs du coffre, l'état « vérification » de Beebs et les
-- IP 39 / 40 reviennent à leur état sauvegardé (_backup_0411_cloud_beebs_ip). L'orchestrateur voit l'IP changer et rouvre
-- le navigateur sur 176.103.182.215. Le navigateur, lui, a été vidé de Beebs (outils/effacer-plateforme.mjs) : le coffre
-- restauré y remet la session Beebs à la prochaine ouverture.
BEGIN;
DO $$
DECLARE b jsonb; v jsonb;
BEGIN
  IF (SELECT count(*) FROM public._backup_0411_cloud_beebs_ip WHERE quoi = 'cloud_ips') <> 2 THEN RAISE EXCEPTION 'sauvegarde des IP incomplète'; END IF;
  -- IP : 40 rendue au pool, 39 rendue au compte (colonnes d'état seulement, valeurs sauvegardées).
  FOR b IN SELECT ligne FROM public._backup_0411_cloud_beebs_ip WHERE quoi = 'cloud_ips' LOOP
    UPDATE public.cloud_ips SET etat = b ->> 'etat', user_id = NULLIF(b ->> 'user_id', '')::uuid,
           attributions = (b ->> 'attributions')::int, dernier_user_id = NULLIF(b ->> 'dernier_user_id', '')::uuid,
           derniere_origine = b ->> 'derniere_origine', reserve_pour = NULLIF(b ->> 'reserve_pour', '')::uuid,
           reserve_jusqu_au = NULLIF(b ->> 'reserve_jusqu_au', '')::timestamptz, attribuee_le = NULLIF(b ->> 'attribuee_le', '')::timestamptz,
           liberee_le = NULLIF(b ->> 'liberee_le', '')::timestamptz, repos_fin = NULLIF(b ->> 'repos_fin', '')::timestamptz, maj_le = now()
     WHERE id = (b ->> 'id')::bigint;
  END LOOP;
  -- La ligne Beebs du coffre.
  INSERT INTO public.cloud_coffre SELECT (jsonb_populate_record(NULL::public.cloud_coffre, ligne)).*
    FROM public._backup_0411_cloud_beebs_ip WHERE quoi = 'cloud_coffre'
  ON CONFLICT DO NOTHING;
  -- L'état « vérification » de Beebs lu par l'app.
  SELECT ligne INTO v FROM public._backup_0411_cloud_beebs_ip WHERE quoi = 'cloud_verification';
  IF v IS NOT NULL AND v <> 'null'::jsonb THEN
    PERFORM public.platform_settings_fusionner(ARRAY['beebs'], jsonb_build_object('cloud_verification', v), ARRAY[]::text[], 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid);
  END IF;
END $$;
SELECT (SELECT string_agg(id || ':' || etat || ':' || coalesce(left(user_id::text, 8), '-'), ' ' ORDER BY id) FROM public.cloud_ips WHERE id IN (39, 40)) AS ips,
       (SELECT count(*) FROM public.cloud_coffre WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND plateforme = 'beebs') AS beebs;
COMMIT;
