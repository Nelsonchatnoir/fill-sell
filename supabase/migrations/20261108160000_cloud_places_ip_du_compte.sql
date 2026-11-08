-- ═══════════════════════════════════════════════════════════════════════════
-- FillSell Cloud — « N PLACES RESTANTES » VRAI POUR UN COMPTE QUI A DÉJÀ SON IP (08/11/2026, point 3 de Nico)
-- PRÉPARÉE, NON APPLIQUÉE : feu vert NOMMÉ de Nico requis. Essai jetable :
--   PREUVE_PG=embarque node scripts/essais/20261108160000_banc.mjs
-- Constat (08/11, 14:53, prod) : un compte ordinaire voit 5 places (LEAST(14 serveur, 5 IP)) ; un compte qui a DÉJÀ une IP
-- à lui (attribuée, ou au repos qui lui revient — Nicotest, IP 2) en voyait 14 : sa propre IP faisait sauter la borne
-- des IP (v_ips := v_serveur). Désormais : les IP libres attribuables + la sienne (une place de plus, pour lui seul).
-- Rotation : inchangée (l'IP ne borne rien). Corps parti de pg_get_functiondef EN PROD le 08/11 (fixture
-- scripts/essais/fixtures/prod-0811-places-ip-compte/cloud_vente_etat.sql, md5 80f7ff7f67…) : seul le bloc v_ips change.
-- Lu par cloud_disponibilite_moi (compteur de l'app), cloud_essai_preparer_moi (vente) : aucun autre changement.
-- INVERSE : supabase/rollbacks/20261108160000_cloud_places_ip_du_compte_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════

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
  -- (08/11, point 3 de Nico : « 14 places restantes » quand 5 seulement pouvaient être servies) Sa propre IP compte UNE
  -- place de plus, pour lui seul — jamais toutes les places du serveur : places = LEAST(serveur, IP libres + la sienne).
  IF v_rotation THEN
    v_ips := v_serveur;
  ELSE
    SELECT count(*)::int INTO v_ips FROM public.cloud_ips i
     WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, p_user, v_nature);
    IF v_sienne THEN v_ips := v_ips + 1; END IF;
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
