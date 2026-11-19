-- CORPS DE PROD du 19/11/2026 (pg_get_functiondef, lecture seule), recopiés à l'octet pour le banc jetable de
-- 20261119200000_cloud_actif_sans_ip_prioritaire (scripts/essais/20261119200000_banc.mjs). Jamais appliqué ailleurs.

-- cloud_param
CREATE OR REPLACE FUNCTION public.cloud_param(p_cle text, p_defaut integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((SELECT value FROM public.coin_config WHERE key = 'cloud_' || p_cle), p_defaut);
$function$
;

-- cloud_ts
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

-- cloud_journal
CREATE OR REPLACE FUNCTION public.cloud_journal(p_ip bigint, p_nature text, p_user uuid, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  INSERT INTO public.cloud_ip_evenements (ip_id, nature, user_id, details)
  VALUES (p_ip, p_nature, p_user, COALESCE(p_details, '{}'::jsonb));
$function$
;

-- cloud_ip_refus_prouve
CREATE OR REPLACE FUNCTION public.cloud_ip_refus_prouve(p_refus jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(jsonb_typeof(p_refus) = 'object'
         AND EXISTS (SELECT 1 FROM jsonb_each(p_refus) e WHERE (e.value ->> 'prouvee')::boolean IS TRUE), false);
$function$
;

-- cloud_ip_rang_operateur
CREATE OR REPLACE FUNCTION public.cloud_ip_rang_operateur(p_sante jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN jsonb_typeof(p_sante -> 'operateur' -> 'rang') = 'number'
               AND (p_sante -> 'operateur' ->> 'rang') IN ('0', '1', '2')
              THEN (p_sante -> 'operateur' ->> 'rang')::integer
              ELSE 1 END;
$function$
;

-- cloud_ip_attribuable
CREATE OR REPLACE FUNCTION public.cloud_ip_attribuable(p cloud_ips, p_user uuid, p_nature text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.expire_le >= CASE WHEN p_nature = 'essai'
                             THEN now() + make_interval(days => 7 + public.cloud_param('grace_jours', 2)
                                                              + public.cloud_param('marge_expiration_jours', 1))
                             ELSE now() + make_interval(days => public.cloud_param('renouvellement_avant_jours', 3)) END
     AND COALESCE(p.sante ->> 'verdict', '') <> 'grillee'
     AND CASE
           WHEN p.etat = 'repos' THEN p_user IS NOT NULL AND p.dernier_user_id = p_user
           WHEN p.etat = 'disponible' THEN p.attributions < public.cloud_param('attributions_max', 6)
                AND (p.reserve_pour IS NULL OR p.reserve_pour = p_user OR p.reserve_jusqu_au < now())
           ELSE false END;
$function$
;

-- cloud_etat
CREATE OR REPLACE FUNCTION public.cloud_etat(p_user uuid, p_maintenant timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- ⛔ MÊME VALEUR que CLOUD_EXIGE_UN_PALIER (palier.js), changée le même jour.
  c_exige_un_palier CONSTANT boolean := false;
  v_now timestamptz := date_trunc('milliseconds', p_maintenant);
  v_is_cloud boolean; v_debut timestamptz; v_fin timestamptz; v_arrete boolean;
  v_periode timestamptz; v_arret_fp boolean;
  v_business boolean; v_pro boolean; v_premium boolean; v_comped boolean;
  v_essai_pris boolean; v_en_cours boolean; v_paye boolean; v_avec_formule boolean; v_palier_ok boolean;
  v_base jsonb;
BEGIN
  SELECT p.is_cloud, date_trunc('milliseconds', p.cloud_essai_debut), date_trunc('milliseconds', p.cloud_essai_fin),
         p.cloud_essai_arrete, date_trunc('milliseconds', p.cloud_periode_fin), p.cloud_arret_fin_periode,
         p.is_business, p.is_pro, p.is_premium, p.is_comped
    INTO v_is_cloud, v_debut, v_fin, v_arrete, v_periode, v_arret_fp, v_business, v_pro, v_premium, v_comped
    FROM public.profiles p WHERE p.id = p_user;
  v_essai_pris := v_debut IS NOT NULL;
  -- un essai arrêté s'arrête TOUT DE SUITE, même si la fin n'a pas bougé
  v_en_cours := v_debut IS NOT NULL AND v_fin IS NOT NULL AND v_debut <= v_now AND v_now < v_fin AND v_arrete IS NOT TRUE;
  v_paye := v_is_cloud IS TRUE;
  v_avec_formule := (v_business IS TRUE OR v_pro IS TRUE OR v_premium IS TRUE OR v_comped IS TRUE);
  v_palier_ok := NOT c_exige_un_palier OR v_avec_formule;
  v_base := jsonb_build_object(
    'essaiPris', v_essai_pris,
    'essaiArrete', v_essai_pris AND v_arrete IS TRUE,
    'essaiFin', CASE WHEN v_fin IS NULL THEN NULL
                     ELSE to_char(v_fin AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
    'joursRestants', NULL,
    'avecFormule', v_avec_formule,
    'periodeFin', CASE WHEN v_paye AND v_periode IS NOT NULL
                       THEN to_char(v_periode AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
    'arretPrevuLe', CASE WHEN v_paye AND v_arret_fp IS TRUE AND v_periode IS NOT NULL
                         THEN to_char(v_periode AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END);
  IF (v_paye OR v_en_cours) AND NOT v_palier_ok THEN
    RETURN v_base || jsonb_build_object('etat', 'suspendu', 'actif', false);
  END IF;
  IF v_paye THEN
    RETURN v_base || jsonb_build_object('etat', 'paye', 'actif', true);
  END IF;
  IF v_en_cours THEN
    RETURN v_base || jsonb_build_object('etat', 'essai', 'actif', true,
      'joursRestants', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_fin - v_now)) / 86400)::integer));
  END IF;
  IF v_essai_pris AND (v_arrete IS TRUE OR (v_fin IS NOT NULL AND v_now >= v_fin)) THEN
    RETURN v_base || jsonb_build_object('etat', 'essai_termine', 'actif', false);
  END IF;
  RETURN v_base || jsonb_build_object('etat', 'aucun', 'actif', false);
END;
$function$
;

-- cloud_voie_attendue
CREATE OR REPLACE FUNCTION public.cloud_voie_attendue(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((public.cloud_etat(p_user) ->> 'actif')::boolean, false);
$function$
;

-- cloud_ip_attribuer
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
$function$
;

-- cloud_ip_reserver
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
$function$
;

-- cloud_ip_liberer
CREATE OR REPLACE FUNCTION public.cloud_ip_liberer(p_user uuid, p_raison text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ip bigint; v_etat text;
BEGIN
  UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_pour = p_user;
  SELECT id, etat INTO v_ip, v_etat FROM public.cloud_ips WHERE user_id = p_user FOR UPDATE;
  IF v_ip IS NULL THEN RETURN NULL; END IF;
  UPDATE public.cloud_ips
     SET etat = 'repos', user_id = NULL, liberee_le = now(),
         repos_fin = now() + make_interval(days => public.cloud_param('repos_jours', 7)),
         purge_preuve = NULL, purge_prouvee_le = NULL, maj_le = now()
   WHERE id = v_ip;
  PERFORM public.cloud_journal(v_ip, 'liberation', p_user, jsonb_build_object('raison', p_raison, 'etat_avant', v_etat));
  RETURN v_ip;
END;
$function$
;

-- cloud_compte_synchroniser
CREATE OR REPLACE FUNCTION public.cloud_compte_synchroniser(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_voie jsonb;
  v_pool jsonb;
BEGIN
  -- (03/11) Le drapeau du compte suit son état Cloud, tous canaux. Un échec ici ne bloque jamais l'IP.
  BEGIN
    v_voie := public.cloud_voie_appliquer(p_user);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'cloud_compte_synchroniser : drapeau du compte % : %', p_user, SQLERRM;
    v_voie := jsonb_build_object('ok', false, 'erreur', left(SQLERRM, 200));
  END;
  v_pool := public.cloud_compte_synchroniser_pool(p_user);
  RETURN COALESCE(v_pool, '{}'::jsonb) || jsonb_build_object('voie', v_voie);
END;
$function$
;

-- cloud_comptes_a_servir
CREATE OR REPLACE FUNCTION public.cloud_comptes_a_servir()
 RETURNS TABLE(user_id uuid, ip_id bigint, ip text, port integer, etat_cloud text, poste_etat text, session_fillsell_id uuid, plateformes_connectees text[], delai_sessions_min integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH t AS (
    SELECT i.user_id AS u, i.id AS ip_id, host(i.ip) AS ip, i.port, public.cloud_etat(i.user_id) AS e
      FROM public.cloud_ips i WHERE i.etat IN ('attribuee_essai', 'attribuee_client')
    UNION ALL
    -- (30/10, lot D) Rotation : les comptes actifs SANS IP attribuée, sortie choisie par l'orchestrateur.
    SELECT p.id, NULL::bigint, NULL::text, NULL::integer, public.cloud_etat(p.id)
      FROM public.profiles p
     WHERE public.cloud_param('ip_rotation', 0) = 1
       AND (p.is_cloud IS TRUE OR p.cloud_essai_debut IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i2 WHERE i2.user_id = p.id))
  SELECT t.u, t.ip_id, t.ip, t.port, t.e ->> 'etat', po.etat, po.session_fillsell_id,
         COALESCE((SELECT array_agg(c.plateforme ORDER BY c.plateforme) FROM public.cloud_coffre c
                    WHERE c.user_id = t.u AND c.connecte AND c.plateforme <> 'fillsell'), '{}'),
         NULLIF(public.cloud_param('delai_sessions_min', -1), -1)
    FROM t LEFT JOIN public.cloud_postes po ON po.user_id = t.u
   -- actif, ou essai fini pendant sa grâce (le navigateur peut finir ses jobs) ;
   -- un compte inactif hors grâce n'a déjà plus d'IP (cloud_compte_synchroniser).
   WHERE COALESCE((t.e ->> 'actif')::boolean, false) OR t.e ->> 'etat' = 'essai_termine';
$function$
;

-- cloud_places_libres
CREATE OR REPLACE FUNCTION public.cloud_places_libres()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH servis AS (SELECT c.user_id FROM public.cloud_comptes_a_servir() c),
       reserves AS (
         SELECT DISTINCT i.reserve_pour AS u FROM public.cloud_ips i
          WHERE i.reserve_pour IS NOT NULL AND i.reserve_jusqu_au > now()
            AND NOT EXISTS (SELECT 1 FROM servis s WHERE s.user_id = i.reserve_pour))
  SELECT GREATEST(
    COALESCE((SELECT sum(s.capacite) FROM public.cloud_serveurs s
               WHERE s.etat = 'actif' AND s.vu_le > now() - interval '5 minutes'
                 AND COALESCE(s.details -> 'service' ->> 'apte', '') = 'true'), 0)::int
    - (SELECT count(*) FROM servis)::int
    - (SELECT count(*) FROM reserves)::int, 0);
$function$
;

-- cloud_attente_places_a_offrir
CREATE OR REPLACE FUNCTION public.cloud_attente_places_a_offrir()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_libres integer := 0;
  v_tenues integer;
  v_ips integer;
BEGIN
  IF to_regprocedure('public.cloud_places_libres()') IS NOT NULL THEN
    v_libres := COALESCE(public.cloud_places_libres(), 0);
  END IF;
  SELECT count(*)::int INTO v_tenues FROM public.cloud_attente a
   WHERE a.inscrit_le IS NOT NULL AND a.notifie_le > now() - interval '24 hours'
     AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.reserve_pour = a.user_id AND i.reserve_jusqu_au > now());
  IF public.cloud_param('ip_rotation', 0) = 1 THEN
    v_ips := v_libres;
  ELSE
    SELECT count(*)::int INTO v_ips FROM public.cloud_ips i
     WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, NULL, 'essai');
  END IF;
  RETURN GREATEST(LEAST(v_libres, v_ips) - v_tenues, 0);
END;
$function$
;
