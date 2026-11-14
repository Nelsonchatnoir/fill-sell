CREATE OR REPLACE FUNCTION public.cloud_ip_signaler(p_ip bigint, p_critere text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v public.cloud_ips%ROWTYPE;
  v_nouvelle bigint;
  v_pf text := lower(COALESCE(p_details ->> 'plateforme', p_details -> 'details' ->> 'plateforme', ''));
BEGIN
  IF p_critere NOT IN ('blocage_anti_robot','captcha_repete','compte_restreint','liste_noire',
                       'sortie_non_conforme','controle_entree','manuel') THEN
    RAISE EXCEPTION 'cloud_ip_signaler : critère inconnu %', p_critere;
  END IF;
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'raison', 'ip_inconnue'); END IF;
  PERFORM public.cloud_journal(p_ip, 'signalement', v.user_id, jsonb_build_object('critere', p_critere, 'details', p_details, 'etat_avant', v.etat));
  IF v.etat IN ('rebut', 'expiree') THEN RETURN jsonb_build_object('ok', true, 'deja', v.etat); END IF;
  -- (03/11) Une plateforme qui refuse : un refus sur ELLE, non prouvé — jamais tout le pool, jamais le rebut.
  IF p_critere IN ('blocage_anti_robot', 'captcha_repete') THEN
    IF v_pf NOT IN ('vinted', 'leboncoin', 'beebs', 'depop') THEN
      RETURN jsonb_build_object('ok', false, 'raison', 'plateforme_requise');
    END IF;
    RETURN public.cloud_ip_refus_noter(p_ip, v_pf, p_critere, p_details) || jsonb_build_object('refus', true, 'rebut', false, 'titulaire', v.user_id);
  END IF;
  UPDATE public.cloud_ips
     SET etat = 'rebut', user_id = NULL, reserve_pour = NULL, reserve_jusqu_au = NULL,
         rebut_critere = p_critere, rebut_le = now(), liberee_le = COALESCE(liberee_le, now()), maj_le = now()
   WHERE id = p_ip;
  PERFORM public.cloud_journal(p_ip, 'rebut', v.user_id, jsonb_build_object('critere', p_critere));
  IF v.user_id IS NOT NULL THEN
    v_nouvelle := public.cloud_ip_attribuer(v.user_id, CASE WHEN v.etat = 'attribuee_client' THEN 'client' ELSE 'essai' END);
  END IF;
  RETURN jsonb_build_object('ok', true, 'rebut', true, 'titulaire', v.user_id, 'nouvelle_ip', v_nouvelle);
END;
$function$
