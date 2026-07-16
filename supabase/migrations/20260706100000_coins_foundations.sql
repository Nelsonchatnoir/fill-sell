-- ── Système de pièces — Phase 1 : fondations ────────────────────────────────
-- Grille validée le 2026-07-06 :
--   actions  : original=3, ia_light=12, ia_advanced=35 pièces (1 pièce = 0,05 € facial)
--   quotas   : premium=150/mois, pro=800/mois (remis à zéro chaque mois, pas de report)
--   packs    : 100/4,99 · 220/9,99 · 460/19,99 · 1150/49,99 € (crédités par les webhooks, Phase 2)
-- Principes :
--   * coin_ledger = source de vérité auditable ; coin_wallets = cache des soldes
--   * client : LECTURE SEULE (RLS own rows) — toute écriture passe par les RPC
--   * spend_coins_and_publish = débit ATOMIQUE lié à l'insert cross_post_jobs
--     (le user est pris dans auth.uid(), jamais dans le payload)
--   * grant/credit : réservés au service_role (edge functions / webhooks), idempotents

-- ── Config ajustable sans redéploiement ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coin_config (
  key        text PRIMARY KEY,
  value      integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.coin_config (key, value) VALUES
  ('price_original',        3),
  ('price_ia_light',       12),
  ('price_ia_advanced',    35),
  ('monthly_grant_premium', 150),
  ('monthly_grant_pro',     800)
ON CONFLICT (key) DO NOTHING;
ALTER TABLE public.coin_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coin_config readable by all users" ON public.coin_config FOR SELECT USING (true);
GRANT SELECT ON public.coin_config TO authenticated;

-- ── Portefeuille (cache) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coin_wallets (
  user_id                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  included_balance       integer NOT NULL DEFAULT 0 CHECK (included_balance  >= 0),
  purchased_balance      integer NOT NULL DEFAULT 0 CHECK (purchased_balance >= 0),
  included_granted_month date,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coin_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own wallet read" ON public.coin_wallets FOR SELECT USING (auth.uid() = user_id);
GRANT SELECT ON public.coin_wallets TO authenticated;

-- ── Ledger (source de vérité) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coin_ledger (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta           integer NOT NULL,
  included_after  integer NOT NULL,
  purchased_after integer NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('grant_monthly','purchase','spend_publish','refund','admin')),
  ref             text,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS coin_ledger_ref_unique ON public.coin_ledger (ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS coin_ledger_user_idx ON public.coin_ledger (user_id, created_at DESC);
ALTER TABLE public.coin_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ledger read" ON public.coin_ledger FOR SELECT USING (auth.uid() = user_id);
GRANT SELECT ON public.coin_ledger TO authenticated;

-- ── RPC : débit atomique + insertion des jobs de publication ────────────────
-- Appelé par le client authentifié à l'étape Publier. Tout ou rien :
-- si l'insert des jobs échoue, aucune pièce n'est débitée (même transaction).
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

  v_total := v_wallet.included_balance + v_wallet.purchased_balance;
  IF v_total < v_price THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'insufficient_coins',
      'price', v_price, 'balance', v_total
    );
  END IF;

  -- Débit : pièces incluses d'abord, achetées ensuite
  v_from_inc := LEAST(v_wallet.included_balance, v_price);
  v_from_pur := v_price - v_from_inc;

  UPDATE coin_wallets SET
    included_balance  = included_balance  - v_from_inc,
    purchased_balance = purchased_balance - v_from_pur,
    updated_at        = now()
  WHERE user_id = v_user;

  -- Insertion des jobs — user_id imposé côté serveur, photo_option imposée
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

  -- Continuité analytics avec l'existant (feature publish)
  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'publish', jsonb_build_object('coins', v_price, 'photo_option', p_photo_option));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price,
    'included_after',  v_wallet.included_balance - v_from_inc,
    'purchased_after', v_wallet.purchased_balance - v_from_pur
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.spend_coins_and_publish(text, jsonb) TO authenticated;

-- ── RPC : grant mensuel (service_role uniquement — webhooks + cron filet) ────
-- Remet included_balance au quota du tier, une seule fois par mois calendaire.
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
  IF p_tier NOT IN ('premium','pro') THEN
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

-- ── RPC : crédit d'un pack acheté (service_role uniquement, idempotent) ─────
-- p_ref = identifiant unique de la transaction (Apple/Google/Stripe) :
-- un même reçu rejoué ne crédite jamais deux fois (index unique sur ledger.ref).
CREATE OR REPLACE FUNCTION public.credit_purchased_coins(
  p_user_id  uuid,
  p_amount   integer,
  p_ref      text,
  p_metadata jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wallet coin_wallets%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('credited', false, 'reason', 'invalid_amount');
  END IF;
  IF p_ref IS NULL OR length(trim(p_ref)) = 0 THEN
    RETURN jsonb_build_object('credited', false, 'reason', 'missing_ref');
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  BEGIN
    INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, ref, metadata)
    VALUES (
      p_user_id, p_amount,
      v_wallet.included_balance, v_wallet.purchased_balance + p_amount,
      'purchase', p_ref, p_metadata
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('credited', false, 'reason', 'already_credited', 'ref', p_ref);
  END;

  UPDATE coin_wallets SET
    purchased_balance = purchased_balance + p_amount,
    updated_at        = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('credited', true, 'amount', p_amount,
    'purchased_after', v_wallet.purchased_balance + p_amount);
END;
$$;
REVOKE ALL ON FUNCTION public.credit_purchased_coins(uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_purchased_coins(uuid, integer, text, jsonb) TO service_role;
