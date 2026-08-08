-- RETOUR ARRIÈRE PARTIEL (2026-08-08 après-midi, décision Nico chiffrée) :
-- la génération d'annonce REDEVIENT payante en Pro (1 Pépite, tous paliers).
-- La PUBLICATION, elle, reste offerte en Pro (spend_coins_and_publish et la
-- contrainte coin_reservations_unit_price_check >= 0 NE BOUGENT PAS).
--
-- Raison : la génération est un passage obligé par article et n'était bornée
-- par rien une fois offerte (~0,017 € l'appel → un Pro devient déficitaire
-- vers ~900 articles/mois). Ramenée dans le budget des 600 Pépites, la
-- dépense maximale d'un Pro est bornée et la marge plancher repasse à ~6 €.
--
-- Cette migration ANNULE 20260808113843 (court-circuit is_pro) ET, de fait,
-- 20260808114934 (le plafond 200/24 h vivait DANS la branche gratuite — le
-- débit reprend son rôle de frein). La clé coin_config.pro_generate_daily_cap
-- et le traitement 'pro_daily_cap_reached' de generate-listing restent en
-- place, INERTES — canal prêt si un plafond redevient nécessaire.
-- Comportement restauré = celui d'avant le 08/08 midi : tout le monde paie
-- price_generate, ligne spend_generate au ledger, remboursement normal via
-- refund_coins (kind refund_generate) en cas d'échec.

create or replace function public.spend_coins_for_generate(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_price    integer;
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
