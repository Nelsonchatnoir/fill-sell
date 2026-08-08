-- Génération d'annonce IA OFFERTE en Pro (2026-08-08, suite immédiate de la
-- publication offerte — migration 20260808111536). Demande Nico : « La
-- génération à 1 pépite doit être gratuite aussi ! »
--
-- spend_coins_for_generate rend allowed=true, price=0 pour is_pro, SANS
-- débit, SANS ligne de ledger (une ligne spend_generate à 0 par génération
-- ne serait que du bruit dans l'historique) et sans toucher au wallet.
-- generate-listing est déjà compatible sans redéploiement : il rembourse
-- `spend.price` et saute le remboursement si price <= 0.
--
-- Restent payés en Pro : retouche photos (0/9/32) et Lens (6). is_pro est la
-- seule condition (un is_comped est un Premium offert, il paie sa génération).

create or replace function public.spend_coins_for_generate(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_price    integer;
  v_is_pro   boolean := false;
  v_wallet   coin_wallets%ROWTYPE;
  v_total    integer;
  v_from_inc integer;
  v_from_pur integer;
  v_tier     text;
BEGIN
  SELECT value INTO v_price FROM coin_config WHERE key = 'price_generate';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  -- ── Génération OFFERTE en Pro (2026-08-08) ────────────────────────────────
  SELECT COALESCE(is_pro, false) INTO v_is_pro FROM profiles WHERE id = p_user_id;
  IF v_is_pro THEN
    RETURN jsonb_build_object('allowed', true, 'price', 0, 'pro_free_generation', true);
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
    SELECT CASE
             WHEN p.is_pro = true THEN 'pro'
             WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
             ELSE 'free'
           END INTO v_tier
    FROM profiles p WHERE p.id = p_user_id;
    PERFORM upgrade_monthly_grant(p_user_id, COALESCE(v_tier, 'free'), null, 'lazy');
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
