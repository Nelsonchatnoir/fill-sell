-- ═══════════════════════════════════════════════════════════════════════════
-- spend_coins_and_republish : plafond de republication MANUELLE pour les
-- comptes free — 3 par jour (2026-09-02)
--
-- Mesuré (audit du 02/09) : 49 comptes free ont lancé 1 392 republications
-- (686 réussies) — la seule valeur récurrente du produit était servie
-- gratuitement, en volume, à hauteur du grant free (50/mois).
--
-- NOUVELLE RÈGLE : un compte free (ni premium, ni pro, ni business, ni
-- comped — is_comped vaut premium partout, expression canonique du 25/07) a
-- droit à 3 republications MANUELLES par jour. Les payants ne sont pas
-- concernés : aucun plafond manuel pour eux, comportement inchangé.
--
-- MÉCANIQUE : même comptage que le plafond auto existant — jobs 'republish'
-- réellement CRÉÉS depuis date_trunc('day', now()) (jour UTC, comme l'auto ;
-- les tentatives refusées ne créent pas de job donc ne comptent pas). Le
-- refus est posé AVANT tout débit et AVANT la création du job : ni Pépite
-- débitée, ni capture lancée, ni créneau consommé.
--
-- CODE DE REFUS DÉDIÉ (lu par l'app pour ouvrir la modale de conversion) :
--     { allowed: false, reason: 'plafond_republication_free',
--       plafond: 3, faites: <nb déjà créées aujourd'hui> }
-- Distinct de 'plafond_auto_atteint' (plafond du moteur auto, Pro) et de
-- tout autre refus.
--
-- PAS DE RÉTROACTIF : rien n'est débité ni annulé sur l'existant. Un free
-- qui a déjà republié N ≥ 3 fois aujourd'hui au moment du déploiement verra
-- son PROCHAIN clic refusé (le comptage lit les jobs du jour) ; rien ne lui
-- est repris, la limite joue pleinement dès demain.
--
-- Le point « republication auto ouverte au Premium » du même lot N'EST PAS
-- dans cette migration : le moteur auto vit dans l'extension, qui coupe
-- elle-même l'automatisation des comptes non-Pro
-- (chrome-extension/background.js, arret_motif 'plan_non_pro') — l'ouvrir
-- exige un passage Chrome Web Store, hors périmètre OTA + serveur. La
-- branche p_source='auto' ci-dessous est donc STRICTEMENT inchangée
-- (auto_reserve_pro, plafond 10..50, plafond_auto_atteint).
--
-- ⚠️ Migration NON appliquée automatiquement : à jouer explicitement (cf.
-- CLAUDE.md). Idempotente, rejouable (CREATE OR REPLACE, aucune donnée
-- modifiée). Seul ajout au corps de la fonction : le bloc « Plafond de
-- republication MANUELLE » ; tout le reste est la définition de prod du
-- 02/09 reprise à l'identique.
-- ═══════════════════════════════════════════════════════════════════════════

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

  -- ── Plafond de republication MANUELLE pour les comptes free (2026-09-02) ──
  -- 3 par jour. Free = ni premium, ni pro, ni business, ni comped (is_comped
  -- vaut premium partout — expression canonique du 25/07). Même mécanique de
  -- comptage que le plafond auto ci-dessus : jobs réellement CRÉÉS depuis
  -- date_trunc('day', now()) — un refus ne crée pas de job, il ne compte pas.
  -- Posé AVANT le débit et AVANT la création du job, comme tous les refus en
  -- amont : ni Pépite débitée, ni capture lancée, ni créneau consommé.
  -- COALESCE 'manuel' : les jobs d'avant l'existence de republish_source
  -- étaient tous manuels (le moteur auto a toujours posé la clé).
  -- Code de refus DÉDIÉ, distinct de plafond_auto_atteint : c'est lui que
  -- l'app lit pour ouvrir la modale de conversion.
  IF p_source = 'manuel'
     AND v_prof.is_business IS NOT TRUE AND v_prof.is_pro IS NOT TRUE
     AND v_prof.is_premium IS NOT TRUE AND v_prof.is_comped IS NOT TRUE THEN
    SELECT count(*) INTO v_faits FROM cross_post_jobs
    WHERE user_id = v_user AND action = 'republish'
      AND COALESCE(platform_fields->>'republish_source', 'manuel') = 'manuel'
      AND created_at >= date_trunc('day', now());
    IF v_faits >= 3 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_republication_free',
                                'plafond', 3, 'faites', v_faits);
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

  -- ── Article sans photo (2026-08-28) ──────────────────────────────────────
  -- La capture ne trouvera aucune URL de photo : la republication echouerait
  -- a coup sur. On refuse AVANT le debit et AVANT la creation du job, donc ni
  -- Pepite debitee, ni creneau du plafond auto consomme.
  IF NOT EXISTS (
    SELECT 1 FROM inventaire i
    WHERE i.id = p_inventaire_id AND i.user_id = v_user
      AND i.photos IS NOT NULL AND jsonb_array_length(i.photos) > 0
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'article_sans_photo');
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
$function$;
