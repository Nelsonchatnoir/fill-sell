-- ═══════════════════════════════════════════════════════════════════════════
-- REPUBLICATION COMMANDABLE À DISTANCE — la capture passe à la RÉCLAMATION
-- ⛔ NON APPLIQUÉE — à montrer à Nico avant exécution (2026-08-05).
-- ═══════════════════════════════════════════════════════════════════════════
-- Problème : spend_coins_and_republish EXIGE une capture 'valide' de moins de
-- 10 minutes, et cette capture est prise par l'extension DU NAVIGATEUR COURANT
-- (postMessage). Depuis un téléphone, personne ne répond : « extension muette
-- (30 s) », rien en base. La republication était donc desktop-only de fait.
--
-- Décision Nico (05/08) : la capture est prise par l'extension AU MOMENT OÙ
-- ELLE RAMASSE le job, juste avant d'agir — jamais au clic.
--
-- POURQUOI CE N'EST PAS UN AFFAIBLISSEMENT, malgré les apparences : la borne
-- de fraîcheur de 24 h (background.js) n'était pas une garde en soi, c'était
-- le PANSEMENT d'une capture prise au clic sur un job qui pouvait dormir des
-- heures avant d'agir. En capturant juste avant de supprimer, ce mode de
-- défaillance CESSE D'EXISTER : la capture a quelques secondes quand la
-- suppression part. La garde anti-perte, elle, est INCHANGÉE et même
-- resserrée — verdict='valide' exigé avant toute suppression, évalué à
-- quelques secondes de l'acte au lieu de 10 minutes ou 24 heures.
--
-- Ce que la RPC garde intégralement : garde extension, automatisation réservée
-- au plan Pro + plafond quotidien, doublon en cours, cadence 24 h par article,
-- droits par plan (Free = price_republish, Premium/Pro/comped = 0), débit AU
-- CLIC (arbitrage Nico : un refus pour solde insuffisant doit être immédiat et
-- lisible, pas annoncé deux minutes plus tard hors écran).
--
-- Ce qu'elle perd : les trois refus liés à la capture (capture_absente,
-- capture_incomplete, capture_perimee). Ils n'ont plus de sens au clic — ils
-- se produisent désormais à la réclamation, côté extension, qui clôt alors le
-- job en 'failed' (et NON 'needs_user') : rien n'a été touché, l'annonce est
-- intacte, il n'y a rien à reprendre — et le trigger republish_refund_on_terminal
-- rend la Pépite. Une Pépite retenue pour un service jamais rendu
-- contredirait l'article 5 des CGV publiées ce jour.
--
-- NOUVELLE PREMIÈRE ÉTAPE : platform_fields.republish_step = 'a_capturer'.
-- La machine à étapes devient  a_capturer → captured → deleted → recreated.
-- Idempotente.

CREATE OR REPLACE FUNCTION public.spend_coins_and_republish(
  p_inventaire_id      bigint,
  p_vinted_item_id     text,
  p_source             text    DEFAULT 'manuel',
  p_prix_republication numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user     uuid := auth.uid();
  v_item     text := NULLIF(trim(p_vinted_item_id), '');
  v_price    integer;
  v_wallet   coin_wallets%ROWTYPE;
  v_from_inc integer := 0;
  v_from_pur integer := 0;
  v_tier     text;
  v_prof     record;
  v_inclus   boolean;
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

  SELECT is_premium, is_pro, is_comped, extension_last_seen_at, extension_version,
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
  -- ⚠️ GARDE DE VERSION — NOUVELLE, ET INDISPENSABLE.
  -- Jusqu'ici, c'est la capture côté site qui interdisait de fait à un compte
  -- en 0.4.x de créer un job 'republish' : sans le canal postMessage de la
  -- 0.5.0, le clic n'aboutissait jamais. En déplaçant la capture dans
  -- l'extension, ce garde-fou IMPLICITE disparaît — et un job 'republish'
  -- servi à une 0.4.x, qui ne connaît pas cette action, serait avalé.
  -- La garde redevient donc explicite, ici, au moment de créer le job.
  IF version_cle(v_prof.extension_version) IS NULL
     OR version_cle(v_prof.extension_version) < version_cle('0.5.0') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'extension_trop_ancienne',
                              'version', v_prof.extension_version);
  END IF;

  v_inclus := (v_prof.is_premium IS TRUE OR v_prof.is_pro IS TRUE OR v_prof.is_comped IS TRUE);

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

REVOKE ALL ON FUNCTION public.spend_coins_and_republish(bigint, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_coins_and_republish(bigint, text, text, numeric) TO authenticated, service_role;

-- L'ANCIENNE signature à 3 arguments doit DISPARAÎTRE : laissée en place, elle
-- cohabiterait avec la nouvelle et PostgREST choisirait l'une ou l'autre selon
-- les arguments nommés reçus — un appel sans prix retomberait sur l'ancienne,
-- qui exige toujours une capture fraîche. C'est le piège déjà rencontré sur
-- refund_coins (migration 20260805020000).
DROP FUNCTION IF EXISTS public.spend_coins_and_republish(bigint, text, text);

-- ── Relance d'un republish : même chemin pour tous les supports ─────────────
-- La relance côté front RECAPTURAIT depuis le navigateur courant quand
-- l'étape était 'captured' — donc impossible depuis un téléphone, alors que la
-- branche 'deleted' (simple re-pend) marchait. Le bouton « Relancer »
-- fonctionnait ou non selon l'étape où le job s'était arrêté, sans que rien ne
-- l'annonce. Désormais une seule RPC, sans capture : on renvoie le job à
-- l'étape 'a_capturer' (l'extension recapturera avant d'agir), sauf si
-- l'annonce est DÉJÀ supprimée — auquel cas la capture en base est la seule
-- source qui reste et la reprise repart directement à la recréation.
CREATE OR REPLACE FUNCTION public.relancer_republish(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_job  cross_post_jobs%ROWTYPE;
  v_step text;
  v_pf   jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  SELECT * INTO v_job FROM cross_post_jobs
  WHERE id = p_job_id AND user_id = v_user AND action = 'republish';
  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'job_introuvable');
  END IF;
  IF v_job.status NOT IN ('needs_user', 'failed') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'job_non_relancable', 'status', v_job.status);
  END IF;

  v_pf   := COALESCE(v_job.platform_fields, '{}'::jsonb);
  v_step := COALESCE(v_pf->>'republish_step', 'a_capturer');

  -- 'deleted' : l'annonce n'existe plus, on ne peut plus la capturer. La
  -- capture en base fait foi et la reprise repart à la recréation.
  IF v_step <> 'deleted' THEN
    v_pf := (v_pf - 'next_action_after' - 'capture_id') || jsonb_build_object('republish_step', 'a_capturer');
  ELSE
    v_pf := v_pf - 'next_action_after';
  END IF;

  UPDATE cross_post_jobs
  SET status = 'pending', error = null, platform_fields = v_pf
  WHERE id = p_job_id AND user_id = v_user;

  RETURN jsonb_build_object('ok', true, 'republish_step', v_pf->>'republish_step');
END;
$$;

REVOKE ALL ON FUNCTION public.relancer_republish(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relancer_republish(uuid) TO authenticated, service_role;
