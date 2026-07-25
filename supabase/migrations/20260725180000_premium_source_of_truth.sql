-- ── Résiliation = fin du premium, partout (2026-07-25) ───────────────────────
-- Règle métier tranchée : un abonnement résilié/expiré ne laisse plus de
-- statut premium. L'ancienne expression (is_premium OR is_founder OR
-- apple_original_transaction_id OR google_purchase_token) confondait « a un
-- jour eu un abonnement/id » avec « abonnement actif » : un Apple expiré
-- restait premium à vie (2 comptes réels sur-crédités 150 Pépites/mois), un
-- founder Stripe résilié l'aurait été aussi (is_founder jamais retiré).
--
-- Nouvelle source de vérité : is_premium/is_pro, maintenus par les 4 flux de
-- paiement (apple-iap-webhook, validate-apple-receipt post-b80429b,
-- google-play-webhook, recomputeStripeFlags) + is_comped, marqueur EXPLICITE
-- des comptes offerts sans abonnement (remplace l'usage implicite de
-- is_founder et des ids résiduels). is_founder redevient un simple marqueur
-- historique/tarifaire, sans effet sur l'accès.
--
-- Expression premium canonique (CLAUDE.md mis à jour dans le même commit) :
--   is_premium = true OR is_pro = true OR is_comped = true
--
-- Simulation exécutée avant application : sur 452 profils, EXACTEMENT 2
-- changent de tier (les 2 Apple expirés 794f0be6 / 6d3c2e39, premium→free,
-- voulu) ; Thomas et sbooby.stan restent premium via is_comped ; Mériné
-- reste premium via son abonnement Stripe réel (vérifié sur le dashboard
-- Stripe, past_due mais actif). Les soldes 150 des 2 comptes rétrogradés
-- s'auto-corrigent au sweep suivant (grant_monthly_coins ÉCRASE
-- included_balance au montant du tier).

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_comped boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.profiles.is_comped IS
  'Premium offert sans abonnement actif (décision explicite). Seul signal premium légitime hors is_premium/is_pro — is_founder et les ids Apple/Google n''en sont plus.';

-- Comped confirmés par Nico le 25/07 : Thomas (upgrade bug voice engine,
-- gardé) et sbooby.stan (comped volontaire).
UPDATE public.profiles SET is_comped = true
WHERE id IN ('6dbb1f38-d96c-492e-a065-92993f42dac5', '5074ab96-3781-4410-a495-ece7f5316204');

-- ── Sweep quotidien : nouveau classement de tier ─────────────────────────────
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
             WHEN is_premium = true OR is_comped = true THEN 'premium'
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

-- ── spend_coins_and_publish : lazy grant au nouveau tier ─────────────────────
-- Base = définition LIVE du 25/07 (garde anti-republication 20260725150000
-- incluse) ; seul le CASE du tier change.
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
  v_conflicts jsonb;
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

  -- Garde anti-republication (20260725150000) — placée AVANT le pricing et le
  -- FOR UPDATE du wallet : un refus ne débite rien et ne pose aucun verrou.
  SELECT jsonb_agg(DISTINCT j->>'platform') INTO v_conflicts
  FROM jsonb_array_elements(p_jobs) AS j
  WHERE NULLIF(j->>'inventaire_id','') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM cross_post_jobs c
      WHERE c.user_id = v_user
        AND c.inventaire_id = NULLIF(j->>'inventaire_id','')::bigint
        AND c.platform = j->>'platform'
        AND COALESCE(c.action, 'publish') <> 'delete'
        AND (
          c.status IN ('pending', 'processing')
          OR (
            c.status = 'published'
            AND NOT EXISTS (
              SELECT 1 FROM cross_post_jobs d
              WHERE d.user_id = v_user
                AND d.inventaire_id = c.inventaire_id
                AND d.platform = c.platform
                AND d.action = 'delete'
                AND d.status = 'deleted'
                AND d.created_at > c.created_at
            )
          )
        )
    );
  IF v_conflicts IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'already_published',
      'platforms', v_conflicts
    );
  END IF;

  SELECT value INTO v_price FROM coin_config WHERE key = 'price_' || p_photo_option;
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;

  -- Grant mensuel lazy (2026-07-23) : un inscrit du jour a ses Pépites dès sa
  -- première action payante, sans attendre le sweep.
  IF v_wallet.included_granted_month IS DISTINCT FROM v_month THEN
    SELECT CASE
             WHEN p.is_pro = true THEN 'pro'
             WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
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
REVOKE ALL ON FUNCTION public.spend_coins_and_publish(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_coins_and_publish(text, jsonb) TO authenticated, service_role;

-- ── spend_coins_for_lens : lazy grant au nouveau tier ────────────────────────
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
  -- wallets tout neufs.
  IF v_wallet.included_granted_month IS DISTINCT FROM v_month THEN
    SELECT CASE
             WHEN p.is_pro = true THEN 'pro'
             WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
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

-- ── check_inventory_limit : limite Free 20 articles, nouveau statut ──────────
CREATE OR REPLACE FUNCTION public.check_inventory_limit()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_profile  record;
  v_count    int;
BEGIN
  -- Articles "vendu" ne comptent pas et ne déclenchent pas la limite
  IF NEW.statut = 'vendu' THEN
    RETURN NEW;
  END IF;

  SELECT is_premium, is_pro, is_comped
  INTO v_profile
  FROM profiles
  WHERE id = NEW.user_id;

  -- Pro : accès illimité
  IF v_profile.is_pro IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Premium : abonnement actif (is_premium, source de vérité des 4 flux de
  -- paiement) ou compte offert (is_comped)
  IF v_profile.is_premium IS TRUE OR v_profile.is_comped IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Free : limite à 20 articles actifs
  SELECT COUNT(*) INTO v_count
  FROM inventaire
  WHERE user_id = NEW.user_id AND statut != 'vendu';

  IF v_count >= 20 THEN
    RAISE EXCEPTION 'LIMIT_REACHED';
  END IF;

  RETURN NEW;
END;
$$;
