CREATE OR REPLACE FUNCTION public.cloud_disponibilite_moi()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_vente jsonb;
  a public.cloud_attente%ROWTYPE;
  v_rang integer;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('vente_possible', false, 'raison', 'compte_inconnu'); END IF;
  v_vente := public.cloud_vente_etat(v_user);
  SELECT * INTO a FROM public.cloud_attente WHERE user_id = v_user;
  IF a.inscrit_le IS NOT NULL AND a.notifie_le IS NULL THEN
    SELECT count(*)::int + 1 INTO v_rang FROM public.cloud_attente x
     WHERE x.inscrit_le IS NOT NULL AND x.notifie_le IS NULL AND x.inscrit_le < a.inscrit_le;
  END IF;
  RETURN v_vente || jsonb_build_object('attente', jsonb_build_object(
    'inscrit', a.inscrit_le IS NOT NULL,
    'inscrit_le', a.inscrit_le,
    'notifie_le', a.notifie_le,
    'rang', v_rang,
    'place_pour_toi', a.inscrit_le IS NOT NULL AND a.notifie_le > now() - interval '24 hours'
                      AND COALESCE((v_vente ->> 'vente_possible')::boolean, false)));
END;
$function$
