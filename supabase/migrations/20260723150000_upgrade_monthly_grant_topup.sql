-- ── Top-up des Pépites incluses au changement de tier en cours de mois ───────
-- (2026-07-23) grant_monthly_coins est idempotent par MOIS, pas par tier. Or le
-- sweep quotidien crédite TOUS les profils (free compris) : quand quelqu'un
-- s'abonne ou upgrade en cours de mois, son grant du mois est DÉJÀ posé et le
-- webhook tombe sur already_granted — un nouveau Premium restait à 25 Pépites,
-- un Premium passé Pro restait à 150, jusqu'au 1er du mois suivant.
--
-- upgrade_monthly_grant(p_user_id, p_tier) :
--   · mois vierge → délègue à grant_monthly_coins (grant plein, comportement
--     historique inchangé) ;
--   · déjà crédité ce mois → complète la DIFFÉRENCE entre le grant du tier
--     déjà crédité (lu dans le ledger du mois : grant_monthly puis
--     grant_upgrade successifs) et celui du nouveau tier. On ajoute le delta
--     au solde restant — jamais de reset : ce qui a été dépensé reste dépensé,
--     l'utilisateur finit comme s'il avait été crédité du bon tier au départ.
--   · delta <= 0 (downgrade, replay, tier identique) → no-op : JAMAIS de
--     claw-back en cours de mois.
-- Idempotence : ref unique grant_upgrade:<uid>:<YYYY-MM>:<tier> (index
-- coin_ledger_ref_unique) + lock FOR UPDATE sur le wallet.

ALTER TABLE public.coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_kind_check;
ALTER TABLE public.coin_ledger ADD CONSTRAINT coin_ledger_kind_check
  CHECK (kind IN ('grant_monthly','grant_upgrade','purchase','spend_publish','refund','admin'));

CREATE OR REPLACE FUNCTION public.upgrade_monthly_grant(
  p_user_id uuid,
  p_tier    text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_month      date := date_trunc('month', now())::date;
  v_wallet     coin_wallets%ROWTYPE;
  v_old_tier   text;
  v_old_amount integer;
  v_new_amount integer;
  v_delta      integer;
  v_ref        text;
BEGIN
  IF p_tier NOT IN ('free','premium','pro') THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'invalid_tier');
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  -- Pas encore crédité ce mois-ci : grant plein classique.
  IF v_wallet.included_granted_month IS DISTINCT FROM v_month THEN
    RETURN grant_monthly_coins(p_user_id, p_tier);
  END IF;

  -- Tier le plus récemment crédité ce mois (grant initial, corrigé par les
  -- top-ups successifs — free→premium puis premium→pro donne bien deux deltas).
  SELECT l.metadata->>'tier' INTO v_old_tier
  FROM coin_ledger l
  WHERE l.user_id = p_user_id
    AND l.kind IN ('grant_monthly','grant_upgrade')
    AND l.created_at >= v_month
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT 1;
  -- Wallet stampé sans ligne de ledger ce mois (ne devrait pas exister) :
  -- on suppose 'free', le pire cas est un léger sur-crédit, jamais un blocage.
  v_old_tier := COALESCE(v_old_tier, 'free');

  SELECT value INTO v_new_amount FROM coin_config WHERE key = 'monthly_grant_' || p_tier;
  IF v_new_amount IS NULL THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'grant_not_configured');
  END IF;
  SELECT value INTO v_old_amount FROM coin_config WHERE key = 'monthly_grant_' || v_old_tier;
  v_old_amount := COALESCE(v_old_amount, 0);

  v_delta := v_new_amount - v_old_amount;
  IF v_delta <= 0 THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'no_upgrade_needed',
                              'from_tier', v_old_tier, 'tier', p_tier);
  END IF;

  UPDATE coin_wallets SET
    included_balance = included_balance + v_delta,
    updated_at       = now()
  WHERE user_id = p_user_id;

  v_ref := 'grant_upgrade:' || p_user_id || ':' || to_char(v_month, 'YYYY-MM') || ':' || p_tier;
  INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, ref, metadata)
  VALUES (
    p_user_id, v_delta,
    v_wallet.included_balance + v_delta, v_wallet.purchased_balance,
    'grant_upgrade', v_ref,
    jsonb_build_object('tier', p_tier, 'from_tier', v_old_tier)
  );

  RETURN jsonb_build_object('granted', true, 'topup', true, 'amount', v_delta,
                            'from_tier', v_old_tier, 'tier', p_tier, 'month', v_month);
END;
$$;
REVOKE ALL ON FUNCTION public.upgrade_monthly_grant(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upgrade_monthly_grant(uuid, text) TO service_role;

-- ── Sweep quotidien : devient auto-réparateur ────────────────────────────────
-- Identique à 20260707200000 hormis l'appel : upgrade_monthly_grant au lieu de
-- grant_monthly_coins. Mois vierge → délégation (comportement inchangé) ;
-- tier du profil monté depuis le crédit du mois (webhook d'upgrade raté) →
-- top-up au plus tard le lendemain 04:15.
CREATE OR REPLACE FUNCTION public.grant_monthly_coins_sweep()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_granted int := 0;
  v_skipped int := 0;
  r record;
  res jsonb;
BEGIN
  FOR r IN
    SELECT id,
           CASE
             WHEN is_pro = true THEN 'pro'
             WHEN is_premium = true OR is_founder = true
               OR apple_original_transaction_id IS NOT NULL
               OR google_purchase_token IS NOT NULL THEN 'premium'
             ELSE 'free'
           END AS tier
    FROM profiles
  LOOP
    res := upgrade_monthly_grant(r.id, r.tier);
    IF COALESCE((res->>'granted')::boolean, false) THEN
      v_granted := v_granted + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('granted', v_granted, 'skipped', v_skipped, 'ran_at', now());
END;
$$;
REVOKE ALL ON FUNCTION public.grant_monthly_coins_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_monthly_coins_sweep() TO service_role;
