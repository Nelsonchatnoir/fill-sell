-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261114100000_origine_plateforme_inscription — remet la PROD lue le 14/11 (pg_get_functiondef,
-- pg_get_viewdef : md5 0915de0d…, aec47bda…, 0fa3e0d5…, 04b03db9… — le banc le vérifie).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Ordre : la vue et les fonctions qui nomment acquisition_plateforme d'abord, la colonne en dernier.
-- ⚠ La colonne part avec ses valeurs : elles sont d'abord copiées dans public._sauvegarde_acquisition_plateforme_20261114
--   (id, acquisition_plateforme ; RLS, aucun droit anon / authenticated). Les autres colonnes d'origine ne bougent pas ;
--   un Android venu de Google Play reste « meta » en source et redevient « web » dans la vue (règle d'avant).
-- ⚠ À jouer AVANT : rien. L'app reste compatible (elle rejoue à 7 paramètres sur PGRST202).
--   npx supabase db query --linked -f supabase/rollbacks/20261114100000_origine_plateforme_inscription_INVERSE.sql
--   npx supabase migration repair --linked --status reverted 20261114100000
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

DO $verif$
BEGIN
  IF to_regprocedure('public.poser_origine_inscription(text,text,text,text,text,text,timestamptz,text)') IS NULL THEN
    RAISE EXCEPTION 'la migration 20261114100000 n''est pas en place (aucune poser_origine_inscription à 8 paramètres) — ON S''ARRÊTE';
  END IF;
END
$verif$;

CREATE TABLE IF NOT EXISTS public._sauvegarde_acquisition_plateforme_20261114 AS
  SELECT id, acquisition_plateforme FROM public.profiles WHERE acquisition_plateforme IS NOT NULL;
ALTER TABLE public._sauvegarde_acquisition_plateforme_20261114 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._sauvegarde_acquisition_plateforme_20261114 FROM PUBLIC, anon, authenticated;

-- ── La vue (prod du 14/11). ──────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.origines_inscriptions
WITH (security_invoker = true) AS
SELECT date_trunc('month', p.created_at AT TIME ZONE 'Europe/Paris')::date AS mois_inscription,
       p.acquisition_captured_at IS NOT NULL AS origine_captee,
       p.acquisition_source   AS source,
       p.acquisition_medium   AS medium,
       p.acquisition_campaign AS campaign,
       p.acquisition_content  AS content,
       CASE
         WHEN p.acquisition_source = 'app_ios' THEN 'ios'
         WHEN p.acquisition_source = 'app_android' THEN 'android'
         WHEN p.acquisition_captured_at IS NOT NULL THEN 'web'
       END AS plateforme_inscription,
       public.palier_de(p.id) AS palier,
       coalesce(p.email, '') ~* '\+test[0-9]+@' AS compte_essai,
       false AS parti,
       NULL::date AS supprime_le
  FROM public.profiles p
UNION ALL
SELECT o.mois_inscription, o.origine_captee, o.source, o.medium, o.campaign, o.content,
       o.plateforme_inscription, o.palier, o.compte_essai, true, o.supprime_le
  FROM public.origines_comptes_supprimes o;
REVOKE ALL ON TABLE public.origines_inscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.origines_inscriptions TO service_role;

-- ── L'archive (prod du 14/11). ───────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.profiles_origine_survit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inscrit     timestamptz;
  v_fournisseur text;
  v_age         interval;
  v_palier      text;
BEGIN
  BEGIN
    SELECT u.created_at, u.raw_app_meta_data ->> 'provider'
      INTO v_inscrit, v_fournisseur
      FROM auth.users u
     WHERE u.id = OLD.id;
  EXCEPTION WHEN OTHERS THEN
    v_inscrit := NULL;
    v_fournisseur := NULL;
  END;
  v_inscrit := coalesce(v_inscrit, OLD.created_at);
  v_age := now() - v_inscrit;

  BEGIN
    v_palier := public.palier_de(OLD.id);
  EXCEPTION WHEN OTHERS THEN
    v_palier := NULL;
  END;

  INSERT INTO public.origines_comptes_supprimes (
    supprime_le, mois_inscription, anciennete, origine_captee, source, medium, campaign, content,
    referrer_domaine, fbclid_present, plateforme_inscription, fournisseur, palier, canal_paiement, compte_essai)
  VALUES (
    (now() AT TIME ZONE 'Europe/Paris')::date,
    date_trunc('month', v_inscrit AT TIME ZONE 'Europe/Paris')::date,
    CASE
      WHEN v_age IS NULL THEN NULL
      WHEN v_age < interval '1 hour' THEN 'moins_1h'
      WHEN v_age < interval '1 day' THEN 'moins_1j'
      WHEN v_age < interval '7 days' THEN 'moins_7j'
      WHEN v_age < interval '30 days' THEN 'moins_30j'
      WHEN v_age < interval '90 days' THEN 'moins_90j'
      ELSE 'plus_90j'
    END,
    OLD.acquisition_captured_at IS NOT NULL,
    public.origine_valeur_propre(OLD.acquisition_source),
    public.origine_valeur_propre(OLD.acquisition_medium),
    public.origine_valeur_propre(OLD.acquisition_campaign),
    public.origine_valeur_propre(OLD.acquisition_content),
    left(lower(substring(OLD.acquisition_referrer FROM '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#:@\s]+)')), 253),
    coalesce(btrim(OLD.acquisition_fbclid), '') <> '',
    CASE
      WHEN OLD.acquisition_source = 'app_ios' THEN 'ios'
      WHEN OLD.acquisition_source = 'app_android' THEN 'android'
      WHEN OLD.acquisition_captured_at IS NOT NULL THEN 'web'
    END,
    CASE
      WHEN v_fournisseur IN ('email', 'google', 'apple') THEN v_fournisseur
      WHEN v_fournisseur IS NOT NULL THEN 'autre'
    END,
    CASE WHEN v_palier IN ('free', 'premium', 'pro', 'business') THEN v_palier END,
    CASE
      WHEN nullif(btrim(OLD.stripe_customer_id), '') IS NOT NULL THEN 'stripe'
      WHEN nullif(btrim(OLD.apple_original_transaction_id), '') IS NOT NULL THEN 'apple'
      WHEN nullif(btrim(OLD.google_purchase_token), '') IS NOT NULL THEN 'google'
    END,
    coalesce(OLD.email, '') ~* '\+test[0-9]+@'
  );
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  -- Jamais une suppression retenue par l'archive.
  RAISE WARNING 'profiles_origine_survit : origine non archivée (%), suppression poursuivie', SQLERRM;
  RETURN OLD;
END;
$function$;

-- ── La pose à 7 paramètres (prod du 14/11). ──────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.poser_origine_inscription(text, text, text, text, text, text, timestamptz, text);
CREATE OR REPLACE FUNCTION public.poser_origine_inscription(
  p_source    text,
  p_medium    text,
  p_campaign  text,
  p_content   text,
  p_fbclid    text,
  p_referrer  text,
  p_captee_le timestamptz
) RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_inscrit timestamptz;
  v_capte   timestamptz := least(coalesce(p_captee_le, now()), now());
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;
  SELECT coalesce(u.created_at, p.created_at)
    INTO v_inscrit
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
   WHERE p.id = v_uid;
  -- Compte inconnu, ou de plus de 30 jours : plus de « premier contact » à mesurer.
  IF v_inscrit IS NULL OR now() - v_inscrit > interval '30 days' THEN
    RETURN false;
  END IF;
  -- Capture postérieure au compte (au-delà de la marge) : une visite ultérieure, pas l'origine.
  IF v_capte > v_inscrit + interval '6 hours' THEN
    RETURN false;
  END IF;
  UPDATE public.profiles
     SET acquisition_source      = public.origine_valeur_propre(p_source),
         acquisition_medium      = public.origine_valeur_propre(p_medium),
         acquisition_campaign    = public.origine_valeur_propre(p_campaign),
         acquisition_content     = public.origine_valeur_propre(p_content),
         acquisition_fbclid      = left(nullif(btrim(coalesce(p_fbclid, '')), ''), 500),
         acquisition_referrer    = lower(substring(btrim(coalesce(p_referrer, '')) FROM '^(https?://[^/?#:@\s]{1,253})')),
         acquisition_captured_at = v_capte
   WHERE id = v_uid
     AND acquisition_captured_at IS NULL;
  RETURN FOUND;
END;
$function$;
REVOKE ALL ON FUNCTION public.poser_origine_inscription(text, text, text, text, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poser_origine_inscription(text, text, text, text, text, text, timestamptz) TO authenticated, service_role;

-- ── Le verrou d'immuabilité (prod du 14/11). ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.profiles_acquisition_immuable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.acquisition_captured_at IS NOT NULL THEN
    NEW.acquisition_source      := OLD.acquisition_source;
    NEW.acquisition_medium      := OLD.acquisition_medium;
    NEW.acquisition_campaign    := OLD.acquisition_campaign;
    NEW.acquisition_content     := OLD.acquisition_content;
    NEW.acquisition_fbclid      := OLD.acquisition_fbclid;
    NEW.acquisition_referrer    := OLD.acquisition_referrer;
    NEW.acquisition_captured_at := OLD.acquisition_captured_at;
  END IF;
  RETURN NEW;
END;
$function$;

-- ── La colonne, en dernier. ──────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles DROP COLUMN IF EXISTS acquisition_plateforme;

COMMIT;
