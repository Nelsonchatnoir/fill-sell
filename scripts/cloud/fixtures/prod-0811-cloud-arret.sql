-- Corps de PROD relus le 08/11/2026 (pg_get_functiondef / pg_get_triggerdef, lecture seule) : le chemin de l'ARRÊT du Cloud
-- (profil écrit → déclencheurs → drapeau cloud_voie, IP au repos, comptes servis). Utilisé par scripts/cloud/preuve-resiliation-mails.mjs.
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

CREATE OR REPLACE FUNCTION public.cloud_compte_synchroniser_pool(p_user uuid)
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

CREATE OR REPLACE FUNCTION public.cloud_comptes_du_serveur(p_serveur text)
 RETURNS TABLE(user_id uuid, ip_id bigint, ip text, port integer, etat_cloud text, poste_etat text, session_fillsell_id uuid, plateformes_connectees text[], delai_sessions_min integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_servis uuid[];
  v_u uuid;
BEGIN
  IF p_serveur IS NULL OR btrim(p_serveur) = '' THEN RETURN; END IF;
  SELECT array_agg(c.user_id) INTO v_servis FROM public.cloud_comptes_a_servir() c;
  FOREACH v_u IN ARRAY COALESCE(v_servis, '{}'::uuid[]) LOOP
    PERFORM public.cloud_serveur_choisir(v_u, v_servis);
  END LOOP;
  RETURN QUERY
    SELECT c.user_id, c.ip_id, c.ip, c.port, c.etat_cloud, c.poste_etat, c.session_fillsell_id, c.plateformes_connectees, c.delai_sessions_min
      FROM public.cloud_comptes_a_servir() c
      JOIN public.cloud_postes po ON po.user_id = c.user_id
     WHERE po.serveur = p_serveur;
END;
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

CREATE OR REPLACE FUNCTION public.cloud_param(p_cle text, p_defaut integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((SELECT value FROM public.coin_config WHERE key = 'cloud_' || p_cle), p_defaut);
$function$
;

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

CREATE OR REPLACE FUNCTION public.cloud_voie_appliquer(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_avant boolean;
  v_ps jsonb;
  v_attendue boolean;
  v_taches integer := 0;
  v_etats integer := 0;
  v_pf text;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'compte_inconnu'); END IF;
  SELECT p.cloud_voie, p.platform_settings INTO v_avant, v_ps FROM public.profiles p WHERE p.id = p_user;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'raison', 'compte_inconnu'); END IF;
  v_attendue := public.cloud_voie_attendue(p_user);
  IF v_avant IS NOT DISTINCT FROM v_attendue THEN
    RETURN jsonb_build_object('ok', true, 'change', false, 'cloud_voie', v_attendue);
  END IF;
  UPDATE public.profiles SET cloud_voie = v_attendue WHERE id = p_user AND cloud_voie IS DISTINCT FROM v_attendue;
  IF v_attendue IS FALSE THEN
    -- Les tâches en attente : plus rien du Cloud ne les retient (la marque et SON message seulement ; un autre
    -- message reste). get-pending-jobs les sert à l'ordinateur dès son prochain poll.
    UPDATE public.cross_post_jobs j
       SET error = CASE WHEN j.error IS NOT DISTINCT FROM (j.platform_fields -> 'attente_verification_cloud' ->> 'message')
                        THEN NULL ELSE j.error END,
           platform_fields = j.platform_fields - 'attente_verification_cloud'
     WHERE j.user_id = p_user AND j.status = 'pending' AND j.platform_fields ? 'attente_verification_cloud';
    GET DIAGNOSTICS v_taches = ROW_COUNT;
    -- « Résoudre la vérification » du Cloud n'a plus de sens : l'état part (lu par l'app seulement).
    FOREACH v_pf IN ARRAY ARRAY['vinted', 'leboncoin', 'beebs', 'depop'] LOOP
      IF jsonb_typeof(v_ps -> v_pf) = 'object' AND (v_ps -> v_pf) ? 'cloud_verification' THEN
        BEGIN
          PERFORM public.platform_settings_fusionner(ARRAY[v_pf], NULL, ARRAY['cloud_verification'], p_user);
          v_etats := v_etats + 1;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'cloud_voie_appliquer : compte % : état de vérification % non retiré : %', p_user, v_pf, SQLERRM;
        END;
      END IF;
    END LOOP;
  END IF;
  RAISE LOG 'cloud_voie_appliquer : compte % : cloud_voie % → % (tâches rendues : %, vérifications retirées : %)',
    p_user, v_avant, v_attendue, v_taches, v_etats;
  RETURN jsonb_build_object('ok', true, 'change', true, 'cloud_voie', v_attendue,
    'taches_rendues', v_taches, 'verifications_retirees', v_etats);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cloud_voie_attendue(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((public.cloud_etat(p_user) ->> 'actif')::boolean, false);
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

CREATE OR REPLACE FUNCTION public.profiles_cloud_ref_close()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c public.cloud_refs_closes%ROWTYPE;
  v_now timestamptz := now();
  v_demande jsonb;
BEGIN
  -- Seule la référence que la mise à jour POSE compte : une référence nouvelle passe toujours.
  SELECT * INTO c FROM public.cloud_refs_closes WHERE ref = NEW.cloud_ref;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NOT (
       (NEW.is_cloud IS TRUE AND OLD.is_cloud IS DISTINCT FROM TRUE)
    OR (NEW.cloud_periode_fin > v_now AND NEW.cloud_periode_fin IS DISTINCT FROM OLD.cloud_periode_fin)
    OR (NEW.cloud_essai_fin > v_now
        AND (NEW.cloud_essai_debut, NEW.cloud_essai_fin) IS DISTINCT FROM (OLD.cloud_essai_debut, OLD.cloud_essai_fin))
    OR (OLD.cloud_essai_arrete IS TRUE AND NEW.cloud_essai_arrete IS NOT TRUE)
  ) THEN
    RETURN NEW;   -- rien ne se rallume (un « off », une annulation d'essai…) : la mise à jour passe telle quelle
  END IF;
  v_demande := jsonb_build_object('is_cloud', NEW.is_cloud, 'cloud_canal', NEW.cloud_canal, 'cloud_ref', NEW.cloud_ref,
    'cloud_periode_fin', NEW.cloud_periode_fin, 'cloud_essai_debut', NEW.cloud_essai_debut, 'cloud_essai_fin', NEW.cloud_essai_fin,
    'cloud_essai_arrete', NEW.cloud_essai_arrete, 'cloud_arret_fin_periode', NEW.cloud_arret_fin_periode);
  NEW.is_cloud                := OLD.is_cloud;
  NEW.cloud_canal             := OLD.cloud_canal;
  NEW.cloud_ref               := OLD.cloud_ref;
  NEW.cloud_periode_fin       := OLD.cloud_periode_fin;
  NEW.cloud_essai_debut       := OLD.cloud_essai_debut;
  NEW.cloud_essai_fin         := OLD.cloud_essai_fin;
  NEW.cloud_essai_arrete      := OLD.cloud_essai_arrete;
  NEW.cloud_arret_fin_periode := OLD.cloud_arret_fin_periode;
  RAISE LOG 'profiles_cloud_ref_close : compte % : référence close % (%) — rallumage du Cloud neutralisé, demandé : %',
    NEW.id, c.ref, c.canal, v_demande;
  IF c.canal IN ('apple', 'google') THEN
    BEGIN
      INSERT INTO public.stores_notifications_journal (canal, type, effet, connu, effet_applique, user_id,
                                                        transaction_originale, motif, detail)
      VALUES (c.canal, 'CLOUD_REF_CLOSE', 'cloud_ref_close', true, 'rallumage_neutralise', NEW.id, c.ref,
              'ref_close', jsonb_build_object('raison', c.raison, 'close_le', c.close_le, 'close_par', c.par,
                'user_de_la_close', c.user_id, 'demande', v_demande, 'role', current_user));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'profiles_cloud_ref_close : journal non écrit (compte %, référence %) : %', NEW.id, c.ref, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE TRIGGER profiles_cloud_pool AFTER UPDATE OF is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete ON public.profiles FOR EACH ROW WHEN (((old.is_cloud IS DISTINCT FROM new.is_cloud) OR (old.cloud_essai_debut IS DISTINCT FROM new.cloud_essai_debut) OR (old.cloud_essai_fin IS DISTINCT FROM new.cloud_essai_fin) OR (old.cloud_essai_arrete IS DISTINCT FROM new.cloud_essai_arrete))) EXECUTE FUNCTION profiles_cloud_pool();
CREATE TRIGGER profiles_zz_cloud_ref_close BEFORE UPDATE OF is_cloud, cloud_canal, cloud_ref, cloud_periode_fin, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete, cloud_arret_fin_periode ON public.profiles FOR EACH ROW WHEN (((new.cloud_ref IS NOT NULL) AND ((((((((old.is_cloud IS DISTINCT FROM new.is_cloud) OR (old.cloud_canal IS DISTINCT FROM new.cloud_canal)) OR (old.cloud_ref IS DISTINCT FROM new.cloud_ref)) OR (old.cloud_periode_fin IS DISTINCT FROM new.cloud_periode_fin)) OR (old.cloud_essai_debut IS DISTINCT FROM new.cloud_essai_debut)) OR (old.cloud_essai_fin IS DISTINCT FROM new.cloud_essai_fin)) OR (old.cloud_essai_arrete IS DISTINCT FROM new.cloud_essai_arrete)) OR (old.cloud_arret_fin_periode IS DISTINCT FROM new.cloud_arret_fin_periode)))) EXECUTE FUNCTION profiles_cloud_ref_close();
