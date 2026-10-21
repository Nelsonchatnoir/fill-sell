-- INVERSE de 20261020200000_securite_2010_controle_identite : les trois corps tels que lus en prod
-- le 20/10 (≈ 22:00), avant la garde. Droits inchangés.

CREATE OR REPLACE FUNCTION public.spend_coins_for_generate(p_user_id uuid, p_inventaire_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_price     integer;
  v_wallet    coin_wallets%ROWTYPE;
  v_total     integer;
  v_from_inc  integer;
  v_from_pur  integer;
  v_tier      text;
  v_quota     integer;
  v_cycle     timestamptz;
  v_consommes integer;
  v_regen     boolean := false;
BEGIN
  SELECT CASE
           WHEN p.is_business = true THEN 'business'
           WHEN p.is_pro = true THEN 'pro'
           WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
           ELSE 'free'
         END INTO v_tier
  FROM profiles p WHERE p.id = p_user_id;
  v_tier := COALESCE(v_tier, 'free');

  -- QUOTA D'ANNONCES (bascule 02/09) — AVANT tout le reste. Régénération du
  -- même article sous 24 h : passe sans compter.
  IF p_inventaire_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM usage_logs u
      WHERE u.user_id = p_user_id AND u.feature = 'generate_listing'
        AND u.metadata->>'inventaire_id' = p_inventaire_id::text
        AND u.created_at >= now() - interval '24 hours'
    ) INTO v_regen;
  END IF;

  IF NOT v_regen THEN
    -- (11/10) Le réglage du compte prime sur le quota du palier.
    v_quota := quota_annonces_compte(p_user_id, v_tier);
    IF v_quota IS NOT NULL AND v_quota > 0 THEN
      v_cycle := debut_cycle_quotas(p_user_id);
      v_consommes := quota_annonces_consommees(p_user_id, v_cycle);
      IF v_consommes >= v_quota THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'quota_annonces_atteint',
                                  'plafond', v_quota, 'consommes', v_consommes);
      END IF;
    END IF;
  END IF;

  SELECT value INTO v_price FROM coin_config WHERE key = 'price_generate';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  IF v_price = 0 THEN
    RETURN jsonb_build_object('allowed', true, 'price', 0, 'regen', v_regen);
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
    PERFORM upgrade_monthly_grant(p_user_id, v_tier, null, 'lazy');
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

CREATE OR REPLACE FUNCTION public.spend_coins_for_lens(p_user_id uuid, p_unifie boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_price     integer;
  v_wallet    coin_wallets%ROWTYPE;
  v_total     integer;
  v_from_inc  integer;
  v_from_pur  integer;
  v_tier      text;
  v_quota     integer;
  v_consommes integer;
BEGIN
  SELECT CASE
           WHEN p.is_business = true THEN 'business'
           WHEN p.is_pro = true THEN 'pro'
           WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
           ELSE 'free'
         END INTO v_tier
  FROM profiles p WHERE p.id = p_user_id;
  v_tier := COALESCE(v_tier, 'free');

  -- ── COMPTEUR FUSIONNÉ (02/09 soir) — avant tout appel IA ─────────────────
  -- (11/10) Le réglage du compte prime sur le quota du palier.
  v_quota := quota_annonces_compte(p_user_id, v_tier);
  IF v_quota IS NOT NULL AND v_quota > 0 THEN
    v_consommes := quota_annonces_consommees(p_user_id, debut_cycle_quotas(p_user_id));
    IF v_consommes >= v_quota THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'quota_annonces_atteint',
                                'plafond', v_quota, 'consommes', v_consommes);
    END IF;
  END IF;

  SELECT value INTO v_price FROM coin_config WHERE key = 'price_lens_overflow';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  -- Prix nul : ni wallet ni ledger — la ligne usage_logs 'lens' reste posée.
  -- unifie:true = ce scan sera porté par sa ligne generate_listing.
  IF v_price = 0 THEN
    INSERT INTO usage_logs (user_id, feature, metadata)
    VALUES (p_user_id, 'lens',
      jsonb_build_object('coins', 0, 'model', 'per_scan')
      || CASE WHEN p_unifie THEN jsonb_build_object('unifie', true) ELSE '{}'::jsonb END);
    RETURN jsonb_build_object('allowed', true, 'price', 0);
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
    PERFORM upgrade_monthly_grant(p_user_id, v_tier, null, 'lazy');
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
$function$;

CREATE OR REPLACE FUNCTION public.fiche_completer_photos_capture(p_inventaire bigint, p_vignette text, p_capture jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_photos jsonb;
  n integer;
BEGIN
  IF p_inventaire IS NULL OR jsonb_typeof(p_capture -> 'photos') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  SELECT COALESCE(jsonb_agg(p ORDER BY o), '[]'::jsonb) INTO v_photos
    FROM jsonb_array_elements(p_capture -> 'photos') WITH ORDINALITY AS t(p, o)
   WHERE jsonb_typeof(p) = 'string' AND (p #>> '{}') ~ '^https?://';
  IF jsonb_array_length(v_photos) < 2 THEN RETURN false; END IF;
  UPDATE inventaire i SET
    photos = v_photos,
    photos_a_rapatrier = true
   WHERE i.id = p_inventaire
     AND i.fusionne_dans IS NULL
     AND jsonb_array_length(COALESCE(i.photos, '[]'::jsonb)) <= 1
     AND (i.photos -> 0 IS NULL
          OR (i.photos ->> 0) = p_vignette
          OR (i.photos ->> 0) LIKE '%/rapatrie-fiche/' || p_inventaire::text || '/%');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$function$;
