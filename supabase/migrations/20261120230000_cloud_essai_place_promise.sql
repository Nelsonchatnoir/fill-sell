-- (20/11/2026 soir, BLOC D DE NICO) L'ESSAI CLOUD DÉMARRE TOUT DE SUITE QUAND UNE IP EST EN ROUTE — JAMAIS LA LISTE D'ATTENTE.
-- Avant : stock d'IP saines vide mais un achat IPRoyal standard en route (livré et contrôlé en quelques minutes) → la vente
-- disait « ip_en_preparation », la préparation inscrivait à la liste d'attente (cloud_attente) et le paiement refusait
-- (cloud_essai_permis.fraiche faux → 409 preparation_requise).
-- Règle : aucune IP réservable maintenant, MAIS le serveur a une place (cloud_places_libres, capacité tenue) ET une IP peut
-- VENIR (cloud_ip_a_venir : achat en route au registre, IP livrée au contrôle d'entrée « achetee » ou en « quarantaine »,
-- rachat automatique allumé avec un solde IPRoyal qui paie une IP) → la préparation pose une PLACE PROMISE
-- (cloud_essai_demandes.place_promise_jusqu_au = maintenant + cloud_reservation_min, 30 min) et répond
-- { ok: true, place: 'en_preparation' } — jamais d'inscription à cloud_attente dans ce cas. Le paiement l'accepte
-- (cloud_essai_permis.fraiche), la promesse compte comme une réservation (cloud_places_libres ; les IP libres vont d'abord
-- aux promesses des autres dans cloud_vente_etat et cloud_attente_places_a_offrir), la vente reste ouverte
-- (vente_possible : vrai, place : 'en_preparation'). Une fois l'essai démarré, tout existe déjà : compte actif sans IP
-- (cloud_actifs_sans_ip, achat sur demande de l'orchestrateur, contrôle d'abord pour lui, déclencheur
-- cloud_ips_zz_servir_actif_sans_ip → cloud_ip_attribuer dès le contrôle réussi).
-- Rien qui puisse venir : comme avant (« ip_en_preparation », liste d'attente). Capacité pleine : « complet », comme avant.
-- La règle du stock (max(6 ; 2 × pic d'attributions/jour sur 7 jours)) et la capacité de cloud-2 (40) ne changent pas.
-- Gardes : les 5 fonctions relues en PROD le 20/11 à 21:00 (pg_get_functiondef, md5 ci-dessous), sinon rien n'est changé.
-- Inverse : supabase/rollbacks/20261120230000_cloud_essai_place_promise_INVERSE.sql. Banc : scripts/bancs/place-promise-2011/banc.mjs.
DO $garde$
BEGIN
  IF (SELECT md5(pg_get_functiondef('public.cloud_essai_preparer_moi(text)'::regprocedure))) IS DISTINCT FROM '51608897cd01a66ab79faaa4894b9c23'
     OR (SELECT md5(pg_get_functiondef('public.cloud_essai_permis(uuid)'::regprocedure))) IS DISTINCT FROM '36c9fd88af13f4f109a5a6a806b45ab3'
     OR (SELECT md5(pg_get_functiondef('public.cloud_places_libres()'::regprocedure))) IS DISTINCT FROM 'b172962fee75ef0ce0865aacc83cde01'
     OR (SELECT md5(pg_get_functiondef('public.cloud_vente_etat(uuid)'::regprocedure))) IS DISTINCT FROM '6af6915c41c3a72174a32c5f70a68974'
     OR (SELECT md5(pg_get_functiondef('public.cloud_attente_places_a_offrir()'::regprocedure))) IS DISTINCT FROM 'aa323d97786cc80872611a70d65c2383' THEN
    RAISE EXCEPTION 'cloud_essai_preparer_moi, cloud_essai_permis, cloud_places_libres, cloud_vente_etat ou cloud_attente_places_a_offrir a changé depuis sa relecture du 20/11 : migration arrêtée, rien n''est modifié';
  END IF;
END
$garde$;

ALTER TABLE public.cloud_essai_demandes ADD COLUMN IF NOT EXISTS place_promise_jusqu_au timestamptz;
COMMENT ON COLUMN public.cloud_essai_demandes.place_promise_jusqu_au IS
  '(20/11/2026 soir, bloc D de Nico) Place PROMISE par la préparation quand aucune IP n''est réservable mais qu''une IP peut venir (cloud_ip_a_venir) : le paiement l''accepte jusqu''à cette heure ; elle compte comme une réservation.';

CREATE OR REPLACE FUNCTION public.cloud_promesses_en_cours(p_sauf uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- (20/11/2026 soir, bloc D de Nico, 20261120230000) Les PLACES PROMISES qui courent (cloud_essai_demandes.place_promise_jusqu_au) :
  -- un compte qui n'est pas encore au Cloud actif (une fois l'essai démarré, il compte dans cloud_actifs_sans_ip), sans IP
  -- attribuée ni réservation qui court (sinon déjà comptée). Rotation : aucune (l'IP ne borne rien).
  SELECT CASE WHEN public.cloud_param('ip_rotation', 0) = 1 THEN 0 ELSE (
    SELECT count(*)::int FROM public.cloud_essai_demandes d
      JOIN public.profiles p ON p.id = d.user_id
     WHERE d.place_promise_jusqu_au > now()
       AND d.user_id IS DISTINCT FROM p_sauf
       AND NOT COALESCE(p.is_cloud IS TRUE OR (p.cloud_essai_fin > now() AND p.cloud_essai_debut <= now() AND p.cloud_essai_arrete IS NOT TRUE), false)
       AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.user_id = d.user_id)
       AND NOT EXISTS (SELECT 1 FROM public.cloud_ips r WHERE r.reserve_pour = d.user_id AND r.reserve_jusqu_au > now())) END;
$function$;
REVOKE ALL ON FUNCTION public.cloud_promesses_en_cours(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cloud_ip_a_venir()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- (20/11/2026 soir, bloc D de Nico, 20261120230000) Les IP qui peuvent VENIR dans les minutes, sans rien changer au stock :
  --   · les achats EN ROUTE (registre cloud_ip_commandes : « demandee », « en_cours ») — la commande IPRoyal standard est
  --     livrée en quelques secondes, contrôlée, puis attribuée ;
  --   · les IP LIVRÉES pas encore entrées au pool (« achetee » : contrôle d'entrée à venir ; « quarantaine » : recontrôlée),
  --     pour un essai (même échéance et même nombre d'attributions que la garde du nombre), jamais une « grillee » ;
  --   · le RACHAT AUTOMATIQUE allumé (cloud_ip_achats_auto = 1) quand le dernier solde IPRoyal noté par l'orchestrateur
  --     (coin_config cloud_ip_solde_cents ; absent = inconnu = rien) paie au moins une IP au dernier prix du registre
  --     (5 $ sans registre) — au plus 10, le garde-fou des 24 h.
  -- Rotation : 0 (l'IP ne borne rien).
  WITH prix AS (
    SELECT COALESCE((SELECT round(c.prix_usd * 100 / c.quantite) FROM public.cloud_ip_commandes c
                      WHERE c.nature = 'achat' AND c.prix_usd > 0 AND c.quantite > 0 ORDER BY c.id DESC LIMIT 1), 500)::int AS cents)
  SELECT CASE WHEN public.cloud_param('ip_rotation', 0) = 1 THEN 0 ELSE
    (SELECT COALESCE(sum(c.quantite), 0) FROM public.cloud_ip_commandes c
      WHERE c.nature = 'achat' AND c.statut IN ('demandee', 'en_cours'))::int
    + (SELECT count(*) FROM public.cloud_ips i
        WHERE i.etat IN ('achetee', 'quarantaine')
          AND i.expire_le >= now() + make_interval(days => 7 + public.cloud_param('grace_jours', 2)
                                                    + public.cloud_param('marge_expiration_jours', 1))
          AND i.attributions < public.cloud_param('attributions_max', 6)
          AND COALESCE(i.sante ->> 'verdict', '') <> 'grillee')::int
    + (SELECT CASE WHEN public.cloud_param('ip_achats_auto', 0) = 1 AND public.cloud_param('ip_solde_cents', -1) >= x.cents
                   THEN LEAST(public.cloud_param('ip_solde_cents', -1) / GREATEST(x.cents, 1), 10) ELSE 0 END FROM prix x)
  END;
$function$;
REVOKE ALL ON FUNCTION public.cloud_ip_a_venir() FROM PUBLIC, anon, authenticated;

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
    - (SELECT count(*) FROM reserves)::int
    -- (20/11/2026 soir, bloc D de Nico, 20261120230000) Les places PROMISES comptent comme les réservations : la capacité reste tenue.
    - public.cloud_promesses_en_cours(NULL), 0);
$function$;

CREATE OR REPLACE FUNCTION public.cloud_essai_permis(p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'permis', CASE WHEN p.id IS NULL OR p.cloud_essai_debut IS NOT NULL OR d.user_id IS NULL THEN false ELSE d.essai_permis END,
    'raison', CASE WHEN p.id IS NULL THEN 'compte_inconnu'
                   WHEN p.cloud_essai_debut IS NOT NULL THEN 'essai_deja_pris'
                   WHEN d.user_id IS NULL THEN 'non_prepare'
                   ELSE d.raison END,
    'prepare', d.user_id IS NOT NULL,
    'fraiche', d.user_id IS NOT NULL AND d.demande_le > now() - interval '1 hour'
               AND (EXISTS (SELECT 1 FROM public.cloud_ips i
                             WHERE i.user_id = x.id
                                OR (i.reserve_pour = x.id AND i.reserve_jusqu_au > now())
                                OR (i.etat = 'repos' AND i.dernier_user_id = x.id))
                    -- (20/11/2026 soir, bloc D de Nico, 20261120230000) ou une place PROMISE qui court (une IP en route).
                    OR COALESCE(d.place_promise_jusqu_au > now(), false)))
    FROM (SELECT p_user AS id) x
    LEFT JOIN public.profiles p ON p.id = x.id
    LEFT JOIN public.cloud_essai_demandes d ON d.user_id = x.id;
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
  v_promesses integer;
  v_sa_promesse boolean;
  v_a_venir integer;
  v_places_a_venir integer;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('vente_possible', false, 'raison', 'compte_inconnu'); END IF;
  SELECT true, p.cloud_essai_debut INTO v_trouve, v_debut FROM public.profiles p WHERE p.id = p_user;
  IF v_trouve IS NOT TRUE THEN RETURN jsonb_build_object('vente_possible', false, 'raison', 'compte_inconnu'); END IF;
  IF public.cloud_voie_attendue(p_user) THEN
    -- (19/11/2026, 20261119200000, décision de Nico, point 5) Un compte DÉJÀ client : sa place est-elle prête (IP attribuée,
    -- ou rotation) ? Sinon l'app dit « ta place se prépare » — jamais une offre.
    RETURN jsonb_build_object('vente_possible', false, 'raison', 'deja_client',
      'place_prete', v_rotation OR EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.user_id = p_user));
  END IF;
  v_nature := CASE WHEN v_debut IS NULL THEN 'essai' ELSE 'client' END;
  -- 1. La place serveur (chantier A). Fonction absente = capacité inconnue = pas de vente.
  IF to_regprocedure('public.cloud_places_libres()') IS NOT NULL THEN
    v_libres := COALESCE(public.cloud_places_libres(), 0);
  END IF;
  -- Sa propre réservation d'IP (préparation en cours) est déjà retirée des places libres : elle lui revient.
  v_sa_resa := EXISTS (SELECT 1 FROM public.cloud_ips i
                        WHERE i.reserve_pour = p_user AND i.reserve_jusqu_au > now() AND i.user_id IS NULL);
  -- (20/11/2026 soir, bloc D de Nico, 20261120230000) Les places PROMISES des autres comptes comptent comme leurs réservations ;
  -- la sienne, retirée des places libres comme une réservation, lui revient.
  v_promesses := public.cloud_promesses_en_cours(p_user);
  v_sa_promesse := NOT v_sa_resa AND public.cloud_promesses_en_cours(NULL) > v_promesses;
  SELECT a.inscrit_le INTO v_inscrit FROM public.cloud_attente a WHERE a.user_id = p_user;
  -- Les places gardées 24 h aux inscrits prévenus (sans réservation d'IP : sinon déjà comptées).
  SELECT count(*)::int INTO v_tenues FROM public.cloud_attente a
   WHERE a.user_id <> p_user AND a.inscrit_le IS NOT NULL AND a.notifie_le > now() - interval '24 hours'
     AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i WHERE i.reserve_pour = a.user_id AND i.reserve_jusqu_au > now());
  -- La file : les inscrits pas encore prévenus passent avant (tous, pour un compte qui n'est pas inscrit).
  SELECT count(*)::int INTO v_devant FROM public.cloud_attente a
   WHERE a.user_id <> p_user AND a.inscrit_le IS NOT NULL AND a.notifie_le IS NULL
     AND (v_inscrit IS NULL OR a.inscrit_le < v_inscrit);
  -- (19/11/2026, 20261119200000, décision de Nico, point 5) Les comptes au Cloud ACTIF (payé, offert, essai) sans IP passent
  -- AVANT la file et la vente : leur place est due (cloud_actifs_sans_ip).
  v_devant := v_devant + public.cloud_actifs_sans_ip(p_user);
  v_serveur := v_libres + (CASE WHEN v_sa_resa THEN 1 ELSE 0 END) + (CASE WHEN v_sa_promesse THEN 1 ELSE 0 END);
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
    -- (20/11/2026 soir, bloc D) Les IP libres vont d'abord aux places promises des autres comptes.
    v_ips := v_ips - v_promesses;
  END IF;
  v_places := LEAST(v_serveur, v_ips) - v_tenues - v_devant;
  -- 2. L'IP : la sienne, sa réservation, une IP au repos qui lui revient, ou une libre attribuable (rotation : toujours).
  v_ip := v_rotation OR EXISTS (
    SELECT 1 FROM public.cloud_ips i
     WHERE i.user_id = p_user
        OR (i.reserve_pour = p_user AND i.reserve_jusqu_au > now())
        OR (i.etat IN ('disponible', 'repos') AND public.cloud_ip_attribuable(i, p_user, v_nature)));
  -- (20/11/2026 soir, BLOC D DE NICO) Aucune place à prendre MAINTENANT, mais le serveur en a une et une IP peut VENIR
  -- (cloud_ip_a_venir : achat en route, IP livrée au contrôle d'entrée ou en quarantaine, rachat automatique payable),
  -- en plus de celles déjà dues (inscrits prévenus, file, comptes actifs sans IP, promesses) : la vente reste OUVERTE et la
  -- préparation PROMET la place (« en_preparation ») — jamais la liste d'attente. Rien qui puisse venir, ou serveur plein :
  -- comme avant.
  IF v_places <= 0 AND NOT v_rotation AND NOT v_sienne THEN
    v_a_venir := public.cloud_ip_a_venir();
    IF v_a_venir > 0 THEN
      v_places_a_venir := LEAST(v_serveur, v_ips + v_a_venir) - v_tenues - v_devant;
    END IF;
  END IF;
  IF COALESCE(v_places_a_venir, 0) > 0 THEN
    RETURN jsonb_build_object(
      'vente_possible', true,
      'raison', NULL,
      'places', v_places_a_venir,
      'ip', v_ip,
      'nature', v_nature,
      'place', 'en_preparation');
  END IF;
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
    -- (20/11/2026 soir, bloc D de Nico, 20261120230000) Les IP libres vont d'abord aux places PROMISES : personne n'est prévenu
    -- pour elles (comme pour une IP réservée).
    v_ips := v_ips - public.cloud_promesses_en_cours(NULL);
  END IF;
  -- (19/11/2026, 20261119200000, décision de Nico, point 5) Moins les comptes au Cloud ACTIF sans IP : leur place est due,
  -- personne n'est prévenu pour elle.
  RETURN GREATEST(LEAST(v_libres, v_ips) - v_tenues - public.cloud_actifs_sans_ip(NULL), 0);
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
  v_promesse timestamptz;
BEGIN
  SELECT true, p.is_cloud, p.cloud_essai_debut INTO v_trouve, v_cloud, v_debut FROM public.profiles p WHERE p.id = v_user;
  IF v_trouve IS NOT TRUE THEN RETURN jsonb_build_object('ok', false, 'raison', 'compte_inconnu'); END IF;
  IF v_cloud IS TRUE THEN RETURN jsonb_build_object('ok', false, 'raison', 'deja_client'); END IF;
  -- (20/11/2026 soir, bloc D de Nico, 20261120230000) Une préparation à la fois : deux places promises ne comptent jamais
  -- sur la même IP à venir (la vente est lue après le verrou).
  PERFORM pg_advisory_xact_lock(hashtextextended('cloud_essai_preparer', 0));
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
  -- (20/11/2026 soir, BLOC D DE NICO) … sauf une place PROMISE : aucune IP réservable, une IP en route (la vente le dit,
  -- « en_preparation ») — l'essai démarre tout de suite, l'IP est attribuée dès sa livraison et son contrôle. Jamais la liste
  -- d'attente dans ce cas. La dernière IP prise entre la vente et la réservation : la vente relue décide.
  IF NOT v_rotation THEN
    IF v_vente ->> 'place' IS DISTINCT FROM 'en_preparation' THEN
      v_ip := public.cloud_ip_reserver(v_user);
    END IF;
    IF v_ip IS NULL AND (v_vente ->> 'place' = 'en_preparation'
                         OR public.cloud_vente_etat(v_user) ->> 'place' = 'en_preparation') THEN
      v_promesse := now() + make_interval(mins => public.cloud_param('reservation_min', 30));
    ELSIF v_ip IS NULL THEN
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
  -- (20/11/2026 soir, bloc D) La promesse est posée (ou effacée : une IP réservée, la rotation) avec la demande.
  INSERT INTO public.cloud_essai_demandes (user_id, appareil_h, comptes_h, essai_permis, raison, place_promise_jusqu_au)
  VALUES (v_user, v_h_app, v_comptes, v_permis, v_raison, v_promesse)
  ON CONFLICT (user_id) DO UPDATE SET appareil_h = EXCLUDED.appareil_h, comptes_h = EXCLUDED.comptes_h,
    essai_permis = EXCLUDED.essai_permis, raison = EXCLUDED.raison, demande_le = now(),
    place_promise_jusqu_au = EXCLUDED.place_promise_jusqu_au;
  RETURN jsonb_build_object('ok', true, 'essai', v_permis, 'raison', v_raison,
    'place_jusqu_au', CASE WHEN v_promesse IS NOT NULL THEN v_promesse
                           WHEN v_ip IS NULL THEN NULL ELSE (SELECT reserve_jusqu_au FROM public.cloud_ips WHERE id = v_ip) END)
    || CASE WHEN v_promesse IS NOT NULL THEN jsonb_build_object('place', 'en_preparation') ELSE '{}'::jsonb END;
END;
$function$;
