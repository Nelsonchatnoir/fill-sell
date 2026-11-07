CREATE OR REPLACE FUNCTION public.cloud_empreintes_engager(p_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  d public.cloud_essai_demandes%ROWTYPE;
  v_garde timestamptz;
  v_n integer := 0; v_k integer;
BEGIN
  SELECT * INTO d FROM public.cloud_essai_demandes WHERE user_id = p_user;
  IF NOT FOUND OR d.essai_permis IS NOT TRUE THEN RETURN 0; END IF;
  SELECT COALESCE(cloud_essai_fin, now() + interval '7 days')
           + make_interval(months => public.cloud_param('empreintes_conservation_mois', 12))
    INTO v_garde FROM public.profiles WHERE id = p_user;
  IF d.appareil_h IS NOT NULL THEN
    INSERT INTO public.cloud_essai_empreintes (user_id, nature, plateforme, empreinte, conserver_jusqu_au)
    VALUES (p_user, 'appareil', NULL, d.appareil_h, v_garde) ON CONFLICT (nature, empreinte) DO NOTHING;
    GET DIAGNOSTICS v_k = ROW_COUNT; v_n := v_n + v_k;
  END IF;
  INSERT INTO public.cloud_essai_empreintes (user_id, nature, plateforme, empreinte, conserver_jusqu_au)
  SELECT DISTINCT ON (x ->> 'h') p_user, 'compte_plateforme', x ->> 'plateforme', x ->> 'h', v_garde
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.comptes_h) = 'array' THEN d.comptes_h ELSE '[]'::jsonb END) x
   WHERE COALESCE(x ->> 'h', '') ~ '^[0-9a-f]{64}$' AND COALESCE(x ->> 'plateforme', '') <> ''
  ON CONFLICT (nature, empreinte) DO NOTHING;
  GET DIAGNOSTICS v_k = ROW_COUNT; v_n := v_n + v_k;
  DELETE FROM public.cloud_essai_demandes WHERE user_id = p_user;
  RETURN v_n;
END;
$function$
