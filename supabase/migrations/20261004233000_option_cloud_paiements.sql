-- ═══════════════════════════════════════════════════════════════════════════
-- L'option « FillSell Cloud » vue par les PAIEMENTS — 04/10/2026 (branche
-- feat/option-cloud-paiements, NON APPLIQUÉE, NON DÉPLOYÉE)
-- ═══════════════════════════════════════════════════════════════════════════
-- Décisions FINALES de Nico (04/10 nuit) : Cloud = abonnement SÉPARÉ, 20 €/mois,
-- essai gratuit 7 jours, carte obligatoire ; ouvert à TOUS, comptes Free compris
-- (le compte garde les quotas de son palier) ; cumulable avec les paliers ; si
-- le palier prend fin, le compte repasse en Free et Cloud CONTINUE.
--
-- Ce fichier pose les COLONNES que les flux de paiement écrivent (stripe-webhook,
-- create-checkout-session, cancel-subscription, apple-iap-webhook,
-- google-play-webhook, validate-*) et UNE lecture serveur de l'état
-- (cloud_droits), miroir de etatCloud() dans _shared/cloud-option.js.
--
-- Cohabite avec la PROPOSITION de la branche conception/cloud-option
-- (PROPOSITION_20261004_cloud_option_et_pool_ip.sql.txt) : mêmes noms et mêmes
-- types pour is_cloud, cloud_essai_debut, cloud_essai_fin (IF NOT EXISTS des
-- deux côtés, l'ordre d'application est indifférent) ; les colonnes de canal et
-- de référence sont propres à ce fichier.
--
-- ⛔ À appliquer AVANT tout déploiement des fonctions de la branche (elles
--    écrivent ces colonnes). Une par une : db query --linked -f, puis
--    migration repair --linked --status applied 20261004233000.
--
-- INVERSE (à garder prêt) :
--   DROP FUNCTION IF EXISTS public.cloud_droits_moi();
--   DROP FUNCTION IF EXISTS public.cloud_droits(uuid);
--   ALTER TABLE public.profiles
--     DROP CONSTRAINT IF EXISTS profiles_cloud_canal_connu,
--     DROP CONSTRAINT IF EXISTS profiles_cloud_essai_coherent,
--     DROP COLUMN IF EXISTS cloud_canal, DROP COLUMN IF EXISTS cloud_ref,
--     DROP COLUMN IF EXISTS cloud_fin_periode, DROP COLUMN IF EXISTS cloud_annule_fin_periode;
--   -- is_cloud / cloud_essai_debut / cloud_essai_fin : partagées avec la
--   -- proposition conception ; ne les retirer que si elle n'est pas appliquée.

-- 1. LES COLONNES ──────────────────────────────────────────────────────────────
-- is_cloud                 : option PAYÉE (posée par les flux de paiement, comme is_premium)
-- cloud_essai_debut / fin  : l'essai de 7 jours, tel que le store ou Stripe l'a daté
--                            (trial_start/trial_end, purchaseDate/expiresDate,
--                            startTime/expiryTime). Jamais effacés : un seul essai par compte.
-- cloud_canal              : qui porte l'option : stripe | apple | google | offert
-- cloud_ref                : la référence chez ce canal (abonnement Stripe,
--                            originalTransactionId Apple, purchaseToken Google)
-- cloud_fin_periode        : fin de la période payée (ou de l'essai)
-- cloud_annule_fin_periode : renouvellement coupé par la personne, accès conservé jusqu'à l'échéance
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_cloud boolean,
  ADD COLUMN IF NOT EXISTS cloud_essai_debut timestamptz,
  ADD COLUMN IF NOT EXISTS cloud_essai_fin timestamptz,
  ADD COLUMN IF NOT EXISTS cloud_canal text,
  ADD COLUMN IF NOT EXISTS cloud_ref text,
  ADD COLUMN IF NOT EXISTS cloud_fin_periode timestamptz,
  ADD COLUMN IF NOT EXISTS cloud_annule_fin_periode boolean NOT NULL DEFAULT false;

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
REVOKE UPDATE (is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_canal, cloud_ref, cloud_fin_periode, cloud_annule_fin_periode)
  ON public.profiles FROM anon, authenticated;

COMMENT ON COLUMN public.profiles.is_cloud IS 'Abonnement FillSell Cloud PAYÉ (flux de paiement). Essai : voir cloud_essai_*. Ouvert à tous, indépendant du palier ; ne rend jamais premium.';
COMMENT ON COLUMN public.profiles.cloud_canal IS 'Canal qui porte l''option Cloud : stripe | apple | google | offert. Un événement d''un autre canal n''y touche pas.';
COMMENT ON COLUMN public.profiles.cloud_ref IS 'Référence de l''option chez son canal : id d''abonnement Stripe, originalTransactionId Apple, purchaseToken Google.';

-- 2. L'ÉTAT CLOUD D'UN COMPTE, côté serveur ──────────────────────────────────
-- Miroir EXACT de etatCloud() (_shared/cloud-option.js) pour l'orchestrateur
-- des navigateurs Cloud et les RPC.
--   etat  : aucun | essai | paye | essai_termine
--   actif : un navigateur Cloud doit-il tourner pour ce compte ?
-- Le palier n'entre PAS dans le calcul : Cloud tourne avec ou sans palier ;
-- les quotas restent ceux du palier (Free compris), calculés ailleurs.
CREATE OR REPLACE FUNCTION public.cloud_droits(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  p record;
  v_now timestamptz := now();
  v_essai_pris boolean;
  v_essai_en_cours boolean;
  v_etat text;
  v_actif boolean;
  v_jours integer;
BEGIN
  SELECT is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_canal, cloud_fin_periode, cloud_annule_fin_periode
    INTO p
    FROM public.profiles WHERE id = p_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('etat', 'aucun', 'actif', false, 'essai_pris', false);
  END IF;
  v_essai_pris := p.cloud_essai_debut IS NOT NULL;
  v_essai_en_cours := p.cloud_essai_debut IS NOT NULL AND p.cloud_essai_fin IS NOT NULL
                      AND p.cloud_essai_debut <= v_now AND v_now < p.cloud_essai_fin;
  IF COALESCE(p.is_cloud, false) THEN
    v_etat := 'paye'; v_actif := true;
  ELSIF v_essai_en_cours THEN
    v_etat := 'essai'; v_actif := true;
    v_jours := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (p.cloud_essai_fin - v_now)) / 86400.0))::integer;
  ELSIF v_essai_pris AND p.cloud_essai_fin IS NOT NULL AND v_now >= p.cloud_essai_fin THEN
    v_etat := 'essai_termine'; v_actif := false;
  ELSE
    v_etat := 'aucun'; v_actif := false;
  END IF;
  RETURN jsonb_build_object(
    'etat', v_etat,
    'actif', v_actif,
    'essai_pris', v_essai_pris,
    'essai_fin', p.cloud_essai_fin,
    'jours_restants', v_jours,
    'canal', p.cloud_canal,
    'fin_periode', p.cloud_fin_periode,
    'annule_fin_periode', COALESCE(p.cloud_annule_fin_periode, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cloud_droits(uuid) FROM PUBLIC, anon, authenticated;

-- La même chose pour SOI, depuis l'app (JWT utilisateur).
CREATE OR REPLACE FUNCTION public.cloud_droits_moi()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.cloud_droits(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.cloud_droits_moi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloud_droits_moi() TO authenticated;

-- 3. RELECTURE après application (à coller) ─────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'profiles' AND column_name LIKE 'cloud%' OR column_name = 'is_cloud';
-- SELECT public.cloud_droits('<uuid>');
