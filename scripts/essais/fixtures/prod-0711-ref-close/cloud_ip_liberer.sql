CREATE OR REPLACE FUNCTION public.cloud_ip_liberer(p_user uuid, p_raison text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ip bigint; v_etat text;
BEGIN
  UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_pour = p_user;
  SELECT id, etat INTO v_ip, v_etat FROM public.cloud_ips WHERE user_id = p_user FOR UPDATE;
  IF v_ip IS NULL THEN RETURN NULL; END IF;
  UPDATE public.cloud_ips
     SET etat = 'repos', user_id = NULL, liberee_le = now(),
         repos_fin = now() + make_interval(days => public.cloud_param('repos_jours', 7)),
         purge_preuve = NULL, purge_prouvee_le = NULL, maj_le = now()
   WHERE id = v_ip;
  PERFORM public.cloud_journal(v_ip, 'liberation', p_user, jsonb_build_object('raison', p_raison, 'etat_avant', v_etat));
  RETURN v_ip;
END;
$function$
