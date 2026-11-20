-- INVERSE de 20261120230000_cloud_essai_place_promise (20/11/2026 soir, bloc D de Nico) : les 5 fonctions telles que relues en
-- PROD le 20/11 à 21:00 (pg_get_functiondef ; md5 cloud_essai_preparer_moi 51608897…, cloud_essai_permis 36c9fd88…,
-- cloud_places_libres b172962f…, cloud_vente_etat 6af6915c…, cloud_attente_places_a_offrir aa323d97…), mot pour mot ; puis
-- cloud_ip_a_venir et cloud_promesses_en_cours retirées, puis la colonne cloud_essai_demandes.place_promise_jusqu_au.
-- Les corps sont rejoués par EXECUTE, fins de ligne NORMALISÉES : quatre sont en LF en prod (les CR que core.autocrlf mettrait
-- dans ce fichier sont retirés) ; celui de cloud_essai_permis a été créé en prod depuis un fichier Windows (CRLF à chaque ligne
-- de son corps) et les retrouve. Ainsi les md5 reviennent à l'octet, quelle que soit la fin de ligne de ce fichier.
-- Rejouable (IF EXISTS). Une place promise qui courait redevient une préparation sans place : le paiement redemande une
-- préparation (409 preparation_requise), comme avant. La clé coin_config cloud_ip_solde_cents (écrite par l'orchestrateur)
-- est laissée : plus rien ne la lit.
DO $inverse$
BEGIN
  -- cloud_essai_preparer_moi (corps de prod en LF)
  EXECUTE replace($corps$CREATE OR REPLACE FUNCTION public.cloud_essai_preparer_moi(p_appareil text)
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
$function$
$corps$, chr(13), '');
  -- cloud_vente_etat (corps de prod en LF)
  EXECUTE replace($corps$CREATE OR REPLACE FUNCTION public.cloud_vente_etat(p_user uuid)
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
$function$
$corps$, chr(13), '');
  -- cloud_attente_places_a_offrir (corps de prod en LF)
  EXECUTE replace($corps$CREATE OR REPLACE FUNCTION public.cloud_attente_places_a_offrir()
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
  -- (19/11/2026, 20261119200000, décision de Nico, point 5) Moins les comptes au Cloud ACTIF sans IP : leur place est due,
  -- personne n'est prévenu pour elle.
  RETURN GREATEST(LEAST(v_libres, v_ips) - v_tenues - public.cloud_actifs_sans_ip(NULL), 0);
END;
$function$
$corps$, chr(13), '');
  -- cloud_places_libres (corps de prod en LF)
  EXECUTE replace($corps$CREATE OR REPLACE FUNCTION public.cloud_places_libres()
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
$corps$, chr(13), '');
  -- cloud_essai_permis (corps de prod en CRLF)
  EXECUTE replace(replace($corps$CREATE OR REPLACE FUNCTION public.cloud_essai_permis(p_user uuid)
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
               AND EXISTS (SELECT 1 FROM public.cloud_ips i
                            WHERE i.user_id = x.id
                               OR (i.reserve_pour = x.id AND i.reserve_jusqu_au > now())
                               OR (i.etat = 'repos' AND i.dernier_user_id = x.id)))
    FROM (SELECT p_user AS id) x
    LEFT JOIN public.profiles p ON p.id = x.id
    LEFT JOIN public.cloud_essai_demandes d ON d.user_id = x.id;
$function$
$corps$, chr(13), ''), chr(10), chr(13) || chr(10));
END
$inverse$;
DROP FUNCTION IF EXISTS public.cloud_ip_a_venir();
DROP FUNCTION IF EXISTS public.cloud_promesses_en_cours(uuid);
ALTER TABLE public.cloud_essai_demandes DROP COLUMN IF EXISTS place_promise_jusqu_au;
