CREATE OR REPLACE FUNCTION public.cloud_ts(p text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN p::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$
;
