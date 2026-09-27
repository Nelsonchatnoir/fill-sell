-- ═══════════════════════════════════════════════════════════════════════════
-- JAMAIS PUBLIER LÀ OÙ UNE FICHE JUMELLE EST DÉJÀ EN LIGNE (27/09)
-- APPLIQUÉE le 27/09 à 11:52 (GO Nico, CLI db query -f), après rejeu annulé :
-- tome 5 (fiche Vinted) vers Leboncoin avant = accepté, après = refusé (jumelle
-- en ligne 3093208201) ; vers Opla accepté ; fiche Leboncoin vers Vinted refusée
-- (6676902409 en ligne) ; droits identiques.
-- ═══════════════════════════════════════════════════════════════════════════
-- spend_coins_and_publish (recopiée de la version EN PROD, pg_get_functiondef
-- du 27/09, c.-à-d. 20260927081347) : refus 'already_published' / motif
-- 'jumeau_en_ligne' quand une paire « Est-ce le même article ? » encore
-- ouverte relie la fiche publiée à une fiche qui a une annonce VIVANTE sur la
-- même plateforme. Rien d'autre ne change (débit, réservation, autres refus).
-- Aucune fiche fusionnée ni supprimée, aucune annonce retirée.

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
  v_jumeaux       jsonb := NULL;
  v_jumeaux_pf    jsonb := NULL;
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

  -- ── UNE FICHE JUMELLE DÉJÀ EN LIGNE SUR LA PLATEFORME (2026-09-27) ────────
  -- Louis, « Une, deux, trois princesses » : chaque tome existe en DEUX fiches
  -- (une venue de Vinted, une venue de Leboncoin), jamais réunies ; ce matin
  -- les fiches Vinted des tomes 1-3 sont parties sur Leboncoin, où les fiches
  -- jumelles étaient déjà en ligne → trois annonces en double. La garde
  -- ci-dessus ne voyait que LA fiche publiée.
  -- Jumelle = une paire « Est-ce le même article ? » encore OUVERTE
  -- (inventaire_doublons, statut 'proposee') : le doute n'est pas tranché, on
  -- ne publie pas par-dessus une annonce vivante de l'autre fiche sur CETTE
  -- plateforme. Refus 'already_published' (les applications d'avant le
  -- comprennent : elles laissent la plateforme de côté et publient les
  -- autres), motif 'jumeau_en_ligne' et la liste, pour dire laquelle. La
  -- personne tranche dans l'app : « Non, ce sont deux articles » ferme la
  -- paire et la publication repart ; « Oui » réunit les deux fiches.
  -- Vivante = rattachée à un relevé en ligne, ou dépôt publié sans retrait
  -- abouti, ou (Vinted) fiche du dressing encore en ligne.
  SELECT jsonb_agg(DISTINCT jsonb_build_object(
           'platform', x.platform, 'inventaire_id', x.jumeau, 'titre', x.titre,
           'listing_id', x.listing_id, 'url', x.url, 'doublon_id', x.doublon_id)),
         jsonb_agg(DISTINCT x.platform)
    INTO v_jumeaux, v_jumeaux_pf
    FROM (
      SELECT q.platform, pr.jumeau, pr.doublon_id, i.titre, viv.listing_id, viv.url
        FROM (SELECT j->>'platform' AS platform, NULLIF(j->>'inventaire_id', '')::bigint AS inv
                FROM jsonb_array_elements(p_jobs) AS j) q
        JOIN LATERAL (
          SELECT d.id AS doublon_id, CASE WHEN d.garde = q.inv THEN d.absorbe ELSE d.garde END AS jumeau
            FROM inventaire_doublons d
           WHERE d.user_id = v_user AND d.statut = 'proposee' AND q.inv IN (d.garde, d.absorbe)
        ) pr ON true
        JOIN inventaire i ON i.id = pr.jumeau AND i.user_id = v_user
        JOIN LATERAL (
          SELECT a.listing_id, a.url
            FROM annonces_plateforme a
           WHERE a.user_id = v_user AND a.platform = q.platform AND a.inventaire_id = pr.jumeau
             AND a.statut_plateforme = 'en_ligne' AND a.disparu_le IS NULL AND a.retiree_le IS NULL
          UNION ALL
          SELECT COALESCE(NULLIF(btrim(c.platform_listing_id), ''), annonce_id_job(c.platform, c.listing_url)), c.listing_url
            FROM cross_post_jobs c
           WHERE c.user_id = v_user AND c.platform = q.platform AND c.inventaire_id = pr.jumeau
             AND COALESCE(c.action, 'publish') IN ('publish', 'republish') AND c.status = 'published'
             AND (c.listing_url IS NOT NULL OR NULLIF(btrim(c.platform_listing_id), '') IS NOT NULL)
             AND NOT EXISTS (
               SELECT 1 FROM cross_post_jobs dd
                WHERE dd.user_id = v_user AND dd.inventaire_id = c.inventaire_id AND dd.platform = c.platform
                  AND dd.action = 'delete' AND dd.status = 'deleted'
                  AND dd.created_at > COALESCE(c.published_at, c.created_at))
          UNION ALL
          SELECT i.vinted_item_id::text, NULL
           WHERE q.platform = 'vinted' AND i.vinted_item_id IS NOT NULL AND i.disparu_le IS NULL
             AND COALESCE(i.statut, '') <> 'vendu'
          LIMIT 1
        ) viv ON true
       WHERE q.inv IS NOT NULL
    ) x;
  IF v_jumeaux IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'already_published', 'motif', 'jumeau_en_ligne',
      'platforms', v_jumeaux_pf, 'jumeaux', v_jumeaux
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
