-- (20/11/2026 18:09, DÉCISION DE NICO — règle du 03/11 : « le refus porte sur la plateforme qui refuse ») UNE IP OÙ UNE
-- PLATEFORME EST FERMÉE RESTE ATTRIBUABLE ; LES COMPTES QUI UTILISENT CETTE PLATEFORME PASSENT D'ABORD PAR UNE IP OÙ ELLE EST
-- OUVERTE. Le contrôle de santé (orchestrateur, cloud-pool.js santeSuivante) ne juge plus que la sortie ; une plateforme qui
-- refuse ou ne conclut pas (Beebs : DataDome 406 sur la 81 et la 88) est notée dans sante.plateformes_fermees.
-- cloud_ip_attribuer et cloud_ip_reserver : juste après SA réservation, les IP où aucune plateforme du compte
-- (cloud_plateformes_du_compte : son coffre et ses annonces relevées) n'est fermée ; s'il n'y en a pas, la suivante quand
-- même (les autres plateformes tournent). Le reste de l'ordre est inchangé.
-- Gardes : les deux fonctions de prod relues le 20/11 (md5 100def96… et d4910c01…), sinon rien n'est changé.
-- Inverse : supabase/rollbacks/20261120200000_cloud_ip_plateformes_fermees_priorite_INVERSE.sql. Miroir : choisirIp.
DO $garde$
BEGIN
  IF (SELECT md5(pg_get_functiondef('public.cloud_ip_attribuer(uuid, text)'::regprocedure))) IS DISTINCT FROM '100def96467f086932e8dc1e7e2e8e7c'
     OR (SELECT md5(pg_get_functiondef('public.cloud_ip_reserver(uuid)'::regprocedure))) IS DISTINCT FROM 'd4910c017c371e12cb1695c2a761d854' THEN
    RAISE EXCEPTION 'cloud_ip_attribuer ou cloud_ip_reserver a changé depuis sa relecture du 20/11 : migration arrêtée, rien n''est modifié';
  END IF;
END
$garde$;

CREATE OR REPLACE FUNCTION public.cloud_plateformes_du_compte(p_user uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- (20/11/2026) Les plateformes qu'un compte utilise : son coffre Cloud (connectée ou non) et ses annonces relevées en ligne.
  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}'::text[]) FROM (
    SELECT c.plateforme AS x FROM public.cloud_coffre c WHERE c.user_id = p_user AND c.plateforme <> 'fillsell'
    UNION
    SELECT a.platform FROM public.annonces_plateforme a WHERE a.user_id = p_user AND a.disparu_le IS NULL
  ) t WHERE x IS NOT NULL;
$function$;
REVOKE ALL ON FUNCTION public.cloud_plateformes_du_compte(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cloud_ip_attribuer(p_user uuid, p_nature text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- (19/11/2026 soir, 20261119230000, décision de Nico) Seulement une IP contrôlée juste avant
-- (cloud_ip_controlee_avant_attribution) — la sienne au repos comme une disponible ; sinon NULL : l'orchestrateur contrôle
-- l'IP suivante, le compte attend « une place se prépare ».
-- (20/11/2026 18:09, 20261120200000) Après sa réservation : d'abord une IP où aucune de SES plateformes n'est fermée.
DECLARE
  v_ip bigint;
  v_retour boolean := false;
  v_controle_le text;
  v_pf text[] := public.cloud_plateformes_du_compte(p_user);
BEGIN
  IF p_user IS NULL OR p_nature NOT IN ('essai', 'client') THEN RAISE EXCEPTION 'cloud_ip_attribuer : appel invalide'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cloud_ip:' || p_user::text, 0));
  SELECT id INTO v_ip FROM public.cloud_ips WHERE user_id = p_user;
  IF v_ip IS NOT NULL THEN RETURN v_ip; END IF;
  SELECT id INTO v_ip FROM public.cloud_ips i
   WHERE i.etat = 'repos' AND i.dernier_user_id = p_user AND public.cloud_ip_attribuable(i, p_user, p_nature)
     AND public.cloud_ip_controlee_avant_attribution(i)
   ORDER BY i.liberee_le DESC LIMIT 1 FOR UPDATE SKIP LOCKED;
  v_retour := v_ip IS NOT NULL;
  IF v_ip IS NULL THEN
    SELECT id INTO v_ip FROM public.cloud_ips i
     WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, p_user, p_nature)
       AND public.cloud_ip_controlee_avant_attribution(i)
     ORDER BY (i.reserve_pour = p_user) DESC NULLS LAST,
              (COALESCE(i.sante -> 'plateformes_fermees', '[]'::jsonb) ?| COALESCE(v_pf, '{}'::text[])),
              public.cloud_ip_refus_prouve(i.refus),
              public.cloud_ip_rang_operateur(i.sante), (i.refus = '{}'::jsonb) DESC,
              i.expire_le, i.attributions, i.id
     LIMIT 1 FOR UPDATE SKIP LOCKED;
  END IF;
  IF v_ip IS NULL THEN RETURN NULL; END IF;
  SELECT sante ->> 'saine_le' INTO v_controle_le FROM public.cloud_ips WHERE id = v_ip;
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
          jsonb_build_object('nature', p_nature, 'controle_le', v_controle_le));
  RETURN v_ip;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cloud_ip_reserver(p_user uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- (19/11/2026 soir, 20261119230000) D'abord une IP contrôlée juste avant (cloud_ip_controlee_avant_attribution) : au
-- paiement, l'attribution la prend sans attendre un contrôle. Rien d'autre ne change.
-- (20/11/2026 18:09, 20261120200000) Après sa réservation : d'abord une IP où aucune de SES plateformes n'est fermée.
DECLARE v_ip bigint; v_pf text[];
BEGIN
  IF p_user IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cloud_ip:' || p_user::text, 0));
  SELECT id INTO v_ip FROM public.cloud_ips WHERE user_id = p_user;
  IF v_ip IS NOT NULL THEN RETURN v_ip; END IF;
  SELECT id INTO v_ip FROM public.cloud_ips i
   WHERE i.etat = 'repos' AND i.dernier_user_id = p_user AND public.cloud_ip_attribuable(i, p_user, 'essai')
   ORDER BY i.liberee_le DESC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_ip IS NOT NULL THEN RETURN v_ip; END IF;   -- la sienne : rien à réserver, personne d'autre ne la prend
  v_pf := public.cloud_plateformes_du_compte(p_user);
  SELECT id INTO v_ip FROM public.cloud_ips i
   WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, p_user, 'essai')
   ORDER BY (i.reserve_pour = p_user) DESC NULLS LAST,
            (COALESCE(i.sante -> 'plateformes_fermees', '[]'::jsonb) ?| COALESCE(v_pf, '{}'::text[])),
            public.cloud_ip_controlee_avant_attribution(i) DESC,
            public.cloud_ip_refus_prouve(i.refus),
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
