-- INVERSE de 20261120210000 : cloud_attente_a_prevenir_existe telle que relue en prod le 20/11 (md5 a7f37a24…).
CREATE OR REPLACE FUNCTION public.cloud_attente_a_prevenir_existe()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Un renvoi en attente (échec passager), ou un inscrit à prévenir ET une place à offrir. Jamais d'erreur (cron).
  IF EXISTS (SELECT 1 FROM public.cloud_attente WHERE notif_statut = 'a_envoyer' AND notif_essais < 3) THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_attente WHERE inscrit_le IS NOT NULL AND notifie_le IS NULL) THEN RETURN false; END IF;
  RETURN public.cloud_attente_places_a_offrir() > 0;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$function$;
