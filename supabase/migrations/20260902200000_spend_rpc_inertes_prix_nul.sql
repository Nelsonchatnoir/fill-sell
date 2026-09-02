-- ═══════════════════════════════════════════════════════════════════════════
-- Bascule quotas (1/5) : les RPC de dépense deviennent INERTES à prix nul
--
-- Vérifié en prod le 02/09 : seul spend_coins_and_republish portait la garde
-- « IF v_price > 0 ». Les trois autres, à prix 0, auraient continué d'écrire
-- une ligne coin_ledger delta-0 PAR GESTE, de prendre le verrou FOR UPDATE du
-- wallet, de déclencher le lazy grant — et publish aurait empilé des
-- réservations à 0. Ces early-returns sont la CONDITION de l'inertie de la
-- machinerie Pépites, pas du confort.
--
-- · spend_coins_for_generate : à prix 0, PLUS AUCUNE écriture. Le comptage
--   du quota d'annonces vit dans la MÊME fonction (migration 3/5) — ici on ne
--   pose que l'inertie monétaire.
-- · spend_coins_for_lens : à prix 0, ne touche ni wallet ni ledger MAIS
--   continue de poser la ligne usage_logs 'lens' : c'est elle que
--   lens-analysis enrichit (tokens/coût) et c'est le COMPTEUR de scans.
-- · spend_coins_and_publish : chirurgical — à prix 0 on saute UNIQUEMENT
--   verrou wallet + lazy grant + insufficient_coins + débit + réservation +
--   ledger. TOUT LE RESTE s'exécute à l'identique : gardes
--   extension_required / extension_stale, garde already_published, création
--   des jobs (reservation_id NULL → le trigger settle court-circuite,
--   vérifié : un règlement à 0 ne raise jamais et ne bouge rien), livraison
--   des photos dans inventaire, ligne usage_logs.
--
-- Réversible : remonter les prix dans coin_config — les branches v_price>0
-- reprennent vie telles quelles.
-- ⚠️ À appliquer explicitement (jamais db push). Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── spend_coins_for_generate ────────────────────────────────────────────────
-- (le quota d'annonces est ajouté par la migration 3/5, qui REDÉFINIT cette
-- fonction avec sa nouvelle signature — celle-ci pose l'inertie si la 3/5
-- n'était pas encore passée, et sert de référence de retour arrière)
CREATE OR REPLACE FUNCTION public.spend_coins_for_generate(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Prix nul (bascule quotas 02/09) : rien à débiter, rien à écrire.
  IF v_price = 0 THEN
    RETURN jsonb_build_object('allowed', true, 'price', 0);
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
    SELECT CASE
             WHEN p.is_business = true THEN 'business'
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

-- ── spend_coins_for_lens ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.spend_coins_for_lens(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_price    integer;
  v_wallet   coin_wallets%ROWTYPE;
  v_total    integer;
  v_from_inc integer;
  v_from_pur integer;
  v_tier     text;
BEGIN
  SELECT value INTO v_price FROM coin_config WHERE key = 'price_lens_overflow';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  -- Prix nul (bascule quotas 02/09) : ni wallet ni ledger — MAIS la ligne
  -- usage_logs 'lens' reste posée : lens-analysis l'enrichit (tokens, coût)
  -- et c'est le compteur du quota de scans (migration 3/5).
  IF v_price = 0 THEN
    INSERT INTO usage_logs (user_id, feature, metadata)
    VALUES (p_user_id, 'lens', jsonb_build_object('coins', 0, 'model', 'per_scan'));
    RETURN jsonb_build_object('allowed', true, 'price', 0);
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
    SELECT CASE
             WHEN p.is_business = true THEN 'business'
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

-- ── spend_coins_and_publish — early-return CHIRURGICAL ──────────────────────
CREATE OR REPLACE FUNCTION public.spend_coins_and_publish(p_photo_option text, p_jobs jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user          uuid := auth.uid();
  v_price         integer;
  v_price_photo   integer;
  v_price_unit    integer;
  v_price_pub     integer;
  v_photos_billed boolean := true;
  v_wallet        coin_wallets%ROWTYPE;
  v_total         integer;
  v_from_inc      integer := 0;
  v_from_pur      integer := 0;
  v_photo_inc     integer;
  v_pub_inc       integer;
  v_pub_pur       integer;
  v_job_count     integer;
  v_tier          text;
  v_conflicts     jsonb;
  v_ext_seen      timestamptz;
  v_lang          text;
  v_res_id        uuid := NULL;
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
  -- CONSERVÉE à prix nul : ce n'est pas une garde Pépites, c'est la garde
  -- « la file a-t-elle un exécuteur ». Messages sans mention de Pépites
  -- (bascule 02/09).
  SELECT extension_last_seen_at, lang
    INTO v_ext_seen, v_lang
  FROM profiles WHERE id = v_user;
  IF v_ext_seen IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'extension_required',
      'message', CASE WHEN COALESCE(v_lang, 'fr') = 'en'
        THEN 'Publishing requires the free FillSell Chrome extension on a computer — it''s what posts your listings for you. Install it from fillsell.app/extension (your Vinted wardrobe syncs in seconds, included). Nothing was used from your plan.'
        ELSE 'Pour publier, il faut l''extension Chrome gratuite FillSell sur un ordinateur : c''est elle qui met tes annonces en ligne pour toi. Installe-la depuis fillsell.app/extension — ton dressing Vinted s''y synchronise en quelques secondes, c''est inclus. Rien n''a été décompté.'
      END
    );
  END IF;

  -- ── Fenêtre de fraîcheur (2026-08-04) — conservée, cf. ci-dessus ─────────
  IF v_ext_seen < now() - interval '7 days' THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'extension_stale',
      'derniere_activite', v_ext_seen,
      'message', CASE WHEN COALESCE(v_lang, 'fr') = 'en'
        THEN 'Your FillSell extension hasn''t been seen for over a week. Open Chrome on your computer to wake it up, then try again. Nothing was used from your plan.'
        ELSE 'Ton extension FillSell ne s''est pas manifestée depuis plus d''une semaine. Ouvre Chrome sur ton ordinateur pour la réveiller, puis relance. Rien n''a été décompté.'
      END
    );
  END IF;

  -- ── Garde inventaire_id (2026-07-29) — conservée ──────────────────────────
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_jobs) AS j
    WHERE NULLIF(j->>'inventaire_id','') IS NULL
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'missing_inventaire_id');
  END IF;

  -- ── Garde already_published — conservée ───────────────────────────────────
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

  SELECT value INTO v_price_photo FROM coin_config WHERE key = 'price_' || p_photo_option;
  SELECT value INTO v_price_unit  FROM coin_config WHERE key = 'price_per_platform';
  IF v_price_photo IS NULL OR v_price_unit IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  -- ── Retouche livrée ? Sinon part photos à 0 (2026-08-05 soir) — conservée ─
  IF p_photo_option <> 'original' AND v_price_photo > 0 THEN
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_jobs) AS j
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(j->'photos') = 'array' THEN j->'photos' ELSE '[]'::jsonb END
      ) AS ph
      WHERE (jsonb_typeof(ph) = 'object' AND (
               COALESCE(ph->>'enhanced', '')   <> ''
               OR COALESCE(ph->>'bg_removed', '') <> ''
               OR COALESCE(ph->>'type', '') LIKE 'enhanced%'
               OR COALESCE(ph->>'url', '')  LIKE '%/enhanced/%'))
         OR (jsonb_typeof(ph) = 'string' AND (ph #>> '{}') LIKE '%/enhanced/%')
    ) THEN
      v_price_photo   := 0;
      v_photos_billed := false;
    END IF;
  END IF;

  v_price_pub := v_price_unit * v_job_count;
  v_price     := v_price_photo + v_price_pub;

  -- ══ CHIRURGIE prix nul (bascule 02/09) : on ne saute QUE l'argent ═════════
  -- verrou wallet + lazy grant + insufficient_coins + débit + réservation +
  -- ledger. Les jobs partent avec reservation_id NULL — le trigger settle
  -- court-circuite dessus (vérifié le 02/09 : un settle à 0 ne raise jamais).
  IF v_price > 0 THEN
    INSERT INTO coin_wallets (user_id) VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;

    IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
      SELECT CASE
               WHEN p.is_business = true THEN 'business'
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
        'price_photos', v_price_photo, 'price_publication', v_price_pub,
        'photos_billed', v_photos_billed
      );
    END IF;

    v_photo_inc := LEAST(v_wallet.included_balance, v_price_photo);
    v_pub_inc   := LEAST(v_wallet.included_balance - v_photo_inc, v_price_pub);
    v_pub_pur   := v_price_pub - v_pub_inc;
    v_from_inc  := v_photo_inc + v_pub_inc;
    v_from_pur  := v_price - v_from_inc;

    UPDATE coin_wallets SET
      included_balance  = included_balance  - v_from_inc,
      purchased_balance = purchased_balance - v_from_pur,
      reserved_balance  = reserved_balance  + v_price_pub,
      updated_at        = now()
    WHERE user_id = v_user;

    INSERT INTO coin_reservations (user_id, amount, unit_price, from_included, from_purchased, job_count, photo_option)
    VALUES (v_user, v_price_pub, v_price_unit, v_pub_inc, v_pub_pur, v_job_count, p_photo_option)
    RETURNING id INTO v_res_id;
  END IF;

  INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, photo_option,
                               title, description, price, photos, platform_fields, reservation_id)
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
    j->'platform_fields',
    v_res_id
  FROM jsonb_array_elements(p_jobs) AS j;

  -- ── Livraison des photos (2026-08-04) : même transaction — conservée ──────
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

  IF v_price > 0 THEN
    INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
    VALUES (
      v_user, -v_price,
      v_wallet.included_balance - v_from_inc,
      v_wallet.purchased_balance - v_from_pur,
      'spend_publish',
      jsonb_build_object(
        'photo_option', p_photo_option, 'platforms', v_job_count,
        'price_photos', v_price_photo, 'price_publication', v_price_pub,
        'photos_billed', v_photos_billed,
        'reservation_id', v_res_id
      )
    );
  END IF;

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'publish', jsonb_build_object(
    'coins', v_price, 'photo_option', p_photo_option, 'platforms', v_job_count
  ));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price,
    'price_photos', v_price_photo, 'price_publication', v_price_pub,
    'photos_billed', v_photos_billed,
    'included_after',  CASE WHEN v_price > 0 THEN v_wallet.included_balance - v_from_inc ELSE NULL END,
    'purchased_after', CASE WHEN v_price > 0 THEN v_wallet.purchased_balance - v_from_pur ELSE NULL END,
    'reserved_after',  CASE WHEN v_price > 0 THEN v_wallet.reserved_balance + v_price_pub ELSE NULL END
  );
END;
$function$;
