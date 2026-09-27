-- ═══════════════════════════════════════════════════════════════════════════
-- PUBLIER NE RETIRE JAMAIS DE PHOTO À LA FICHE (27/09)
-- APPLIQUÉE le 27/09 à 10:51 (GO Nico, CLI db query -f), après rejeu en
-- transaction annulée : fiche avant 3/3/3 → après 5/5/6, job Leboncoin toujours
-- à 3 photos, droits identiques, aucune ligne de test restante.
-- ═══════════════════════════════════════════════════════════════════════════
-- spend_coins_and_publish recopie sur inventaire.photos les photos d'UN des
-- jobs de la fournée : DISTINCT ON (inv_id) SANS ORDER BY, donc le premier
-- venu. Quand c'est le job Leboncoin plafonné (« Divers > Autres » : 3 photos
-- gratuites, regles.js → lbcPhotosCapped), la fiche est RÉÉCRITE avec ces 3
-- photos : les autres disparaissent de l'article, alors que Vinted, Beebs,
-- eBay et Opla les ont toutes reçues.
-- Mesuré le 27/09 sur 60 jours : 17 articles avec un job Leboncoin plafonné,
-- 16 dont la fiche a exactement le nombre de photos du job plafonné (Louis
-- Thonet, « Rangement Blanc et Vert Pomme » : 5 photos → 3).
--
-- Correctif, UN SEUL : un job plafonné ne réécrit jamais la fiche, et parmi
-- les autres la liste la plus longue gagne. Une fournée Leboncoin SEUL et
-- plafonnée laisse donc la fiche telle qu'elle était (elle ne gagne pas les
-- photos ajoutées dans le stepper, elle n'en perd aucune).
-- Rien d'autre ne change : débit, réservation, jobs insérés (le job Leboncoin
-- part toujours avec ses 3 photos), refus.
-- ⛔ Les 16 fiches déjà tronquées ne sont PAS réparées ici (les photos
--    retirées vivent encore dans les jobs des autres plateformes) : décision à
--    part.
--
-- Recopiée de la version EN PROD (pg_get_functiondef du 27/09) — seul le bloc
-- « UPDATE inventaire … SET photos » change. CREATE OR REPLACE conserve les
-- droits (postgres, authenticated, service_role).

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
  v_ebay_api_seul boolean := false;
  v_en_pause      jsonb := NULL;
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

  BEGIN
    SELECT jsonb_agg(DISTINCT j->>'platform') INTO v_en_pause
    FROM jsonb_array_elements(p_jobs) AS j
    WHERE EXISTS (SELECT 1 FROM public.platform_health h WHERE h.platform = j->>'platform' AND h.paused = true);
  EXCEPTION WHEN OTHERS THEN
    v_en_pause := NULL;
  END;
  IF v_en_pause IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'platform_paused', 'platforms', v_en_pause,
      'messages', (SELECT COALESCE(jsonb_object_agg(h.platform, jsonb_build_object('fr', h.message_fr, 'en', h.message_en)), '{}'::jsonb)
                   FROM public.platform_health h WHERE h.paused = true AND v_en_pause ? h.platform)
    );
  END IF;

  SELECT NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(p_jobs) AS j WHERE j->>'platform' IS DISTINCT FROM 'ebay'
         )
         AND COALESCE(p.ebay_voie_api, false)
         AND a.user_id IS NOT NULL
         AND a.revoked_at IS NULL
         AND a.fulfillment_policy_id IS NOT NULL
         AND a.payment_policy_id IS NOT NULL
         AND a.return_policy_id IS NOT NULL
         AND (a.seller_state->>'bloque_par_etat_ebay') = 'false'
    INTO v_ebay_api_seul
  FROM profiles p
  LEFT JOIN ebay_accounts a ON a.user_id = p.id
  WHERE p.id = v_user;
  v_ebay_api_seul := COALESCE(v_ebay_api_seul, false);

  SELECT extension_last_seen_at, lang
    INTO v_ext_seen, v_lang
  FROM profiles WHERE id = v_user;

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
          c.status IN ('pending', 'processing', 'needs_user')
          OR (
            c.status = 'published'
            AND NOT EXISTS (
              SELECT 1 FROM cross_post_jobs d
              WHERE d.user_id = v_user
                AND d.inventaire_id = c.inventaire_id
                AND d.platform = c.platform
                AND d.action = 'delete'
                AND d.status = 'deleted'
                AND (
                  CASE
                    WHEN annonce_id_de_job(d.platform_listing_id, d.listing_url) IS NOT NULL
                     AND annonce_id_de_job(c.platform_listing_id, c.listing_url) IS NOT NULL
                    THEN annonce_id_de_job(d.platform_listing_id, d.listing_url) = annonce_id_de_job(c.platform_listing_id, c.listing_url)
                    ELSE d.created_at > COALESCE(c.published_at, c.created_at)
                  END
                )
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

  BEGIN
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
  EXCEPTION WHEN unique_violation THEN
    IF v_price > 0 THEN
      UPDATE coin_wallets SET
        included_balance  = included_balance  + v_from_inc,
        purchased_balance = purchased_balance + v_from_pur,
        reserved_balance  = reserved_balance  - v_price_pub,
        updated_at        = now()
      WHERE user_id = v_user;
      DELETE FROM coin_reservations WHERE id = v_res_id;
    END IF;
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'already_published',
      'platforms', (SELECT jsonb_agg(DISTINCT j->>'platform') FROM jsonb_array_elements(p_jobs) AS j)
    );
  END;

  UPDATE inventaire i
  SET photos = sub.photos
  FROM (
    SELECT DISTINCT ON (inv_id) inv_id, photos
    FROM (
      SELECT NULLIF(j->>'inventaire_id','')::bigint AS inv_id, j->'photos' AS photos,
             -- Un job PLAFONNÉ par sa plateforme (Leboncoin « Divers > Autres » :
             -- 3 photos gratuites, regles.js) ne porte qu'un extrait : il ne
             -- réécrit JAMAIS la fiche (2026-09-27).
             COALESCE(j->'platform_fields'->'lbcPhotosCapped' = 'true'::jsonb, false) AS plafonne
      FROM jsonb_array_elements(p_jobs) AS j
    ) x
    WHERE inv_id IS NOT NULL
      AND jsonb_typeof(photos) = 'array'
      AND jsonb_array_length(photos) > 0
      AND NOT plafonne
    -- Sans ORDER BY, DISTINCT ON gardait le PREMIER job venu : quand c'était
    -- celui de Leboncoin plafonné, la fiche perdait ses photos. La liste la
    -- plus longue est la liste entière.
    ORDER BY inv_id, jsonb_array_length(photos) DESC
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
$function$
;
