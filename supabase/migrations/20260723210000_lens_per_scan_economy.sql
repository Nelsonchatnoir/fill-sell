-- ── Levée du gate économie v2 : Lens payant-par-scan (2026-07-23, go Nico) ───
-- Trois morceaux, dans l'ordre :
--   1. monthly_grant_free = 30 — le grant Free promis par la landing devient
--      réel. Le sweep quotidien (04:15) crédite tous les Free existants dès
--      son prochain passage (leurs wallets ne sont pas stampés : grant plein).
--   2. spend_coins_for_lens : grant mensuel LAZY avant débit + metadata
--      per_scan (plus un « overflow » — chaque analyse coûte désormais).
--   3. spend_coins_and_publish : même grant lazy — un inscrit du jour doit
--      pouvoir publier avant le sweep du lendemain.
-- Les deux réécritures partent des définitions LIVE (pg_get_functiondef du
-- 2026-07-23), pas des fichiers de migration (leçon spend_lens).
-- Le retrait des quotas mensuels (5/120/250) se fait dans l'edge function
-- lens-analysis (déployée dans la foulée) : check_and_log_usage ne change pas,
-- il sert toujours voice-transcribe, voice-intent et deal-analysis.

INSERT INTO public.coin_config (key, value) VALUES ('monthly_grant_free', 30)
ON CONFLICT (key) DO NOTHING;

-- ── spend_coins_for_lens : lazy grant + per_scan ─────────────────────────────
CREATE OR REPLACE FUNCTION public.spend_coins_for_lens(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_price    integer;
  v_wallet   coin_wallets%ROWTYPE;
  v_total    integer;
  v_from_inc integer;
  v_from_pur integer;
  v_month    date := date_trunc('month', now())::date;
  v_tier     text;
BEGIN
  SELECT value INTO v_price FROM coin_config WHERE key = 'price_lens_overflow';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  -- Grant mensuel lazy : couvre les comptes créés entre deux sweeps et les
  -- wallets tout neufs. upgrade_monthly_grant délègue à grant_monthly_coins
  -- sur un mois vierge et gère aussi un éventuel top-up de tier ; le
  -- pré-check évite juste un aller-retour inutile sur le chemin chaud.
  IF v_wallet.included_granted_month IS DISTINCT FROM v_month THEN
    SELECT CASE
             WHEN p.is_pro = true THEN 'pro'
             WHEN p.is_premium = true OR p.is_founder = true
               OR p.apple_original_transaction_id IS NOT NULL
               OR p.google_purchase_token IS NOT NULL THEN 'premium'
             ELSE 'free'
           END INTO v_tier
    FROM profiles p WHERE p.id = p_user_id;
    PERFORM upgrade_monthly_grant(p_user_id, COALESCE(v_tier, 'free'));
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
$$;
REVOKE ALL ON FUNCTION public.spend_coins_for_lens(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_coins_for_lens(uuid) TO service_role;

-- ── spend_coins_and_publish : même grant lazy, reste identique au LIVE ───────
CREATE OR REPLACE FUNCTION public.spend_coins_and_publish(
  p_photo_option text,
  p_jobs         jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user      uuid := auth.uid();
  v_price     integer;
  v_wallet    coin_wallets%ROWTYPE;
  v_total     integer;
  v_from_inc  integer;
  v_from_pur  integer;
  v_job_count integer;
  v_month     date := date_trunc('month', now())::date;
  v_tier      text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthorized');
  END IF;
  IF p_photo_option NOT IN ('original','ia_light','ia_advanced') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_photo_option');
  END IF;
  v_job_count := COALESCE(jsonb_array_length(p_jobs), 0);
  IF v_job_count < 1 OR v_job_count > 5 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_jobs');
  END IF;

  SELECT value INTO v_price FROM coin_config WHERE key = 'price_' || p_photo_option;
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;

  -- Grant mensuel lazy (2026-07-23) : un inscrit du jour a désormais ses 30
  -- Pépites Free dès sa première action payante, sans attendre le sweep.
  IF v_wallet.included_granted_month IS DISTINCT FROM v_month THEN
    SELECT CASE
             WHEN p.is_pro = true THEN 'pro'
             WHEN p.is_premium = true OR p.is_founder = true
               OR p.apple_original_transaction_id IS NOT NULL
               OR p.google_purchase_token IS NOT NULL THEN 'premium'
             ELSE 'free'
           END INTO v_tier
    FROM profiles p WHERE p.id = v_user;
    PERFORM upgrade_monthly_grant(v_user, COALESCE(v_tier, 'free'));
    SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;
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
  WHERE user_id = v_user;

  INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, photo_option,
                               title, description, price, photos, platform_fields)
  SELECT
    v_user,
    NULLIF(j->>'inventaire_id','')::bigint,
    j->>'platform',
    'pending',
    p_photo_option,
    j->>'title',
    j->>'description',
    NULLIF(j->>'price','')::numeric,
    j->'photos',
    j->'platform_fields'
  FROM jsonb_array_elements(p_jobs) AS j;

  INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
  VALUES (
    v_user, -v_price,
    v_wallet.included_balance - v_from_inc,
    v_wallet.purchased_balance - v_from_pur,
    'spend_publish',
    jsonb_build_object('photo_option', p_photo_option, 'platforms', v_job_count)
  );

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'publish', jsonb_build_object('coins', v_price, 'photo_option', p_photo_option));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price,
    'included_after',  v_wallet.included_balance - v_from_inc,
    'purchased_after', v_wallet.purchased_balance - v_from_pur
  );
END;
$$;
-- Grants inchangés : cette RPC est appelée par le client authentifié.
REVOKE ALL ON FUNCTION public.spend_coins_and_publish(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_coins_and_publish(text, jsonb) TO authenticated, service_role;
