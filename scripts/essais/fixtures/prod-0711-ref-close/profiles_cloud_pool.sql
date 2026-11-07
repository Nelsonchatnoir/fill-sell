CREATE OR REPLACE FUNCTION public.profiles_cloud_pool()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    PERFORM public.cloud_compte_synchroniser(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'profiles_cloud_pool : compte % : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$
