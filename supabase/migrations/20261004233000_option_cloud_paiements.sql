-- ═══════════════════════════════════════════════════════════════════════════
-- L'abonnement « FillSell Cloud » vu par les PAIEMENTS — 04/10/2026 (branche
-- feat/option-cloud-paiements, NON APPLIQUÉE, NON DÉPLOYÉE)
-- ═══════════════════════════════════════════════════════════════════════════
-- Décisions FINALES de Nico (04/10 nuit) : Cloud = abonnement SÉPARÉ, 20 €/mois,
-- essai gratuit 7 jours, carte obligatoire ; ouvert à TOUS, comptes Free compris
-- (le compte garde les quotas de son palier) ; cumulable avec les paliers ;
-- résilier ou perdre le palier n'arrête PAS Cloud. Un seul essai par compte
-- FillSell, tous canaux confondus.
--
-- ALIGNÉ sur src/utils/palier.js (cloudDuProfil, branche conception/cloud-option,
-- 83/83). Le socle du pool d'IP dédiées (20261005120000_cloud_socle_ip_dediee.sql,
-- 05/10) DÉPEND de ce fichier : colonnes et cloud_etat sont posés ICI seulement,
-- et ce fichier s'applique EN PREMIER.
--
-- ⛔ À appliquer AVANT tout déploiement des fonctions de la branche (elles
--    écrivent ces colonnes). Une par une : db query --linked -f, puis
--    migration repair --linked --status applied 20261004233000.
--
-- INVERSE (à garder prêt) :
--   DROP FUNCTION IF EXISTS public.cloud_etat_moi();
--   DROP FUNCTION IF EXISTS public.cloud_etat(uuid, timestamptz);
--   ALTER TABLE public.profiles
--     DROP CONSTRAINT IF EXISTS profiles_cloud_canal_connu,
--     DROP CONSTRAINT IF EXISTS profiles_cloud_essai_coherent,
--     DROP COLUMN IF EXISTS cloud_canal, DROP COLUMN IF EXISTS cloud_ref,
--     DROP COLUMN IF EXISTS cloud_periode_fin, DROP COLUMN IF EXISTS cloud_arret_fin_periode,
--     DROP COLUMN IF EXISTS cloud_essai_arrete,
--     DROP COLUMN IF EXISTS is_cloud, DROP COLUMN IF EXISTS cloud_essai_debut, DROP COLUMN IF EXISTS cloud_essai_fin;

-- 1. LES COLONNES ──────────────────────────────────────────────────────────────
-- is_cloud                : abonnement Cloud PAYÉ (flux de paiement, comme is_premium) ;
--                           ne rend JAMAIS premium.
-- cloud_essai_debut / fin : l'essai de 7 jours (null = jamais d'essai) ; un seul
--                           par compte, tous canaux ; jamais effacés.
-- cloud_essai_arrete      : essai arrêté par la personne — effet IMMÉDIAT, fin
--                           ramenée à l'arrêt, rien facturé.
-- cloud_periode_fin       : fin de la période payée en cours.
-- cloud_arret_fin_periode : arrêt demandé une fois payée : tourne jusqu'à
--                           cloud_periode_fin, puis s'arrête.
-- cloud_canal / cloud_ref : qui porte l'abonnement (stripe | apple | google |
--                           offert) et sa référence chez lui (id d'abonnement
--                           Stripe, originalTransactionId, purchaseToken).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_cloud boolean,
  ADD COLUMN IF NOT EXISTS cloud_essai_debut timestamptz,
  ADD COLUMN IF NOT EXISTS cloud_essai_fin timestamptz,
  ADD COLUMN IF NOT EXISTS cloud_essai_arrete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cloud_periode_fin timestamptz,
  ADD COLUMN IF NOT EXISTS cloud_arret_fin_periode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cloud_canal text,
  ADD COLUMN IF NOT EXISTS cloud_ref text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_cloud_essai_coherent') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_cloud_essai_coherent
      CHECK (cloud_essai_fin IS NULL OR (cloud_essai_debut IS NOT NULL AND cloud_essai_fin >= cloud_essai_debut));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_cloud_canal_connu') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_cloud_canal_connu
      CHECK (cloud_canal IS NULL OR cloud_canal IN ('stripe', 'apple', 'google', 'offert'));
  END IF;
END $$;

-- Comme is_premium : seul le serveur (service role) écrit ces colonnes.
REVOKE UPDATE (is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete, cloud_periode_fin,
               cloud_arret_fin_periode, cloud_canal, cloud_ref)
  ON public.profiles FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS profiles_is_cloud_idx ON public.profiles (id) WHERE is_cloud IS TRUE;

COMMENT ON COLUMN public.profiles.is_cloud IS 'Abonnement FillSell Cloud PAYÉ (flux de paiement). Ouvert à tous, indépendant du palier ; ne rend jamais premium.';
COMMENT ON COLUMN public.profiles.cloud_canal IS 'Canal qui porte Cloud : stripe | apple | google | offert. Un événement d''un autre canal n''y touche pas.';
COMMENT ON COLUMN public.profiles.cloud_essai_debut IS 'Début de l''essai Cloud. Un seul essai par compte FillSell, tous canaux : non null = essai déjà pris.';

-- 2. cloud_etat — MÊME RÈGLE que cloudDuProfil (src/utils/palier.js) ──────────
-- Mêmes noms, mêmes valeurs que l'app. Instants tronqués à la milliseconde
-- (comme Date.parse). Un compte inconnu rend « aucun ». Texte repris AU
-- CARACTÈRE PRÈS de la proposition de la branche conception (04/10 nuit).
CREATE OR REPLACE FUNCTION public.cloud_etat(p_user uuid, p_maintenant timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  -- ⛔ MÊME VALEUR que CLOUD_EXIGE_UN_PALIER (palier.js), changée le même jour.
  c_exige_un_palier CONSTANT boolean := false;
  v_now timestamptz := date_trunc('milliseconds', p_maintenant);
  v_is_cloud boolean; v_debut timestamptz; v_fin timestamptz; v_arrete boolean;
  v_periode timestamptz; v_arret_fp boolean;
  v_business boolean; v_pro boolean; v_premium boolean; v_comped boolean;
  v_essai_pris boolean; v_en_cours boolean; v_paye boolean; v_avec_formule boolean; v_palier_ok boolean;
  v_base jsonb;
BEGIN
  SELECT p.is_cloud, date_trunc('milliseconds', p.cloud_essai_debut), date_trunc('milliseconds', p.cloud_essai_fin),
         p.cloud_essai_arrete, date_trunc('milliseconds', p.cloud_periode_fin), p.cloud_arret_fin_periode,
         p.is_business, p.is_pro, p.is_premium, p.is_comped
    INTO v_is_cloud, v_debut, v_fin, v_arrete, v_periode, v_arret_fp, v_business, v_pro, v_premium, v_comped
    FROM public.profiles p WHERE p.id = p_user;
  v_essai_pris := v_debut IS NOT NULL;
  -- un essai arrêté s'arrête TOUT DE SUITE, même si la fin n'a pas bougé
  v_en_cours := v_debut IS NOT NULL AND v_fin IS NOT NULL AND v_debut <= v_now AND v_now < v_fin AND v_arrete IS NOT TRUE;
  v_paye := v_is_cloud IS TRUE;
  v_avec_formule := (v_business IS TRUE OR v_pro IS TRUE OR v_premium IS TRUE OR v_comped IS TRUE);
  v_palier_ok := NOT c_exige_un_palier OR v_avec_formule;
  v_base := jsonb_build_object(
    'essaiPris', v_essai_pris,
    'essaiArrete', v_essai_pris AND v_arrete IS TRUE,
    'essaiFin', CASE WHEN v_fin IS NULL THEN NULL
                     ELSE to_char(v_fin AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
    'joursRestants', NULL,
    'avecFormule', v_avec_formule,
    'periodeFin', CASE WHEN v_paye AND v_periode IS NOT NULL
                       THEN to_char(v_periode AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
    'arretPrevuLe', CASE WHEN v_paye AND v_arret_fp IS TRUE AND v_periode IS NOT NULL
                         THEN to_char(v_periode AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END);
  IF (v_paye OR v_en_cours) AND NOT v_palier_ok THEN
    RETURN v_base || jsonb_build_object('etat', 'suspendu', 'actif', false);
  END IF;
  IF v_paye THEN
    RETURN v_base || jsonb_build_object('etat', 'paye', 'actif', true);
  END IF;
  IF v_en_cours THEN
    RETURN v_base || jsonb_build_object('etat', 'essai', 'actif', true,
      'joursRestants', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_fin - v_now)) / 86400)::integer));
  END IF;
  IF v_essai_pris AND (v_arrete IS TRUE OR (v_fin IS NOT NULL AND v_now >= v_fin)) THEN
    RETURN v_base || jsonb_build_object('etat', 'essai_termine', 'actif', false);
  END IF;
  RETURN v_base || jsonb_build_object('etat', 'aucun', 'actif', false);
END;
$f$;
REVOKE ALL ON FUNCTION public.cloud_etat(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloud_etat(uuid, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.cloud_etat_moi()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT public.cloud_etat(auth.uid());
$f$;
REVOKE ALL ON FUNCTION public.cloud_etat_moi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloud_etat_moi() TO authenticated;

-- 3. RELECTURE après application (à coller) ─────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'profiles' AND (column_name LIKE 'cloud%' OR column_name = 'is_cloud');
-- SELECT public.cloud_etat('<uuid>');
