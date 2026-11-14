-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261114100000_origine_plateforme_inscription — LA PLATEFORME D'INSCRIPTION QUITTE acquisition_source (14/11/2026,
-- bloc E1 : suivi des inscriptions venues de la pub Meta)
-- NON APPLIQUÉE : préparée par un agent, l'intégrateur l'applique après le feu vert EXPLICITE de Nico.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- CONSTAT (prod, lecture seule, 14/11) : la plateforme d'une inscription n'a pas de colonne. La vue origines_inscriptions
-- et l'archive des comptes supprimés (profiles_origine_survit) la DÉDUISENT de acquisition_source : « app_ios » → ios,
-- « app_android » → android, toute autre source posée → web. Le jour où l'app Android lit la campagne de son
-- installation par Google Play (src/utils/acquisition.js, enrichirSourceAndroid — prochain binaire, INACTIF), un Android
-- venu de la pub porte source = « meta » : l'ancienne règle le compterait « web ».
-- Relu le 14/11 : 3 763 profils, 570 origines posées ; rien d'autre ne lit acquisition_* (3 fonctions, 1 vue, 2
-- déclencheurs ; aucune fonction edge) ; authenticated n'a PAS l'UPDATE de ces colonnes (droits par colonne) : la pose
-- passe par la RPC seule.
--
-- LA RÈGLE (tous les comptes) :
--   1. colonne acquisition_plateforme (ios / android / web), NULL par défaut. AUCUNE ligne existante réécrite : pour
--      elles, la règle d'avant (déduite de la source) reste celle qui répond, par coalesce ;
--   2. elle se verrouille avec les autres colonnes d'origine (profiles_acquisition_immuable) : première pose gagne ;
--   3. poser_origine_inscription prend un 8e paramètre, p_plateforme DEFAULT NULL. L'app d'aujourd'hui (web, iPhone,
--      Android : 7 paramètres nommés) garde son appel tel quel ; une valeur hors liste devient NULL, sans erreur.
--      L'ancienne signature est RETIRÉE (DROP) : laissée à côté, PostgREST ne saurait pas choisir entre les deux
--      (PGRST203) et TOUTES les poses tomberaient ;
--   4. vue et archive : plateforme = coalesce(acquisition_plateforme, règle d'avant).
-- L'app (src/utils/acquisition.js) n'envoie p_plateforme que sur le chemin Google Play, et rejoue à 7 paramètres si la
-- base ne connaît pas encore la fonction à 8 (PGRST202) : aucun ordre de déploiement ne fait perdre une origine.
--
-- ⛔ Tout le reste à l'octet près : définitions de la PROD lues le 14/11 (pg_get_functiondef, pg_get_viewdef). Garde
--    ci-dessous : md5 relus, sinon ON S'ARRÊTE. Droits redits à l'identique (RPC : authenticated + service_role, jamais
--    anon ; vue : service_role en lecture seule ; archive et déclencheurs : inchangés).
-- droits : RPC poser_origine_inscription → authenticated, service_role (jamais anon, jamais PUBLIC) ; vue
--   origines_inscriptions → service_role SELECT ; colonne : les droits de table de profiles (inchangés).
-- Charge : une colonne NULL ajoutée (aucune réécriture de la table, contrôle CHECK sur 3 763 lignes), 3 fonctions et une
--   vue remplacées ; aucun cron, aucun appel réseau, aucune boucle.
-- Banc : PREUVE_PG=embarque node scripts/essais/20261114100000_banc.mjs (Postgres jetable : avant / migration / rejeu /
--   appels de l'app d'aujourd'hui et de demain / verrou / archive / inverse / rejouée).
-- Verrou : npm run selftest:acquisition-meta.
-- Inverse : supabase/rollbacks/20261114100000_origine_plateforme_inscription_INVERSE.sql
-- À jouer (feu vert de Nico) :
--   npx supabase db query --linked -f supabase/migrations/20261114100000_origine_plateforme_inscription.sql
--   npx supabase migration repair --linked --status applied 20261114100000
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

DO $verif$
DECLARE
  v_rpc7   regprocedure := to_regprocedure('public.poser_origine_inscription(text,text,text,text,text,text,timestamptz)');
  v_rpc8   regprocedure := to_regprocedure('public.poser_origine_inscription(text,text,text,text,text,text,timestamptz,text)');
  v_imm    text := md5(pg_get_functiondef('public.profiles_acquisition_immuable()'::regprocedure));
  v_survit text := md5(pg_get_functiondef('public.profiles_origine_survit()'::regprocedure));
  v_vue    text := md5(pg_get_viewdef('public.origines_inscriptions'::regclass, true));
BEGIN
  -- La prod lue le 14/11, ou cette migration déjà passée (rejeu).
  IF NOT coalesce((v_rpc7 IS NOT NULL AND v_rpc8 IS NULL
           AND md5(pg_get_functiondef(v_rpc7)) = '0915de0d5fa3e33176a2bbe05729ba9a'
           AND v_imm = 'aec47bda23057b6eb38751b4854d35ff'
           AND v_survit = '0fa3e0d510e18fc4ec776622571c9d85'
           AND v_vue = '04b03db9afbfe7bb60bfec9340a2e906')
       OR (v_rpc7 IS NULL AND v_rpc8 IS NOT NULL
           AND md5(pg_get_functiondef(v_rpc8)) = 'f9c73c8bf1f32ba4d123e56bbf766f78'
           AND v_imm = 'e645a96f072b71c64c356e9b97f11a21'
           AND v_survit = '7c710886052021cb575931325acf2dc4'
           AND v_vue = 'f15fd70a46da3c19c79dbe258b433083'), false) THEN
    RAISE EXCEPTION 'origine d''inscription : la prod a changé depuis la lecture du 14/11 (rpc7 %, rpc8 %, immuable %, survit %, vue %) — ON S''ARRÊTE, rien n''est changé',
      v_rpc7, v_rpc8, v_imm, v_survit, v_vue;
  END IF;
END
$verif$;

-- ── 1. La colonne. ────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS acquisition_plateforme text
    CONSTRAINT profiles_acquisition_plateforme_check CHECK (acquisition_plateforme IN ('ios', 'android', 'web'));
COMMENT ON COLUMN public.profiles.acquisition_plateforme IS
  'Plateforme de l''inscription (ios / android / web), posée avec l''origine par poser_origine_inscription (14/11). NULL = règle d''avant, déduite de acquisition_source (app_ios / app_android / autre = web). IMMUABLE une fois posée.';

-- ── 2. Le verrou d'immuabilité (prod du 14/11 + la colonne). ─────────────────────────────────────────────────────
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
    NEW.acquisition_plateforme  := OLD.acquisition_plateforme;
    NEW.acquisition_captured_at := OLD.acquisition_captured_at;
  END IF;
  RETURN NEW;
END;
$function$;

-- ── 3. La pose : 8e paramètre par défaut (prod du 14/11 + p_plateforme). ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.poser_origine_inscription(text, text, text, text, text, text, timestamptz);
CREATE OR REPLACE FUNCTION public.poser_origine_inscription(
  p_source     text,
  p_medium     text,
  p_campaign   text,
  p_content    text,
  p_fbclid     text,
  p_referrer   text,
  p_captee_le  timestamptz,
  p_plateforme text DEFAULT NULL
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
         acquisition_plateforme  = CASE WHEN p_plateforme IN ('ios', 'android', 'web') THEN p_plateforme END,
         acquisition_captured_at = v_capte
   WHERE id = v_uid
     AND acquisition_captured_at IS NULL;
  RETURN FOUND;
END;
$function$;
REVOKE ALL ON FUNCTION public.poser_origine_inscription(text, text, text, text, text, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poser_origine_inscription(text, text, text, text, text, text, timestamptz, text) TO authenticated, service_role;

-- ── 4. L'archive des comptes supprimés (prod du 14/11 ; seule la plateforme change). ─────────────────────────────
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
    coalesce(OLD.acquisition_plateforme, CASE
      WHEN OLD.acquisition_source = 'app_ios' THEN 'ios'
      WHEN OLD.acquisition_source = 'app_android' THEN 'android'
      WHEN OLD.acquisition_captured_at IS NOT NULL THEN 'web'
    END),
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

-- ── 5. La vue des inscrits par origine (prod du 14/11 ; seule la plateforme change). ─────────────────────────────
CREATE OR REPLACE VIEW public.origines_inscriptions
WITH (security_invoker = true) AS
SELECT date_trunc('month', p.created_at AT TIME ZONE 'Europe/Paris')::date AS mois_inscription,
       p.acquisition_captured_at IS NOT NULL AS origine_captee,
       p.acquisition_source   AS source,
       p.acquisition_medium   AS medium,
       p.acquisition_campaign AS campaign,
       p.acquisition_content  AS content,
       coalesce(p.acquisition_plateforme, CASE
         WHEN p.acquisition_source = 'app_ios' THEN 'ios'
         WHEN p.acquisition_source = 'app_android' THEN 'android'
         WHEN p.acquisition_captured_at IS NOT NULL THEN 'web'
       END) AS plateforme_inscription,
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

COMMIT;
