-- INVERSE de 20261114120000 : le corps de la prod du 14/11 (md5 5d8de791f46faa1f9c4951ed3bdc4c51), garde « deja_grillee » comprise.
CREATE OR REPLACE FUNCTION public.cloud_ip_sante_noter(p_ip bigint, p_sante jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v public.cloud_ips%ROWTYPE;
  v_avant text;
  v_apres text := p_sante ->> 'verdict';
BEGIN
  IF p_sante IS NULL OR jsonb_typeof(p_sante) <> 'object' OR v_apres IS NULL
     OR v_apres NOT IN ('saine', 'suspecte', 'grillee', 'inconnue') THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'sante_illisible');
  END IF;
  IF octet_length(p_sante::text) > 16384 THEN RETURN jsonb_build_object('ok', false, 'raison', 'sante_trop_grosse'); END IF;
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'raison', 'ip_inconnue'); END IF;
  -- Jamais sur une IP tenue par un compte (attribuée pendant le contrôle : son verdict n'est pas écrit) ni hors du pool.
  IF v.user_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'ip_tenue_par_un_compte'); END IF;
  IF v.etat IN ('rebut', 'expiree') THEN RETURN jsonb_build_object('ok', false, 'raison', 'ip_hors_pool'); END IF;
  v_avant := v.sante ->> 'verdict';
  -- Grillée = définitif : jamais rabaissée par un contrôle suivant (elle expire à son terme).
  IF v_avant = 'grillee' AND v_apres <> 'grillee' THEN RETURN jsonb_build_object('ok', false, 'raison', 'deja_grillee', 'avant', v_avant); END IF;
  UPDATE public.cloud_ips SET sante = p_sante, maj_le = now() WHERE id = p_ip;
  IF v_avant IS DISTINCT FROM v_apres THEN
    PERFORM public.cloud_journal(p_ip, 'visite_controle', NULL, jsonb_build_object('sante', jsonb_build_object(
      'avant', v_avant, 'apres', v_apres, 'le', p_sante ->> 'le', 'echecs', COALESCE(p_sante -> 'echecs', '[]'::jsonb))));
  END IF;
  RETURN jsonb_build_object('ok', true, 'avant', v_avant, 'apres', v_apres);
END;
$function$
;
