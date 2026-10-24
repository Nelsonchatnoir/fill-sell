-- ═══════════════════════════════════════════════════════════════════════════
-- L'ORIGINE D'UNE INSCRIPTION EST CAPTÉE, ET ELLE SURVIT AU COMPTE (25/10, point 6 de Nico) — APPLIQUÉE
-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIQUÉE le 25/10 à 01:30:41 (Paris) — mission de nuit de Nico : « migrations autorisées cette nuit si essai à
-- blanc + selftests verts + preuve en prod ». Essai 19/19 relancé à 01:29 ; preuve relue (archive RLS fermée,
-- déclencheur actif, RPC authenticated oui / anon non, 3 230 profils intacts). Appliquée par :
--    npx supabase db query --linked -f supabase/migrations/20261025013000_origine_inscription_survit_au_compte.sql
--    npx supabase migration repair --linked --status applied 20261025013000
--
-- CE QUI A ÉTÉ MESURÉ LE 25/10 (lecture seule, 00:10 → 01:00 Paris) :
--   · 0 profil sur 3 229 porte une origine (acquisition_captured_at), 0 sur les 570 inscrits des 30 derniers
--     jours. La cause n'est plus celle du 27/09 : `authenticated` n'a le droit d'UPDATE que sur 13 colonnes de
--     profiles (GRANT par colonnes, migration 20260706400000) et acquisition_* n'en fait pas partie. L'UPDATE de
--     src/utils/acquisition.js (poserSourceSurProfil) reçoit 42501 → HTTP 403 de PostgREST, à CHAQUE ouverture
--     de session d'un compte de moins de 30 jours ; l'erreur est rendue sans être levée, donc jamais vue.
--   · Un compte supprimé (delete-account) emporte son profil : même captée, l'origine partirait avec lui. Ce qui
--     survit aujourd'hui : departs_compte (anonyme, sans origine, seulement si « Pourquoi tu pars ? » a été
--     traversé : 37 lignes depuis le 06/10) et email_destinataires (adresse + user_id, voulu pour les
--     désinscriptions : 57 comptes supprimés depuis le 19/09).
--   · Aucune statistique d'acquisition en base : aucune fonction ni vue ne lit acquisition_* (seul le
--     déclencheur profiles_acquisition_immuable), ops-digest non plus ; entonnoir_inscrits est une vue sur
--     profiles, elle perd le compte avec lui.
--
-- LA RÈGLE (tous les comptes, toutes les voies de suppression) :
--   1. L'origine se pose par une RPC SECURITY DEFINER, poser_origine_inscription (même schéma que
--      set_app_build) : la personne connectée, son seul profil, une seule fois (acquisition_captured_at NULL, et
--      profiles_acquisition_immuable derrière), compte de moins de 30 jours, capture antérieure au compte
--      (6 h de marge), valeurs bornées à 200 caractères, toute valeur contenant « @ » masquée, referrer réduit
--      à « schéma://domaine ».
--   2. Quand un profil est supprimé, un déclencheur BEFORE DELETE écrit UNE ligne ANONYME dans
--      origines_comptes_supprimes : jour de suppression, mois d'inscription, tranche d'ancienneté, origine
--      (source, medium, campaign, content, domaine du referrer, fbclid présent oui/non — jamais sa valeur),
--      plateforme d'inscription, fournisseur d'identité, palier au départ (palier_de), canal de paiement connu,
--      compte d'essai interne oui/non. Ni e-mail, ni identifiant, ni horodatage précis.
--      Toutes les voies passent par là : profiles_id_fkey n'a PAS de cascade (relu le 25/10), un compte ne
--      s'efface donc qu'après son profil (delete-account : profil puis auth.users).
--   3. Le déclencheur ne bloque JAMAIS une suppression : toute erreur est rattrapée (WARNING), la suppression
--      continue. Il est SECURITY DEFINER parce que delete-account supprime sous service_role, qui ne lit pas
--      auth.users (has_table_privilege = false, relu le 25/10) et n'écrit pas dans l'archive.
--   4. La vue origines_inscriptions (security_invoker, service_role seul) rend les inscrits par mois et par
--      origine, vivants ET partis : c'est là que se lisent désormais les statistiques d'acquisition.
--
-- DROITS (régime du 30/10, migration 20261024110000) :
-- droits : serveur seulement — origines_comptes_supprimes : RLS sans politique, aucun droit anon/authenticated, service_role en lecture seule (seul le déclencheur écrit, en propriétaire)
--   · vue origines_inscriptions : service_role en lecture, rien d'autre ;
--   · poser_origine_inscription : authenticated + service_role, jamais anon ;
--   · profiles_origine_survit (déclencheur) et origine_valeur_propre : ni anon ni authenticated.
--
-- CE QUI NE CHANGE PAS : aucune ligne existante touchée, aucun compte, aucun cron, aucun appel réseau, aucun
-- droit de profiles. ⚠️ La RPC ne sert qu'avec l'app qui l'appelle (src/utils/acquisition.js → supabase.rpc,
-- web + OTA) : d'ici là, l'UPDATE direct continue d'échouer en silence et l'archive garde des origines vides.
-- Charge : un déclencheur par profil supprimé (quelques dizaines par mois), aucune boucle, aucune relecture.
-- Inverse : supabase/rollbacks/20261025013000_origine_inscription_survit_au_compte_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

-- ── 1. Une valeur d'origine propre : bornée, jamais une adresse e-mail. ──────
CREATE OR REPLACE FUNCTION public.origine_valeur_propre(p_valeur text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT CASE
    WHEN p_valeur IS NULL OR btrim(p_valeur) = '' THEN NULL
    WHEN strpos(p_valeur, '@') > 0 THEN '(masquée)'
    ELSE left(btrim(p_valeur), 200)
  END
$function$;
REVOKE ALL ON FUNCTION public.origine_valeur_propre(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.origine_valeur_propre(text) TO service_role;

-- ── 2. L'archive anonyme. ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.origines_comptes_supprimes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  supprime_le            date,
  mois_inscription       date,
  anciennete             text CHECK (anciennete IN ('moins_1h', 'moins_1j', 'moins_7j', 'moins_30j', 'moins_90j', 'plus_90j')),
  origine_captee         boolean NOT NULL DEFAULT false,
  source                 text CHECK (source IS NULL OR char_length(source) <= 200),
  medium                 text CHECK (medium IS NULL OR char_length(medium) <= 200),
  campaign               text CHECK (campaign IS NULL OR char_length(campaign) <= 200),
  content                text CHECK (content IS NULL OR char_length(content) <= 200),
  referrer_domaine       text CHECK (referrer_domaine IS NULL OR char_length(referrer_domaine) <= 253),
  fbclid_present         boolean NOT NULL DEFAULT false,
  plateforme_inscription text CHECK (plateforme_inscription IN ('ios', 'android', 'web')),
  fournisseur            text CHECK (fournisseur IN ('email', 'google', 'apple', 'autre')),
  palier                 text CHECK (palier IN ('free', 'premium', 'pro', 'business')),
  canal_paiement         text CHECK (canal_paiement IN ('stripe', 'apple', 'google')),
  compte_essai           boolean NOT NULL DEFAULT false,
  rattrapage             boolean NOT NULL DEFAULT false,
  CONSTRAINT origines_comptes_supprimes_jour CHECK (rattrapage OR supprime_le IS NOT NULL)
);
COMMENT ON TABLE public.origines_comptes_supprimes IS
  'Origine d''une inscription, gardée ANONYME quand le compte est supprimé (25/10). Une ligne par profil supprimé, écrite par le déclencheur profiles_origine_survit_trg seulement. Ni e-mail, ni identifiant, ni horodatage précis. canal_paiement = un identifiant de paiement existait (pas une preuve de paiement). rattrapage = ligne reconstituée après coup (mois d''inscription seul).';
ALTER TABLE public.origines_comptes_supprimes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.origines_comptes_supprimes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.origines_comptes_supprimes TO service_role;
-- (fillsell_table_nait_protegee donne SELECT, INSERT, UPDATE, DELETE à service_role : l'archive ne s'écrit que
-- par le déclencheur, service_role la lit seulement.)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.origines_comptes_supprimes FROM service_role;

-- ── 3. Le déclencheur : une ligne anonyme par profil supprimé, jamais un blocage. ─
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
REVOKE ALL ON FUNCTION public.profiles_origine_survit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_origine_survit_trg ON public.profiles;
CREATE TRIGGER profiles_origine_survit_trg
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_origine_survit();

-- ── 4. La pose de l'origine par la personne connectée (remplace l'UPDATE direct, refusé en 42501). ─
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

-- ── 5. Les inscrits par mois et par origine, vivants ET partis (lecture serveur seulement). ─
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
COMMENT ON VIEW public.origines_inscriptions IS
  'Inscrits par mois et par origine, comptes vivants (profiles) ET supprimés (origines_comptes_supprimes). Lecture serveur seulement (25/10).';
REVOKE ALL ON TABLE public.origines_inscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.origines_inscriptions TO service_role;

COMMIT;
