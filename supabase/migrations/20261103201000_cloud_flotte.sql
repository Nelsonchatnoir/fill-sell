-- ═══════════════════════════════════════════════════════════════════════════
-- FillSell Cloud — LA FLOTTE DE SERVEURS ET LES PLACES (03/11/2026, points 1 et 5 de Nico)
--
-- « On ne refuse jamais un client par manque de mémoire » ; « avant de vendre, vérifier qu'il existe une place
-- serveur ». Avant : un seul serveur, `cloud_postes.serveur` écrit mais jamais lu, chaque orchestrateur servait TOUS
-- les comptes, ni l'essai ni le paiement ne regardaient la capacité.
--
--   · cloud_serveurs : chaque orchestrateur bat chaque minute (cloud_serveur_battre) avec sa capacité (navigateurs
--     simultanés), ses navigateurs ouverts et ses comptes. Un serveur vu depuis < 5 min est VIVANT ; vu depuis
--     > 15 min (ou « retire »), ses comptes sont réattribuables.
--   · cloud_places_libres() : capacité des serveurs vivants − comptes à servir − places gardées entre la
--     préparation et le paiement (IP réservées). Lue AVANT toute vente (chantier C : essai, Stripe, boutons
--     Apple / Google). Signature FIXE.
--   · cloud_serveur_choisir : le serveur d'un compte servi — gardé s'il vit, sinon le serveur vivant le plus libre
--     (verrou consultatif : deux orchestrateurs n'attribuent jamais en même temps). Un serveur inconnu de la table
--     n'est jamais « mort » : rien n'est volé avant son premier battement (déploiement avant migration).
--   · cloud_comptes_du_serveur(p_serveur) : ce que l'orchestrateur sert (remplace cloud_comptes_a_servir côté
--     serveur, mêmes colonnes) ; cloud_serveur_moi() : l'adresse de « Me connecter » du compte connecté.
--   · coin_config (entiers) : cloud_places_seuil (2), cloud_serveurs_auto (0 = création COUPÉE), cloud_serveur_type
--     (0 = cpx42, index de TYPES_SERVEUR de serveur-cloud/src/flotte.js), cloud_serveur_lieu (0 = fsn1).
--   · stockage privé « cloud-paquets » : le paquet de l'orchestrateur qu'un serveur neuf télécharge (URL signée 2 h).
--
-- Aucune ligne inchangée réécrite (attribution : seulement si le serveur change). Le battement réécrit sa ligne
-- (vu_le) : une ligne par serveur et par minute.
-- Inverse : supabase/rollbacks/20261103201000_cloud_flotte_INVERSE.sql. Idempotente. db push INTERDIT.
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.cloud_serveurs (
  nom         text PRIMARY KEY CHECK (nom ~ '^[a-z0-9][a-z0-9-]{0,40}$'),
  domaine     text NOT NULL,
  ipv4        inet,
  hetzner_id  bigint,
  type        text,
  capacite    integer NOT NULL DEFAULT 0 CHECK (capacite >= 0),
  ouverts     integer NOT NULL DEFAULT 0 CHECK (ouverts >= 0),
  comptes     integer NOT NULL DEFAULT 0 CHECK (comptes >= 0),
  etat        text NOT NULL DEFAULT 'actif' CHECK (etat IN ('actif', 'en_creation', 'retire')),
  vu_le       timestamptz,
  cree_le     timestamptz NOT NULL DEFAULT now(),
  details     jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.cloud_serveurs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cloud_serveurs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.cloud_serveurs TO service_role;   -- droits : serveur seulement (cloud_serveurs : orchestrateurs, fonctions)
COMMENT ON TABLE public.cloud_serveurs IS
  'FillSell Cloud (03/11/2026) : un serveur Hetzner = un orchestrateur. Battement chaque minute (cloud_serveur_battre) ; vivant si vu < 5 min ; ses comptes réattribuables après 15 min sans battement.';

CREATE INDEX IF NOT EXISTS cloud_postes_serveur_idx ON public.cloud_postes (serveur) WHERE serveur IS NOT NULL;

-- ── Le serveur d'un compte ────────────────────────────────────────────────────
-- p_servis : les comptes à servir (cloud_comptes_a_servir), passés par l'appelant qui boucle ; NULL = relus ici.
CREATE OR REPLACE FUNCTION public.cloud_serveur_choisir(p_user uuid, p_servis uuid[] DEFAULT NULL)
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
$function$;
REVOKE EXECUTE ON FUNCTION public.cloud_serveur_choisir(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_serveur_choisir(uuid, uuid[]) TO service_role;

-- ── Ce que sert un orchestrateur ─────────────────────────────────────────────
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
$function$;
REVOKE EXECUTE ON FUNCTION public.cloud_comptes_du_serveur(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_comptes_du_serveur(text) TO service_role;

-- ── Les places libres (lue avant toute vente — signature FIXE) ───────────────
CREATE OR REPLACE FUNCTION public.cloud_places_libres()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
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
$function$;
REVOKE EXECUTE ON FUNCTION public.cloud_places_libres() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloud_places_libres() TO authenticated, service_role;

-- ── Le battement d'un orchestrateur ──────────────────────────────────────────
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
$function$;
REVOKE EXECUTE ON FUNCTION public.cloud_serveur_battre(text, text, inet, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_serveur_battre(text, text, inet, integer, integer, jsonb) TO service_role;

-- ── Un serveur en création (montée en charge, flotte.js) ─────────────────────
CREATE OR REPLACE FUNCTION public.cloud_serveur_noter_creation(p_nom text, p_domaine text, p_hetzner_id bigint, p_type text, p_ipv4 inet, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.cloud_serveurs AS s (nom, domaine, hetzner_id, type, ipv4, etat, details)
  VALUES (p_nom, p_domaine, p_hetzner_id, p_type, p_ipv4, 'en_creation', COALESCE(p_details, '{}'::jsonb))
  ON CONFLICT (nom) DO UPDATE SET
    hetzner_id = COALESCE(EXCLUDED.hetzner_id, s.hetzner_id),
    type = COALESCE(EXCLUDED.type, s.type),
    ipv4 = COALESCE(EXCLUDED.ipv4, s.ipv4),
    details = s.details || EXCLUDED.details
   WHERE s.etat = 'en_creation';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.cloud_serveur_noter_creation(text, text, bigint, text, inet, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_serveur_noter_creation(text, text, bigint, text, inet, jsonb) TO service_role;

-- ── L'adresse de « Me connecter » du compte connecté ─────────────────────────
CREATE OR REPLACE FUNCTION public.cloud_serveur_moi()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_srv text;
  v_dom text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('domaine', NULL); END IF;
  v_srv := public.cloud_serveur_choisir(auth.uid(), NULL);
  SELECT s.domaine INTO v_dom FROM public.cloud_serveurs s WHERE s.nom = v_srv AND s.etat <> 'retire';
  RETURN jsonb_build_object('domaine', v_dom);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.cloud_serveur_moi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloud_serveur_moi() TO authenticated, service_role;

-- ── Les réglages (entiers) ───────────────────────────────────────────────────
INSERT INTO public.coin_config (key, value, updated_at) VALUES
  ('cloud_places_seuil', 2, now()),
  ('cloud_serveurs_auto', 0, now()),
  ('cloud_serveur_type', 0, now()),
  ('cloud_serveur_lieu', 0, now())
ON CONFLICT (key) DO NOTHING;

-- ── Le paquet d'un serveur neuf (privé, URL signée) ──────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('cloud-paquets', 'cloud-paquets', false)
ON CONFLICT (id) DO NOTHING;
