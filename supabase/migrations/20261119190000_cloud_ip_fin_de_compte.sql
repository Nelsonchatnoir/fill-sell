-- 20261119190000_cloud_ip_fin_de_compte — L'IP D'UN COMPTE FINI REVIENT AU STOCK SANS GARDE INUTILE, UNE IP PAR COMPTE,
-- LA VENTE DIT « UNE PLACE SE PRÉPARE » (19/11/2026, demande de Nico : « tout nettoyer et rendre la règle propre, aucune IP
-- payée en trop » ; décision 1 du 19/11 midi : raison de vente à part quand il manque une IP, feu vert pour la migration).
-- PRÉPARÉE, NON APPLIQUÉE : `npx supabase db query --linked -f` puis `migration repair`, par le coordinateur. Jamais `db push`.
--
-- Constat (prod, lu en lecture seule le 19/11 11:46 → 12:07) :
--  · IP 2 (b695d990) et IP 4 (d0ac0538), essais finis le 17/11 vers 11:50, postes éteints : restées tenues 48 h par la GRÂCE
--    de cloud_compte_synchroniser_pool (coin_config cloud_grace_jours absent = 2 jours après cloud_essai_fin), parties au
--    repos à l'entretien de 12:07:18 (chemin normal). La grâce sert au 1er paiement qui peut encore arriver ; elle gardait
--    AUSSI l'IP des essais dont la personne avait coupé le renouvellement (le 19/11 : 43, 78, 83, 84 — 2 jours chacun) ;
--  · IP 39, 2e IP du compte de Nico, réservée le 04/11 jusqu'à son échéance (scripts/reparations/
--    20261104_cloud_essai_gpu_reserve_39_nico.sql) alors que le compte tient la 42 : rien ne lève une réservation qui court ;
--  · la vente disait « complet » quand les serveurs avaient des places mais qu'aucune IP n'était encore prête.
--
-- RÈGLES :
--  1. cloud_compte_synchroniser_pool — la grâce d'un essai fini (décision de Nico du 19/11 : « pas de grâce pour un essai
--     déjà annulé ni pour un compte payé puis résilié » ; rien d'autre ne change) :
--     · AUCUNE si l'essai a été arrêté (cloud_essai_arrete, comme avant) ou son renouvellement coupé (cloud_arret_fin_periode
--       vrai — Apple et Google le gardent après l'expiration ; Stripe tant que l'abonnement vit) ;
--     · AUCUNE si l'IP a été convertie (« attribuee_client ») : le compte a payé puis s'est arrêté (résilié, remboursé,
--       impayé — règle du 03/11 : un impayé arrête le Cloud) — b695d990 le 17/11 ;
--     · Stripe, IP jamais convertie : Stripe passe l'abonnement « active » à la fin même de l'essai (b695d990 : conversion à
--       11:52:19 = trial_end, paiement à 12:53) ; un essai Stripe non converti a été annulé (Stripe remet
--       cloud_arret_fin_periode à faux en le terminant : cloud-option.js, miseAJourProfilDepuisStripe) — sauf message en
--       retard : coin_config cloud_grace_stripe_heures (absent = 2 heures) ;
--     · sinon (essai Apple ou Google non coupé qui attend son 1er paiement) : cloud_grace_jours (absent = 2 jours).
--  2. cloud_pool_entretien — un compte qui TIENT une IP n'a aucune réservation ailleurs : levée au passage suivant, dite au
--     journal (cloud_ip_evenements, nature « reservation », details.levee) — la 39 revient au pool seule.
--  3. cloud_ip_titulaires() (neuve, service_role seulement) — pour le plan de renouvellement (cloud-pool.js, planDuJour) :
--     par IP attribuée, le compte est-il actif, et sa FIN CONNUE (inactif : maintenant ; renouvellement coupé : fin de la
--     période payée, ou fin d'essai ; sinon NULL = il continue).
--  4. cloud_vente_etat — places serveur libres mais aucune IP prête : raison « ip_en_preparation » (plus « complet ») ;
--     cloud_essai_preparer_moi l'inscrit à la liste d'attente comme « complet » et rend la même raison.
--  5. cloud_ip_remplacee() (neuve, service_role seulement) + nature « remplacement » au journal : une adresse REMPLACÉE par
--     IPRoyal dans la même commande (remplacement gratuit des IP 80, 81, 82 accordé le 19/11) — l'IP libre reçoit la nouvelle
--     adresse et ses identifiants, sa santé est effacée, elle repasse le contrôle d'entrée puis la santé. Avant : rien ne
--     relisait l'adresse d'une commande livrée (la base gardait l'ancienne, l'IP restait « grillée » jusqu'à son échéance).
-- Inchangés : repos 7 jours, purge prouvée, contrôle de sortie, attribution, réservation de 30 min, couverture d'une IP
-- d'essai (7 + cloud_grace_jours + 1 jours).
--
-- Gardes : les corps de PROD relus le 19/11 ~12:00 (md5 ci-dessous) ; ailleurs, la migration s'arrête.
-- Banc jetable : PREUVE_PG=embarque node scripts/essais/20261119190000_banc.mjs.
-- Inverse : supabase/rollbacks/20261119190000_cloud_ip_fin_de_compte_INVERSE.sql.

SET lock_timeout = '5s';

DO $garde$
BEGIN
  IF md5(pg_get_functiondef('public.cloud_compte_synchroniser_pool(uuid)'::regprocedure)) <> '1714a0018cd818e2fb2ba5077bf111e9'
     AND pg_get_functiondef('public.cloud_compte_synchroniser_pool(uuid)'::regprocedure) NOT LIKE '%20261119190000%' THEN
    RAISE EXCEPTION 'cloud_compte_synchroniser_pool a changé en prod depuis sa lecture du 19/11 : relire, jamais forcer';
  END IF;
  IF md5(pg_get_functiondef('public.cloud_pool_entretien()'::regprocedure)) <> 'c914c95ed3f11c1dc4715aa482844fef'
     AND pg_get_functiondef('public.cloud_pool_entretien()'::regprocedure) NOT LIKE '%20261119190000%' THEN
    RAISE EXCEPTION 'cloud_pool_entretien a changé en prod depuis sa lecture du 19/11 : relire, jamais forcer';
  END IF;
  IF md5(pg_get_functiondef('public.cloud_vente_etat(uuid)'::regprocedure)) <> '80f7ff7f67a9d39e4655d311102dc137'
     AND pg_get_functiondef('public.cloud_vente_etat(uuid)'::regprocedure) NOT LIKE '%20261119190000%' THEN
    RAISE EXCEPTION 'cloud_vente_etat a changé en prod depuis sa lecture du 19/11 : relire, jamais forcer';
  END IF;
  IF md5(pg_get_functiondef('public.cloud_essai_preparer_moi(text)'::regprocedure)) <> 'cf96cdc12218d4e34dd33b4056ac75ed'
     AND pg_get_functiondef('public.cloud_essai_preparer_moi(text)'::regprocedure) NOT LIKE '%20261119190000%' THEN
    RAISE EXCEPTION 'cloud_essai_preparer_moi a changé en prod depuis sa lecture du 19/11 : relire, jamais forcer';
  END IF;
END
$garde$;

CREATE OR REPLACE FUNCTION public.cloud_compte_synchroniser_pool(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- (19/11/2026, 20261119190000) La grâce d'un essai fini ne garde l'IP que si un 1er paiement peut encore arriver :
-- aucune si l'essai est arrêté ou son renouvellement coupé ; Stripe sans conversion : cloud_grace_stripe_heures (2 h) ;
-- sinon cloud_grace_jours (2 jours).
DECLARE
  v_e jsonb := public.cloud_etat(p_user);
  v_etat text := v_e ->> 'etat';
  v_actif boolean := COALESCE((v_e ->> 'actif')::boolean, false);
  v_ip public.cloud_ips%ROWTYPE;
  v_id bigint;
  v_arret boolean;
  v_canal text;
  v_grace interval;
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
  IF v_etat = 'essai_termine' AND COALESCE((v_e ->> 'essaiArrete')::boolean, false) IS NOT TRUE THEN
    SELECT p.cloud_arret_fin_periode IS TRUE, p.cloud_canal INTO v_arret, v_canal FROM public.profiles p WHERE p.id = p_user;
    v_grace := CASE
      -- renouvellement coupé (Apple, Google : gardé après l'expiration ; Stripe : tant que l'abonnement vit) : aucun paiement à attendre
      WHEN v_arret IS TRUE THEN NULL
      -- IP convertie (« attribuee_client ») : le compte a payé puis s'est arrêté (résilié, remboursé, impayé — règle du
      -- 03/11 : un impayé arrête le Cloud) : un client, aucune grâce (décision de Nico du 19/11)
      WHEN v_ip.etat = 'attribuee_client' THEN NULL
      -- Stripe convertit à la fin même de l'essai (abonnement « active ») : une IP jamais convertie = essai annulé,
      -- sauf message en retard
      WHEN v_canal = 'stripe' THEN make_interval(hours => public.cloud_param('grace_stripe_heures', 2))
      -- essai de boutique (Apple, Google) non coupé, en attente de son 1er paiement (notification en retard, relance)
      ELSE make_interval(days => public.cloud_param('grace_jours', 2)) END;
    IF v_grace IS NOT NULL AND public.cloud_ts(v_e ->> 'essaiFin') + v_grace > now() THEN
      RETURN jsonb_build_object('etat', v_etat, 'action', 'grace', 'ip', v_ip.id);
    END IF;
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
  v_reservations integer; r record; v_s jsonb; v_levees integer := 0;
BEGIN
  -- a. réservations échues
  UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_jusqu_au < now();
  GET DIAGNOSTICS v_reservations = ROW_COUNT;
  -- a bis. (19/11/2026, 20261119190000) Un compte qui TIENT une IP n'a aucune réservation ailleurs (une IP par compte) :
  --        levée, dite au journal (la 39, réservée au compte de Nico qui tient la 42, revient au pool).
  FOR r IN SELECT i.id, i.reserve_pour FROM public.cloud_ips i
            WHERE i.reserve_pour IS NOT NULL
              AND EXISTS (SELECT 1 FROM public.cloud_ips t WHERE t.user_id = i.reserve_pour AND t.id <> i.id)
            FOR UPDATE OF i LOOP
    UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL, maj_le = now() WHERE id = r.id;
    PERFORM public.cloud_journal(r.id, 'reservation', r.reserve_pour, jsonb_build_object('levee', 'titulaire_d_une_autre_ip'));
    v_levees := v_levees + 1;
  END LOOP;
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
  RETURN jsonb_build_object('reservations_echues', v_reservations, 'reservations_levees', v_levees, 'synchronises', v_synchro, 'expirees', v_expirees,
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
    -- (19/11/2026, 20261119190000, décision 1 de Nico) Le serveur a des places mais aucune IP n'est encore prête : la
    -- place se prépare (achat / contrôle d'entrée en cours) — jamais « complet ».
    'raison', CASE WHEN v_places <= 0 THEN
                     CASE WHEN NOT v_rotation AND NOT v_sienne AND v_serveur - v_tenues - v_devant > 0
                          THEN 'ip_en_preparation' ELSE 'complet' END
                   WHEN NOT v_ip THEN 'pool_vide' ELSE NULL END,
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
  -- (19/11/2026, 20261119190000) « ip_en_preparation » (places serveur, IP pas encore prête) : la liste d'attente aussi.
  IF v_vente ->> 'raison' IN ('complet', 'ip_en_preparation') THEN
    INSERT INTO public.cloud_attente AS a (user_id) VALUES (v_user)
    ON CONFLICT (user_id) DO UPDATE SET derniere_le = now(), essais = a.essais + 1;
    RETURN jsonb_build_object('ok', false, 'raison', v_vente ->> 'raison',
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

CREATE OR REPLACE FUNCTION public.cloud_ip_titulaires()
 RETURNS TABLE(ip_id bigint, etat_cloud text, actif boolean, fin_connue timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- (19/11/2026, 20261119190000) Pour le plan de renouvellement (cloud-pool.js, planDuJour) : par IP attribuée, le compte
  -- est-il actif, et sa FIN CONNUE — inactif : maintenant ; renouvellement coupé : fin de la période payée (client) ou
  -- fin d'essai (essai) ; sinon NULL (aucune fin connue : il continue, l'IP se renouvelle).
  SELECT i.id, x.e ->> 'etat', COALESCE((x.e ->> 'actif')::boolean, false),
         CASE
           WHEN COALESCE((x.e ->> 'actif')::boolean, false) IS NOT TRUE THEN now()
           WHEN p.cloud_arret_fin_periode IS NOT TRUE THEN NULL
           WHEN x.e ->> 'etat' = 'paye' THEN p.cloud_periode_fin
           ELSE p.cloud_essai_fin END
    FROM public.cloud_ips i
    LEFT JOIN public.profiles p ON p.id = i.user_id
    CROSS JOIN LATERAL (SELECT public.cloud_etat(i.user_id) AS e) x
   WHERE i.user_id IS NOT NULL AND i.etat IN ('attribuee_essai', 'attribuee_client');
$function$;

REVOKE ALL ON FUNCTION public.cloud_ip_titulaires() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_ip_titulaires() TO service_role;

-- 5. (19/11/2026) LE REMPLACEMENT D'UNE ADRESSE PAR IPRoyal dans la même commande (remplacement gratuit d'une IP défectueuse :
--    80, 81, 82 le 19/11) : le journal connaît la nature « remplacement ».
DO $nature$
BEGIN
  IF pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'cloud_ip_evenements_nature_check'
                            AND conrelid = 'public.cloud_ip_evenements'::regclass)) NOT LIKE '%''remplacement''%'
     AND pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'cloud_ip_evenements_nature_check'
                            AND conrelid = 'public.cloud_ip_evenements'::regclass))
         <> $$CHECK ((nature = ANY (ARRAY['achat'::text, 'controle_entree'::text, 'reservation'::text, 'attribution'::text, 'retour_meme_compte'::text, 'conversion'::text, 'liberation'::text, 'purge'::text, 'sortie_repos'::text, 'signalement'::text, 'rebut'::text, 'renouvellement'::text, 'identifiants_changes'::text, 'expiration'::text, 'incident'::text, 'refus'::text, 'refus_leve'::text, 'refus_prouve'::text, 'visite_controle'::text, 'depense'::text, 'quarantaine'::text, 'sortie_quarantaine'::text])))$$ THEN
    RAISE EXCEPTION 'cloud_ip_evenements_nature_check a changé en prod depuis sa lecture du 19/11 : relire, jamais forcer';
  END IF;
END
$nature$;
ALTER TABLE public.cloud_ip_evenements DROP CONSTRAINT cloud_ip_evenements_nature_check;
ALTER TABLE public.cloud_ip_evenements ADD CONSTRAINT cloud_ip_evenements_nature_check CHECK ((nature = ANY (ARRAY['achat'::text,
  'controle_entree'::text, 'reservation'::text, 'attribution'::text, 'retour_meme_compte'::text, 'conversion'::text, 'liberation'::text,
  'purge'::text, 'sortie_repos'::text, 'signalement'::text, 'rebut'::text, 'renouvellement'::text, 'identifiants_changes'::text,
  'expiration'::text, 'incident'::text, 'refus'::text, 'refus_leve'::text, 'refus_prouve'::text, 'visite_controle'::text, 'depense'::text,
  'quarantaine'::text, 'sortie_quarantaine'::text, 'remplacement'::text])));

-- cloud_ip_remplacee (neuve, service_role seulement) : une IP LIBRE (achetee, disponible, quarantaine, repos purgé) reçoit
-- la NOUVELLE adresse de sa commande, son port et ses identifiants (coffre) ; l'ancienne santé, les refus, la quarantaine, la
-- réservation et l'historique de repos sont effacés (ils parlaient de l'ancienne adresse) ; elle repart « achetee » : le
-- contrôle d'entrée la rend disponible, puis le contrôle de santé la juge — jamais attribuée avant. Refusé : une IP tenue par
-- un compte (jamais changée seule : l'orchestrateur alerte), un repos pas encore purgé, la même adresse, une adresse déjà au
-- pool. Appelée par l'orchestrateur (approvisionnement.js, relireCommandes) à la relecture horaire des commandes IPRoyal.
CREATE OR REPLACE FUNCTION public.cloud_ip_remplacee(p_ip bigint, p_nouvelle inet, p_port integer, p_proxy_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- (19/11/2026, 20261119190000) Le remplacement d'une adresse par IPRoyal dans la même commande.
DECLARE
  v public.cloud_ips%ROWTYPE;
  v_secret uuid;
BEGIN
  IF p_ip IS NULL OR p_nouvelle IS NULL OR COALESCE(p_proxy_url, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'appel_invalide');
  END IF;
  SELECT * INTO v FROM public.cloud_ips WHERE id = p_ip FOR UPDATE;
  IF v.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'ip_inconnue'); END IF;
  IF v.user_id IS NOT NULL OR v.etat NOT IN ('achetee', 'disponible', 'quarantaine', 'repos') THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'pas_libre', 'etat', v.etat);
  END IF;
  IF v.etat = 'repos' AND v.purge_prouvee_le IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'purge_en_attente');   -- la purge de son dernier compte d'abord
  END IF;
  IF host(v.ip) = host(p_nouvelle) THEN RETURN jsonb_build_object('ok', false, 'raison', 'meme_adresse'); END IF;
  IF EXISTS (SELECT 1 FROM public.cloud_ips WHERE ip = p_nouvelle AND id <> p_ip AND etat <> 'expiree') THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'adresse_deja_au_pool');
  END IF;
  SELECT s.id INTO v_secret FROM vault.secrets s WHERE s.name = v.secret_nom;
  IF v_secret IS NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'secret_absent'); END IF;
  PERFORM vault.update_secret(v_secret, p_proxy_url);
  UPDATE public.cloud_ips
     SET ip = p_nouvelle, port = COALESCE(p_port, port), asn = NULL, etat = 'achetee', livree_le = now(),
         sante = NULL, refus = '{}'::jsonb, quarantaine = NULL, reserve_pour = NULL, reserve_jusqu_au = NULL,
         dernier_user_id = NULL, liberee_le = NULL, repos_fin = NULL, purge_preuve = NULL, purge_prouvee_le = NULL,
         attributions = COALESCE((SELECT sum(x.attributions) FROM public.cloud_ips x WHERE x.ip = p_nouvelle AND x.id <> p_ip), 0)::integer,
         maj_le = now()
   WHERE id = p_ip;
  PERFORM public.cloud_journal(p_ip, 'remplacement', NULL, jsonb_build_object('commande', v.commande,
          'ancienne', host(v.ip), 'nouvelle', host(p_nouvelle), 'etat_avant', v.etat,
          'sante_avant', v.sante ->> 'verdict', 'attributions_avant', v.attributions));
  RETURN jsonb_build_object('ok', true, 'ip', p_ip);
END;
$function$;

REVOKE ALL ON FUNCTION public.cloud_ip_remplacee(bigint, inet, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_ip_remplacee(bigint, inet, integer, text) TO service_role;
