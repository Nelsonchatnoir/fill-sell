-- ═══════════════════════════════════════════════════════════════════════════
-- « Pas d'URL au bout de la fenêtre = ÉCHEC, et la Pépite est rendue »
-- Décision Nico, 2026-08-10.
-- ═══════════════════════════════════════════════════════════════════════════
-- Un job `published` sans listing_url restait `published` indéfiniment : ni
-- surveillé pour la vente (checkPublishedListings filtre listing_url NOT NULL),
-- ni retirable, et la Pépite restait dépensée. On ne sait pas distinguer
-- « annonce en ligne, lien illisible » de « annonce jamais créée » — dans le
-- doute, l'utilisateur ne paie pas.
--
-- ⚠️ POURQUOI UN CRÉDIT EXPLICITE ET PAS settle_publish_reservation('release')
-- La réservation est CAPTURÉE au passage en `published` (mesuré : statuts
-- 'captured'/'partial', reservation_settled_at renseigné). Or settle ne
-- libère que le RESTE :
--     v_remain := amount - captured - released_included - released_purchased;
-- sur une unité déjà capturée, v_remain = 0 → aucun mouvement, aucune ligne
-- ledger. Rendre ici, ce n'est donc pas libérer une réservation : c'est
-- ANNULER une capture. C'est ce que fait refund_publish_unconfirmed, en
-- reprenant exactement la mécanique de poches de settle.
--
-- DETTE ASSUMÉE (option (c) écartée le 2026-08-10, à faire un jour) : le bon
-- modèle serait de ne capturer la réservation qu'À LA CAPTURE DE L'URL, pas au
-- passage en `published`. Ça supprimerait tout besoin de remboursement. C'est
-- une refonte de la facturation, hors sujet aujourd'hui.

-- ── 1. Remboursement explicite, IDEMPOTENT ──────────────────────────────────
-- Idempotence portée par coin_ledger_ref_unique (index UNIQUE sur ref) :
-- ref = 'refund_publish_unconfirmed:<job_id>' — une seule ligne par job, même
-- si le cron repasse cent fois. Le contrôle EXISTS ci-dessous évite l'exception
-- dans le cas normal ; l'index reste le vrai garde-fou en cas de concurrence.
CREATE OR REPLACE FUNCTION public.refund_publish_unconfirmed(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  j        cross_post_jobs%ROWTYPE;
  r        coin_reservations%ROWTYPE;
  v_ref    text;
  v_unit   integer;
  v_pur    integer;
  v_inc    integer;
  v_wallet coin_wallets%ROWTYPE;
BEGIN
  SELECT * INTO j FROM cross_post_jobs WHERE id = p_job FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('rembourse', 0, 'raison', 'job_absent');
  END IF;
  -- Jobs antérieurs au système de réservation : rien à rendre, et surtout pas
  -- de Pépite créée à partir de rien.
  IF j.reservation_id IS NULL THEN
    RETURN jsonb_build_object('rembourse', 0, 'raison', 'sans_reservation');
  END IF;

  v_ref := 'refund_publish_unconfirmed:' || p_job::text;
  IF EXISTS (SELECT 1 FROM coin_ledger WHERE ref = v_ref) THEN
    RETURN jsonb_build_object('rembourse', 0, 'raison', 'deja_rembourse');
  END IF;

  SELECT * INTO r FROM coin_reservations WHERE id = j.reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('rembourse', 0, 'raison', 'reservation_absente');
  END IF;

  -- Une seule UNITÉ (le prix d'une publication), et jamais plus que ce qui a
  -- réellement été capturé sur cette réservation — une réservation couvre
  -- plusieurs plateformes, on ne rend que la part de CE job.
  v_unit := LEAST(COALESCE(r.unit_price, 1), r.captured);
  IF v_unit <= 0 THEN
    RETURN jsonb_build_object('rembourse', 0, 'raison', 'rien_a_rembourser');
  END IF;

  -- Même règle de poches que settle_publish_reservation : on rend d'abord en
  -- purchased (acheté = permanent, il ne doit pas se transformer en inclus qui
  -- expire), le reste en included.
  v_pur := LEAST(v_unit, GREATEST(0, r.from_purchased - r.released_purchased));
  v_inc := v_unit - v_pur;

  -- La capture est ANNULÉE : captured recule, released avance. Les invariants
  -- de la réservation (captured + released <= amount) restent vrais, et son
  -- statut final se recalcule comme dans settle.
  UPDATE coin_reservations SET
    captured           = GREATEST(0, captured - v_unit),
    released_purchased = released_purchased + v_pur,
    released_included  = released_included  + v_inc
  WHERE id = r.id;

  -- reserved_balance N'EST PAS touché : il a déjà été décrémenté à la capture.
  UPDATE coin_wallets SET
    purchased_balance = purchased_balance + v_pur,
    included_balance  = included_balance  + v_inc,
    updated_at        = now()
  WHERE user_id = j.user_id
  RETURNING * INTO v_wallet;

  INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, ref, metadata)
  VALUES (
    j.user_id, v_unit,
    COALESCE(v_wallet.included_balance, 0), COALESCE(v_wallet.purchased_balance, 0),
    'refund_publish_unconfirmed', v_ref,
    jsonb_build_object(
      'job_id', p_job, 'reservation_id', r.id, 'platform', j.platform,
      'from_purchased', v_pur, 'from_included', v_inc
    )
  );

  SELECT * INTO r FROM coin_reservations WHERE id = j.reservation_id;
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

  RETURN jsonb_build_object('rembourse', v_unit, 'purchased', v_pur, 'included', v_inc);
END;
$function$;

-- ── 2. Le balayage ──────────────────────────────────────────────────────────
-- Fenêtre comptée depuis published_at, repli created_at : un job créé à 13h54
-- et publié à 19h02 consommait 5 h de fenêtre avant même d'exister en ligne
-- (cas réel, job 71942bc2).
-- Durées :
--   · vinted                     2 h — son URL vient de la réponse serveur ou
--     de la redirection, dans le MÊME passage (mesuré : 273 URL sur 276
--     publications), et RIEN ne peut la remplir après coup : Vinted est
--     explicitement hors de recoverMissingListingUrls. 2 h est déjà une marge
--     large, elle ne couvre qu'une écriture qui courserait avec le poll ;
--   · leboncoin / beebs / ebay  48 h — durée exacte de
--     LISTING_URL_RECOVERY_MAX_AGE_MS côté extension. ⚠️ VALEUR DUPLIQUÉE :
--     si elle bouge là-bas, elle doit bouger ici.
-- p_publie_apres : borne basse facultative, pour ne pas réveiller d'un coup un
-- backlog ancien (cf. le commentaire de la planification cron plus bas).
CREATE OR REPLACE FUNCTION public.fail_publish_without_listing_url(
  p_publie_apres timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  j        record;
  v_ref    jsonb;
  n_jobs   integer := 0;
  n_rendu  integer := 0;
BEGIN
  FOR j IN
    SELECT id, platform, COALESCE(published_at, created_at) AS repere
    FROM cross_post_jobs
    WHERE status = 'published'
      AND action = 'publish'
      AND listing_url IS NULL
      AND (p_publie_apres IS NULL OR COALESCE(published_at, created_at) >= p_publie_apres)
      AND COALESCE(published_at, created_at) < now() - (
        CASE WHEN platform = 'vinted' THEN interval '2 hours' ELSE interval '48 hours' END
      )
    ORDER BY COALESCE(published_at, created_at)
    FOR UPDATE SKIP LOCKED
  LOOP
    v_ref := refund_publish_unconfirmed(j.id);
    IF (v_ref->>'rembourse')::int > 0 THEN n_rendu := n_rendu + (v_ref->>'rembourse')::int; END IF;

    UPDATE cross_post_jobs SET
      status = 'failed',
      error  =
        'Publication non confirmée : ton annonce n''a pas pu être retrouvée en ligne sur '
        || initcap(platform)
        || ' — on n''a jamais réussi à récupérer son lien, donc on ne peut ni suivre sa vente ni la retirer pour toi. '
        || 'Tes Pépites de publication t''ont été rendues. '
        || '⚠️ AVANT DE REPUBLIER, va vérifier tes annonces sur ' || initcap(platform)
        || ' : si elle y est déjà, republier en créerait une deuxième.',
      platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
        'listing_url_abandon', jsonb_build_object(
          'at', now(),
          'repere', j.repere,
          'refund', v_ref
        )
      )
    WHERE id = j.id;
    n_jobs := n_jobs + 1;
  END LOOP;

  RETURN jsonb_build_object('jobs_echoues', n_jobs, 'pepites_rendues', n_rendu);
END;
$function$;

REVOKE ALL ON FUNCTION public.refund_publish_unconfirmed(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_publish_without_listing_url(timestamptz) FROM public, anon, authenticated;

-- ── 3. Planification ────────────────────────────────────────────────────────
-- ⚠️ LA BORNE p_publie_apres EST LE POINT À TRANCHER AVANT DE PLANIFIER.
-- Au 2026-08-10, 8 jobs sont hors fenêtre, TOUS Beebs et TOUS à la MÊME
-- utilisatrice (Ornella, inscrite le 04/04) — le plus ancien du 29/07. Les
-- basculer d'un coup lui ferait apparaître 8 « Échec » sur des publications
-- qu'elle croit réglées depuis 11 jours, sans qu'elle ait rien fait. Et 6 des
-- 8 n'ont AUCUNE réservation (antérieurs au système) : elles recevraient
-- l'alarme sans la compensation.
-- La planification n'est donc PAS incluse dans cette migration : elle se pose
-- à la main, avec la borne choisie. Exemple (backlog épargné) :
--   SELECT cron.schedule(
--     'publish-sans-lien-echec-daily', '35 3 * * *',
--     $$SELECT public.fail_publish_without_listing_url('2026-08-10T20:00:00Z'::timestamptz)$$
--   );
-- Passer NULL à la place de la date traiterait aussi tout le backlog.
