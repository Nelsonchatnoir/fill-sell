-- INVERSE de supabase/migrations/20261106200000_cloud_attribution_serveur_apte.sql (06/11/2026 soir).
-- Remet MOT POUR MOT les trois fonctions de la PROD relues le 06/11 vers 18:00 (pg_get_functiondef :
-- cloud_serveur_battre, cloud_places_libres, cloud_serveur_choisir), retire les trois fonctions de déclaration et la
-- colonne cloud_postes.serveur_origine (les origines notées sont perdues : les comptes restent où ils sont).
-- À lancer : npx supabase db query --linked -f <ce fichier>, sur ordre de Nico. Idempotent.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.cloud_serveur_battre(p_nom text, p_domaine text, p_ipv4 inet, p_capacite integer, p_ouverts integer, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_comptes int;
  v_cap int := GREATEST(COALESCE(p_capacite, 0), 0);
BEGIN
  IF p_nom IS NULL OR btrim(p_nom) = '' OR p_domaine IS NULL OR btrim(p_domaine) = '' THEN
    RAISE EXCEPTION 'cloud_serveur_battre : nom et domaine requis';
  END IF;
  SELECT count(*)::int INTO v_comptes
    FROM public.cloud_comptes_a_servir() c JOIN public.cloud_postes po ON po.user_id = c.user_id
   WHERE po.serveur = p_nom;
  INSERT INTO public.cloud_serveurs AS s (nom, domaine, ipv4, capacite, ouverts, comptes, etat, vu_le, details)
  VALUES (p_nom, p_domaine, p_ipv4, v_cap, GREATEST(COALESCE(p_ouverts, 0), 0), v_comptes, 'actif', now(), COALESCE(p_details, '{}'::jsonb))
  ON CONFLICT (nom) DO UPDATE SET
    domaine = EXCLUDED.domaine,
    ipv4 = COALESCE(EXCLUDED.ipv4, s.ipv4),
    capacite = EXCLUDED.capacite,
    ouverts = EXCLUDED.ouverts,
    comptes = EXCLUDED.comptes,
    etat = CASE WHEN s.etat = 'retire' THEN 'retire' ELSE 'actif' END,
    vu_le = now(),
    details = s.details || EXCLUDED.details;
  RETURN jsonb_build_object('comptes', v_comptes, 'places', GREATEST(v_cap - v_comptes, 0), 'places_libres', public.cloud_places_libres());
END;
$function$
;

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
               WHERE s.etat = 'actif' AND s.vu_le > now() - interval '5 minutes'), 0)::int
    - (SELECT count(*) FROM servis)::int
    - (SELECT count(*) FROM reserves)::int, 0);
$function$
;

CREATE OR REPLACE FUNCTION public.cloud_serveur_choisir(p_user uuid, p_servis uuid[] DEFAULT NULL::uuid[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_srv text;
  v_servis uuid[] := p_servis;
  v_choix text;
BEGIN
  IF p_user IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cloud_serveur_choisir'));
  SELECT po.serveur INTO v_srv FROM public.cloud_postes po WHERE po.user_id = p_user;
  -- Gardé : un serveur vivant (vu < 15 min), en création, ou INCONNU de la table (jamais volé avant son battement).
  IF v_srv IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.cloud_serveurs s
        WHERE s.nom = v_srv
          AND (s.etat = 'retire' OR (s.etat = 'actif' AND (s.vu_le IS NULL OR s.vu_le < now() - interval '15 minutes'))))
  THEN
    RETURN v_srv;
  END IF;
  IF v_servis IS NULL THEN
    SELECT array_agg(c.user_id) INTO v_servis FROM public.cloud_comptes_a_servir() c;
  END IF;
  -- Un compte qui n'est pas à servir n'est jamais attribué (il garde ce qu'il a).
  IF NOT (p_user = ANY (COALESCE(v_servis, '{}'::uuid[]))) THEN RETURN v_srv; END IF;
  SELECT s.nom INTO v_choix
    FROM public.cloud_serveurs s
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS pris FROM public.cloud_postes p2
       WHERE p2.serveur = s.nom AND p2.user_id <> p_user AND p2.user_id = ANY (v_servis)) x
   WHERE s.etat = 'actif' AND s.vu_le > now() - interval '5 minutes' AND s.capacite > x.pris
   ORDER BY s.capacite - x.pris DESC, s.nom
   LIMIT 1;
  IF v_choix IS NULL THEN RETURN NULL; END IF;   -- aucune place nulle part : pas servi (la vente l'a déjà refusé)
  INSERT INTO public.cloud_postes AS po (user_id, etat, serveur, details, maj_le)
  VALUES (p_user, 'eteint', v_choix, '{}'::jsonb, now())
  ON CONFLICT (user_id) DO UPDATE SET serveur = EXCLUDED.serveur, maj_le = now()
   WHERE po.serveur IS DISTINCT FROM EXCLUDED.serveur;
  RETURN v_choix;
END;
$function$
;

DROP FUNCTION IF EXISTS public.cloud_serveur_ne_peut_garder(public.cloud_serveurs, uuid);
DROP FUNCTION IF EXISTS public.cloud_serveur_peut_recevoir(public.cloud_serveurs, uuid);
DROP FUNCTION IF EXISTS public.cloud_serveur_admet(jsonb, uuid);
ALTER TABLE public.cloud_postes DROP COLUMN IF EXISTS serveur_origine;
