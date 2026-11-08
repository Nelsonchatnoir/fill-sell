-- INVERSE de 20261108233000 : le corps de la prod du 08/11, mot pour mot.
CREATE OR REPLACE FUNCTION public.cloud_ip_remettre_en_pool(p_ip bigint, p_controle jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v public.cloud_ips%ROWTYPE;
  m text[] := '{}';
BEGIN
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'manques', '["ip_inconnue"]'::jsonb); END IF;
  IF v.etat IS DISTINCT FROM 'repos' THEN m := array_append(m, 'pas_au_repos'); END IF;
  IF v.repos_fin IS NULL OR now() < v.repos_fin THEN m := array_append(m, 'repos_en_cours'); END IF;
  IF v.purge_prouvee_le IS NULL OR v.liberee_le IS NULL OR v.purge_prouvee_le < v.liberee_le
     OR cardinality(public.cloud_purge_manques(v.purge_preuve, v.liberee_le)) > 0 THEN
    m := array_append(m, 'purge_non_prouvee');
  END IF;
  IF v.expire_le <= now() THEN m := array_append(m, 'expiree'); END IF;
  m := m || public.cloud_controle_manques(p_controle, v.ip);
  IF cardinality(m) > 0 THEN RETURN jsonb_build_object('ok', false, 'manques', to_jsonb(m)); END IF;
  UPDATE public.cloud_ips SET etat = 'disponible', maj_le = now() WHERE id = p_ip;
  PERFORM public.cloud_journal(p_ip, 'sortie_repos', NULL, jsonb_build_object('controle', p_controle));
  RETURN jsonb_build_object('ok', true);
END;
$function$;
