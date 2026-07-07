-- ── Lens : chaque analyse coûte des Pépites, tous tiers (décision 2026-07-07) ──
-- Fin du quota mensuel inclus (free=5 / premium=120 / pro=250) et du frein
-- journalier Premium 10/j. Nouvelle grille :
--   * toute analyse Lens coûte price_lens_overflow Pépites (6 → 9)
--   * grants mensuels : free=30 (nouveau), premium=150 (inchangé), pro=800 → 600
-- La bascule effective côté serveur est le déploiement de lens-analysis ;
-- cette migration ne fait que préparer la config et ouvrir grant_monthly_coins
-- au tier 'free'. Prérequis avant déploiement : provisionner les Free existants
-- (cf. 20260707200000 + SELECT grant_monthly_coins_sweep()).

UPDATE public.coin_config SET value = 600, updated_at = now()
WHERE key = 'monthly_grant_pro';

INSERT INTO public.coin_config (key, value) VALUES ('monthly_grant_free', 30)
ON CONFLICT (key) DO NOTHING;

UPDATE public.coin_config SET value = 9, updated_at = now()
WHERE key = 'price_lens_overflow';

-- ── grant_monthly_coins : accepte le tier 'free' ────────────────────────────
-- Identique à 20260706100000 hormis la liste des tiers autorisés.
CREATE OR REPLACE FUNCTION public.grant_monthly_coins(
  p_user_id uuid,
  p_tier    text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_amount integer;
  v_month  date := date_trunc('month', now())::date;
  v_wallet coin_wallets%ROWTYPE;
BEGIN
  IF p_tier NOT IN ('free','premium','pro') THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'invalid_tier');
  END IF;
  SELECT value INTO v_amount FROM coin_config WHERE key = 'monthly_grant_' || p_tier;
  IF v_amount IS NULL THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'grant_not_configured');
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet.included_granted_month = v_month THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'already_granted', 'month', v_month);
  END IF;

  UPDATE coin_wallets SET
    included_balance       = v_amount,   -- reset mensuel, pas de report des incluses
    included_granted_month = v_month,
    updated_at             = now()
  WHERE user_id = p_user_id;

  INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, ref, metadata)
  VALUES (
    p_user_id, v_amount - v_wallet.included_balance, v_amount, v_wallet.purchased_balance,
    'grant_monthly',
    'grant_monthly:' || p_user_id || ':' || to_char(v_month, 'YYYY-MM'),
    jsonb_build_object('tier', p_tier)
  );

  RETURN jsonb_build_object('granted', true, 'amount', v_amount, 'month', v_month);
END;
$$;
REVOKE ALL ON FUNCTION public.grant_monthly_coins(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_monthly_coins(uuid, text) TO service_role;
