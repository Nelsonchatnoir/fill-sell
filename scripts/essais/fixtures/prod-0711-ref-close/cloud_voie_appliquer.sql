CREATE OR REPLACE FUNCTION public.cloud_voie_appliquer(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_avant boolean;
  v_ps jsonb;
  v_attendue boolean;
  v_taches integer := 0;
  v_etats integer := 0;
  v_pf text;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'compte_inconnu'); END IF;
  SELECT p.cloud_voie, p.platform_settings INTO v_avant, v_ps FROM public.profiles p WHERE p.id = p_user;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'raison', 'compte_inconnu'); END IF;
  v_attendue := public.cloud_voie_attendue(p_user);
  IF v_avant IS NOT DISTINCT FROM v_attendue THEN
    RETURN jsonb_build_object('ok', true, 'change', false, 'cloud_voie', v_attendue);
  END IF;
  UPDATE public.profiles SET cloud_voie = v_attendue WHERE id = p_user AND cloud_voie IS DISTINCT FROM v_attendue;
  IF v_attendue IS FALSE THEN
    -- Les tâches en attente : plus rien du Cloud ne les retient (la marque et SON message seulement ; un autre
    -- message reste). get-pending-jobs les sert à l'ordinateur dès son prochain poll.
    UPDATE public.cross_post_jobs j
       SET error = CASE WHEN j.error IS NOT DISTINCT FROM (j.platform_fields -> 'attente_verification_cloud' ->> 'message')
                        THEN NULL ELSE j.error END,
           platform_fields = j.platform_fields - 'attente_verification_cloud'
     WHERE j.user_id = p_user AND j.status = 'pending' AND j.platform_fields ? 'attente_verification_cloud';
    GET DIAGNOSTICS v_taches = ROW_COUNT;
    -- « Résoudre la vérification » du Cloud n'a plus de sens : l'état part (lu par l'app seulement).
    FOREACH v_pf IN ARRAY ARRAY['vinted', 'leboncoin', 'beebs', 'depop'] LOOP
      IF jsonb_typeof(v_ps -> v_pf) = 'object' AND (v_ps -> v_pf) ? 'cloud_verification' THEN
        BEGIN
          PERFORM public.platform_settings_fusionner(ARRAY[v_pf], NULL, ARRAY['cloud_verification'], p_user);
          v_etats := v_etats + 1;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'cloud_voie_appliquer : compte % : état de vérification % non retiré : %', p_user, v_pf, SQLERRM;
        END;
      END IF;
    END LOOP;
  END IF;
  RAISE LOG 'cloud_voie_appliquer : compte % : cloud_voie % → % (tâches rendues : %, vérifications retirées : %)',
    p_user, v_avant, v_attendue, v_taches, v_etats;
  RETURN jsonb_build_object('ok', true, 'change', true, 'cloud_voie', v_attendue,
    'taches_rendues', v_taches, 'verifications_retirees', v_etats);
END;
$function$
