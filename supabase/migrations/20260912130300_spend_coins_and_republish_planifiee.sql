-- ═══════════════════════════════════════════════════════════════════════════
-- REPUBLICATION PLANIFIÉE (créneaux) — 4/5 : spend_coins_and_republish
-- 2026-09-12, décisions Nico.
-- ═══════════════════════════════════════════════════════════════════════════
-- Base : la définition EN PROD du 12/09 (md5 ff8cc7b9…, identique au fichier
-- 20260902201000 hors commentaires). TROIS changements, tous dans le bloc
-- `p_source = 'auto'` ; TOUT LE RESTE est recopié mot pour mot (gardes
-- extension / fraîcheur / version, quota mensuel par palier, free à vie,
-- republish_en_cours, cadence_24h, article_sans_photo, branche monétaire
-- inerte à prix 0, trigger de maintenance).
--
-- 1. L'AUTO S'OUVRE À PREMIUM (point 6). Avant : is_pro seul. Maintenant :
--    premium, pro, business — c'est-à-dire tout ABONNÉ. Le code de refus
--    reste 'auto_reserve_pro' : le parc d'extensions 0.6.x le classe
--    « portée compte » (REPUBLISH_AUTO_REFUS_COMPTE) ; un code neuf serait
--    ré-essayé article par article, bruyant. Le libellé est côté app.
--
-- 2. VOIE PLANIFIÉE (réglage republish_planifiee actif) : le plafond du jour
--    est celui du RÉGLAGE NORMALISÉ (republish_planifiee_reglage, 3/5),
--    c'est-à-dire LEAST(plafond du palier, choix de l'utilisateur) — plus
--    jamais « 50 max, 10 par défaut ». Compté sur les jobs auto CRÉÉS depuis
--    MINUIT LOCAL (fuseau du réglage), et non depuis date_trunc('day', now())
--    qui est le minuit UTC du serveur. Puis PAR BOUTIQUE (point 3, validé :
--    le global prime, il vient d'être testé) : boutique de l'article
--    (inventaire.vinted_account_id), plafond = plafond_boutique[boutique] ou
--    le global, refus 'plafond_boutique_atteint'. Article sans boutique
--    connue : compte dans le global seul (fail-open, doctrine du 03/09).
--
-- 3. VOIE HISTORIQUE (republish_auto, moteur client ou sweep témoin) :
--    INCHANGÉE MOT POUR MOT — borne 50, défaut 10, jour serveur. « Rien ne
--    casse la republication actuelle tant que le nouveau module n'est pas
--    servi » : un compte qui n'a pas activé le module ne voit aucune
--    différence, à part l'ouverture Premium (qui ne concerne que l'app
--    nouvelle : le moteur client des 0.6.x garde son propre gate is_pro).
--
-- Dépend de 3/5 (republish_planifiee_reglage, republish_minuit_local).
-- Idempotente (CREATE OR REPLACE). Retour arrière : rejouer la définition
-- de 20260902201000 (ou celle relevée en prod le 12/09).

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
  v_avie     integer;
  v_depuis   integer;
  v_cycle    timestamptz;
  v_titre    text;
  v_prix     numeric;
  v_job_id   uuid;
  -- Voie planifiée (12/09)
  v_regl       jsonb;
  v_minuit     timestamptz;
  v_boutique   text;
  v_plafond_b  integer;
  v_faits_b    integer;
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
  IF p_prix_republication IS NOT NULL AND p_prix_republication < 1 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_price');
  END IF;

  SELECT is_premium, is_pro, is_business, is_comped, extension_last_seen_at, extension_version,
         lang, platform_settings
  INTO v_prof FROM profiles WHERE id = v_user;

  IF v_prof.extension_last_seen_at IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'extension_required',
      'message', CASE WHEN COALESCE(v_prof.lang, 'fr') = 'en'
        THEN 'Republishing requires the free FillSell Chrome extension on a computer. Nothing was used from your plan.'
        ELSE 'Pour republier, il faut l''extension Chrome gratuite FillSell sur un ordinateur. Rien n''a été décompté.'
      END);
  END IF;
  IF v_prof.extension_last_seen_at < now() - interval '7 days' THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'extension_stale',
      'derniere_activite', v_prof.extension_last_seen_at,
      'message', CASE WHEN COALESCE(v_prof.lang, 'fr') = 'en'
        THEN 'Your FillSell extension hasn''t been seen for over a week. Open Chrome on your computer to wake it up, then try again. Nothing was used from your plan.'
        ELSE 'Ton extension FillSell ne s''est pas manifestée depuis plus d''une semaine. Ouvre Chrome sur ton ordinateur pour la réveiller, puis relance. Rien n''a été décompté.'
      END
    );
  END IF;

  IF version_cle(v_prof.extension_version) IS NULL
     OR version_cle(v_prof.extension_version) < version_cle('0.5.0') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'extension_trop_ancienne',
                              'version', v_prof.extension_version);
  END IF;

  v_tier := CASE
    WHEN v_prof.is_business IS TRUE THEN 'business'
    WHEN v_prof.is_pro IS TRUE THEN 'pro'
    WHEN v_prof.is_premium IS TRUE OR v_prof.is_comped IS TRUE THEN 'premium'
    ELSE 'free' END;

  IF p_source = 'auto' THEN
    -- (1) Ouverture à Premium (12/09) : l'auto est réservée aux ABONNÉS.
    -- Code de refus CONSERVÉ ('auto_reserve_pro') — cf. bandeau.
    IF v_tier NOT IN ('premium', 'pro', 'business') THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'auto_reserve_pro');
    END IF;

    v_regl := republish_planifiee_reglage(v_user);
    IF v_regl IS NOT NULL AND COALESCE((v_regl ->> 'actif')::boolean, false) THEN
      -- (2) VOIE PLANIFIÉE : plafond du réglage normalisé (≤ palier), jour
      -- LOCAL du fuseau du réglage, puis par boutique — le global prime.
      v_plafond := (v_regl ->> 'plafond_jour')::integer;
      v_minuit  := republish_minuit_local(COALESCE(v_regl ->> 'fuseau', 'Europe/Paris'));
      SELECT count(*) INTO v_faits FROM cross_post_jobs
      WHERE user_id = v_user AND action = 'republish'
        AND platform_fields->>'republish_source' = 'auto'
        AND created_at >= v_minuit;
      IF v_faits >= v_plafond THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_auto_atteint', 'plafond', v_plafond);
      END IF;

      SELECT NULLIF(trim(i.vinted_account_id), '') INTO v_boutique
      FROM inventaire i WHERE i.id = p_inventaire_id AND i.user_id = v_user;
      IF v_boutique IS NOT NULL THEN
        v_plafond_b := LEAST(v_plafond, GREATEST(1, COALESCE(
          NULLIF(v_regl -> 'plafond_boutique' ->> v_boutique, '')::integer, v_plafond)));
        SELECT count(*) INTO v_faits_b
        FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id
        WHERE j.user_id = v_user AND j.action = 'republish'
          AND j.platform_fields->>'republish_source' = 'auto'
          AND j.created_at >= v_minuit
          AND i.vinted_account_id = v_boutique;
        IF v_faits_b >= v_plafond_b THEN
          RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_boutique_atteint',
                                    'plafond', v_plafond_b, 'boutique', v_boutique);
        END IF;
      END IF;
    ELSE
      -- (3) VOIE HISTORIQUE, INCHANGÉE : plafond technique 45/jour (borne 50)
      -- anti-bannissement Vinted, réglage republish_auto.plafond_jour.
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
  END IF;

  -- ── Bascule 02/09 : plafonds de republication par palier ─────────────────
  IF v_tier = 'free' THEN
    SELECT value INTO v_avie   FROM coin_config WHERE key = 'republication_avie_free';
    SELECT value INTO v_depuis FROM coin_config WHERE key = 'republication_avie_depuis';
    IF v_avie IS NOT NULL AND v_avie > 0 AND v_depuis IS NOT NULL THEN
      SELECT count(*) INTO v_faits FROM cross_post_jobs
      WHERE user_id = v_user AND action = 'republish'
        AND created_at >= to_timestamp(v_depuis);
      IF v_faits >= v_avie THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_republication_free',
                                  'plafond', v_avie, 'restantes', 0);
      END IF;
    END IF;
  ELSIF v_tier IN ('premium', 'pro') THEN
    SELECT value INTO v_plafond FROM coin_config WHERE key = 'quota_republication_' || v_tier;
    IF v_plafond IS NOT NULL AND v_plafond > 0 THEN
      SELECT COALESCE(max(created_at), date_trunc('month', now())) INTO v_cycle
      FROM coin_ledger WHERE user_id = v_user AND kind IN ('grant_monthly','grant_upgrade');
      SELECT count(*) INTO v_faits FROM cross_post_jobs
      WHERE user_id = v_user AND action = 'republish' AND created_at >= v_cycle;
      IF v_faits >= v_plafond THEN
        IF p_source = 'auto' THEN
          RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_auto_atteint', 'plafond', v_plafond);
        END IF;
        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_republication_mensuel',
                                  'plafond', v_plafond, 'faites', v_faits);
      END IF;
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

  IF NOT EXISTS (
    SELECT 1 FROM inventaire i
    WHERE i.id = p_inventaire_id AND i.user_id = v_user
      AND i.photos IS NOT NULL AND jsonb_array_length(i.photos) > 0
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'article_sans_photo');
  END IF;

  SELECT titre INTO v_titre FROM inventaire
  WHERE id = p_inventaire_id AND user_id = v_user;

  SELECT value INTO v_price FROM coin_config WHERE key = 'price_republish';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  IF v_price > 0 THEN
    INSERT INTO coin_wallets (user_id) VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;
    IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
      PERFORM upgrade_monthly_grant(v_user, v_tier, null, 'lazy');
      SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;
    END IF;
    IF v_wallet.included_balance + v_wallet.purchased_balance < v_price THEN
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
      'republish_step', 'a_capturer',
      'vinted_item_id', v_item,
      'pepites_debitees', v_price,
      'republish_source', p_source
    )
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
    'plan', v_tier
  ));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price, 'job_id', v_job_id,
    'included_after',  CASE WHEN v_price > 0 THEN v_wallet.included_balance - v_from_inc ELSE NULL END,
    'purchased_after', CASE WHEN v_price > 0 THEN v_wallet.purchased_balance - v_from_pur ELSE NULL END
  );
END;
$function$;

-- Contrôle : la définition en prod doit contenir 'VOIE PLANIFIÉE' et
-- 'VOIE HISTORIQUE, INCHANGÉE' :
--   SELECT pg_get_functiondef(p.oid) ILIKE '%VOIE PLANIFIÉE%'
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'spend_coins_and_republish';
