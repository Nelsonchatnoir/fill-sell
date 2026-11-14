CREATE OR REPLACE FUNCTION public.cloud_ip_controle_entree(p_ip bigint, p_controle jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v public.cloud_ips%ROWTYPE;
  v_manques text[];
BEGIN
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF NOT FOUND OR v.etat <> 'achetee' THEN RETURN jsonb_build_object('ok', false, 'raison', 'pas_achetee'); END IF;
  v_manques := public.cloud_controle_manques(p_controle, v.ip);
  PERFORM public.cloud_journal(p_ip, 'controle_entree', NULL, jsonb_build_object('controle', p_controle, 'manques', to_jsonb(v_manques)));
  IF cardinality(v_manques) > 0 THEN
    PERFORM public.cloud_ip_signaler(p_ip, 'controle_entree', jsonb_build_object('manques', to_jsonb(v_manques)));
    RETURN jsonb_build_object('ok', false, 'raison', 'rebut', 'manques', to_jsonb(v_manques), 'demander_remplacement', true);
  END IF;
  UPDATE public.cloud_ips SET etat = 'disponible', maj_le = now() WHERE id = p_ip;
  RETURN jsonb_build_object('ok', true);
END;
$function$
