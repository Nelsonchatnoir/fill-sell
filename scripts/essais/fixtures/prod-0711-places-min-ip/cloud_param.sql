CREATE OR REPLACE FUNCTION public.cloud_param(p_cle text, p_defaut integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((SELECT value FROM public.coin_config WHERE key = 'cloud_' || p_cle), p_defaut);
$function$
