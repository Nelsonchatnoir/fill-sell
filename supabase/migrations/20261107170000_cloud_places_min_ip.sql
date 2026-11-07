-- ═══════════════════════════════════════════════════════════════════════════
-- FillSell Cloud — LES PLACES = LE PLUS PETIT DES DEUX : places du serveur, IP libres (07/11/2026, FEU VERT NOMMÉ de Nico :
-- « places = min(places du serveur, IP libres) »).
--
-- Le défaut (lu en prod le 07/11) : cloud_vente_etat comptait les places du SERVEUR seules (14 sur cloud-2) alors que le
-- pool n'avait que 6 IP attribuables à un nouveau compte (7 disponibles, dont l'IP 39 réservée à Nico jusqu'au 03/12) :
-- le compteur « N places restantes » promettait 14 places, et la vente restait ouverte au-delà de la 6e IP (le paiement
-- était refusé plus loin, par cloud_essai_preparer_moi, faute d'IP — « pool_vide »). La liste d'attente, elle, offrait
-- déjà LEAST(places, IP) (cloud_attente_places_a_offrir) : les trois ne lisaient pas le même chiffre.
--
-- La règle, pour TOUS les comptes : places = LEAST(places du serveur, IP attribuables) − places gardées 24 h − file devant.
--   · places du serveur : cloud_places_libres() (+ 1 si le compte tient déjà une réservation d'IP : elle lui revient) ;
--   · IP attribuables : les IP « disponible » que cloud_ip_attribuable donne à CE compte pour SA nature (essai/client) —
--     la sienne réservée comprise ; un compte qui a déjà son IP (attribuée, ou au repos pour lui) n'en prend aucune au
--     pool : pour lui, seule la place serveur compte ; en rotation (cloud_ip_rotation = 1) : l'IP ne borne rien ;
--   · un inscrit prévenu (place gardée 24 h) et chaque inscrit devant lui prennent une place ET une IP.
-- Vente impossible dès que ce nombre tombe à 0 : raison « complet » → cloud_essai_preparer_moi inscrit sur la liste
-- d'attente et ne réserve rien (jamais un paiement sans place ET sans IP) ; le compteur de l'app affiche ce même nombre
-- (cloud_disponibilite_moi.places) ; la liste d'attente offre LEAST(places, IP) (inchangée). Quand l'entretien horaire
-- achète des IP (cloud_ip_achats_auto = 1 le jour de l'ouverture), chaque IP entrée au pool remonte ce nombre, jusqu'à la
-- limite du serveur.
--
-- Signature, retour et droits INCHANGÉS (CREATE OR REPLACE garde les GRANT). Écrite depuis pg_get_functiondef de la
-- prod du 07/11 (fixtures : scripts/essais/fixtures/prod-0711-places-min-ip/). Essai sur Postgres JETABLE :
-- scripts/essais/20261107170000_banc.mjs. Inverse : supabase/rollbacks/20261107170000_cloud_places_min_ip_INVERSE.sql.
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
