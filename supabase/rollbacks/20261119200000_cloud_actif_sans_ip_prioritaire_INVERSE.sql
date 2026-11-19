-- INVERSE de 20261119200000_cloud_actif_sans_ip_prioritaire : le déclencheur et les deux fonctions neuves retirés ;
-- cloud_vente_etat remise dans le corps posé par 20261119190000 (md5 77c880490edda8df4e8ddadc12e925a2 — jamais celui d'avant
-- 20261119190000 : l'inverse de 20261119190000 s'en charge) ; cloud_attente_places_a_offrir remise dans son corps de prod du
-- 19/11 (md5 047c92fb19ed1817b56fcc25033dbac3). Droits inchangés (CREATE OR REPLACE les garde).
SET lock_timeout = '5s';

DROP TRIGGER IF EXISTS cloud_ips_zz_servir_actif_sans_ip ON public.cloud_ips;
DROP FUNCTION IF EXISTS public.cloud_ips_servir_actif_sans_ip();

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
$function$;

DROP FUNCTION IF EXISTS public.cloud_actifs_sans_ip(uuid);
