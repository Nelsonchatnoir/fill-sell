-- (20/11/2026 soir, URGENT de Nico) UNE IP QUI NE PASSE PAS LE CONTRÔLE N'EST JAMAIS ATTRIBUABLE.
-- 81, 88 (Beebs : vérification DataDome, 406) et 89 (aucune connexion) rendaient cloud_ip_attribuable = true comme la 80 :
-- la fonction n'écartait qu'une IP « grillee » ; une IP au contrôle sans conclusion (« inconnue ») comptait dans les places
-- à vendre (cloud_vente_etat), les places offertes à la liste d'attente (cloud_attente_places_a_offrir), la garde du nombre,
-- la réservation et le service d'un compte actif sans IP. Règle (décision de Nico du 20/11 : la France + les 4 plateformes
-- ouvertes) : attribuable seulement si le DERNIER contrôle de santé est passé (verdict « saine ») depuis moins de
-- cloud_sante_validite_h heures (36, = cloud-pool.js santeConnue). L'attribution garde en plus son contrôle de moins d'une
-- heure (cloud_ip_controlee_avant_attribution). Miroir : supabase/functions/_shared/cloud-pool.js ipAttribuable.
-- Garde : la fonction de prod est celle relue le 20/11 (md5 a6d76077bf8335dc662a30c781215771), sinon rien n'est changé.
-- Inverse : supabase/rollbacks/20261120190000_cloud_ip_attribuable_saine_seulement_INVERSE.sql.
DO $garde$
BEGIN
  IF (SELECT md5(pg_get_functiondef('public.cloud_ip_attribuable(cloud_ips, uuid, text)'::regprocedure)))
     IS DISTINCT FROM 'a6d76077bf8335dc662a30c781215771' THEN
    RAISE EXCEPTION 'cloud_ip_attribuable a changé depuis sa relecture du 20/11 : migration arrêtée, rien n''est modifié';
  END IF;
END
$garde$;

CREATE OR REPLACE FUNCTION public.cloud_ip_attribuable(p cloud_ips, p_user uuid, p_nature text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- (20/11/2026 soir, 20261120190000) Attribuable seulement si le dernier contrôle de santé est PASSÉ (« saine ») depuis
  -- moins de cloud_sante_validite_h heures : une IP « inconnue », « suspecte » ou « grillee » ne l'est jamais.
  SELECT p.expire_le >= CASE WHEN p_nature = 'essai'
                             THEN now() + make_interval(days => 7 + public.cloud_param('grace_jours', 2)
                                                              + public.cloud_param('marge_expiration_jours', 1))
                             ELSE now() + make_interval(days => public.cloud_param('renouvellement_avant_jours', 3)) END
     AND COALESCE(p.sante ->> 'verdict', '') = 'saine'
     AND public.cloud_ts(p.sante ->> 'saine_le') IS NOT NULL
     AND public.cloud_ts(p.sante ->> 'saine_le') >= now() - make_interval(hours => public.cloud_param('sante_validite_h', 36))
     AND CASE
           WHEN p.etat = 'repos' THEN p_user IS NOT NULL AND p.dernier_user_id = p_user
           WHEN p.etat = 'disponible' THEN p.attributions < public.cloud_param('attributions_max', 6)
                AND (p.reserve_pour IS NULL OR p.reserve_pour = p_user OR p.reserve_jusqu_au < now())
           ELSE false END;
$function$;
