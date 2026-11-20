-- (20/11/2026 soir, décision de Nico, point 6) LE MAIL « TA PLACE EST PRÊTE » RATÉ EST RÉESSAYÉ PAR LE CRON, sans attendre un
-- nouvel inscrit. push-cloud-place-5min n'appelait la fonction que s'il y avait un renvoi de push ou un nouvel inscrit à
-- prévenir (cloud_attente_a_prevenir_existe) : une place offerte sans appareil dont le mail avait échoué restait sans mail.
-- Désormais aussi : une place offerte sans appareil (notif_statut « sans_appareil »), jamais mailée (notif_resultat.mail_le
-- absent), offerte il y a moins de 2 jours, moins de 3 essais de mail (notif_resultat.mail_essais, compté par la fonction).
-- Garde : la fonction de prod relue le 20/11 (md5 a7f37a24ce4f2bd173e3dbcc9b05a460).
-- Inverse : supabase/rollbacks/20261120210000_cloud_attente_mail_a_reessayer_INVERSE.sql.
DO $garde$
BEGIN
  IF (SELECT md5(pg_get_functiondef('public.cloud_attente_a_prevenir_existe()'::regprocedure))) IS DISTINCT FROM 'a7f37a24ce4f2bd173e3dbcc9b05a460' THEN
    RAISE EXCEPTION 'cloud_attente_a_prevenir_existe a changé depuis sa relecture du 20/11 : migration arrêtée, rien n''est modifié';
  END IF;
END
$garde$;

CREATE OR REPLACE FUNCTION public.cloud_attente_a_prevenir_existe()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Un renvoi en attente (échec passager), ou un inscrit à prévenir ET une place à offrir. Jamais d'erreur (cron).
  IF EXISTS (SELECT 1 FROM public.cloud_attente WHERE notif_statut = 'a_envoyer' AND notif_essais < 3) THEN RETURN true; END IF;
  -- (20/11/2026 soir, 20261120210000) Une place offerte sans appareil dont le mail n'est pas parti : le mail est réessayé.
  IF EXISTS (SELECT 1 FROM public.cloud_attente
              WHERE notif_statut = 'sans_appareil' AND inscrit_le IS NOT NULL AND notifie_le > now() - interval '2 days'
                AND (notif_resultat ->> 'mail_le') IS NULL
                AND COALESCE(NULLIF(notif_resultat ->> 'mail_essais', '')::integer, 0) < 3) THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_attente WHERE inscrit_le IS NOT NULL AND notifie_le IS NULL) THEN RETURN false; END IF;
  RETURN public.cloud_attente_places_a_offrir() > 0;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$function$;
