-- ── Grille tarifaire à deux axes (2026-08-04, décision Nico) ─────────────────
-- AXE PHOTOS (une fois par article) : original 3→0 (GRATUIT), ia_light 12→9,
-- ia_advanced 35→32. AXE PUBLICATION : 3 Pépites PAR PLATEFORME, toutes
-- plateformes, Vinted incluse. La génération du texte reste gratuite (aucun
-- débit dans generate-listing — inchangé). Les retouches baissent de 3 parce
-- qu'elles incluaient la publication : le total Vinted-seul est identique
-- (0+3=3, 9+3=12, 32+3=35).
--
-- ⚠️ ATOMIQUE : les valeurs de coin_config ET la formule du RPC changent dans
-- le MÊME fichier. Appliquer l'un sans l'autre ouvrirait une fenêtre où
-- « photos originales = 0 » se publie gratuitement (ancienne formule sur
-- nouvelles valeurs) ou où tout augmente de 3×n (nouvelle formule sur
-- anciennes valeurs).
--
-- Exemples de contrôle (à vérifier après application) :
--   Vinted seul, photos perso        : 0 + 3×1 = 3
--   Vinted seul, retouche light      : 9 + 3×1 = 12
--   4 plateformes, photos perso      : 0 + 3×4 = 12
--   4 plateformes, retouche advanced : 32 + 3×4 = 44
--
-- Idempotent : UPDATE/upsert à valeur fixe + CREATE OR REPLACE.

UPDATE coin_config SET value = 0  WHERE key = 'price_original';
UPDATE coin_config SET value = 9  WHERE key = 'price_ia_light';
UPDATE coin_config SET value = 32 WHERE key = 'price_ia_advanced';
INSERT INTO coin_config (key, value) VALUES ('price_per_platform', 3)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Base : 20260804210000 (garde extension + photos livrées), seuls changent le
-- calcul du prix (photo + 3 × plateformes) et les champs de réponse/ledger.
create or replace function public.spend_coins_and_publish(p_photo_option text, p_jobs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_user        uuid := auth.uid();
  v_price       integer;
  v_price_photo integer;
  v_price_unit  integer;
  v_price_pub   integer;
  v_wallet      coin_wallets%ROWTYPE;
  v_total       integer;
  v_from_inc    integer;
  v_from_pur    integer;
  v_job_count   integer;
  v_tier        text;
  v_conflicts   jsonb;
  v_ext_seen    timestamptz;
  v_lang        text;
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

  -- ── Garde extension (2026-08-04) : jamais vue = personne pour exécuter ────
  SELECT extension_last_seen_at, lang INTO v_ext_seen, v_lang
  FROM profiles WHERE id = v_user;
  IF v_ext_seen IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'extension_required',
      'message', CASE WHEN COALESCE(v_lang, 'fr') = 'en'
        THEN 'Publishing requires the free FillSell Chrome extension on a computer — it''s what posts your listings for you. Install it from fillsell.app/extension (your Vinted wardrobe syncs in seconds, included). No Nuggets were charged.'
        ELSE 'Pour publier, il faut l''extension Chrome gratuite FillSell sur un ordinateur : c''est elle qui met tes annonces en ligne pour toi. Installe-la depuis fillsell.app/extension — ton dressing Vinted s''y synchronise en quelques secondes, c''est inclus. Aucune Pépite n''a été débitée.'
      END
    );
  END IF;

  -- ── Garde inventaire_id (2026-07-29) ──────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_jobs) AS j
    WHERE NULLIF(j->>'inventaire_id','') IS NULL
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'missing_inventaire_id');
  END IF;

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

  -- ── Grille à deux axes (2026-08-04) : photos (par article) + 3/plateforme ─
  SELECT value INTO v_price_photo FROM coin_config WHERE key = 'price_' || p_photo_option;
  SELECT value INTO v_price_unit  FROM coin_config WHERE key = 'price_per_platform';
  IF v_price_photo IS NULL OR v_price_unit IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;
  v_price_pub := v_price_unit * v_job_count;
  v_price     := v_price_photo + v_price_pub;

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

  v_total := v_wallet.included_balance + v_wallet.purchased_balance;
  IF v_total < v_price THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'insufficient_coins',
      'price', v_price, 'balance', v_total,
      'price_photos', v_price_photo, 'price_publication', v_price_pub
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

  -- ── Livraison des photos (2026-08-04) : même transaction que le débit ─────
  UPDATE inventaire i
  SET photos = sub.photos
  FROM (
    SELECT DISTINCT ON (inv_id) inv_id, photos
    FROM (
      SELECT NULLIF(j->>'inventaire_id','')::bigint AS inv_id, j->'photos' AS photos
      FROM jsonb_array_elements(p_jobs) AS j
    ) x
    WHERE inv_id IS NOT NULL
      AND jsonb_typeof(photos) = 'array'
      AND jsonb_array_length(photos) > 0
  ) sub
  WHERE i.id = sub.inv_id AND i.user_id = v_user;

  INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
  VALUES (
    v_user, -v_price,
    v_wallet.included_balance - v_from_inc,
    v_wallet.purchased_balance - v_from_pur,
    'spend_publish',
    jsonb_build_object(
      'photo_option', p_photo_option, 'platforms', v_job_count,
      'price_photos', v_price_photo, 'price_publication', v_price_pub
    )
  );

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'publish', jsonb_build_object(
    'coins', v_price, 'photo_option', p_photo_option, 'platforms', v_job_count
  ));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price,
    'price_photos', v_price_photo, 'price_publication', v_price_pub,
    'included_after',  v_wallet.included_balance - v_from_inc,
    'purchased_after', v_wallet.purchased_balance - v_from_pur
  );
END;
$$;

REVOKE ALL ON FUNCTION public.spend_coins_and_publish(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_coins_and_publish(text, jsonb) TO authenticated, service_role;
