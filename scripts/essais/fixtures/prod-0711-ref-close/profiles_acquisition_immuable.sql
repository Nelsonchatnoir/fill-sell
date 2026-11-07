CREATE OR REPLACE FUNCTION public.profiles_acquisition_immuable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.acquisition_captured_at IS NOT NULL THEN
    NEW.acquisition_source      := OLD.acquisition_source;
    NEW.acquisition_medium      := OLD.acquisition_medium;
    NEW.acquisition_campaign    := OLD.acquisition_campaign;
    NEW.acquisition_content     := OLD.acquisition_content;
    NEW.acquisition_fbclid      := OLD.acquisition_fbclid;
    NEW.acquisition_referrer    := OLD.acquisition_referrer;
    NEW.acquisition_captured_at := OLD.acquisition_captured_at;
  END IF;
  RETURN NEW;
END;
$function$
