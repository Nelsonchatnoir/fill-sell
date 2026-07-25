-- ── Garde anti-republication (2026-07-25, S7) ────────────────────────────────
-- Le griséage du stepper (publishedSet) est la première barrière, mais elle est
-- exclusivement front : le chemin Lens ne la portait pas, et rien n'empêchait
-- l'insertion d'un 2e job publish pour un (inventaire_id, platform) déjà en
-- ligne — des doublons 'published' coexistent d'ailleurs en base (constat
-- 2026-07-13, StockTab). Cette migration ajoute la barrière de VÉRITÉ dans
-- spend_coins_and_publish : refus AVANT tout débit de Pépites, raison
-- 'already_published' + liste des plateformes en conflit (le front l'affiche).
--
-- « Déjà en ligne » réplique la sémantique client de computeRemovalInfo
-- (src/utils/publicationState.js) : un job publish 'published' SANS delete
-- 'deleted' postérieur. On refuse aussi 'pending'/'processing' (un job déjà en
-- file — le laisser doubler créerait la même annonce deux fois quelques
-- minutes plus tard). Un job failed/needs_user/cancelled/deleted n'empêche
-- rien : la relance est légitime. Les articles hors stock (inventaire_id NULL,
-- flux Lens sans ajout au stock) ne sont pas concernés : aucune clé de
-- rapprochement n'existe.
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

  -- Garde anti-republication (cf. en-tête de la migration) — placée AVANT le
  -- pricing et le FOR UPDATE du wallet : un refus ne débite rien et ne pose
  -- aucun verrou.
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

  -- Grant mensuel lazy (2026-07-23) : un inscrit du jour a désormais ses 30
  -- Pépites Free dès sa première action payante, sans attendre le sweep.
  IF v_wallet.included_granted_month IS DISTINCT FROM v_month THEN
    SELECT CASE
             WHEN p.is_pro = true THEN 'pro'
             WHEN p.is_premium = true OR p.is_founder = true
               OR p.apple_original_transaction_id IS NOT NULL
               OR p.google_purchase_token IS NOT NULL THEN 'premium'
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
-- Grants inchangés : cette RPC est appelée par le client authentifié.
REVOKE ALL ON FUNCTION public.spend_coins_and_publish(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_coins_and_publish(text, jsonb) TO authenticated, service_role;
