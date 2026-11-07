CREATE OR REPLACE FUNCTION public.cloud_ip_refus_prouve(p_refus jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(jsonb_typeof(p_refus) = 'object'
         AND EXISTS (SELECT 1 FROM jsonb_each(p_refus) e WHERE (e.value ->> 'prouvee')::boolean IS TRUE), false);
$function$
