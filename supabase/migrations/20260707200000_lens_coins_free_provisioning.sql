-- ── Provisioning des Pépites pour TOUS les tiers (décision 2026-07-07) ───────
-- Prérequis à la bascule "chaque analyse Lens coûte des Pépites" : les comptes
-- Free n'ont aujourd'hui ni wallet (création lazy) ni grant. Deux filets :
--   1. le sweep quotidien couvre désormais tous les profils (tier 'free' par
--      défaut) au lieu des seuls abonnés ;
--   2. spend_coins_for_lens fait un grant lazy du mois courant avant débit —
--      couvre les comptes créés entre deux sweeps et les wallets tout neufs.
-- Après application : lancer une fois SELECT public.grant_monthly_coins_sweep();
-- pour provisionner l'existant AVANT de déployer lens-analysis.

-- ── Sweep : tous les profils, tier déduit de la détection premium canonique ──
-- (is_premium OR is_founder OR token Apple/Google → premium ; is_pro → pro ;
-- sinon free). Les tokens sont inclus pour ne pas classer 'free' un abonné IAP
-- dont is_premium serait retombé : un grant 'free' posé en premier bloquerait
-- son grant 150/600 du mois (idempotence par mois calendaire).
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
    res := grant_monthly_coins(r.id, r.tier);
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

-- ── spend_coins_for_lens : grant mensuel lazy avant débit ────────────────────
-- Identique à 20260706300000 hormis le bloc "grant lazy" : si le wallet n'a pas
-- reçu son grant du mois courant, il est posé (au tier du compte) avant de
-- vérifier le solde. grant_monthly_coins reste idempotent, le double-check sur
-- included_granted_month évite juste un aller-retour inutile.
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

  IF v_wallet.included_granted_month IS DISTINCT FROM v_month THEN
    SELECT CASE
             WHEN p.is_pro = true THEN 'pro'
             WHEN p.is_premium = true OR p.is_founder = true
               OR p.apple_original_transaction_id IS NOT NULL
               OR p.google_purchase_token IS NOT NULL THEN 'premium'
             ELSE 'free'
           END
      INTO v_tier
      FROM profiles p WHERE p.id = p_user_id;
    PERFORM grant_monthly_coins(p_user_id, COALESCE(v_tier, 'free'));
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
    jsonb_build_object('overflow', false)
  );

  -- Trace analytics de l'analyse (plus aucun quota ne lit ce compteur)
  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (p_user_id, 'lens', jsonb_build_object('coins', v_price));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price,
    'included_after',  v_wallet.included_balance - v_from_inc,
    'purchased_after', v_wallet.purchased_balance - v_from_pur
  );
END;
$$;
REVOKE ALL ON FUNCTION public.spend_coins_for_lens(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_coins_for_lens(uuid) TO service_role;
