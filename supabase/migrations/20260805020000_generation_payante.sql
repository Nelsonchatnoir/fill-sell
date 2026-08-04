-- ── Génération d'annonce payante : 1 Pépite, débit au clic (2026-08-05) ──────
-- generate_listing n'avait AUCUN débit : générer titre + description + prix
-- puis copier-coller ailleurs était un service LLM entièrement gratuit. La
-- génération devient un poste distinct de la grille (elle ne remplace rien :
-- photos 0/9/32 + publication 3/plateforme inchangées).
--
--   · price_generate = 1 dans coin_config — jamais de prix en dur ;
--   · kind 'spend_generate' (débit) et 'refund_generate' (échec remboursé
--     automatiquement par generate-listing) — la CHECK de coin_ledger est une
--     liste FERMÉE, tout nouveau kind DOIT y entrer par migration (leçon
--     release_publish du 04/08, attrapée par le test transactionnel) ;
--   · spend_coins_for_generate : clone du modèle spend_coins_for_lens LIVE
--     (grant lazy next_grant_at, débit included d'abord). PAS d'insert
--     usage_logs ici : generate-listing pose déjà sa ligne de télémétrie
--     'generate_listing' (avec le coût API réel) au succès — une seconde
--     ligne compterait double ;
--   · refund_coins gagne p_kind (défaut 'refund' : lens-analysis, qui
--     l'appelle avec 3 arguments nommés, ne change pas). DROP puis CREATE :
--     un CREATE OR REPLACE avec la nouvelle signature créerait une SURCHARGE
--     ambiguë pour PostgREST au lieu de remplacer.
--
-- Le plafond 15/60 générations/24 h posé le matin du 04/08 est retiré de
-- generate-listing dans la foulée : le débit le remplace.

INSERT INTO public.coin_config (key, value) VALUES ('price_generate', 1)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_kind_check;
ALTER TABLE public.coin_ledger ADD CONSTRAINT coin_ledger_kind_check
  CHECK (kind = ANY (ARRAY[
    'grant_monthly'::text, 'grant_upgrade'::text, 'purchase'::text,
    'spend_publish'::text, 'spend_lens'::text, 'refund'::text, 'admin'::text,
    'release_publish'::text, 'spend_generate'::text, 'refund_generate'::text
  ]));

-- ── spend_coins_for_generate : débit AVANT l'appel LLM ───────────────────────
CREATE OR REPLACE FUNCTION public.spend_coins_for_generate(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;
REVOKE ALL ON FUNCTION public.spend_coins_for_generate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_coins_for_generate(uuid) TO service_role;

-- ── refund_coins : kind paramétrable, comportement 3-args STRICTEMENT inchangé
DROP FUNCTION IF EXISTS public.refund_coins(uuid, integer, jsonb);
CREATE OR REPLACE FUNCTION public.refund_coins(
  p_user_id uuid, p_amount integer, p_metadata jsonb DEFAULT NULL::jsonb, p_kind text DEFAULT 'refund'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wallet coin_wallets%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'invalid_amount');
  END IF;
  IF p_kind NOT IN ('refund', 'refund_generate') THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'invalid_kind');
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
    p_kind, p_metadata
  );

  RETURN jsonb_build_object('refunded', true, 'amount', p_amount);
END;
$$;
REVOKE ALL ON FUNCTION public.refund_coins(uuid, integer, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_coins(uuid, integer, jsonb, text) TO service_role;
