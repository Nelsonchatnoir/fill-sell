-- ── Réservation / capture des Pépites de publication (2026-08-05) ────────────
-- Schéma validé par Nico le 04/08, adapté à la grille à deux axes :
--   · part PHOTOS (0/9/32) → DÉBIT FERME au clic — service rendu à l'instant
--     même (photos persistées dans la même transaction, cf. 20260804210000) ;
--   · part PUBLICATION (3 × plateformes) → RÉSERVÉE au clic, CAPTURÉE à
--     hauteur des plateformes réellement publiées, le reste RELÂCHÉ.
--     Chaque plateforme vaut exactement unit_price (3) : aucun arrondi.
--
-- Mouvements de solde :
--   clic     : included/purchased -= total ; reserved_balance += part publication
--              (le solde DISPONIBLE affiché — included+purchased — est donc
--              déjà net de la réservation, comme aujourd'hui du débit).
--   publié   : capture — reserved -= 3. Pas de ligne ledger : aucun mouvement
--              de solde dépensable, la traçabilité vit sur coin_reservations.
--   failed / cancelled / sold-sans-publication : release — reserved -= 3,
--              le montant REVIENT en purchased d'abord (le plus précieux :
--              acheté, permanent) puis en included, dans la limite de ce que
--              chaque poche avait fourni. Ledger kind='release_publish',
--              delta positif → visible dans l'historique des réglages.
--   expiré   : réservation encore 'held' après 30 j → ses jobs encore
--              pending/processing/needs_user passent 'cancelled' (le trigger
--              relâche job par job), le reliquat est relâché en bloc,
--              expired_at est posé → remonté dans l'ops-digest de 8h50.
--
-- Cas assumé (documenté, en faveur de l'utilisateur) : un job 'failed' déjà
-- relâché puis RELANCÉ (remis pending par l'UI) qui finit publié ne re-capture
-- rien — reservation_settled_at l'a soldé une fois pour toutes. Perte bornée à
-- 3 Pépites par relance de job échoué ; l'alternative (re-débiter au moment de
-- la relance) peut échouer sur solde vide et casser la relance.
--
-- Le trigger enforce_inventory_limit (BEFORE INSERT sur inventaire) n'est pas
-- concerné. cron.schedule est GARDÉ par une vérification d'existence — jamais
-- de job planifié en double (règle CLAUDE.md).

-- 1. Colonne de solde réservé — affichée « dont X en attente de publication ».
ALTER TABLE public.coin_wallets
  ADD COLUMN IF NOT EXISTS reserved_balance integer NOT NULL DEFAULT 0;

-- 2. Les réservations. from_included/from_purchased = ce que chaque poche a
-- fourni à la PART PUBLICATION (la part photos, débitée ferme, n'y figure
-- pas). captured/released_* sont des compteurs cumulatifs ; l'invariant borne
-- toute dérive.
CREATE TABLE IF NOT EXISTS public.coin_reservations (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount             integer     NOT NULL CHECK (amount >= 0),
  unit_price         integer     NOT NULL CHECK (unit_price > 0),
  from_included      integer     NOT NULL DEFAULT 0,
  from_purchased     integer     NOT NULL DEFAULT 0,
  captured           integer     NOT NULL DEFAULT 0,
  released_included  integer     NOT NULL DEFAULT 0,
  released_purchased integer     NOT NULL DEFAULT 0,
  job_count          integer     NOT NULL,
  photo_option       text,
  status             text        NOT NULL DEFAULT 'held'
                     CHECK (status IN ('held','captured','released','partial')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz,
  expired_at         timestamptz,
  CHECK (from_included + from_purchased = amount),
  CHECK (captured + released_included + released_purchased <= amount)
);
CREATE INDEX IF NOT EXISTS coin_reservations_user    ON public.coin_reservations (user_id);
CREATE INDEX IF NOT EXISTS coin_reservations_held    ON public.coin_reservations (created_at) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS coin_reservations_expired ON public.coin_reservations (expired_at) WHERE expired_at IS NOT NULL;

ALTER TABLE public.coin_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own reservations" ON public.coin_reservations;
CREATE POLICY "Users read own reservations"
  ON public.coin_reservations FOR SELECT
  TO authenticated USING ((SELECT auth.uid()) = user_id);
-- SELECT seul, à dessein (écart assumé avec la règle générale des grants
-- CLAUDE.md) : table d'argent, toute écriture passe par les fonctions
-- SECURITY DEFINER ci-dessous — un INSERT/UPDATE client n'a aucun cas d'usage.
GRANT SELECT ON public.coin_reservations TO authenticated;

-- 3. Lien job → réservation. settled_at = ce job a déjà capturé/relâché sa
-- part : le trigger ne repasse JAMAIS deux fois (un failed→pending→failed ne
-- relâche pas deux fois 3 Pépites).
ALTER TABLE public.cross_post_jobs
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES public.coin_reservations(id) ON DELETE SET NULL;
ALTER TABLE public.cross_post_jobs
  ADD COLUMN IF NOT EXISTS reservation_settled_at timestamptz;
CREATE INDEX IF NOT EXISTS cross_post_jobs_reservation
  ON public.cross_post_jobs (reservation_id) WHERE reservation_id IS NOT NULL;

-- 4. Règlement d'une part de réservation. p_amount NULL → une part
-- (unit_price) ; sinon borné au restant (l'expiration passe « tout »).
CREATE OR REPLACE FUNCTION public.settle_publish_reservation(
  p_reservation uuid, p_mode text, p_amount integer DEFAULT NULL, p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r         coin_reservations%ROWTYPE;
  v_remain  integer;
  v_amt     integer;
  v_rel_pur integer;
  v_rel_inc integer;
  v_wallet  coin_wallets%ROWTYPE;
BEGIN
  IF p_mode NOT IN ('capture','release') THEN
    RAISE EXCEPTION 'settle_publish_reservation: mode invalide %', p_mode;
  END IF;
  SELECT * INTO r FROM coin_reservations WHERE id = p_reservation FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  v_remain := r.amount - r.captured - r.released_included - r.released_purchased;
  v_amt := LEAST(COALESCE(p_amount, r.unit_price), v_remain);
  IF v_amt > 0 THEN
    IF p_mode = 'capture' THEN
      -- L'argent quitte définitivement le réservé — aucune poche dépensable ne
      -- bouge, donc pas de ligne ledger (elle afficherait un +0 trompeur).
      UPDATE coin_reservations SET captured = captured + v_amt WHERE id = r.id;
      UPDATE coin_wallets SET
        reserved_balance = GREATEST(0, reserved_balance - v_amt),
        updated_at = now()
      WHERE user_id = r.user_id;
    ELSE
      -- Retour en purchased d'abord (acheté = permanent), included ensuite —
      -- chacun borné à ce que sa poche avait fourni et n'a pas déjà repris.
      v_rel_pur := LEAST(v_amt, r.from_purchased - r.released_purchased);
      v_rel_inc := v_amt - v_rel_pur;
      UPDATE coin_reservations SET
        released_purchased = released_purchased + v_rel_pur,
        released_included  = released_included  + v_rel_inc
      WHERE id = r.id;
      UPDATE coin_wallets SET
        reserved_balance  = GREATEST(0, reserved_balance - v_amt),
        purchased_balance = purchased_balance + v_rel_pur,
        included_balance  = included_balance  + v_rel_inc,
        updated_at = now()
      WHERE user_id = r.user_id
      RETURNING * INTO v_wallet;
      INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
      VALUES (
        r.user_id, v_amt,
        COALESCE(v_wallet.included_balance, 0), COALESCE(v_wallet.purchased_balance, 0),
        'release_publish',
        jsonb_build_object('reservation_id', r.id, 'reason', COALESCE(p_reason, 'job_terminal'))
      );
    END IF;
  END IF;
  -- Statut final quand tout est réglé. Relu depuis la ligne (compteurs frais).
  SELECT * INTO r FROM coin_reservations WHERE id = p_reservation;
  IF r.captured + r.released_included + r.released_purchased >= r.amount AND r.status = 'held' THEN
    UPDATE coin_reservations SET
      status = CASE
        WHEN r.captured = r.amount THEN 'captured'
        WHEN r.captured = 0        THEN 'released'
        ELSE 'partial'
      END,
      resolved_at = now()
    WHERE id = r.id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.settle_publish_reservation(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;

-- 5. Trigger : un job à réservation qui atteint un état terminal règle SA part.
--   published → capture ; failed/cancelled → release ; sold sans passage par
--   published (article vendu ailleurs pendant l'attente) → la publication n'a
--   pas été rendue → release. needs_user n'est PAS terminal (le job revit).
CREATE OR REPLACE FUNCTION public.cross_post_job_settle_reservation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.reservation_id IS NULL OR NEW.reservation_settled_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'published' THEN
    PERFORM settle_publish_reservation(NEW.reservation_id, 'capture');
    NEW.reservation_settled_at := now();
  ELSIF NEW.status IN ('failed', 'cancelled', 'sold') THEN
    PERFORM settle_publish_reservation(NEW.reservation_id, 'release');
    NEW.reservation_settled_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cross_post_jobs_settle_reservation ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_settle_reservation
  BEFORE UPDATE OF status ON public.cross_post_jobs
  FOR EACH ROW EXECUTE FUNCTION public.cross_post_job_settle_reservation();

-- 6. Expiration à 30 jours : jobs jamais exécutés annulés (message honnête),
-- reliquat relâché, expired_at posé pour l'ops-digest. SKIP LOCKED : deux runs
-- qui se chevauchent ne se marchent pas dessus.
CREATE OR REPLACE FUNCTION public.expire_publish_reservations()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r      record;
  v_cnt  integer;
  n_res  integer := 0;
  n_jobs integer := 0;
BEGIN
  FOR r IN
    SELECT id FROM coin_reservations
    WHERE status = 'held' AND created_at < now() - interval '30 days'
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE cross_post_jobs SET
      status = 'cancelled',
      error = COALESCE(NULLIF(error, ''),
        'Publication jamais exécutée en 30 jours — Pépites rendues sur ton solde.')
    WHERE reservation_id = r.id AND status IN ('pending', 'processing', 'needs_user');
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    n_jobs := n_jobs + v_cnt;
    -- Reliquat éventuel (job supprimé, statut hors nomenclature) : tout relâcher.
    PERFORM settle_publish_reservation(r.id, 'release', 2147483647, 'expired');
    UPDATE coin_reservations SET expired_at = now() WHERE id = r.id;
    n_res := n_res + 1;
  END LOOP;
  RETURN jsonb_build_object('reservations_expirees', n_res, 'jobs_annules', n_jobs);
END;
$$;
REVOKE ALL ON FUNCTION public.expire_publish_reservations() FROM PUBLIC, anon, authenticated;

-- pg_cron quotidien 03:20 UTC — GARDÉ contre le double-schedule (l'historique
-- de migrations a déjà produit un cron en double, cf. CLAUDE.md).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-publish-reservations-daily') THEN
    PERFORM cron.schedule(
      'expire-publish-reservations-daily',
      '20 3 * * *',
      'SELECT public.expire_publish_reservations();'
    );
  END IF;
END;
$$;

-- 7. spend_coins_and_publish v5 : identique à 20260804230000 (garde extension,
-- grille 2 axes, photos livrées) + la part publication part en réservation.
create or replace function public.spend_coins_and_publish(p_photo_option text, p_jobs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_user          uuid := auth.uid();
  v_price         integer;
  v_price_photo   integer;
  v_price_unit    integer;
  v_price_pub     integer;
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

  -- Répartition par poche, part photos servie d'abord depuis included : la
  -- décomposition de la PART PUBLICATION (v_pub_inc/v_pub_pur) est mémorisée
  -- sur la réservation — c'est elle qui pilote où revient un release.
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
    'included_after',  v_wallet.included_balance - v_from_inc,
    'purchased_after', v_wallet.purchased_balance - v_from_pur,
    'reserved_after',  v_wallet.reserved_balance + v_price_pub
  );
END;
$$;

REVOKE ALL ON FUNCTION public.spend_coins_and_publish(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_coins_and_publish(text, jsonb) TO authenticated, service_role;
