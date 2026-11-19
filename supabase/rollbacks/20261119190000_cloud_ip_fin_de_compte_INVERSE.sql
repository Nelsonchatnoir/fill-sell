-- INVERSE de 20261119190000_cloud_ip_fin_de_compte : les corps de PROD du 19/11 (relus par pg_get_functiondef, md5
-- cloud_compte_synchroniser_pool 1714a0018cd818e2fb2ba5077bf111e9, cloud_pool_entretien c914c95ed3f11c1dc4715aa482844fef, cloud_vente_etat 80f7ff7f67a9d39e4655d311102dc137, cloud_essai_preparer_moi cf96cdc12218d4e34dd33b4056ac75ed), remis tels quels ; la fonction neuve
-- cloud_ip_titulaires() retirée (l'orchestrateur la lit sans s'en servir si elle manque : le plan renouvelle alors comme avant).
SET lock_timeout = '5s';

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
$function$;

CREATE OR REPLACE FUNCTION public.cloud_pool_entretien()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_mois integer := public.cloud_param('empreintes_conservation_mois', 12);
  v_synchro integer := 0; v_expirees integer := 0; v_incidents integer := 0; v_empreintes integer;
  v_reservations integer; r record; v_s jsonb;
BEGIN
  -- a. réservations échues
  UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_jusqu_au < now();
  GET DIAGNOSTICS v_reservations = ROW_COUNT;
  -- b. chaque compte qui tient une IP, ou qui devrait en tenir une, suit son état
  --    (grâce écoulée, option arrêtée, compte supprimé, déclencheur avalé, client sans place)
  FOR r IN SELECT user_id FROM public.cloud_ips WHERE user_id IS NOT NULL
           UNION SELECT p.id FROM public.profiles p
                  WHERE (p.is_cloud IS TRUE OR (p.cloud_essai_fin > now() AND p.cloud_essai_arrete IS NOT TRUE))
                    AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.user_id = p.id) LOOP
    v_s := public.cloud_compte_synchroniser(r.user_id);
    IF v_s ->> 'action' <> 'rien' THEN v_synchro := v_synchro + 1; END IF;
  END LOOP;
  -- c. échéances passées. Libre : fin normale. Tenue : INCIDENT (le renouvellement a raté).
  FOR r IN SELECT id, user_id, etat, secret_nom FROM public.cloud_ips
            WHERE etat <> 'expiree' AND expire_le <= now() FOR UPDATE LOOP
    UPDATE public.cloud_ips SET etat = 'expiree', user_id = NULL, reserve_pour = NULL, reserve_jusqu_au = NULL, maj_le = now()
     WHERE id = r.id;
    DELETE FROM vault.secrets WHERE name = r.secret_nom;   -- plus d'identifiants pour une IP morte
    PERFORM public.cloud_journal(r.id, CASE WHEN r.user_id IS NULL THEN 'expiration' ELSE 'incident' END, r.user_id,
            jsonb_build_object('etat_avant', r.etat));
    v_expirees := v_expirees + 1;
    IF r.user_id IS NOT NULL THEN
      v_incidents := v_incidents + 1;
      PERFORM public.cloud_compte_synchroniser(r.user_id);   -- une autre IP, s'il en reste
    END IF;
  END LOOP;
  -- d. RGPD et ménage
  DELETE FROM public.cloud_essai_empreintes WHERE conserver_jusqu_au < now();
  GET DIAGNOSTICS v_empreintes = ROW_COUNT;
  UPDATE public.cloud_ip_evenements SET user_id = NULL WHERE user_id IS NOT NULL AND le < now() - make_interval(months => v_mois);
  UPDATE public.cloud_ips SET dernier_user_id = NULL
   WHERE dernier_user_id IS NOT NULL AND user_id IS NULL AND liberee_le < now() - make_interval(months => v_mois);
  DELETE FROM public.cloud_essai_demandes WHERE demande_le < now() - interval '7 days';
  DELETE FROM public.cloud_attente WHERE derniere_le < now() - interval '30 days';
  DELETE FROM public.cloud_connexions WHERE ouverte_le < now() - interval '90 days';
  RETURN jsonb_build_object('reservations_echues', v_reservations, 'synchronises', v_synchro, 'expirees', v_expirees,
                            'incidents', v_incidents, 'empreintes_purgees', v_empreintes);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cloud_vente_etat(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rotation boolean := public.cloud_param('ip_rotation', 0) = 1;
  v_trouve boolean;
  v_debut timestamptz;
  v_nature text;
  v_libres integer := 0;
  v_sa_resa boolean;
  v_inscrit timestamptz;
  v_tenues integer;
  v_devant integer;
  v_places integer;
  v_ip boolean;
  v_serveur integer;
  v_sienne boolean;
  v_ips integer;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('vente_possible', false, 'raison', 'compte_inconnu'); END IF;
  SELECT true, p.cloud_essai_debut INTO v_trouve, v_debut FROM public.profiles p WHERE p.id = p_user;
  IF v_trouve IS NOT TRUE THEN RETURN jsonb_build_object('vente_possible', false, 'raison', 'compte_inconnu'); END IF;
  IF public.cloud_voie_attendue(p_user) THEN
    RETURN jsonb_build_object('vente_possible', false, 'raison', 'deja_client');
  END IF;
  v_nature := CASE WHEN v_debut IS NULL THEN 'essai' ELSE 'client' END;
  -- 1. La place serveur (chantier A). Fonction absente = capacité inconnue = pas de vente.
  IF to_regprocedure('public.cloud_places_libres()') IS NOT NULL THEN
    v_libres := COALESCE(public.cloud_places_libres(), 0);
  END IF;
  -- Sa propre réservation d'IP (préparation en cours) est déjà retirée des places libres : elle lui revient.
  v_sa_resa := EXISTS (SELECT 1 FROM public.cloud_ips i
                        WHERE i.reserve_pour = p_user AND i.reserve_jusqu_au > now() AND i.user_id IS NULL);
  SELECT a.inscrit_le INTO v_inscrit FROM public.cloud_attente a WHERE a.user_id = p_user;
  -- Les places gardées 24 h aux inscrits prévenus (sans réservation d'IP : sinon déjà comptées).
  SELECT count(*)::int INTO v_tenues FROM public.cloud_attente a
   WHERE a.user_id <> p_user AND a.inscrit_le IS NOT NULL AND a.notifie_le > now() - interval '24 hours'
     AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.reserve_pour = a.user_id AND i.reserve_jusqu_au > now());
  -- La file : les inscrits pas encore prévenus passent avant (tous, pour un compte qui n'est pas inscrit).
  SELECT count(*)::int INTO v_devant FROM public.cloud_attente a
   WHERE a.user_id <> p_user AND a.inscrit_le IS NOT NULL AND a.notifie_le IS NULL
     AND (v_inscrit IS NULL OR a.inscrit_le < v_inscrit);
  v_serveur := v_libres + (CASE WHEN v_sa_resa THEN 1 ELSE 0 END);
  -- (07/11, feu vert de Nico) Les IP attribuables : places = LEAST(serveur, IP). Sa propre IP (attribuée, ou au repos
  -- pour lui) ne prend rien au pool ; en rotation, l'IP ne borne rien.
  v_sienne := EXISTS (SELECT 1 FROM public.cloud_ips i
                       WHERE i.user_id = p_user
                          OR (i.etat = 'repos' AND public.cloud_ip_attribuable(i, p_user, v_nature)));
  IF v_rotation OR v_sienne THEN
    v_ips := v_serveur;
  ELSE
    SELECT count(*)::int INTO v_ips FROM public.cloud_ips i
     WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, p_user, v_nature);
  END IF;
  v_places := LEAST(v_serveur, v_ips) - v_tenues - v_devant;
  -- 2. L'IP : la sienne, sa réservation, une IP au repos qui lui revient, ou une libre attribuable (rotation : toujours).
  v_ip := v_rotation OR EXISTS (
    SELECT 1 FROM public.cloud_ips i
     WHERE i.user_id = p_user
        OR (i.reserve_pour = p_user AND i.reserve_jusqu_au > now())
        OR (i.etat IN ('disponible', 'repos') AND public.cloud_ip_attribuable(i, p_user, v_nature)));
  RETURN jsonb_build_object(
    'vente_possible', v_places > 0 AND v_ip,
    'raison', CASE WHEN v_places <= 0 THEN 'complet' WHEN NOT v_ip THEN 'pool_vide' ELSE NULL END,
    'places', GREATEST(v_places, 0),
    'ip', v_ip,
    'nature', v_nature);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cloud_essai_preparer_moi(p_appareil text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_trouve boolean; v_cloud boolean; v_debut timestamptz;
  v_h_app text; v_raison text; v_permis boolean := true; v_ip bigint;
  v_comptes jsonb := '[]'::jsonb; c record; v_h text;
  v_rotation boolean := public.cloud_param('ip_rotation', 0) = 1;
  v_vente jsonb;
BEGIN
  SELECT true, p.is_cloud, p.cloud_essai_debut INTO v_trouve, v_cloud, v_debut FROM public.profiles p WHERE p.id = v_user;
  IF v_trouve IS NOT TRUE THEN RETURN jsonb_build_object('ok', false, 'raison', 'compte_inconnu'); END IF;
  IF v_cloud IS TRUE THEN RETURN jsonb_build_object('ok', false, 'raison', 'deja_client'); END IF;
  -- (03/11, point 5) La PLACE SERVEUR d'abord (et la file d'attente) : sans elle, rien ne démarre.
  v_vente := public.cloud_vente_etat(v_user);
  IF v_vente ->> 'raison' = 'complet' THEN
    INSERT INTO public.cloud_attente AS a (user_id) VALUES (v_user)
    ON CONFLICT (user_id) DO UPDATE SET derniere_le = now(), essais = a.essais + 1;
    RETURN jsonb_build_object('ok', false, 'raison', 'complet',
      'inscrit', EXISTS (SELECT 1 FROM public.cloud_attente WHERE user_id = v_user AND inscrit_le IS NOT NULL));
  END IF;
  -- La place d'abord : sans IP, rien ne démarre (ni essai, ni paiement) — sauf en rotation (30/10, lot D).
  IF NOT v_rotation THEN
    v_ip := public.cloud_ip_reserver(v_user);
    IF v_ip IS NULL THEN
      INSERT INTO public.cloud_attente AS a (user_id) VALUES (v_user)
      ON CONFLICT (user_id) DO UPDATE SET derniere_le = now(), essais = a.essais + 1;
      RETURN jsonb_build_object('ok', false, 'raison', 'pool_vide',
        'inscrit', EXISTS (SELECT 1 FROM public.cloud_attente WHERE user_id = v_user AND inscrit_le IS NOT NULL));
    END IF;
  END IF;
  DELETE FROM public.cloud_attente WHERE user_id = v_user;
  -- Les verrous de l'ESSAI (l'option, elle, reste possible).
  IF v_debut IS NOT NULL THEN
    v_permis := false; v_raison := 'essai_deja_pris';
  ELSIF COALESCE(btrim(p_appareil), '') = '' THEN
    v_permis := false; v_raison := 'appareil_inconnu';
  ELSE
    v_h_app := public.cloud_hacher('appareil', p_appareil);
    IF EXISTS (SELECT 1 FROM public.cloud_essai_empreintes WHERE nature = 'appareil' AND empreinte = v_h_app
                 AND user_id IS DISTINCT FROM v_user) THEN
      v_permis := false; v_raison := 'appareil_deja_vu';
    END IF;
  END IF;
  -- Les comptes Vinted que l'extension de CE compte a déjà relevés (au plus 10).
  FOR c IN SELECT DISTINCT r.vinted_user_id::text AS ident FROM public.vinted_sync_runs r
            WHERE r.user_id = v_user AND r.vinted_user_id IS NOT NULL LIMIT 10 LOOP
    v_h := public.cloud_hacher('vinted', c.ident);
    CONTINUE WHEN v_h IS NULL;
    v_comptes := v_comptes || jsonb_build_object('plateforme', 'vinted', 'h', v_h);
    IF v_permis AND EXISTS (SELECT 1 FROM public.cloud_essai_empreintes WHERE nature = 'compte_plateforme' AND empreinte = v_h
                              AND user_id IS DISTINCT FROM v_user) THEN
      v_permis := false; v_raison := 'compte_plateforme_deja_vu';
    END IF;
  END LOOP;
  INSERT INTO public.cloud_essai_demandes (user_id, appareil_h, comptes_h, essai_permis, raison)
  VALUES (v_user, v_h_app, v_comptes, v_permis, v_raison)
  ON CONFLICT (user_id) DO UPDATE SET appareil_h = EXCLUDED.appareil_h, comptes_h = EXCLUDED.comptes_h,
    essai_permis = EXCLUDED.essai_permis, raison = EXCLUDED.raison, demande_le = now();
  RETURN jsonb_build_object('ok', true, 'essai', v_permis, 'raison', v_raison,
    'place_jusqu_au', CASE WHEN v_ip IS NULL THEN NULL ELSE (SELECT reserve_jusqu_au FROM public.cloud_ips WHERE id = v_ip) END);
END;
$function$;

DROP FUNCTION IF EXISTS public.cloud_ip_titulaires();
DROP FUNCTION IF EXISTS public.cloud_ip_remplacee(bigint, inet, integer, text);
-- La nature « remplacement » retirée du journal ; NOT VALID : les lignes déjà écrites restent (aucun historique effacé).
ALTER TABLE public.cloud_ip_evenements DROP CONSTRAINT cloud_ip_evenements_nature_check;
ALTER TABLE public.cloud_ip_evenements ADD CONSTRAINT cloud_ip_evenements_nature_check CHECK ((nature = ANY (ARRAY['achat'::text, 'controle_entree'::text, 'reservation'::text, 'attribution'::text, 'retour_meme_compte'::text, 'conversion'::text, 'liberation'::text, 'purge'::text, 'sortie_repos'::text, 'signalement'::text, 'rebut'::text, 'renouvellement'::text, 'identifiants_changes'::text, 'expiration'::text, 'incident'::text, 'refus'::text, 'refus_leve'::text, 'refus_prouve'::text, 'visite_controle'::text, 'depense'::text, 'quarantaine'::text, 'sortie_quarantaine'::text]))) NOT VALID;
