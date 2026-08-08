-- Résolution de tier : is_business testé EN PREMIER partout où un NOM de
-- tier est déduit de profiles (flags cumulatifs — Business porte aussi
-- is_premium + is_pro, les gates « is_pro = palier max » restent intacts).
-- Corps repris de la PROD (pg_get_functiondef du 2026-08-08 soir), patchs
-- minimaux :
--   · sweep + 4 spend_* (grant paresseux) : CASE is_business → 'business'
--     avant is_pro ;
--   · coins_awaiting_payment (ops-digest) : idem ;
--   · spend_coins_and_republish : + is_business dans le SELECT de v_prof et
--     dans le label usage_logs metadata.plan.
-- Le gate auto_reserve_pro (is_pro IS NOT TRUE) n'est PAS touché : un
-- Business a is_pro = true, la republication auto lui est ouverte.
-- Idempotente (create or replace).

CREATE OR REPLACE FUNCTION public.grant_monthly_coins_sweep()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_granted  int := 0;
  v_skipped  int := 0;
  v_awaiting int := 0;
  v_purges   int := 0;
  r   record;
  res jsonb;
begin
  -- Purge du cache identify expiré (> 24 h). Best-effort : elle ne conditionne
  -- JAMAIS la fraîcheur (vérifiée à la lecture), elle évite juste la croissance
  -- sans fin de la table.
  delete from lens_identify_cache where created_at < now() - interval '24 hours';
  get diagnostics v_purges = row_count;

  for r in
    select p.id,
           case
             when p.is_business = true then 'business'
          when p.is_pro = true then 'pro'
             when p.is_premium = true or p.is_comped = true then 'premium'
             else 'free'
           end as tier
    from profiles p
    -- LEFT JOIN impératif : un profil sans ligne coin_wallets doit être balayé,
    -- sinon il ne serait jamais crédité. next_grant_at vaut alors NULL.
    left join coin_wallets w on w.user_id = p.id
    where w.next_grant_at is null or w.next_grant_at <= now()
  loop
    res := upgrade_monthly_grant(r.id, r.tier, null, 'sweep');
    if coalesce((res->>'granted')::boolean, false) then
      v_granted := v_granted + 1;
    elsif res->>'reason' = 'awaiting_payment_event' then
      v_awaiting := v_awaiting + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;
  return jsonb_build_object('granted', v_granted, 'skipped', v_skipped,
                            'awaiting_payment', v_awaiting,
                            'lens_cache_purge', v_purges, 'ran_at', now());
end;
$function$
;

CREATE OR REPLACE FUNCTION public.coins_awaiting_payment()
 RETURNS TABLE(user_id uuid, email text, tier text, canal text, next_grant_at timestamp with time zone, jours_retard integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id,
         p.email,
         case when p.is_business then 'business' when p.is_pro then 'pro' else 'premium' end,
         case when p.stripe_customer_id is not null then 'stripe'
              when p.apple_original_transaction_id is not null then 'apple'
              when p.google_purchase_token is not null then 'google'
              else 'inconnu' end,
         w.next_grant_at,
         extract(day from (now() - w.next_grant_at))::int
  from profiles p
  join coin_wallets w on w.user_id = p.id
  where (p.is_pro or p.is_premium)
    and not coalesce(p.is_comped, false)
    and (p.stripe_customer_id is not null
         or p.apple_original_transaction_id is not null
         or p.google_purchase_token is not null)
    and w.next_grant_at is not null
    and w.next_grant_at < now() - interval '3 days'
  order by w.next_grant_at;
$function$
;

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
$function$
;

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
$function$
;

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
  v_from_inc      integer;
  v_from_pur      integer;
  v_photo_inc     integer;
  v_pub_inc       integer;
  v_pub_pur       integer;
  v_job_count     integer;
  v_tier          text;
  v_conflicts     jsonb;
  v_ext_seen      timestamptz;
  v_lang          text;
  v_res_id        uuid;
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
  SELECT extension_last_seen_at, lang
    INTO v_ext_seen, v_lang
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

  -- ── Fenêtre de fraîcheur (2026-08-04) ────────────────────────────────────
  -- La garde ci-dessus teste la POSSESSION d'une extension, pas sa VIE : un
  -- compte qui a installé puis désinstallé garde extension_last_seen_at à
  -- jamais, passait la garde, était DÉBITÉ, et son job restait 'pending' sans
  -- personne pour le ramasser — l'incident des 23 jobs. Au-delà de 7 jours
  -- sans le moindre poll, on cesse de facturer.
  -- Seuil de 7 jours et pas de minutes : la file est asynchrone PAR DESIGN
  -- (commander depuis le mobile avec le PC éteint est un usage légitime).
  -- 7 jours attrape la désinstallation sans refuser une nuit, un week-end,
  -- ni quelques jours sans ordinateur.
  IF v_ext_seen < now() - interval '7 days' THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'extension_stale',
      'derniere_activite', v_ext_seen,
      'message', CASE WHEN COALESCE(v_lang, 'fr') = 'en'
        THEN 'Your FillSell extension hasn''t been seen for over a week. Open Chrome on your computer to wake it up, then try again. No Nuggets were charged.'
        ELSE 'Ton extension FillSell ne s''est pas manifestée depuis plus d''une semaine. Ouvre Chrome sur ton ordinateur pour la réveiller, puis relance. Aucune Pépite n''a été débitée.'
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

  -- ── Grille à deux axes (2026-08-04) : photos (par article) + N/plateforme ─
  -- Depuis le 2026-08-08 : price_per_platform vaut pour TOUS les paliers —
  -- l'exception is_pro (publication offerte, 20260808111536) est retirée,
  -- plus aucun prix conditionné au plan.
  SELECT value INTO v_price_photo FROM coin_config WHERE key = 'price_' || p_photo_option;
  SELECT value INTO v_price_unit  FROM coin_config WHERE key = 'price_per_platform';
  IF v_price_photo IS NULL OR v_price_unit IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  -- ── Retouche livrée ? Sinon part photos à 0 (2026-08-05 soir) ─────────────
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
      'price_photos', v_price_photo, 'price_publication', v_price_pub,
      'photos_billed', v_photos_billed,
      'reservation_id', v_res_id
    )
  );

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'publish', jsonb_build_object(
    'coins', v_price, 'photo_option', p_photo_option, 'platforms', v_job_count
  ));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price,
    'price_photos', v_price_photo, 'price_publication', v_price_pub,
    'photos_billed', v_photos_billed,
    'included_after',  v_wallet.included_balance - v_from_inc,
    'purchased_after', v_wallet.purchased_balance - v_from_pur,
    'reserved_after',  v_wallet.reserved_balance + v_price_pub
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.spend_coins_and_republish(p_inventaire_id bigint, p_vinted_item_id text, p_source text DEFAULT 'manuel'::text, p_prix_republication numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user     uuid := auth.uid();
  v_item     text := NULLIF(trim(p_vinted_item_id), '');
  v_price    integer;
  v_wallet   coin_wallets%ROWTYPE;
  v_from_inc integer := 0;
  v_from_pur integer := 0;
  v_tier     text;
  v_prof     record;
  v_plafond  integer;
  v_faits    integer;
  v_titre    text;
  v_prix     numeric;
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
  -- Le prix ajusté de la feuille de prix. Même plancher que la publication
  -- (1 €) ; NULL = « republier au prix actuel », l'extension reprendra celui
  -- relevé sur l'annonce au moment de la capture.
  IF p_prix_republication IS NOT NULL AND p_prix_republication < 1 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_price');
  END IF;

  SELECT is_premium, is_pro, is_business, is_comped, extension_last_seen_at, extension_version,
         lang, platform_settings
  INTO v_prof FROM profiles WHERE id = v_user;

  -- Garde extension : inchangée. Elle teste que le compte a DÉJÀ eu une
  -- extension — pas qu'il y en a une dans ce navigateur, ce qui serait faux
  -- par construction sur un téléphone et rendrait la file inutile.
  IF v_prof.extension_last_seen_at IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'extension_required',
      'message', CASE WHEN COALESCE(v_prof.lang, 'fr') = 'en'
        THEN 'Republishing requires the free FillSell Chrome extension on a computer. No Nuggets were charged.'
        ELSE 'Pour republier, il faut l''extension Chrome gratuite FillSell sur un ordinateur. Aucune Pépite n''a été débitée.'
      END);
  END IF;
  -- ── Fenêtre de fraîcheur (2026-08-04) ────────────────────────────────────
  -- Même raison que pour la publication : la garde ci-dessus teste la
  -- POSSESSION d'une extension, pas sa VIE. Au-delà de 7 jours sans poll, on
  -- cesse de facturer plutôt que d'empiler des jobs que personne ne ramasse.
  IF v_prof.extension_last_seen_at < now() - interval '7 days' THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'extension_stale',
      'derniere_activite', v_prof.extension_last_seen_at,
      'message', CASE WHEN COALESCE(v_prof.lang, 'fr') = 'en'
        THEN 'Your FillSell extension hasn''t been seen for over a week. Open Chrome on your computer to wake it up, then try again. No Nuggets were charged.'
        ELSE 'Ton extension FillSell ne s''est pas manifestée depuis plus d''une semaine. Ouvre Chrome sur ton ordinateur pour la réveiller, puis relance. Aucune Pépite n''a été débitée.'
      END
    );
  END IF;

  -- ⚠️ GARDE DE VERSION — un job 'republish' servi à une extension < 0.5.0,
  -- qui ne connaît pas cette action, serait avalé. Explicite, ici, au moment
  -- de créer le job.
  IF version_cle(v_prof.extension_version) IS NULL
     OR version_cle(v_prof.extension_version) < version_cle('0.5.0') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'extension_trop_ancienne',
                              'version', v_prof.extension_version);
  END IF;

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

  -- Titre : il venait de la capture, qui n'existe plus à cet instant. On le
  -- prend dans l'inventaire (informatif : affichage du popup et des cartes).
  -- L'extension l'écrasera avec le titre RÉEL relevé à la capture.
  SELECT titre INTO v_titre FROM inventaire
  WHERE id = p_inventaire_id AND user_id = v_user;

  -- ── Grille 2026-08-08 : price_republish pour TOUT LE MONDE ────────────────
  -- (l'ancien « v_inclus → 0 » premium/pro/comped est retiré — plus aucun
  -- prix conditionné au palier.)
  SELECT value INTO v_price FROM coin_config WHERE key = 'price_republish';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

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
    IF v_wallet.included_balance + v_wallet.purchased_balance < v_price THEN
      -- Échec auto JAMAIS silencieux : le réglage de StockTab affiche ce
      -- marqueur (« plus assez de Pépites »), effacé au prochain succès auto.
      IF p_source = 'auto' THEN
        UPDATE profiles SET platform_settings = jsonb_set(
          COALESCE(platform_settings, '{}'::jsonb),
          '{vinted,republish_auto}',
          COALESCE(platform_settings #> '{vinted,republish_auto}', '{}'::jsonb)
            || jsonb_build_object(
                 'derniere_erreur', 'pepites_insuffisantes',
                 'derniere_erreur_le', now()::text),
          true)
        WHERE id = v_user;
      END IF;
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

  -- Succès (le débit a eu lieu) : un échec auto antérieur n'est plus vrai.
  IF p_source = 'auto'
     AND v_prof.platform_settings #> '{vinted,republish_auto}' ? 'derniere_erreur' THEN
    UPDATE profiles SET platform_settings = jsonb_set(
      platform_settings,
      '{vinted,republish_auto}',
      (platform_settings #> '{vinted,republish_auto}') - 'derniere_erreur' - 'derniere_erreur_le')
    WHERE id = v_user;
  END IF;

  v_prix := p_prix_republication;

  INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option,
                               title, price, listing_url, platform_fields)
  VALUES (
    v_user, p_inventaire_id, 'vinted', 'republish', 'pending', 'original',
    v_titre, v_prix,
    'https://www.vinted.fr/items/' || v_item,
    jsonb_build_object(
      -- NOUVELLE première étape : rien n'est capturé au clic.
      'republish_step', 'a_capturer',
      'vinted_item_id', v_item,
      'pepites_debitees', v_price,
      'republish_source', p_source
    )
    -- Le prix ajusté vit ICI entre le clic et l'exécution : l'extension le
    -- lit à la réclamation et l'injecte dans payload.prix de la capture,
    -- exactement comme le front le faisait. La règle « le prix ajusté entre
    -- DANS la capture » reste vraie ; seul l'auteur de l'écriture change.
    || CASE WHEN v_prix IS NOT NULL
            THEN jsonb_build_object('prix_republication', v_prix)
            ELSE '{}'::jsonb END
  ) RETURNING id INTO v_job_id;

  IF v_price > 0 THEN
    INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
    VALUES (v_user, -v_price,
            v_wallet.included_balance - v_from_inc,
            v_wallet.purchased_balance - v_from_pur,
            'spend_republish',
            jsonb_build_object('vinted_item_id', v_item, 'job_id', v_job_id));
  END IF;

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'republish', jsonb_build_object(
    'coins', v_price, 'vinted_item_id', v_item, 'source', p_source,
    'plan', CASE WHEN v_prof.is_business IS TRUE THEN 'business'
                    WHEN v_prof.is_pro IS TRUE THEN 'pro'
                 WHEN (v_prof.is_premium IS TRUE OR v_prof.is_comped IS TRUE) THEN 'premium'
                 ELSE 'free' END
  ));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price, 'job_id', v_job_id,
    'included_after',  CASE WHEN v_price > 0 THEN v_wallet.included_balance - v_from_inc ELSE NULL END,
    'purchased_after', CASE WHEN v_price > 0 THEN v_wallet.purchased_balance - v_from_pur ELSE NULL END
  );
END;
$function$
;
