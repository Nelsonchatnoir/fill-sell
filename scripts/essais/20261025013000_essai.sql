-- ═══════════════════════════════════════════════════════════════════════════
-- ESSAI À BLANC de 20261025013000_origine_inscription_survit_au_compte.sql (PROPOSITION, 25/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- Fabriqué par fabriquer_essai.mjs : corps de la migration À L'OCTET, puis les contrôles. RIEN n'est gardé :
-- la dernière instruction lève une exception qui porte le bilan (OK/KO par contrôle), la transaction est
-- annulée (et un ROLLBACK suit). Lancer, après le feu vert de Nico pour l'ESSAI :
--   npx supabase db query --linked -f essai_a_blanc_20261025013000.sql
-- Attendu : une ERREUR « ESSAI À BLANC TERMINÉ — tout est annulé. 0 échec(s) sur 19 contrôles : … ».
-- Verrou : CREATE TRIGGER prend un verrou SHARE ROW EXCLUSIVE sur profiles le temps de l'essai (~1 à 2 s,
-- lock_timeout 3 s) ; les écritures de profiles attendent ce temps-là. Aucun mail (comptes d'essai sans e-mail
-- à la création ; une file pg_net non validée ne part jamais), aucun appel réseau.
-- Si « permission denied to set role service_role » : remplacer les SET LOCAL ROLE service_role / RESET ROLE
-- par rien (la suppression se fait alors en postgres ; le déclencheur est SECURITY DEFINER de toute façon).
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '3s';

-- ════ Corps de la migration (identique) ════
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

-- ════════════════════════════════════════════════════════════════════════════
-- ESSAI : tout ce qui suit est ANNULÉ (exception finale volontaire, puis ROLLBACK).
-- Comptes d'essai SANS e-mail à la création (handle_new_user n'envoie donc aucun mail de bienvenue ; et
-- rien de ce qui est mis en file par pg_net n'est jamais validé). Identifiants fictifs e55a0000-…-0000000000aN.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE essai_resultats (
  le       timestamptz NOT NULL DEFAULT clock_timestamp(),
  controle text NOT NULL,
  ok       boolean NOT NULL,
  detail   text
) ON COMMIT DROP;

-- 1. Structure et droits.
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'archive : RLS active, aucune politique',
       c.relrowsecurity AND NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = c.oid), NULL
  FROM pg_class c WHERE c.oid = 'public.origines_comptes_supprimes'::regclass;

INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'archive : rien pour anon/authenticated, service_role en lecture seule',
       NOT has_table_privilege('anon', 'public.origines_comptes_supprimes', 'SELECT,INSERT,UPDATE,DELETE')
   AND NOT has_table_privilege('authenticated', 'public.origines_comptes_supprimes', 'SELECT,INSERT,UPDATE,DELETE')
   AND has_table_privilege('service_role', 'public.origines_comptes_supprimes', 'SELECT')
   AND NOT has_table_privilege('service_role', 'public.origines_comptes_supprimes', 'INSERT,UPDATE,DELETE'), NULL;

INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'archive : aucune colonne d''identité',
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'origines_comptes_supprimes'
                      AND column_name IN ('email', 'user_id', 'uid', 'id_compte', 'adresse_ip', 'jeton', 'fbclid', 'le', 'cree_le')), NULL;

INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'vue : service_role seul',
       has_table_privilege('service_role', 'public.origines_inscriptions', 'SELECT')
   AND NOT has_table_privilege('anon', 'public.origines_inscriptions', 'SELECT')
   AND NOT has_table_privilege('authenticated', 'public.origines_inscriptions', 'SELECT'), NULL;

INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'RPC : authenticated oui, anon non ; déclencheur et nettoyeur : ni anon ni authenticated',
       has_function_privilege('authenticated', 'public.poser_origine_inscription(text,text,text,text,text,text,timestamptz)', 'EXECUTE')
   AND NOT has_function_privilege('anon', 'public.poser_origine_inscription(text,text,text,text,text,text,timestamptz)', 'EXECUTE')
   AND NOT has_function_privilege('anon', 'public.profiles_origine_survit()', 'EXECUTE')
   AND NOT has_function_privilege('authenticated', 'public.profiles_origine_survit()', 'EXECUTE')
   AND NOT has_function_privilege('anon', 'public.origine_valeur_propre(text)', 'EXECUTE')
   AND NOT has_function_privilege('authenticated', 'public.origine_valeur_propre(text)', 'EXECUTE'), NULL;

INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'droits de profiles inchangés : authenticated toujours sans UPDATE sur acquisition_* (la RPC est la seule porte)',
       NOT has_column_privilege('authenticated', 'public.profiles', 'acquisition_source', 'UPDATE')
   AND has_column_privilege('authenticated', 'public.profiles', 'username', 'UPDATE'), NULL;

INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'déclencheur BEFORE DELETE posé et actif',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass
                AND tgname = 'profiles_origine_survit_trg' AND tgenabled = 'O'), NULL;

INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'nettoyeur : « @ » masqué, vide = NULL, 200 caractères au plus',
       public.origine_valeur_propre('x@y.fr') = '(masquée)'
   AND public.origine_valeur_propre('   ') IS NULL
   AND char_length(public.origine_valeur_propre(repeat('a', 500))) = 200
   AND public.origine_valeur_propre(' meta ') = 'meta', NULL;

-- 2. Cinq comptes d'essai (sans e-mail).
INSERT INTO auth.users (id, instance_id, aud, role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES
  ('e55a0000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   now() - interval '2 hours', now(), '{"provider":"apple","providers":["apple"]}', '{}'),
  ('e55a0000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   now() - interval '40 days', now(), '{"provider":"google","providers":["google"]}', '{}'),
  ('e55a0000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   now() - interval '10 hours', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('e55a0000-0000-4000-8000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   now() - interval '1 hour', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('e55a0000-0000-4000-8000-0000000000a5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   now() - interval '3 days', now(), '{"provider":"apple","providers":["apple"]}', '{}');

INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'cinq profils d''essai créés par handle_new_user', count(*) = 5, count(*)::text
  FROM public.profiles WHERE id::text LIKE 'e55a0000-0000-4000-8000-0000000000a_';

-- 3. La RPC (auth.uid() posé par les claims, comme sous la session de l'app).
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'RPC sans personne connectée : false', r IS FALSE, r::text
  FROM (SELECT public.poser_origine_inscription('facebook', NULL, NULL, NULL, NULL, NULL, now()) AS r) s;

SELECT set_config('request.jwt.claims', '{"sub":"e55a0000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'RPC, 1re pose (compte de 2 h, capture 3 h avant) : true', r IS TRUE, r::text
  FROM (SELECT public.poser_origine_inscription('facebook', 'paid_social', 'automne_2026', 'contact@exemple.fr',
                                                'IwAR0essai', 'https://L.Facebook.com/l.php?u=x', now() - interval '3 hours') AS r) s;
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'RPC, 2e pose : false, rien d''écrasé', r IS FALSE, r::text
  FROM (SELECT public.poser_origine_inscription('google', 'cpc', 'autre', NULL, NULL, NULL, now() - interval '3 hours') AS r) s;
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'profil a1 : origine posée, contenu masqué, referrer réduit au domaine',
       p.acquisition_source = 'facebook' AND p.acquisition_medium = 'paid_social' AND p.acquisition_campaign = 'automne_2026'
   AND p.acquisition_content = '(masquée)' AND p.acquisition_referrer = 'https://l.facebook.com'
   AND p.acquisition_fbclid = 'IwAR0essai' AND p.acquisition_captured_at IS NOT NULL,
       concat_ws(' | ', p.acquisition_source, p.acquisition_medium, p.acquisition_campaign, p.acquisition_content, p.acquisition_referrer)
  FROM public.profiles p WHERE p.id = 'e55a0000-0000-4000-8000-0000000000a1';

SELECT set_config('request.jwt.claims', '{"sub":"e55a0000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'RPC, compte de 40 jours : false', r IS FALSE, r::text
  FROM (SELECT public.poser_origine_inscription('facebook', 'paid_social', NULL, NULL, NULL, NULL, now() - interval '41 days') AS r) s;

SELECT set_config('request.jwt.claims', '{"sub":"e55a0000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'RPC, capture 10 h après le compte : false (visite ultérieure, pas l''origine)', r IS FALSE, r::text
  FROM (SELECT public.poser_origine_inscription('direct', 'direct', NULL, NULL, NULL, NULL, now()) AS r) s;
SELECT set_config('request.jwt.claims', '', true);

-- 4. Suppression comme delete-account : profil sous service_role, PUIS auth.users.
SET LOCAL ROLE service_role;
DELETE FROM public.profiles WHERE id = 'e55a0000-0000-4000-8000-0000000000a1';
RESET ROLE;
DELETE FROM auth.users WHERE id = 'e55a0000-0000-4000-8000-0000000000a1';

INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'a1 supprimé (profil puis compte) : UNE ligne anonyme, juste',
       count(*) = 1
   AND bool_and(o.source = 'facebook' AND o.medium = 'paid_social' AND o.campaign = 'automne_2026'
       AND o.content = '(masquée)' AND o.referrer_domaine = 'l.facebook.com' AND o.fbclid_present
       AND o.plateforme_inscription = 'web' AND o.fournisseur = 'apple' AND o.palier = 'free'
       AND o.canal_paiement IS NULL AND o.anciennete = 'moins_1j' AND o.origine_captee
       AND NOT o.compte_essai AND NOT o.rattrapage
       AND o.supprime_le = (now() AT TIME ZONE 'Europe/Paris')::date
       AND o.mois_inscription = date_trunc('month', (now() - interval '2 hours') AT TIME ZONE 'Europe/Paris')::date),
       string_agg(to_jsonb(o)::text, ' ')
  FROM public.origines_comptes_supprimes o;

-- 5. Un compte sans origine (la réalité d'aujourd'hui), adresse d'essai interne.
UPDATE public.profiles SET email = 'essai.origine+test7@exemple.invalid' WHERE id = 'e55a0000-0000-4000-8000-0000000000a5';
SET LOCAL ROLE service_role;
DELETE FROM public.profiles WHERE id = 'e55a0000-0000-4000-8000-0000000000a5';
RESET ROLE;
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'a5 supprimé : ligne sans origine, compte d''essai marqué, ancienneté moins_7j',
       count(*) = 1
   AND bool_and(NOT o.origine_captee AND o.source IS NULL AND o.plateforme_inscription IS NULL
       AND o.fournisseur = 'apple' AND o.compte_essai AND o.anciennete = 'moins_7j' AND o.palier = 'free'),
       string_agg(to_jsonb(o)::text, ' ')
  FROM public.origines_comptes_supprimes o WHERE o.compte_essai;

-- 6. L'archive ne retient JAMAIS une suppression (échec forcé de l'insertion).
ALTER TABLE public.origines_comptes_supprimes ADD CONSTRAINT essai_echec_force CHECK (false) NOT VALID;
SET LOCAL ROLE service_role;
DELETE FROM public.profiles WHERE id = 'e55a0000-0000-4000-8000-0000000000a4';
RESET ROLE;
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'archive en échec : la suppression passe quand même, aucune ligne de plus',
       NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = 'e55a0000-0000-4000-8000-0000000000a4')
   AND (SELECT count(*) FROM public.origines_comptes_supprimes) = 2,
       (SELECT count(*) FROM public.origines_comptes_supprimes)::text;
ALTER TABLE public.origines_comptes_supprimes DROP CONSTRAINT essai_echec_force;

-- 7. La vue : vivants + partis.
INSERT INTO essai_resultats (controle, ok, detail)
SELECT 'vue : 2 partis, et autant de vivants que de profils',
       count(*) FILTER (WHERE parti) = 2
   AND count(*) FILTER (WHERE NOT parti) = (SELECT count(*) FROM public.profiles),
       format('partis %s, vivants %s', count(*) FILTER (WHERE parti), count(*) FILTER (WHERE NOT parti))
  FROM public.origines_inscriptions;

-- 8. Verdict : l'exception annule TOUT (migration comprise) et rend le bilan.
DO $$
DECLARE
  v_bilan  text;
  v_echecs integer;
BEGIN
  SELECT string_agg(format('%s %s%s', CASE WHEN ok THEN 'OK' ELSE 'KO' END, controle,
                           CASE WHEN ok OR detail IS NULL THEN '' ELSE ' [' || left(detail, 300) || ']' END), E'\n' ORDER BY le),
         count(*) FILTER (WHERE NOT ok)
    INTO v_bilan, v_echecs
    FROM essai_resultats;
  RAISE EXCEPTION E'ESSAI À BLANC TERMINÉ — tout est annulé. % échec(s) sur % contrôles :\n%',
    v_echecs, (SELECT count(*) FROM essai_resultats), v_bilan;
END $$;

ROLLBACK;
