CREATE OR REPLACE FUNCTION public.cloud_voie_attendue(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((public.cloud_etat(p_user) ->> 'actif')::boolean, false);
$function$
