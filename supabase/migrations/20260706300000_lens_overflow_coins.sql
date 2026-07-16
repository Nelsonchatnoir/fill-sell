-- ── Lens : dépassement de quota payé en pièces ───────────────────────────────
-- Contexte (décisions 2026-07-06) : qualité d'analyse unifiée pour tous les
-- tiers (web_search pour tout le monde), quotas mensuels inclus : free=5,
-- premium=120 (+10/jour conservé), pro=250. Au-delà du quota mensuel, chaque
-- analyse coûte price_lens_overflow pièces — le quota inclus n'est JAMAIS
-- débité en pièces, seul le dépassement l'est.

INSERT INTO public.coin_config (key, value) VALUES ('price_lens_overflow', 6)
ON CONFLICT (key) DO NOTHING;

-- Nouveau type de mouvement dans le ledger
ALTER TABLE public.coin_ledger DROP CONSTRAINT coin_ledger_kind_check;
ALTER TABLE public.coin_ledger ADD CONSTRAINT coin_ledger_kind_check
  CHECK (kind IN ('grant_monthly','purchase','spend_publish','spend_lens','refund','admin'));

-- ── Débit atomique d'une analyse hors quota (appelé par lens-analysis) ──────
-- Débite les pièces ET journalise l'usage 'lens' dans la même transaction.
-- Appelé en service_role (edge function) : p_user_id vient du JWT vérifié.
CREATE OR REPLACE FUNCTION public.spend_coins_for_lens(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_price    integer;
  v_wallet   coin_wallets%ROWTYPE;
  v_total    integer;
  v_from_inc integer;
  v_from_pur integer;
BEGIN
  SELECT value INTO v_price FROM coin_config WHERE key = 'price_lens_overflow';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

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
    jsonb_build_object('overflow', true)
  );

  -- L'analyse hors quota compte aussi dans usage_logs (affichage/analytics) ;
  -- le quota mensuel étant déjà atteint, ça ne re-verrouille rien.
  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (p_user_id, 'lens', jsonb_build_object('overflow', true, 'coins', v_price));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price,
    'included_after',  v_wallet.included_balance - v_from_inc,
    'purchased_after', v_wallet.purchased_balance - v_from_pur
  );
END;
$$;
REVOKE ALL ON FUNCTION public.spend_coins_for_lens(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_coins_for_lens(uuid) TO service_role;

-- ── Remboursement best-effort (échec d'analyse APRÈS débit) ─────────────────
-- Crédite en solde "acheté" (n'expire jamais), quel que soit le solde d'origine
-- du débit — au bénéfice de l'utilisateur, et sans logique de traçage complexe.
CREATE OR REPLACE FUNCTION public.refund_coins(
  p_user_id  uuid,
  p_amount   integer,
  p_metadata jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wallet coin_wallets%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'invalid_amount');
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  UPDATE coin_wallets SET
    purchased_balance = purchased_balance + p_amount,
    updated_at        = now()
  WHERE user_id = p_user_id;

  INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
  VALUES (
    p_user_id, p_amount,
    v_wallet.included_balance, v_wallet.purchased_balance + p_amount,
    'refund', p_metadata
  );

  RETURN jsonb_build_object('refunded', true, 'amount', p_amount);
END;
$$;
REVOKE ALL ON FUNCTION public.refund_coins(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_coins(uuid, integer, jsonb) TO service_role;
