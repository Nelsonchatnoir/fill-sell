-- INVERSE de 20261004200000_photos_ebay_depuis_api.sql : la définition EN PROD relue le 04/10 à 20:23, juste avant.
CREATE OR REPLACE FUNCTION public.annonce_capture_complete_fiche()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    PERFORM fiche_completer_photos_capture(NEW.inventaire_id, NEW.photo_url, NEW.capture);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'annonce_capture_complete_fiche : annonce % : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$
;
DROP TRIGGER IF EXISTS annonce_capture_complete_fiche ON public.annonces_plateforme;
CREATE TRIGGER annonce_capture_complete_fiche AFTER UPDATE OF capture, inventaire_id ON public.annonces_plateforme FOR EACH ROW WHEN (((new.inventaire_id IS NOT NULL) AND (new.capture IS NOT NULL) AND (jsonb_typeof((new.capture -> 'photos'::text)) = 'array'::text) AND (jsonb_array_length((new.capture -> 'photos'::text)) > 1))) EXECUTE FUNCTION annonce_capture_complete_fiche();
