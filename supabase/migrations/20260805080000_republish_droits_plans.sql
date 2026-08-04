-- ── Republication : droits par plan (2026-08-05, décision Nico) ──────────────
-- (⛔ À MONTRER À NICO AVANT APPLICATION — ni appliquée ni commitée d'ici là.)
--
--   · FREE    : manuelle à price_republish (1 Pépite). Pas d'automatisation.
--   · PREMIUM : manuelle GRATUITE (0 Pépite). Pas d'automatisation.
--   · PRO     : manuelle gratuite + AUTOMATISATION (p_source='auto').
--
-- Changements par rapport à 20260805070000 :
--   1. p_source ('manuel' | 'auto') — 'auto' exige is_pro, et respecte le
--      plafond QUOTIDIEN réglé par l'utilisateur
--      (platform_settings.vinted.republish_auto.plafond_jour, borné 1..50,
--      défaut 10) compté sur les jobs auto créés depuis minuit ;
--   2. expression premium canonique (is_premium OR is_pro OR is_comped,
--      cf. CLAUDE.md) ⇒ v_price = 0 : AUCUNE opération wallet/ledger (une
--      ligne à 0 serait du bruit), le job se crée normalement avec
--      pepites_debitees=0 — le trigger de refund ne rembourse donc rien (il
--      lit ce montant) ;
--   3. platform_fields.republish_source ('manuel'|'auto') + usage_logs
--      metadata {coins, source, plan} : le bilan « N republiées ce mois »
--      se lit sans ambiguïté.
-- Tout le reste (gardes capture 10 min / doublon / cadence 24 h / extension)
-- est copié à l'identique. Idempotent.

CREATE OR REPLACE FUNCTION public.spend_coins_and_republish(
  p_inventaire_id bigint, p_vinted_item_id text, p_source text DEFAULT 'manuel'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user     uuid := auth.uid();
  v_item     text := NULLIF(trim(p_vinted_item_id), '');
  v_capture  vinted_republish_captures%ROWTYPE;
  v_price    integer;
  v_wallet   coin_wallets%ROWTYPE;
  v_from_inc integer := 0;
  v_from_pur integer := 0;
  v_tier     text;
  v_prof     record;
  v_inclus   boolean;
  v_plafond  integer;
  v_faits    integer;
  v_job_id   uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthorized');
  END IF;
  IF v_item IS NULL OR v_item !~ '^\d+$' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_item');
  END IF;
  IF p_source NOT IN ('manuel', 'auto') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_source');
  END IF;

  SELECT is_premium, is_pro, is_comped, extension_last_seen_at, lang, platform_settings
  INTO v_prof FROM profiles WHERE id = v_user;
  IF v_prof.extension_last_seen_at IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'extension_required',
      'message', CASE WHEN COALESCE(v_prof.lang, 'fr') = 'en'
        THEN 'Republishing requires the free FillSell Chrome extension on a computer. No Nuggets were charged.'
        ELSE 'Pour republier, il faut l''extension Chrome gratuite FillSell sur un ordinateur. Aucune Pépite n''a été débitée.'
      END);
  END IF;
  v_inclus := (v_prof.is_premium IS TRUE OR v_prof.is_pro IS TRUE OR v_prof.is_comped IS TRUE);

  -- Automatisation : PRO uniquement, plafond quotidien de l'utilisateur.
  IF p_source = 'auto' THEN
    IF v_prof.is_pro IS NOT TRUE THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'auto_reserve_pro');
    END IF;
    v_plafond := LEAST(50, GREATEST(1, COALESCE(
      NULLIF(v_prof.platform_settings->'vinted'->'republish_auto'->>'plafond_jour', '')::integer, 10)));
    SELECT count(*) INTO v_faits FROM cross_post_jobs
    WHERE user_id = v_user AND action = 'republish'
      AND platform_fields->>'republish_source' = 'auto'
      AND created_at >= date_trunc('day', now());
    IF v_faits >= v_plafond THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_auto_atteint', 'plafond', v_plafond);
    END IF;
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

  -- Droits par plan : Premium/Pro/comped = gratuit, Free = price_republish.
  IF v_inclus THEN
    v_price := 0;
  ELSE
    SELECT value INTO v_price FROM coin_config WHERE key = 'price_republish';
    IF v_price IS NULL THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
    END IF;
  END IF;

  IF v_price > 0 THEN
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
  END IF;

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
      'pepites_debitees', v_price,
      'republish_source', p_source
    )
  ) RETURNING id INTO v_job_id;

  IF v_price > 0 THEN
    INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
    VALUES (v_user, -v_price,
            v_wallet.included_balance - v_from_inc,
            v_wallet.purchased_balance - v_from_pur,
            'spend_republish',
            jsonb_build_object('vinted_item_id', v_item, 'job_id', v_job_id, 'capture_id', v_capture.id));
  END IF;

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'republish', jsonb_build_object(
    'coins', v_price, 'vinted_item_id', v_item, 'source', p_source,
    'plan', CASE WHEN v_prof.is_pro IS TRUE THEN 'pro'
                 WHEN v_inclus THEN 'premium' ELSE 'free' END
  ));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price, 'job_id', v_job_id,
    'included_after',  CASE WHEN v_price > 0 THEN v_wallet.included_balance - v_from_inc ELSE NULL END,
    'purchased_after', CASE WHEN v_price > 0 THEN v_wallet.purchased_balance - v_from_pur ELSE NULL END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.spend_coins_and_republish(bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_coins_and_republish(bigint, text, text) TO authenticated, service_role;
-- L'ancienne signature (2 args) reste appelable via le DEFAULT — PostgREST :
-- une seule fonction, pas de surcharge (CREATE OR REPLACE sur 2-args serait
-- une SECONDE fonction : on la supprime).
DROP FUNCTION IF EXISTS public.spend_coins_and_republish(bigint, text);
