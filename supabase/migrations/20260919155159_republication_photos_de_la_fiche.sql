-- ═══════════════════════════════════════════════════════════════════════════
-- Republication multiplateforme : les photos viennent de la FICHE ARTICLE
-- quand le job source n'en porte pas (19/09/2026)
--
-- Signalé par louis@ttfamily.fr (compte Business, inscrit le jour même) :
--   « Pourquoi quand je veux republier une annonce, quelle que soit la
--     plateforme, j'ai ce message d'erreur : Sans photo, la republication ne
--     peut pas aboutir. »
-- Ses 180 articles ont TOUS des photos en base (0 NULL, 0 tableau vide).
--
-- CREATE OR REPLACE de spend_coins_and_republish, repris à l'identique de
-- 20260918200300_republication_auto_multiplateforme_rpc.sql, avec pour seule
-- différence le calcul des photos (déclaration v_photos, garde, et l'INSERT
-- du job de republication). Idempotente, rejouable.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.spend_coins_and_republish(
  p_inventaire_id bigint,
  p_vinted_item_id text,
  p_source text DEFAULT 'manuel'::text,
  p_prix_republication numeric DEFAULT NULL::numeric,
  p_platform text DEFAULT 'vinted'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user     uuid := auth.uid();
  v_item     text := NULLIF(trim(p_vinted_item_id), '');
  v_platform text := lower(COALESCE(NULLIF(trim(p_platform), ''), 'vinted'));
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
  -- Multiplateforme (17/09)
  v_multi      integer;
  v_min        integer;
  v_code       integer;
  v_statut     text;
  v_src        cross_post_jobs%ROWTYPE;
  v_pf_src     jsonb;
  v_photos_n   integer;
  -- 19/09 : les photos RÉELLEMENT redéposées (fiche article en repli du job
  -- source — cf. le bloc commenté plus bas).
  v_photos     jsonb;
  -- Multiplateforme automatique (18/09) : l'enveloppe de compte
  v_faits_cpt   integer;
  v_plafond_cpt integer;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthorized');
  END IF;
  IF v_platform NOT IN ('vinted', 'leboncoin', 'beebs', 'opla') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_platform', 'platform', v_platform);
  END IF;
  IF v_platform = 'vinted' AND (v_item IS NULL OR v_item !~ '^\d+$') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_item');
  END IF;
  IF p_source NOT IN ('manuel', 'auto') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_source');
  END IF;
  -- ── L'AUTO S'OUVRE AUX QUATRE PLATEFORMES (18/09) ─────────────────────────
  -- Ce qui la gardait Vinted-only n'était pas une limite technique : c'était
  -- « conçu, pas livré » (docs § 7 du 17/09). Le module planifié sait désormais
  -- nommer sa plateforme ; la porte devient donc l'interrupteur de CETTE
  -- plateforme, fail-closed (clé absente = fermée), et non plus le nom 'vinted'.
  IF p_source = 'auto' AND NOT republish_planifiee_pf_ouverte(v_platform) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'plateforme_fermee', 'platform', v_platform);
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

  -- ── MULTIPLATEFORME (17/09) : porte, borne de build, source ────────────────
  IF v_platform <> 'vinted' THEN
    SELECT value INTO v_multi FROM coin_config WHERE key = 'republication_multi_ouverte';
    IF COALESCE(v_multi, 0) <> 1 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'republication_multi_fermee', 'platform', v_platform);
    END IF;
    SELECT value INTO v_min FROM coin_config WHERE key = 'republication_multi_extension_min';
    v_min := COALESCE(v_min, 642);
    -- Même encodage que lbc_pro_extension_min / opla_extension_min :
    -- major×10000 + minor×100 + patch ; version illisible = 0.
    v_code := CASE
      WHEN v_prof.extension_version ~ '^\d+\.\d+\.\d+' THEN
        (split_part(v_prof.extension_version, '.', 1))::integer * 10000
        + (split_part(v_prof.extension_version, '.', 2))::integer * 100
        + (regexp_replace(split_part(v_prof.extension_version, '.', 3), '\D.*$', ''))::integer
      ELSE 0 END;
    IF v_min > 0 AND v_code < v_min THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'extension_trop_ancienne',
                                'version', v_prof.extension_version, 'minimum', v_min, 'platform', v_platform);
    END IF;

    SELECT i.statut INTO v_statut FROM inventaire i WHERE i.id = p_inventaire_id AND i.user_id = v_user;
    IF v_statut IS NULL THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_item', 'platform', v_platform);
    END IF;
    IF v_statut = 'vendu' THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'article_vendu', 'platform', v_platform);
    END IF;

    -- La source : le dernier dépôt FillSell EN LIGNE sur cette plateforme.
    SELECT j.* INTO v_src FROM cross_post_jobs j
    WHERE j.user_id = v_user AND j.inventaire_id = p_inventaire_id
      AND j.platform = v_platform AND j.action IN ('publish', 'republish')
      AND j.status = 'published' AND NULLIF(trim(j.listing_url), '') IS NOT NULL
    ORDER BY COALESCE(j.published_at, j.created_at) DESC
    LIMIT 1;
    IF v_src.id IS NULL THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'annonce_introuvable', 'platform', v_platform);
    END IF;

    IF EXISTS (
      SELECT 1 FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish'
        AND j.platform = v_platform AND j.inventaire_id = p_inventaire_id
        AND j.status IN ('pending', 'processing', 'needs_user')
    ) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'republish_en_cours', 'platform', v_platform);
    END IF;
    IF EXISTS (
      SELECT 1 FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish'
        AND j.platform = v_platform AND j.inventaire_id = p_inventaire_id
        AND j.status = 'published'
        AND j.published_at > now() - interval '24 hours'
    ) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'cadence_24h', 'platform', v_platform);
    END IF;

    -- ── LES PHOTOS VIENNENT DE LA FICHE QUAND LE JOB SOURCE N'EN A PAS ──────
    -- (19/09/2026 — bug report louis@ttfamily.fr : « quelle que soit la
    -- plateforme : Sans photo, la republication ne peut pas aboutir ».)
    -- Cette branche comptait les photos du JOB SOURCE. Or un article IMPORTÉ
    -- par un relevé a bien son annonce en ligne et son listing_url — donc un
    -- job source trouvable — mais ce job est écrit par le relevé avec
    -- photos = NULL : le relevé recense des annonces, il ne rapatrie pas de
    -- photos dans le job. La fiche article, elle, EN A. Résultat : refus
    -- « Sans photo » sur un article qui en affiche cinq, et rien de
    -- republiable pour qui est arrivé par un relevé.
    -- La branche Vinted de cette même fonction lisait déjà inventaire.photos ;
    -- c'est la branche multiplateforme du 17/09 qui a divergé. On les aligne.
    -- Mesuré avant correctif : 210 annonces sur 13 comptes ont un job source
    -- sans photo, dont 209 avec des photos sur la fiche.
    --
    -- ⚠️ Le repli sert AUSSI à l'insert plus bas : garder v_src.photos là-bas
    -- aurait produit un job de republication à zéro photo, refusé par le
    -- handler au lieu de l'être ici — un échec déplacé, pas réparé.
    -- inventaire.photos coexiste en deux formes (chaînes nues du relevé et de
    -- la sync, objets {type,url} de nos pipelines) : on normalise en objets,
    -- ordre PRÉSERVÉ (la 1re photo reste la principale), entrées sans URL
    -- écartées.
    v_photos := CASE WHEN jsonb_typeof(v_src.photos) = 'array' AND jsonb_array_length(v_src.photos) > 0
                     THEN v_src.photos ELSE NULL END;
    IF v_photos IS NULL THEN
      SELECT COALESCE(jsonb_agg(
               CASE WHEN jsonb_typeof(a.val) = 'string'
                    THEN jsonb_build_object('url', a.val #>> '{}',
                           'type', CASE WHEN a.ord = 1 THEN 'original' ELSE 'photo_' || (a.ord - 1) END)
                    ELSE a.val END
               ORDER BY a.ord), '[]'::jsonb) INTO v_photos
      FROM inventaire i,
      LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]'::jsonb END)
              WITH ORDINALITY AS a(val, ord)
      WHERE i.id = p_inventaire_id AND i.user_id = v_user
        AND COALESCE(NULLIF(trim(CASE WHEN jsonb_typeof(a.val) = 'string'
                                      THEN a.val #>> '{}' ELSE a.val->>'url' END), ''), '') <> '';
    END IF;
    v_photos_n := CASE WHEN jsonb_typeof(v_photos) = 'array' THEN jsonb_array_length(v_photos) ELSE 0 END;
    IF v_photos_n = 0 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'article_sans_photo', 'platform', v_platform);
    END IF;
  END IF;

  v_tier := CASE
    WHEN v_prof.is_business IS TRUE THEN 'business'
    WHEN v_prof.is_pro IS TRUE THEN 'pro'
    WHEN v_prof.is_premium IS TRUE OR v_prof.is_comped IS TRUE THEN 'premium'
    ELSE 'free' END;

  IF p_source = 'auto' THEN
    -- (1) L'auto RESTE RÉSERVÉE AU PRO (correction Nico 12/09 15h30 : l'ouverture
    -- aux abonnés de la 4/5 était une erreur d'orientation). Gate IDENTIQUE à
    -- celui d'avant la 4/5 ; code de refus inchangé.
    IF v_prof.is_pro IS NOT TRUE THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'auto_reserve_pro');
    END IF;

    v_regl := republish_planifiee_reglage(v_user, v_platform);
    IF v_regl IS NOT NULL AND COALESCE((v_regl ->> 'actif')::boolean, false) THEN
      -- (2) VOIE PLANIFIÉE, PAR PLATEFORME. Trois bornes, dans cet ordre :
      --   a. le plafond du réglage de CETTE plateforme (≤ palier), compté sur
      --      le jour LOCAL de SON fuseau ;
      --   b. l'ENVELOPPE DE COMPTE : la somme des quatre plateformes ne dépasse
      --      pas le plafond du palier (décision Nico 18/09). 170 × 30 = 5 100 ≈
      --      quota_republication_pro = 5 000 : le plafond du palier a été
      --      calibré comme une enveloppe de compte, pas comme un budget par
      --      plateforme. Quatre plafonds pleins brûleraient le mois en 8 jours ;
      --   c. le plafond de boutique, sur Vinted — le global prime toujours.
      v_plafond := (v_regl ->> 'plafond_jour')::integer;
      v_minuit  := republish_minuit_local(COALESCE(v_regl ->> 'fuseau', 'Europe/Paris'));
      SELECT count(*) FILTER (WHERE platform = v_platform), count(*)
      INTO v_faits, v_faits_cpt
      FROM cross_post_jobs
      WHERE user_id = v_user AND action = 'republish'
        AND platform_fields->>'republish_source' = 'auto'
        AND created_at >= v_minuit;
      IF v_faits >= v_plafond THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_auto_atteint',
                                  'plafond', v_plafond, 'platform', v_platform);
      END IF;
      v_plafond_cpt := republish_plafond_palier(v_tier);
      IF v_faits_cpt >= v_plafond_cpt THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_compte_atteint',
                                  'plafond', v_plafond_cpt, 'faites', v_faits_cpt,
                                  'platform', v_platform);
      END IF;

      IF v_platform = 'vinted' THEN
        SELECT NULLIF(trim(i.vinted_account_id), '') INTO v_boutique
        FROM inventaire i WHERE i.id = p_inventaire_id AND i.user_id = v_user;
        IF v_boutique IS NOT NULL THEN
          v_plafond_b := LEAST(v_plafond, GREATEST(1, COALESCE(
            NULLIF(v_regl -> 'plafond_boutique' ->> v_boutique, '')::integer, v_plafond)));
          SELECT count(*) INTO v_faits_b
          FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id
          WHERE j.user_id = v_user AND j.action = 'republish' AND j.platform = 'vinted'
            AND j.platform_fields->>'republish_source' = 'auto'
            AND j.created_at >= v_minuit
            AND i.vinted_account_id = v_boutique;
          IF v_faits_b >= v_plafond_b THEN
            RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_boutique_atteint',
                                      'plafond', v_plafond_b, 'boutique', v_boutique);
          END IF;
        END IF;
      END IF;
    ELSIF v_platform = 'vinted' THEN
      -- (3) VOIE HISTORIQUE, INCHANGÉE, ET VINTED SEUL : l'ancien moteur
      -- republish_auto n'a jamais existé ailleurs. Plafond technique 45/jour
      -- (borne 50) anti-bannissement Vinted, réglage republish_auto.plafond_jour.
      v_plafond := LEAST(50, GREATEST(1, COALESCE(
        NULLIF(v_prof.platform_settings->'vinted'->'republish_auto'->>'plafond_jour', '')::integer, 10)));
      SELECT count(*) INTO v_faits FROM cross_post_jobs
      WHERE user_id = v_user AND action = 'republish'
        AND platform_fields->>'republish_source' = 'auto'
        AND created_at >= date_trunc('day', now());
      IF v_faits >= v_plafond THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_auto_atteint', 'plafond', v_plafond);
      END IF;
    ELSE
      -- Auto demandée sur une plateforme dont le module n'est pas actif. Il n'y
      -- a pas de voie historique hors Vinted, et on n'en invente pas une : rien
      -- ne part, rien n'est débité.
      RETURN jsonb_build_object('allowed', false, 'reason', 'module_inactif', 'platform', v_platform);
    END IF;
  END IF;

  -- ── Bascule 02/09 : plafonds de republication par palier ─────────────────
  -- (toutes plateformes confondues : une republication est une republication)
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

  IF v_platform = 'vinted' THEN
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
      -- `derniere_erreur` vit dans {vinted,republish_auto} : c'est le reglage de
      -- l'ANCIEN moteur Vinted, lu par les extensions 0.6.x. Une auto refusee
      -- sur Leboncoin n'a rien a y ecrire (18/09).
      IF p_source = 'auto' AND v_platform = 'vinted' THEN
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

  IF p_source = 'auto' AND v_platform = 'vinted'
     AND v_prof.platform_settings #> '{vinted,republish_auto}' ? 'derniere_erreur' THEN
    UPDATE profiles SET platform_settings = jsonb_set(
      platform_settings,
      '{vinted,republish_auto}',
      (platform_settings #> '{vinted,republish_auto}') - 'derniere_erreur' - 'derniere_erreur_le')
    WHERE id = v_user;
  END IF;

  v_prix := p_prix_republication;

  IF v_platform = 'vinted' THEN
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
  ELSE
    -- Copie du job source, clés transitoires retirées : tout ce qu'il faut pour
    -- redéposer, rien de ce qui racontait la vie du dépôt d'origine.
    v_pf_src := COALESCE(v_src.platform_fields, '{}'::jsonb)
      - ARRAY['needsUserField', 'needsUserFields', 'needsUserResolved', 'needsUserAttempts', 'needsUserBoucle',
              'boucle_needs_user', 'needs_user_tick_le', 'needs_user_source', 'processing_since', 'next_action_after',
              'stale_recoveries', 'attente_session', 'blocage_antirobot', 'porte_pro_lbc', 'erreurs_archivees',
              'work_window_state', 'last_diagnostic', 'lbc_depot', 'lbc_depot_non_finalise', 'depot_non_confirme_requalifie',
              'verifier_doublon_avant_publication', 'unavailable_since', 'unavailable_pending_since', 'sale_signal',
              'detected_price', 'removed_by_user', 'republished_pending', 'delete_trace', 'delete_confirmed_by',
              'delete_dry_run_trace', 'listing_url_abandon', 'retrait_attend_lien', 'removal_url_missing',
              'republish_step', 'republish_source', 'republish_snapshot', 'republish_platform', 'republish_source_job_id',
              'republish_recreation', 'recreated_at', 'deleted_at', 'deleted_at_client', 'deleted_at_serveur',
              'horloge_client_ecart_s', 'suppression_verdict', 'old_listing_url', 'old_platform_listing_id',
              'recreation_retries', 'pepites_debitees', 'pepite_remboursee', 'prix_republication', 'orphan_alerted_at',
              'deleted_hang_count', 'introuvable_indetermine', 'attente_boutique', 'republish_creneau_id',
              'republish_sweep_at', 'republish_moteur', 'republish_planifie', 'republish_prevol', 'republish_etat_reel'];
    INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option,
                                 title, description, price, photos, listing_url, platform_listing_id, platform_fields)
    VALUES (
      v_user, p_inventaire_id, v_platform, 'republish', 'pending', COALESCE(v_src.photo_option, 'original'),
      COALESCE(v_src.title, v_titre), v_src.description, COALESCE(v_prix, v_src.price), v_photos,
      v_src.listing_url, v_src.platform_listing_id,
      v_pf_src || jsonb_build_object(
        'republish_step', 'a_capturer',
        'republish_source', p_source,
        'republish_platform', v_platform,
        'republish_source_job_id', v_src.id,
        'pepites_debitees', v_price,
        'republish_snapshot', jsonb_build_object(
          'version', 2,
          'plateforme', v_platform,
          'source_job_id', v_src.id,
          'titre', COALESCE(v_src.title, v_titre),
          'prix', COALESCE(v_prix, v_src.price),
          'listing_url', v_src.listing_url,
          'platform_listing_id', v_src.platform_listing_id,
          'photos', v_photos_n,
          'captured_at', now())
      )
      || CASE WHEN v_prix IS NOT NULL
              THEN jsonb_build_object('prix_republication', v_prix)
              ELSE '{}'::jsonb END
    ) RETURNING id INTO v_job_id;
  END IF;

  IF v_price > 0 THEN
    INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
    VALUES (v_user, -v_price,
            v_wallet.included_balance - v_from_inc,
            v_wallet.purchased_balance - v_from_pur,
            'spend_republish',
            jsonb_build_object('vinted_item_id', v_item, 'job_id', v_job_id, 'platform', v_platform));
  END IF;

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'republish', jsonb_build_object(
    'coins', v_price, 'vinted_item_id', v_item, 'source', p_source,
    'plan', v_tier, 'platform', v_platform
  ));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price, 'job_id', v_job_id, 'platform', v_platform,
    'included_after',  CASE WHEN v_price > 0 THEN v_wallet.included_balance - v_from_inc ELSE NULL END,
    'purchased_after', CASE WHEN v_price > 0 THEN v_wallet.purchased_balance - v_from_pur ELSE NULL END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.spend_coins_and_republish(bigint, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_coins_and_republish(bigint, text, text, numeric, text) TO authenticated, service_role;
