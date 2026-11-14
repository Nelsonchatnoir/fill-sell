CREATE OR REPLACE FUNCTION public.cloud_controle_manques(p_controle jsonb, p_ip inet, p_maintenant timestamp with time zone DEFAULT now())
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  m text[] := '{}';
  c jsonb := CASE WHEN jsonb_typeof(p_controle) = 'object' THEN p_controle ELSE '{}'::jsonb END;
  v_fait timestamptz := public.cloud_ts(c ->> 'fait_le');
BEGIN
  IF v_fait IS NULL OR v_fait > p_maintenant + interval '5 minutes' OR v_fait < p_maintenant - interval '24 hours' THEN
    m := array_append(m, 'controle_frais');
  END IF;
  IF COALESCE(c ->> 'ip_sortie', '') <> host(p_ip) THEN m := array_append(m, 'ip_sortie'); END IF;
  IF (c -> 'pays') IS DISTINCT FROM '"FR"'::jsonb THEN m := array_append(m, 'pays'); END IF;
  -- (CASE entre parenthèses : le IF de plpgsql s'arrête au premier THEN hors parenthèses)
  IF (CASE WHEN jsonb_typeof(c -> 'listes_noires') = 'array' THEN jsonb_array_length(c -> 'listes_noires') > 0 ELSE true END) THEN
    m := array_append(m, 'listes_noires');
  END IF;
  IF (CASE WHEN jsonb_typeof(c -> 'plateformes') = 'object'
           THEN NOT EXISTS (SELECT 1 FROM jsonb_object_keys(c -> 'plateformes'))
             OR EXISTS (SELECT 1 FROM jsonb_each(c -> 'plateformes') e WHERE e.value = '"bloque"'::jsonb)
           ELSE true END) THEN
    m := array_append(m, 'plateformes');
  END IF;
  RETURN m;
END;
$function$
