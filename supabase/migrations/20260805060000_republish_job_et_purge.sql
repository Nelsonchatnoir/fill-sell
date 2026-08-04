-- ── É2 republication : job 'republish', débit 1 Pépite, refund auto, purge ───
-- (2026-08-05 — ⛔ EN ATTENTE DE VALIDATION NICO : ni appliquée ni commitée
--  tant que le schéma n'est pas approuvé. Présentée dans le rapport d'É2.)
--
-- Machine à étapes : le job action='republish' (platform 'vinted') porte son
-- état dans platform_fields.republish_step : 'captured' → 'deleted' →
-- 'recreated'. Chaque transition est écrite EN BASE avant le geste suivant —
-- c'est elle qui permet la reprise après interruption. Statuts : pending →
-- processing → published (recréée) / needs_user / failed / cancelled /
-- dry_run_completed (aucun nouveau statut : la nomenclature existante suffit).

-- 1. L'action 'republish' entre dans la CHECK (liste fermée).
ALTER TABLE public.cross_post_jobs DROP CONSTRAINT IF EXISTS cross_post_jobs_action_check;
ALTER TABLE public.cross_post_jobs ADD CONSTRAINT cross_post_jobs_action_check
  CHECK (action = ANY (ARRAY['publish'::text, 'delete'::text, 'republish'::text]));

-- 2. Prix en config (décision : 1 Pépite, jamais 3 — republier 50 annonces
-- doit rester faisable) + kinds de ledger dédiés (CHECK fermée, leçon connue).
INSERT INTO public.coin_config (key, value) VALUES ('price_republish', 1)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_kind_check;
ALTER TABLE public.coin_ledger ADD CONSTRAINT coin_ledger_kind_check
  CHECK (kind = ANY (ARRAY[
    'grant_monthly'::text, 'grant_upgrade'::text, 'purchase'::text,
    'spend_publish'::text, 'spend_lens'::text, 'refund'::text, 'admin'::text,
    'release_publish'::text, 'spend_generate'::text, 'refund_generate'::text,
    'spend_republish'::text, 'refund_republish'::text
  ]));

-- refund_coins accepte le nouveau kind.
DROP FUNCTION IF EXISTS public.refund_coins(uuid, integer, jsonb, text);
CREATE OR REPLACE FUNCTION public.refund_coins(
  p_user_id uuid, p_amount integer, p_metadata jsonb DEFAULT NULL::jsonb, p_kind text DEFAULT 'refund'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wallet coin_wallets%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'invalid_amount');
  END IF;
  IF p_kind NOT IN ('refund', 'refund_generate', 'refund_republish') THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'invalid_kind');
  END IF;
  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;
  UPDATE coin_wallets SET
    purchased_balance = purchased_balance + p_amount,
    updated_at        = now()
  WHERE user_id = p_user_id;
  INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
  VALUES (
    p_user_id, p_amount,
    v_wallet.included_balance, v_wallet.purchased_balance + p_amount,
    p_kind, p_metadata
  );
  RETURN jsonb_build_object('refunded', true, 'amount', p_amount);
END;
$$;
REVOKE ALL ON FUNCTION public.refund_coins(uuid, integer, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_coins(uuid, integer, jsonb, text) TO service_role;

-- 3. spend_coins_and_republish : LA garde d'entrée. Débit à la capture
-- réussie (le client n'appelle cette RPC qu'après une capture persistée) —
-- mais c'est le SERVEUR qui vérifie la capture, jamais le client sur parole.
CREATE OR REPLACE FUNCTION public.spend_coins_and_republish(
  p_inventaire_id bigint, p_vinted_item_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user     uuid := auth.uid();
  v_item     text := NULLIF(trim(p_vinted_item_id), '');
  v_capture  vinted_republish_captures%ROWTYPE;
  v_price    integer;
  v_wallet   coin_wallets%ROWTYPE;
  v_from_inc integer;
  v_from_pur integer;
  v_tier     text;
  v_ext_seen timestamptz;
  v_lang     text;
  v_job_id   uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthorized');
  END IF;
  IF v_item IS NULL OR v_item !~ '^\d+$' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_item');
  END IF;

  -- Extension obligatoire (même garde que la publication) : sans elle,
  -- personne ne viendra ni supprimer ni recréer.
  SELECT extension_last_seen_at, lang INTO v_ext_seen, v_lang
  FROM profiles WHERE id = v_user;
  IF v_ext_seen IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'extension_required',
      'message', CASE WHEN COALESCE(v_lang, 'fr') = 'en'
        THEN 'Republishing requires the free FillSell Chrome extension on a computer. No Nuggets were charged.'
        ELSE 'Pour republier, il faut l''extension Chrome gratuite FillSell sur un ordinateur. Aucune Pépite n''a été débitée.'
      END);
  END IF;

  -- LA GARDE ANTI-PERTE : capture la plus récente pour cet article, verdict
  -- 'valide', et FRAÎCHE (60 min — au-delà, l'annonce a pu bouger : on
  -- re-capture, ça ne coûte rien). Sans elle, AUCUN job n'est créé, AUCUNE
  -- Pépite ne part — et l'extension refusera de son côté tout job republish
  -- dont la capture n'est pas valide : double verrou.
  SELECT * INTO v_capture FROM vinted_republish_captures
  WHERE user_id = v_user AND vinted_item_id = v_item
  ORDER BY captured_at DESC LIMIT 1;
  IF v_capture.id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'capture_absente');
  END IF;
  IF v_capture.verdict <> 'valide' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'capture_incomplete',
      'champs_manquants', to_jsonb(v_capture.champs_manquants));
  END IF;
  IF v_capture.captured_at < now() - interval '60 minutes' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'capture_perimee');
  END IF;

  -- Anti-doublon : un republish encore vivant sur cet article suffit.
  IF EXISTS (
    SELECT 1 FROM cross_post_jobs j
    WHERE j.user_id = v_user AND j.action = 'republish'
      AND j.platform_fields->>'vinted_item_id' = v_item
      AND j.status IN ('pending', 'processing', 'needs_user')
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'republish_en_cours');
  END IF;

  -- Cadence : une republication ABOUTIE par article et par 24 h.
  IF EXISTS (
    SELECT 1 FROM cross_post_jobs j
    WHERE j.user_id = v_user AND j.action = 'republish'
      AND j.platform_fields->>'vinted_item_id' = v_item
      AND j.status = 'published'
      AND j.published_at > now() - interval '24 hours'
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'cadence_24h');
  END IF;

  SELECT value INTO v_price FROM coin_config WHERE key = 'price_republish';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

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

  INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option,
                               title, price, listing_url, platform_fields)
  VALUES (
    v_user, p_inventaire_id, 'vinted', 'republish', 'pending', 'original',
    v_capture.payload->>'titre',
    NULLIF(v_capture.payload->>'prix', '')::numeric,
    'https://www.vinted.fr/items/' || v_item,
    jsonb_build_object(
      'republish_step', 'captured',
      'vinted_item_id', v_item,
      'capture_id', v_capture.id,
      'pepites_debitees', v_price
    )
  ) RETURNING id INTO v_job_id;

  INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
  VALUES (v_user, -v_price,
          v_wallet.included_balance - v_from_inc,
          v_wallet.purchased_balance - v_from_pur,
          'spend_republish',
          jsonb_build_object('vinted_item_id', v_item, 'job_id', v_job_id, 'capture_id', v_capture.id));

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'republish', jsonb_build_object('coins', v_price, 'vinted_item_id', v_item));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price, 'job_id', v_job_id,
    'included_after',  v_wallet.included_balance - v_from_inc,
    'purchased_after', v_wallet.purchased_balance - v_from_pur
  );
END;
$$;
REVOKE ALL ON FUNCTION public.spend_coins_and_republish(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_coins_and_republish(bigint, text) TO authenticated, service_role;

-- 4. Refund AUTOMATIQUE : un republish qui finit failed/cancelled/
-- dry_run_completed (⚠️ le dry run DOIT rembourser : la Pépite a été débitée
-- à la création du job, rien n'a été livré) rend sa Pépite, UNE seule fois
-- (marqueur pepite_remboursee). 'published' = livré, rien à rendre.
CREATE OR REPLACE FUNCTION public.republish_refund_on_terminal()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_montant integer;
BEGIN
  IF NEW.action IS DISTINCT FROM 'republish' THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('failed', 'cancelled', 'dry_run_completed') THEN RETURN NEW; END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF (NEW.platform_fields->>'pepite_remboursee') = 'true' THEN RETURN NEW; END IF;
  v_montant := COALESCE(NULLIF(NEW.platform_fields->>'pepites_debitees', '')::integer, 0);
  IF v_montant > 0 THEN
    PERFORM refund_coins(NEW.user_id, v_montant,
      jsonb_build_object('source', 'republish_' || NEW.status, 'job_id', NEW.id),
      'refund_republish');
    NEW.platform_fields := jsonb_set(COALESCE(NEW.platform_fields, '{}'::jsonb),
      '{pepite_remboursee}', 'true'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cross_post_jobs_republish_refund ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_republish_refund
  BEFORE UPDATE OF status ON public.cross_post_jobs
  FOR EACH ROW EXECUTE FUNCTION public.republish_refund_on_terminal();

-- 5. PURGE (règle validée le 05/08, retouches Nico appliquées) :
--   · retouche 1 : AUCUNE annulation des republish pending anciens — un job
--     qui dort n'est pas un job abandonné (leçon des 23 jobs de publication).
--     La relance e-mail job_pending_relaunch les couvre déjà (sa requête ne
--     filtre pas sur l'action). Pas de borne d'annulation du tout : la garde
--     de fraîcheur à l'EXÉCUTION (point 3, à valider) protégera mieux qu'une
--     annulation ne le ferait. Inchangé : jamais toucher à un job en étape
--     'deleted'.
--   · retouche 2 : la purge supprime les PHOTOS AVEC la ligne. Postgres ne
--     parle pas au storage : la sélection vit ici (fonction ci-dessous,
--     réservée au service_role), l'exécution vit dans l'edge function
--     republish-purge (cron pg_net quotidien) qui supprime d'abord les
--     FICHIERS listés dans photos_urls, puis la ligne — fichiers d'abord :
--     si la suppression storage échoue, la ligne RESTE et le run suivant
--     retente ; jamais l'inverse (une ligne partie avant ses fichiers, c'est
--     la fuite qu'on ferme). ⚠️ Par FICHIER et non par dossier
--     {user}/republish/{item}/ : le dossier est partagé entre les captures
--     successives d'un même article — purger le dossier entier détruirait
--     les photos de la capture PLUS RÉCENTE qu'on garde.
CREATE OR REPLACE FUNCTION public.republish_captures_purgeables(p_limite integer DEFAULT 200)
RETURNS TABLE (id bigint, user_id uuid, vinted_item_id text, photos_urls text[])
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.user_id, c.vinted_item_id, c.photos_urls
  FROM vinted_republish_captures c
  -- BLOQUANT ABSOLU : jamais la capture d'un article dont un republish n'est
  -- pas terminal (pending/processing/needs_user — l'étape 'deleted'
  -- interrompue vit dans needs_user).
  WHERE NOT EXISTS (
      SELECT 1 FROM cross_post_jobs j
      WHERE j.user_id = c.user_id AND j.action = 'republish'
        AND j.platform_fields->>'vinted_item_id' = c.vinted_item_id
        AND j.status IN ('pending', 'processing', 'needs_user')
    )
    AND (
      ( -- supplantée par une plus récente, depuis plus de 7 jours
        EXISTS (
          SELECT 1 FROM vinted_republish_captures c2
          WHERE c2.user_id = c.user_id AND c2.vinted_item_id = c.vinted_item_id
            AND c2.captured_at > c.captured_at
        )
        AND c.captured_at < now() - interval '7 days'
      )
      OR c.captured_at < now() - interval '90 days'
    )
    -- Grâce de 30 j après une recréation réussie qui référence CETTE capture.
    AND NOT EXISTS (
      SELECT 1 FROM cross_post_jobs j2
      WHERE j2.user_id = c.user_id AND j2.action = 'republish'
        AND NULLIF(j2.platform_fields->>'capture_id', '')::bigint = c.id
        AND j2.status = 'published'
        AND j2.published_at > now() - interval '30 days'
    )
  ORDER BY c.captured_at ASC
  LIMIT GREATEST(1, LEAST(p_limite, 500));
$$;
REVOKE ALL ON FUNCTION public.republish_captures_purgeables(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.republish_captures_purgeables(integer) TO service_role;

-- pg_cron quotidien 03:40 UTC → edge function republish-purge (elle seule
-- sait supprimer les fichiers storage). GARDÉ contre le double-schedule.
-- Même en-tête x-cron-secret que les autres crons pg_net (cf. CLAUDE.md).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'republish-purge-daily') THEN
    PERFORM cron.schedule(
      'republish-purge-daily',
      '40 3 * * *',
      $cmd$
  select net.http_post(
    url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/republish-purge',
    headers := '{"Content-Type":"application/json","x-cron-secret":"fs-cron-2026-tunnel"}'::jsonb,
    body    := '{}'::jsonb
  );
  $cmd$
    );
  END IF;
END;
$$;
