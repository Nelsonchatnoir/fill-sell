-- ── Point 3 validé : filet de fraîcheur du RPC resserré à 10 minutes ─────────
-- (2026-08-05 — ⛔ À MONTRER À NICO AVANT APPLICATION, comme d'habitude.)
--
-- La capture est TOUJOURS prise à l'instant du clic (republierArticleVinted
-- enchaîne capture → persistance → RPC en quelques secondes) : 10 min couvre
-- largement un re-hébergement de photos lent, et ferme la fenêtre « annonce
-- modifiée sur Vinted entre capture et clic » que 60 min laissait ouverte.
-- La protection à l'EXÉCUTION (extension : refus de supprimer sur capture
-- > 24 h, needs_user → recapture) vit côté background.js, pas ici.
--
-- Seul changement par rapport à 20260805060000 : interval '60 minutes' →
-- '10 minutes'. Tout le reste est copié à l'identique. Idempotent.

CREATE OR REPLACE FUNCTION public.spend_coins_and_republish(
  p_inventaire_id bigint, p_vinted_item_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user     uuid := auth.uid();
  v_item     text := NULLIF(trim(p_vinted_item_id), '');
  v_capture  vinted_republish_captures%ROWTYPE;
  v_price    integer;
  v_wallet   coin_wallets%ROWTYPE;
  v_from_inc integer;
  v_from_pur integer;
  v_tier     text;
  v_ext_seen timestamptz;
  v_lang     text;
  v_job_id   uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthorized');
  END IF;
  IF v_item IS NULL OR v_item !~ '^\d+$' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_item');
  END IF;

  SELECT extension_last_seen_at, lang INTO v_ext_seen, v_lang
  FROM profiles WHERE id = v_user;
  IF v_ext_seen IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'extension_required',
      'message', CASE WHEN COALESCE(v_lang, 'fr') = 'en'
        THEN 'Republishing requires the free FillSell Chrome extension on a computer. No Nuggets were charged.'
        ELSE 'Pour republier, il faut l''extension Chrome gratuite FillSell sur un ordinateur. Aucune Pépite n''a été débitée.'
      END);
  END IF;

  SELECT * INTO v_capture FROM vinted_republish_captures
  WHERE user_id = v_user AND vinted_item_id = v_item
  ORDER BY captured_at DESC LIMIT 1;
  IF v_capture.id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'capture_absente');
  END IF;
  IF v_capture.verdict <> 'valide' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'capture_incomplete',
      'champs_manquants', to_jsonb(v_capture.champs_manquants));
  END IF;
  IF v_capture.captured_at < now() - interval '10 minutes' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'capture_perimee');
  END IF;

  IF EXISTS (
    SELECT 1 FROM cross_post_jobs j
    WHERE j.user_id = v_user AND j.action = 'republish'
      AND j.platform_fields->>'vinted_item_id' = v_item
      AND j.status IN ('pending', 'processing', 'needs_user')
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'republish_en_cours');
  END IF;

  IF EXISTS (
    SELECT 1 FROM cross_post_jobs j
    WHERE j.user_id = v_user AND j.action = 'republish'
      AND j.platform_fields->>'vinted_item_id' = v_item
      AND j.status = 'published'
      AND j.published_at > now() - interval '24 hours'
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'cadence_24h');
  END IF;

  SELECT value INTO v_price FROM coin_config WHERE key = 'price_republish';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;
  IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
    SELECT CASE
             WHEN p.is_pro = true THEN 'pro'
             WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
             ELSE 'free'
           END INTO v_tier
    FROM profiles p WHERE p.id = v_user;
    PERFORM upgrade_monthly_grant(v_user, COALESCE(v_tier, 'free'), null, 'lazy');
    SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;
  END IF;
  IF v_wallet.included_balance + v_wallet.purchased_balance < v_price THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'insufficient_coins',
      'price', v_price, 'balance', v_wallet.included_balance + v_wallet.purchased_balance);
  END IF;

  v_from_inc := LEAST(v_wallet.included_balance, v_price);
  v_from_pur := v_price - v_from_inc;
  UPDATE coin_wallets SET
    included_balance  = included_balance  - v_from_inc,
    purchased_balance = purchased_balance - v_from_pur,
    updated_at        = now()
  WHERE user_id = v_user;

  INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option,
                               title, price, listing_url, platform_fields)
  VALUES (
    v_user, p_inventaire_id, 'vinted', 'republish', 'pending', 'original',
    v_capture.payload->>'titre',
    NULLIF(v_capture.payload->>'prix', '')::numeric,
    'https://www.vinted.fr/items/' || v_item,
    jsonb_build_object(
      'republish_step', 'captured',
      'vinted_item_id', v_item,
      'capture_id', v_capture.id,
      'pepites_debitees', v_price
    )
  ) RETURNING id INTO v_job_id;

  INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
  VALUES (v_user, -v_price,
          v_wallet.included_balance - v_from_inc,
          v_wallet.purchased_balance - v_from_pur,
          'spend_republish',
          jsonb_build_object('vinted_item_id', v_item, 'job_id', v_job_id, 'capture_id', v_capture.id));

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'republish', jsonb_build_object('coins', v_price, 'vinted_item_id', v_item));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price, 'job_id', v_job_id,
    'included_after',  v_wallet.included_balance - v_from_inc,
    'purchased_after', v_wallet.purchased_balance - v_from_pur
  );
END;
$$;
REVOKE ALL ON FUNCTION public.spend_coins_and_republish(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_coins_and_republish(bigint, text) TO authenticated, service_role;
