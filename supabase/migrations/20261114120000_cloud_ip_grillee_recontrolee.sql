-- 20261114120000_cloud_ip_grillee_recontrolee — (14/11/2026, complément 3 de Nico : « aucune IP payée ne doit être gaspillée »)
-- « Grillée » n'est plus définitif : cloud_ip_sante_noter accepte qu'un contrôle réussi remette une IP grillée « saine »
-- (retour au pool). Le contrôle de santé ne regarde plus eBay (connexion et publications eBay ne passent jamais par l'IP du
-- poste Cloud). Corps réécrit depuis pg_get_functiondef en prod (md5 5d8de791f46faa1f9c4951ed3bdc4c51), seule la garde
-- « deja_grillee » retirée. Inverse : 20261114120000_cloud_ip_grillee_recontrolee_INVERSE.sql. Banc : scripts/essais/20261114120000_banc.mjs.
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
  -- (14/11/2026, complément 3 de Nico) « Grillée » n'est plus définitif : la quarantaine remplace le rebut pour toutes les
  -- IP. Une IP grillée est recontrôlée (15 min, 1 h, 4 h puis toutes les 12 h, cloud-pool.js choisirIpASonder) et revient au
  -- pool dès qu'un contrôle passe (santeSuivante). La décision est dans le code de l'orchestrateur ; ici, on l'écrit.
  UPDATE public.cloud_ips SET sante = p_sante, maj_le = now() WHERE id = p_ip;
  IF v_avant IS DISTINCT FROM v_apres THEN
    PERFORM public.cloud_journal(p_ip, 'visite_controle', NULL, jsonb_build_object('sante', jsonb_build_object(
      'avant', v_avant, 'apres', v_apres, 'le', p_sante ->> 'le', 'echecs', COALESCE(p_sante -> 'echecs', '[]'::jsonb))));
  END IF;
  RETURN jsonb_build_object('ok', true, 'avant', v_avant, 'apres', v_apres);
END;
$function$
;
