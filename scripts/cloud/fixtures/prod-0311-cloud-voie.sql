-- Fonctions de la PROD relues le 03/11/2026 par pg_get_functiondef (lecture seule), copiées telles quelles, pour
-- scripts/cloud/preuve-voie-place-attente.mjs (Postgres JETABLE). Jamais appliqué à une base réelle.
CREATE OR REPLACE FUNCTION public.cloud_param(p_cle text, p_defaut integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((SELECT value FROM public.coin_config WHERE key = 'cloud_' || p_cle), p_defaut);
$function$
;

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
     AND CASE
           WHEN p.etat = 'repos' THEN p_user IS NOT NULL AND p.dernier_user_id = p_user
           WHEN p.etat = 'disponible' THEN p.attributions < public.cloud_param('attributions_max', 6)
                AND (p.reserve_pour IS NULL OR p.reserve_pour = p_user OR p.reserve_jusqu_au < now())
           ELSE false END;
$function$
;

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
   ORDER BY (i.reserve_pour = p_user) DESC NULLS LAST, i.expire_le, i.attributions, i.id
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

CREATE OR REPLACE FUNCTION public.cloud_compte_synchroniser(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_e jsonb := public.cloud_etat(p_user);
  v_etat text := v_e ->> 'etat';
  v_actif boolean := COALESCE((v_e ->> 'actif')::boolean, false);
  v_ip public.cloud_ips%ROWTYPE;
  v_id bigint;
BEGIN
  SELECT * INTO v_ip FROM public.cloud_ips WHERE user_id = p_user;
  IF v_actif THEN
    IF v_ip.id IS NULL THEN
      -- (30/10, lot D) Rotation : rien à attribuer, l'orchestrateur choisit la sortie à chaque session.
      IF public.cloud_param('ip_rotation', 0) = 1 THEN
        IF v_etat = 'essai' THEN PERFORM public.cloud_empreintes_engager(p_user); END IF;
        DELETE FROM public.cloud_attente WHERE user_id = p_user;
        RETURN jsonb_build_object('etat', v_etat, 'action', 'rotation');
      END IF;
      v_id := public.cloud_ip_attribuer(p_user, CASE WHEN v_etat = 'paye' THEN 'client' ELSE 'essai' END);
      IF v_etat = 'essai' THEN PERFORM public.cloud_empreintes_engager(p_user); END IF;
      DELETE FROM public.cloud_attente WHERE user_id = p_user AND v_id IS NOT NULL;
      RETURN jsonb_build_object('etat', v_etat, 'action', CASE WHEN v_id IS NULL THEN 'sans_place' ELSE 'attribuee' END, 'ip', v_id);
    END IF;
    IF v_etat = 'paye' AND v_ip.etat = 'attribuee_essai' THEN
      UPDATE public.cloud_ips SET etat = 'attribuee_client', derniere_origine = 'client', maj_le = now() WHERE id = v_ip.id;
      PERFORM public.cloud_journal(v_ip.id, 'conversion', p_user, '{}'::jsonb);
      RETURN jsonb_build_object('etat', v_etat, 'action', 'convertie', 'ip', v_ip.id);
    END IF;
    RETURN jsonb_build_object('etat', v_etat, 'action', 'rien', 'ip', v_ip.id);
  END IF;
  IF v_ip.id IS NULL THEN RETURN jsonb_build_object('etat', v_etat, 'action', 'rien'); END IF;
  IF v_etat = 'essai_termine'
     AND COALESCE((v_e ->> 'essaiArrete')::boolean, false) IS NOT TRUE
     AND public.cloud_ts(v_e ->> 'essaiFin') + make_interval(days => public.cloud_param('grace_jours', 2)) > now() THEN
    RETURN jsonb_build_object('etat', v_etat, 'action', 'grace', 'ip', v_ip.id);
  END IF;
  v_id := public.cloud_ip_liberer(p_user, 'inactif:' || COALESCE(v_etat, '?'));
  RETURN jsonb_build_object('etat', v_etat, 'action', 'repos', 'ip', v_id);
END;
$function$
;

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
;

CREATE OR REPLACE FUNCTION public.platform_settings_fusionner(p_chemin text[], p_patch jsonb, p_supprimer text[] DEFAULT '{}'::text[], p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid   := auth.uid();
  v_user   uuid;
  v_chemin text[] := COALESCE(p_chemin, '{}');
  v_supp   text[] := COALESCE(p_supprimer, '{}');
  v_ps     jsonb;
  v_new    jsonb;
  v_cible  jsonb;
  v_i      int;
BEGIN
  -- Qui écrit : la personne connectée (jamais pour un autre compte), ou, sans
  -- session, la clé de service / l'administrateur pour le compte nommé.
  IF v_uid IS NOT NULL THEN
    IF p_user IS NOT NULL AND p_user <> v_uid THEN
      RAISE EXCEPTION 'platform_settings_fusionner : écriture refusée pour un autre compte'
        USING ERRCODE = '42501';
    END IF;
    v_user := v_uid;
  ELSE
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
      RAISE EXCEPTION 'platform_settings_fusionner : session requise' USING ERRCODE = '42501';
    END IF;
    v_user := p_user;
  END IF;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'platform_settings_fusionner : compte non précisé' USING ERRCODE = '22023';
  END IF;
  IF p_patch IS NULL AND cardinality(v_supp) = 0 THEN
    RAISE EXCEPTION 'platform_settings_fusionner : rien à écrire' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_chemin) = 0 AND p_patch IS NOT NULL AND jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'platform_settings_fusionner : à la racine, seul un objet se fusionne' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_chemin || v_supp) s WHERE s IS NULL OR s = '' OR position(',' IN s) > 0) THEN
    RAISE EXCEPTION 'platform_settings_fusionner : clé vide ou invalide' USING ERRCODE = '22023';
  END IF;

  SELECT platform_settings INTO v_ps FROM profiles WHERE id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform_settings_fusionner : profil introuvable' USING ERRCODE = 'P0002';
  END IF;
  v_ps  := CASE WHEN jsonb_typeof(v_ps) = 'object' THEN v_ps ELSE '{}'::jsonb END;
  v_new := v_ps;

  -- Les parents manquants deviennent des objets vides. Un parent qui existe
  -- mais n'est PAS un objet : on refuse (le remplacer détruirait sa valeur).
  FOR v_i IN 1 .. cardinality(v_chemin) - 1 LOOP
    IF v_new #> v_chemin[1:v_i] IS NULL THEN
      v_new := jsonb_set(v_new, v_chemin[1:v_i], '{}'::jsonb, true);
    ELSIF jsonb_typeof(v_new #> v_chemin[1:v_i]) <> 'object' THEN
      RAISE EXCEPTION 'platform_settings_fusionner : « % » n''est pas un objet', array_to_string(v_chemin[1:v_i], '.')
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_cible := CASE WHEN cardinality(v_chemin) = 0 THEN v_new ELSE v_new #> v_chemin END;
  IF p_patch IS NOT NULL THEN
    IF jsonb_typeof(p_patch) = 'object' AND (v_cible IS NULL OR jsonb_typeof(v_cible) = 'object') THEN
      v_cible := COALESCE(v_cible, '{}'::jsonb) || p_patch;
    ELSE
      v_cible := p_patch;
    END IF;
  END IF;
  IF cardinality(v_supp) > 0 AND jsonb_typeof(v_cible) = 'object' THEN
    v_cible := v_cible - v_supp;
  END IF;

  IF cardinality(v_chemin) = 0 THEN
    v_new := v_cible;
  ELSIF v_cible IS NOT NULL THEN
    v_new := jsonb_set(v_new, v_chemin, v_cible, true);
  END IF;

  IF v_new IS DISTINCT FROM v_ps THEN
    -- Les suppressions DEMANDÉES, et elles seules, passent la garde.
    PERFORM set_config('fillsell.ps_suppression',
      COALESCE((SELECT string_agg(array_to_string(v_chemin || s, '.'), ',') FROM unnest(v_supp) s), ''), true);
    UPDATE profiles SET platform_settings = v_new WHERE id = v_user;
    PERFORM set_config('fillsell.ps_suppression', '', true);
  END IF;
  RETURN v_new;
END;
$function$
;

CREATE TRIGGER profiles_cloud_pool AFTER UPDATE OF is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete ON public.profiles FOR EACH ROW WHEN (((old.is_cloud IS DISTINCT FROM new.is_cloud) OR (old.cloud_essai_debut IS DISTINCT FROM new.cloud_essai_debut) OR (old.cloud_essai_fin IS DISTINCT FROM new.cloud_essai_fin) OR (old.cloud_essai_arrete IS DISTINCT FROM new.cloud_essai_arrete))) EXECUTE FUNCTION profiles_cloud_pool();
