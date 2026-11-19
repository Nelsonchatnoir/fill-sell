-- Corps de PROD relu le 19/11/2026 (pg_get_functiondef vente_instant(timestamptz,date,timestamptz), md5 ddb53787e216ef5e2222ccb4262e61c1), commentaires retirés pour le banc.
CREATE OR REPLACE FUNCTION public.vente_instant(p_vendu_le timestamp with time zone, p_date date, p_cree timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(p_vendu_le, (((p_date + 1)::timestamp) AT TIME ZONE 'Europe/Paris') - interval '1 second', p_cree);
$function$
;
