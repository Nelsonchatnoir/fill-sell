-- INVERSE de 20261119230000_cloud_ip_controle_avant_attribution — remet les corps de PROD du 19/11 soir de
-- cloud_ip_attribuer et cloud_ip_reserver (pg_get_functiondef, à l'octet : md5 b09eaf83… et b6bddb50…), le corps et le
-- déclencheur posés par 20261119200000 (cloud_ips_servir_actif_sans_ip), puis retire les fonctions neuves et la colonne
-- cloud_ips.controle_renouvellement (un contrôle de sortie se refait : rien d'autre ne s'y perd).
-- Prouvé par le banc jetable : PREUVE_PG=embarque node scripts/essais/20261119230000_banc.mjs (partie C).

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.cloud_ip_attribuer(p_user uuid, p_nature text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ip bigint;
  v_retour boolean := false;
BEGIN
  IF p_user IS NULL OR p_nature NOT IN ('essai', 'client') THEN RAISE EXCEPTION 'cloud_ip_attribuer : appel invalide'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cloud_ip:' || p_user::text, 0));
  SELECT id INTO v_ip FROM public.cloud_ips WHERE user_id = p_user;
  IF v_ip IS NOT NULL THEN RETURN v_ip; END IF;
  SELECT id INTO v_ip FROM public.cloud_ips i
   WHERE i.etat = 'repos' AND i.dernier_user_id = p_user AND public.cloud_ip_attribuable(i, p_user, p_nature)
   ORDER BY i.liberee_le DESC LIMIT 1 FOR UPDATE SKIP LOCKED;
  v_retour := v_ip IS NOT NULL;
  IF v_ip IS NULL THEN
    SELECT id INTO v_ip FROM public.cloud_ips i
     WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, p_user, p_nature)
     ORDER BY (i.reserve_pour = p_user) DESC NULLS LAST, public.cloud_ip_refus_prouve(i.refus),
              public.cloud_ip_rang_operateur(i.sante), (i.refus = '{}'::jsonb) DESC,
              i.expire_le, i.attributions, i.id
     LIMIT 1 FOR UPDATE SKIP LOCKED;
  END IF;
  IF v_ip IS NULL THEN RETURN NULL; END IF;
  UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_pour = p_user AND id <> v_ip;
  UPDATE public.cloud_ips
     SET etat = 'attribuee_' || p_nature, user_id = p_user,
         attributions = attributions + CASE WHEN dernier_user_id IS DISTINCT FROM p_user THEN 1 ELSE 0 END,
         dernier_user_id = p_user, derniere_origine = p_nature,
         reserve_pour = NULL, reserve_jusqu_au = NULL,
         attribuee_le = now(), liberee_le = NULL, repos_fin = NULL,
         purge_preuve = NULL, purge_prouvee_le = NULL, maj_le = now()
   WHERE id = v_ip;
  PERFORM public.cloud_journal(v_ip, CASE WHEN v_retour THEN 'retour_meme_compte' ELSE 'attribution' END, p_user,
          jsonb_build_object('nature', p_nature));
  RETURN v_ip;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cloud_ip_reserver(p_user uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_ip bigint;
BEGIN
  IF p_user IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cloud_ip:' || p_user::text, 0));
  SELECT id INTO v_ip FROM public.cloud_ips WHERE user_id = p_user;
  IF v_ip IS NOT NULL THEN RETURN v_ip; END IF;
  SELECT id INTO v_ip FROM public.cloud_ips i
   WHERE i.etat = 'repos' AND i.dernier_user_id = p_user AND public.cloud_ip_attribuable(i, p_user, 'essai')
   ORDER BY i.liberee_le DESC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_ip IS NOT NULL THEN RETURN v_ip; END IF;   -- la sienne : rien à réserver, personne d'autre ne la prend
  SELECT id INTO v_ip FROM public.cloud_ips i
   WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, p_user, 'essai')
   ORDER BY (i.reserve_pour = p_user) DESC NULLS LAST, public.cloud_ip_refus_prouve(i.refus),
            public.cloud_ip_rang_operateur(i.sante), (i.refus = '{}'::jsonb) DESC,
            i.expire_le, i.attributions, i.id
   LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_ip IS NULL THEN RETURN NULL; END IF;
  UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_pour = p_user AND id <> v_ip;
  UPDATE public.cloud_ips
     SET reserve_pour = p_user, reserve_jusqu_au = now() + make_interval(mins => public.cloud_param('reservation_min', 30)), maj_le = now()
   WHERE id = v_ip;
  PERFORM public.cloud_journal(v_ip, 'reservation', p_user, '{}'::jsonb);
  RETURN v_ip;
END;
$function$;

-- Le corps et le déclencheur de 20261119200000.
CREATE OR REPLACE FUNCTION public.cloud_ips_servir_actif_sans_ip()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- (19/11/2026, 20261119200000, décision de Nico, point 5) L'IP NEW vient de devenir « disponible » : UN compte au Cloud actif
-- sans IP (payés et offerts d'abord, puis essais ; le plus ancien compte d'abord) la reçoit par cloud_compte_synchroniser_pool
-- (cloud_ip_attribuer, sous son verrou de compte). Jamais bloquant : une erreur est dite, l'IP reste disponible.
DECLARE
  v_user uuid;
  v_r jsonb;
BEGIN
  IF public.cloud_param('ip_rotation', 0) = 1 THEN RETURN NULL; END IF;
  BEGIN
    SELECT p.id INTO v_user FROM public.profiles p
     WHERE (p.is_cloud IS TRUE OR (p.cloud_essai_fin > now() AND p.cloud_essai_debut <= now() AND p.cloud_essai_arrete IS NOT TRUE))
       AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.user_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM public.cloud_ips r WHERE r.reserve_pour = p.id AND r.reserve_jusqu_au > now())
       AND public.cloud_ip_attribuable(NEW, p.id, CASE WHEN p.is_cloud IS TRUE THEN 'client' ELSE 'essai' END)
     ORDER BY (p.is_cloud IS TRUE) DESC, p.created_at NULLS LAST, p.id
     LIMIT 1;
    IF v_user IS NOT NULL THEN
      v_r := public.cloud_compte_synchroniser_pool(v_user);
      RAISE LOG 'cloud_ips_servir_actif_sans_ip : IP % disponible → compte % : %', NEW.id, v_user, v_r;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'cloud_ips_servir_actif_sans_ip : IP % : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS cloud_ips_zz_servir_actif_sans_ip ON public.cloud_ips;
CREATE TRIGGER cloud_ips_zz_servir_actif_sans_ip
  AFTER UPDATE OF etat ON public.cloud_ips
  FOR EACH ROW WHEN (NEW.etat = 'disponible' AND OLD.etat IS DISTINCT FROM 'disponible')
  EXECUTE FUNCTION public.cloud_ips_servir_actif_sans_ip();

DROP FUNCTION IF EXISTS public.cloud_ip_attendus();
DROP FUNCTION IF EXISTS public.cloud_ip_controle_renouvellement_noter(bigint, jsonb);
DROP FUNCTION IF EXISTS public.cloud_ip_controlee_avant_attribution(cloud_ips);
ALTER TABLE public.cloud_ips DROP CONSTRAINT IF EXISTS cloud_ips_controle_renouvellement_lisible;
ALTER TABLE public.cloud_ips DROP COLUMN IF EXISTS controle_renouvellement;
