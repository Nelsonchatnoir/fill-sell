-- ═══════════════════════════════════════════════════════════════════════════
-- FillSell Cloud — L'ATTRIBUTION D'UN COMPTE À UN SERVEUR, CORRIGÉE À LA RACINE (06/11/2026 soir, ordre de Nico)
-- PRÉPARÉE, NON APPLIQUÉE (06/11 soir) : feu vert NOMMÉ de Nico requis, après relecture du SQL complet ; ordre et moment : docs/cloud/REPRISE.md, bloc « 07/11 MATIN ».
--
-- Le piège (lu le 06/11 dans cloud_serveur_choisir, migration 20261103201000) : quand le serveur d'un compte ne bat plus
-- depuis 15 min, le compte part au serveur vivant le plus libre, QUEL QU'IL SOIT — le 06/11, cloud-1 (Chromium sans
-- puce, rendu SwiftShader que DataDome bloque, COMPTES_AUTORISES fermé : il ne sert personne) — et il y RESTE tant que
-- ce serveur bat. Règle de Nico : « un compte ne doit JAMAIS être attribué à un serveur incapable de le servir (pas de
-- puce, rendu bloqué, capacité pleine…), et un compte basculé doit revenir sur son serveur dès qu'il rebat » — pour
-- TOUS les serveurs, pas seulement en retirant cloud-1.
--
--   · Chaque orchestrateur DÉCLARE à chaque battement ce qu'il peut servir (details.service, serveur-cloud/src/flotte.js
--     serviceDuServeur) : apte (Chrome officiel, puce, rendu réel LU dans un navigateur), incapable (sans Chrome
--     officiel, sans puce, rendu logiciel), comptes (« tous » ou sa liste COMPTES_AUTORISES). cloud_serveur_battre
--     REMPLACE cette clé à chaque battement (un orchestrateur qui ne la déclare plus redevient « non apte »).
--   · cloud_serveur_choisir : un compte n'est attribué QU'À un serveur vivant (< 5 min), apte, qui l'admet, avec une
--     place ; un serveur sans déclaration (ancien orchestrateur) n'en reçoit AUCUN. Le serveur d'origine d'un compte
--     basculé est retenu (cloud_postes.serveur_origine) : le compte y revient dès que ce serveur rebat, apte, avec une
--     place — jamais au milieu d'une tâche « processing ». Un compte reste sur son serveur tant que celui-ci vit et
--     n'est pas incapable pour lui ; s'il n'y a nulle part où aller, il ne bouge pas (jamais vers un serveur incapable).
--   · cloud_places_libres : seules les places des serveurs vivants ET aptes comptent (cloud-1 en offrait 7 fantômes).
--     Signature FIXE (cloud_vente_etat, cloud_attente_places_a_offrir, cloud_serveur_battre la lisent).
--
-- Ordre de mise en service : l'orchestrateur qui déclare (déploiement « orchestrateur seul ») AVANT cette migration ;
-- dans l'autre ordre rien ne casse (aucun compte déplacé, aucune vente tant qu'aucun serveur n'est apte : fermé).
-- Corps réécrits depuis pg_get_functiondef de la PROD (06/11 18:00), seules les règles ci-dessus changent.
-- Aucune ligne inchangée réécrite. Inverse : supabase/rollbacks/20261106200000_cloud_attribution_serveur_apte_INVERSE.sql.
-- Idempotente. db push INTERDIT.
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.cloud_postes ADD COLUMN IF NOT EXISTS serveur_origine text;
COMMENT ON COLUMN public.cloud_postes.serveur_origine IS
  'Serveur d''origine d''un compte basculé ailleurs (son serveur ne battait plus, ou ne pouvait plus le servir) : il y revient dès que ce serveur rebat, apte, avec une place (cloud_serveur_choisir, 06/11).';

-- ── Ce qu'un serveur a déclaré (pures, sur la ligne de cloud_serveurs) ──────────
CREATE OR REPLACE FUNCTION public.cloud_serveur_admet(p_details jsonb, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_details -> 'service' -> 'comptes' = '"tous"'::jsonb THEN true
    WHEN jsonb_typeof(p_details -> 'service' -> 'comptes') = 'array' THEN (p_details -> 'service' -> 'comptes') ? p_user::text
    ELSE false END;
$function$;

-- Peut RECEVOIR ce compte : vivant (< 5 min), actif, apte déclaré, l'admet. (La place se compte à part.)
CREATE OR REPLACE FUNCTION public.cloud_serveur_peut_recevoir(p_s public.cloud_serveurs, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_s.etat = 'actif' AND p_s.vu_le > now() - interval '5 minutes'
     AND COALESCE(p_s.details -> 'service' ->> 'apte', '') = 'true'
     AND public.cloud_serveur_admet(p_s.details, p_user);
$function$;

-- Ne peut plus GARDER ce compte : incapable déclaré, ou une déclaration qui ne l'admet pas. Sans déclaration (ancien
-- orchestrateur), on ne sait rien : il garde ce qu'il a (rien ne bouge par ignorance).
CREATE OR REPLACE FUNCTION public.cloud_serveur_ne_peut_garder(p_s public.cloud_serveurs, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(p_s.details -> 'service' ->> 'incapable', '') = 'true'
      OR (p_s.details ? 'service' AND NOT public.cloud_serveur_admet(p_s.details, p_user));
$function$;

REVOKE EXECUTE ON FUNCTION public.cloud_serveur_admet(jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cloud_serveur_peut_recevoir(public.cloud_serveurs, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cloud_serveur_ne_peut_garder(public.cloud_serveurs, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_serveur_admet(jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_serveur_peut_recevoir(public.cloud_serveurs, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloud_serveur_ne_peut_garder(public.cloud_serveurs, uuid) TO service_role;

-- ── Le battement : la déclaration REMPLACÉE à chaque fois (jamais une ancienne gardée) ──────────
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
    -- (06/11 soir) La déclaration de service est celle de CE battement : absente → retirée (plus aucun compte reçu).
    details = (COALESCE(s.details, '{}'::jsonb) - 'service') || EXCLUDED.details;
  RETURN jsonb_build_object('comptes', v_comptes, 'places', GREATEST(v_cap - v_comptes, 0), 'places_libres', public.cloud_places_libres());
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.cloud_serveur_battre(text, text, inet, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_serveur_battre(text, text, inet, integer, integer, jsonb) TO service_role;

-- ── Les places : celles des serveurs vivants ET aptes seulement ──────────
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
    - (SELECT count(*) FROM reserves)::int, 0);
$function$;

-- ── LE CHOIX du serveur d'un compte ──────────
CREATE OR REPLACE FUNCTION public.cloud_serveur_choisir(p_user uuid, p_servis uuid[] DEFAULT NULL::uuid[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_srv text;
  v_orig text;
  v_servis uuid[] := p_servis;
  v_choix text;
  v_cour public.cloud_serveurs%ROWTYPE;
  v_o public.cloud_serveurs%ROWTYPE;
  v_connu boolean := false;
  v_mort boolean := false;
  v_job boolean := NULL;
  v_nouvelle_origine text;
BEGIN
  IF p_user IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cloud_serveur_choisir'));
  SELECT po.serveur, po.serveur_origine INTO v_srv, v_orig FROM public.cloud_postes po WHERE po.user_id = p_user;
  IF v_srv IS NOT NULL THEN
    SELECT * INTO v_cour FROM public.cloud_serveurs s WHERE s.nom = v_srv;
    v_connu := FOUND;
    v_mort := v_connu AND (v_cour.etat = 'retire'
              OR (v_cour.etat = 'actif' AND (v_cour.vu_le IS NULL OR v_cour.vu_le < now() - interval '15 minutes')));
  END IF;

  -- 1. Le RETOUR au serveur d'origine, dès qu'il rebat (vivant, apte, l'admet, une place), jamais pendant une tâche.
  IF v_orig IS NOT NULL THEN
    SELECT * INTO v_o FROM public.cloud_serveurs s WHERE s.nom = v_orig;
    IF NOT FOUND OR v_o.etat = 'retire' OR v_orig = v_srv THEN
      UPDATE public.cloud_postes SET serveur_origine = NULL WHERE user_id = p_user AND serveur_origine IS NOT NULL;
      v_orig := NULL;
    ELSIF public.cloud_serveur_peut_recevoir(v_o, p_user) THEN
      IF v_servis IS NULL THEN SELECT array_agg(c.user_id) INTO v_servis FROM public.cloud_comptes_a_servir() c; END IF;
      v_job := EXISTS (SELECT 1 FROM public.cross_post_jobs j WHERE j.user_id = p_user AND j.status = 'processing');
      IF p_user = ANY (COALESCE(v_servis, '{}'::uuid[])) AND NOT v_job
         AND v_o.capacite > (SELECT count(*) FROM public.cloud_postes p2
                              WHERE p2.serveur = v_orig AND p2.user_id <> p_user AND p2.user_id = ANY (v_servis)) THEN
        UPDATE public.cloud_postes SET serveur = v_orig, serveur_origine = NULL, maj_le = now() WHERE user_id = p_user;
        RETURN v_orig;
      END IF;
    END IF;
  END IF;

  -- 2. Gardé : un serveur inconnu de la table (jamais volé avant son battement), en création, ou vivant (< 15 min)
  --    qui peut encore le servir.
  IF v_srv IS NOT NULL AND (NOT v_connu OR (NOT v_mort AND NOT public.cloud_serveur_ne_peut_garder(v_cour, p_user))) THEN
    RETURN v_srv;
  END IF;

  -- 3. Un compte qui n'est pas à servir n'est jamais attribué (il garde ce qu'il a).
  IF v_servis IS NULL THEN SELECT array_agg(c.user_id) INTO v_servis FROM public.cloud_comptes_a_servir() c; END IF;
  IF NOT (p_user = ANY (COALESCE(v_servis, '{}'::uuid[]))) THEN RETURN v_srv; END IF;

  -- 4. Son serveur vit encore mais ne peut plus le servir : jamais déplacé au milieu d'une tâche.
  IF v_srv IS NOT NULL AND NOT v_mort THEN
    IF v_job IS NULL THEN v_job := EXISTS (SELECT 1 FROM public.cross_post_jobs j WHERE j.user_id = p_user AND j.status = 'processing'); END IF;
    IF v_job THEN RETURN v_srv; END IF;
  END IF;

  -- 5. Un serveur qui PEUT le recevoir, avec une place ; sinon il ne bouge pas (jamais vers un serveur incapable).
  SELECT s.nom INTO v_choix
    FROM public.cloud_serveurs s
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS pris FROM public.cloud_postes p2
       WHERE p2.serveur = s.nom AND p2.user_id <> p_user AND p2.user_id = ANY (v_servis)) x
   WHERE public.cloud_serveur_peut_recevoir(s, p_user) AND s.capacite > x.pris
   ORDER BY s.capacite - x.pris DESC, s.nom
   LIMIT 1;
  IF v_choix IS NULL THEN
    RETURN CASE WHEN v_srv IS NOT NULL AND NOT v_mort THEN v_srv ELSE NULL END;
  END IF;
  -- Le serveur d'origine : le premier quitté (gardé à travers plusieurs bascules), jamais un serveur retiré.
  v_nouvelle_origine := CASE
    WHEN v_srv IS NULL OR v_srv = v_choix THEN v_orig
    WHEN v_connu AND v_cour.etat = 'retire' THEN v_orig
    ELSE COALESCE(v_orig, v_srv) END;
  IF v_nouvelle_origine = v_choix THEN v_nouvelle_origine := NULL; END IF;
  INSERT INTO public.cloud_postes AS po (user_id, etat, serveur, serveur_origine, details, maj_le)
  VALUES (p_user, 'eteint', v_choix, v_nouvelle_origine, '{}'::jsonb, now())
  ON CONFLICT (user_id) DO UPDATE SET serveur = EXCLUDED.serveur, serveur_origine = EXCLUDED.serveur_origine, maj_le = now()
   WHERE po.serveur IS DISTINCT FROM EXCLUDED.serveur OR po.serveur_origine IS DISTINCT FROM EXCLUDED.serveur_origine;
  RETURN v_choix;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.cloud_serveur_choisir(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_serveur_choisir(uuid, uuid[]) TO service_role;
