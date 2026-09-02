-- ═══════════════════════════════════════════════════════════════════════════
-- Bascule quotas (3/5) : compteur d'ANNONCES (générations IA), compteur de
-- SCANS Lens, et l'état des compteurs pour l'app
--
-- Décisions (réponses aux stops, 02/09 soir) :
-- · Le compteur d'annonces porte UNIQUEMENT les générations d'annonce par IA
--   (le seul geste qui coûte). Import Excel, saisie manuelle, sync, voix,
--   publication, republication : HORS compteur. Pas de trigger sur
--   inventaire, aucun point d'insertion client touché.
-- · DEUX points de passage serveur, et deux seulement :
--     generate-listing → spend_coins_for_generate (quota_annonces_*)
--     lens-analysis    → spend_coins_for_lens     (quota_scan_*)
--   Le refus tombe DANS le RPC, donc avant tout appel IA (les Edge appellent
--   le RPC avant le modèle — vérifié dans les deux fonctions).
-- · RÉGÉNÉRATION : une reprise du MÊME article (inventaire_id) sous 24 h ne
--   recompte pas — 42 % des générations sont des reprises de confort.
--   ⚠️ Limite ASSUMÉE et signalée : les générations sans inventaire_id
--   (article pas encore sauvé, corps item_data) ne peuvent pas être
--   dédupliquées — chacune compte. Le cache client de signature absorbe déjà
--   les reprises strictement identiques de ce chemin.
-- · Cycle = depuis le dernier grant du ledger (définition
--   d'upgrade_monthly_grant), repli début de mois. Tout se réarme le même
--   jour que le grant.
-- · Clé de quota absente → FAIL-OPEN (aucune limite) : cette migration peut
--   s'appliquer avant la 5/5 sans rien changer au comportement.
-- · Codes de refus : 'quota_annonces_atteint' {plafond, consommes} et
--   'quota_scan_atteint' {plafond, consommes}.
--
-- ⚠️ SIGNATURE : spend_coins_for_generate gagne p_inventaire_id. L'ancienne
-- surcharge (uuid) est DROPPÉE — la garder rendrait l'appel PostgREST
-- {p_user_id} AMBIGU entre les deux. Le paramètre a un DEFAULT : les appels
-- existants restent valides.
-- Réversible : re-CREATE des versions 20260902200000 (+ re-création de
-- l'ancienne signature). ⚠️ À appliquer explicitement. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Début du cycle d'abonnement d'un compte ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.debut_cycle_quotas(p_user_id uuid)
 RETURNS timestamptz
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT max(created_at) FROM coin_ledger
      WHERE user_id = p_user_id AND kind IN ('grant_monthly','grant_upgrade')),
    date_trunc('month', now())
  );
$$;

-- ── Générations d'annonce consommées sur le cycle (dédup régen 24 h) ────────
CREATE OR REPLACE FUNCTION public.quota_annonces_consommees(p_user_id uuid, p_cycle timestamptz)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT count(*)::int FROM usage_logs u
  WHERE u.user_id = p_user_id AND u.feature = 'generate_listing'
    AND u.created_at >= p_cycle
    AND NOT (
      u.metadata ? 'inventaire_id' AND EXISTS (
        SELECT 1 FROM usage_logs prev
        WHERE prev.user_id = u.user_id AND prev.feature = 'generate_listing'
          AND prev.metadata->>'inventaire_id' = u.metadata->>'inventaire_id'
          AND prev.created_at <  u.created_at
          AND prev.created_at >= u.created_at - interval '24 hours'
      )
    );
$$;

-- ── spend_coins_for_generate : le quota d'annonces vit ICI ──────────────────
DROP FUNCTION IF EXISTS public.spend_coins_for_generate(uuid);

CREATE OR REPLACE FUNCTION public.spend_coins_for_generate(p_user_id uuid, p_inventaire_id bigint DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_price     integer;
  v_wallet    coin_wallets%ROWTYPE;
  v_total     integer;
  v_from_inc  integer;
  v_from_pur  integer;
  v_tier      text;
  v_quota     integer;
  v_cycle     timestamptz;
  v_consommes integer;
  v_regen     boolean := false;
BEGIN
  SELECT CASE
           WHEN p.is_business = true THEN 'business'
           WHEN p.is_pro = true THEN 'pro'
           WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
           ELSE 'free'
         END INTO v_tier
  FROM profiles p WHERE p.id = p_user_id;
  v_tier := COALESCE(v_tier, 'free');

  -- ── QUOTA D'ANNONCES (bascule 02/09) — AVANT tout le reste ───────────────
  -- Régénération du même article sous 24 h : passe sans compter.
  IF p_inventaire_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM usage_logs u
      WHERE u.user_id = p_user_id AND u.feature = 'generate_listing'
        AND u.metadata->>'inventaire_id' = p_inventaire_id::text
        AND u.created_at >= now() - interval '24 hours'
    ) INTO v_regen;
  END IF;

  IF NOT v_regen THEN
    SELECT value INTO v_quota FROM coin_config WHERE key = 'quota_annonces_' || v_tier;
    IF v_quota IS NOT NULL AND v_quota > 0 THEN
      v_cycle := debut_cycle_quotas(p_user_id);
      v_consommes := quota_annonces_consommees(p_user_id, v_cycle);
      IF v_consommes >= v_quota THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'quota_annonces_atteint',
                                  'plafond', v_quota, 'consommes', v_consommes);
      END IF;
    END IF;
  END IF;

  SELECT value INTO v_price FROM coin_config WHERE key = 'price_generate';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  -- Prix nul (bascule 02/09) : rien à débiter, rien à écrire — la ligne
  -- usage_logs 'generate_listing' (le compteur) est posée par generate-listing
  -- en fin de course, avec l'inventaire_id et les coûts.
  IF v_price = 0 THEN
    RETURN jsonb_build_object('allowed', true, 'price', 0, 'regen', v_regen);
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
    PERFORM upgrade_monthly_grant(p_user_id, v_tier, null, 'lazy');
    SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  v_total := v_wallet.included_balance + v_wallet.purchased_balance;
  IF v_total < v_price THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'insufficient_coins',
      'price', v_price, 'balance', v_total
    );
  END IF;

  v_from_inc := LEAST(v_wallet.included_balance, v_price);
  v_from_pur := v_price - v_from_inc;

  UPDATE coin_wallets SET
    included_balance  = included_balance  - v_from_inc,
    purchased_balance = purchased_balance - v_from_pur,
    updated_at        = now()
  WHERE user_id = p_user_id;

  INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
  VALUES (
    p_user_id, -v_price,
    v_wallet.included_balance - v_from_inc,
    v_wallet.purchased_balance - v_from_pur,
    'spend_generate',
    NULL
  );

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price,
    'included_after',  v_wallet.included_balance - v_from_inc,
    'purchased_after', v_wallet.purchased_balance - v_from_pur
  );
END;
$function$;

-- ── spend_coins_for_lens : le quota de scans vit ICI ────────────────────────
CREATE OR REPLACE FUNCTION public.spend_coins_for_lens(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_price     integer;
  v_wallet    coin_wallets%ROWTYPE;
  v_total     integer;
  v_from_inc  integer;
  v_from_pur  integer;
  v_tier      text;
  v_quota     integer;
  v_consommes integer;
BEGIN
  SELECT CASE
           WHEN p.is_business = true THEN 'business'
           WHEN p.is_pro = true THEN 'pro'
           WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
           ELSE 'free'
         END INTO v_tier
  FROM profiles p WHERE p.id = p_user_id;
  v_tier := COALESCE(v_tier, 'free');

  -- ── QUOTA DE SCANS (bascule 02/09) — avant tout appel IA ─────────────────
  SELECT value INTO v_quota FROM coin_config WHERE key = 'quota_scan_' || v_tier;
  IF v_quota IS NOT NULL AND v_quota > 0 THEN
    SELECT count(*)::int INTO v_consommes FROM usage_logs
    WHERE user_id = p_user_id AND feature = 'lens'
      AND created_at >= debut_cycle_quotas(p_user_id);
    IF v_consommes >= v_quota THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'quota_scan_atteint',
                                'plafond', v_quota, 'consommes', v_consommes);
    END IF;
  END IF;

  SELECT value INTO v_price FROM coin_config WHERE key = 'price_lens_overflow';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  -- Prix nul : ni wallet ni ledger — la ligne usage_logs 'lens' reste posée
  -- (enrichie par lens-analysis, et c'est le COMPTEUR du quota ci-dessus).
  IF v_price = 0 THEN
    INSERT INTO usage_logs (user_id, feature, metadata)
    VALUES (p_user_id, 'lens', jsonb_build_object('coins', 0, 'model', 'per_scan'));
    RETURN jsonb_build_object('allowed', true, 'price', 0);
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
    PERFORM upgrade_monthly_grant(p_user_id, v_tier, null, 'lazy');
    SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  v_total := v_wallet.included_balance + v_wallet.purchased_balance;
  IF v_total < v_price THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'insufficient_coins',
      'price', v_price, 'balance', v_total
    );
  END IF;

  v_from_inc := LEAST(v_wallet.included_balance, v_price);
  v_from_pur := v_price - v_from_inc;

  UPDATE coin_wallets SET
    included_balance  = included_balance  - v_from_inc,
    purchased_balance = purchased_balance - v_from_pur,
    updated_at        = now()
  WHERE user_id = p_user_id;

  INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
  VALUES (
    p_user_id, -v_price,
    v_wallet.included_balance - v_from_inc,
    v_wallet.purchased_balance - v_from_pur,
    'spend_lens',
    jsonb_build_object('model', 'per_scan')
  );

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (p_user_id, 'lens', jsonb_build_object('coins', v_price, 'model', 'per_scan'));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price,
    'included_after',  v_wallet.included_balance - v_from_inc,
    'purchased_after', v_wallet.purchased_balance - v_from_pur
  );
END;
$function$;

-- ── quotas_etat() : l'état des compteurs pour l'app (en-tête, Lens, Stock) ──
-- Appelée par le CLIENT (auth.uid(), jamais de paramètre user) : une seule
-- source de vérité pour tous les compteurs affichés. Clé absente → plafond
-- null (l'app n'affiche alors pas de compteur pour ce geste).
CREATE OR REPLACE FUNCTION public.quotas_etat()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := auth.uid();
  v_tier  text;
  v_cycle timestamptz;
  v_qa integer; v_qs integer; v_qr integer; v_qrep integer;
  v_avie integer; v_depuis integer;
  v_ca integer; v_cs integer; v_cr integer; v_crep integer;
  v_repub jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;
  SELECT CASE
           WHEN p.is_business = true THEN 'business'
           WHEN p.is_pro = true THEN 'pro'
           WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
           ELSE 'free'
         END INTO v_tier
  FROM profiles p WHERE p.id = v_user;
  v_tier  := COALESCE(v_tier, 'free');
  v_cycle := debut_cycle_quotas(v_user);

  SELECT value INTO v_qa   FROM coin_config WHERE key = 'quota_annonces_'  || v_tier;
  SELECT value INTO v_qs   FROM coin_config WHERE key = 'quota_scan_'      || v_tier;
  SELECT value INTO v_qr   FROM coin_config WHERE key = 'quota_retouche_'  || v_tier;

  v_ca := quota_annonces_consommees(v_user, v_cycle);
  SELECT count(*)::int INTO v_cs FROM usage_logs
   WHERE user_id = v_user AND feature = 'lens' AND created_at >= v_cycle;
  SELECT count(*)::int INTO v_cr FROM usage_logs
   WHERE user_id = v_user AND feature = 'photo_retouche' AND created_at >= v_cycle;

  IF v_tier = 'free' THEN
    SELECT value INTO v_avie   FROM coin_config WHERE key = 'republication_avie_free';
    SELECT value INTO v_depuis FROM coin_config WHERE key = 'republication_avie_depuis';
    IF v_avie IS NOT NULL AND v_depuis IS NOT NULL THEN
      SELECT count(*)::int INTO v_crep FROM cross_post_jobs
       WHERE user_id = v_user AND action = 'republish'
         AND created_at >= to_timestamp(v_depuis);
      v_repub := jsonb_build_object('mode', 'avie', 'plafond', v_avie,
                                    'faites', v_crep,
                                    'restantes', GREATEST(0, v_avie - v_crep));
    ELSE
      v_repub := jsonb_build_object('mode', 'avie', 'plafond', NULL);
    END IF;
  ELSIF v_tier = 'business' THEN
    v_repub := jsonb_build_object('mode', 'illimite');
  ELSE
    SELECT value INTO v_qrep FROM coin_config WHERE key = 'quota_republication_' || v_tier;
    SELECT count(*)::int INTO v_crep FROM cross_post_jobs
     WHERE user_id = v_user AND action = 'republish' AND created_at >= v_cycle;
    v_repub := jsonb_build_object('mode', 'mensuel',
                                  'plafond', NULLIF(COALESCE(v_qrep, 0), 0),
                                  'faites', v_crep,
                                  'restantes', CASE WHEN COALESCE(v_qrep,0) > 0
                                    THEN GREATEST(0, v_qrep - v_crep) ELSE NULL END);
  END IF;

  RETURN jsonb_build_object(
    'palier', v_tier,
    'cycle_debut', v_cycle,
    'annonces',  jsonb_build_object('plafond', v_qa, 'consommes', v_ca,
                   'restantes', CASE WHEN v_qa IS NOT NULL THEN GREATEST(0, v_qa - v_ca) END),
    'scans',     jsonb_build_object('plafond', v_qs, 'consommes', v_cs,
                   'restantes', CASE WHEN v_qs IS NOT NULL THEN GREATEST(0, v_qs - v_cs) END),
    'retouches', jsonb_build_object('plafond', v_qr, 'consommes', v_cr,
                   'restantes', CASE WHEN v_qr IS NOT NULL THEN GREATEST(0, v_qr - v_cr) END),
    'republication', v_repub
  );
END;
$function$;
