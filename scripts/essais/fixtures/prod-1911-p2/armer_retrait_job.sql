-- Corps de PROD relu le 19/11/2026 (pg_get_functiondef armer_retrait_job(uuid,text,interval), md5 860ad82a848f4f5801611422cf566361), commentaires retirés pour le banc.
CREATE OR REPLACE FUNCTION public.armer_retrait_job(p_job_id uuid, p_chemin text, p_delai interval DEFAULT '00:00:00'::interval)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  return public.armer_retrait_job_pour(p_job_id, p_chemin, p_delai, false);
end;
$function$
;
