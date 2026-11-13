-- INVERSE de supabase/migrations/20261113184500_ebay_site_attente_jamais_expiree.sql (13/11/2026, étape 4 L0) :
-- expire_publish_reservations remise À L'OCTET PRÈS telle que la prod l'avait le 13/11 (pg_get_functiondef, md5
-- 6e03144a9eaaf0ec4bedfff20171df79). Les tâches eBay en attente de leur site redeviennent fermables par « attente_14j »
-- et « filet_30j » au passage suivant du cron (03:20 UTC).
-- À jouer : npx supabase db query --linked -f supabase/rollbacks/20261113184500_ebay_site_attente_jamais_expiree_INVERSE.sql
--           puis npx supabase migration repair --linked --status reverted 20261113184500
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE OR REPLACE FUNCTION public.expire_publish_reservations()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r        record;
  v_cnt    integer;
  n_res    integer := 0;
  n_jobs   integer := 0;
  n_nu     integer := 0;
  n_sans   integer := 0;
BEGIN
  -- 1. needs_user seul, a 48 h. On ne touche QUE les jobs needs_user, et on ne
  -- relache QUE leur part : la reservation peut couvrir d'autres plateformes
  -- encore en vol (cas reel 1f02c097).
  FOR r IN
    SELECT j.id AS job_id, j.reservation_id, COALESCE(c.unit_price, 1) AS unit
    FROM cross_post_jobs j
    JOIN coin_reservations c ON c.id = j.reservation_id
    WHERE j.status = 'needs_user'
      AND c.status = 'held'
      AND j.reservation_settled_at IS NULL
      AND COALESCE(j.published_at, j.created_at) < now() - interval '48 hours'
    FOR UPDATE OF j SKIP LOCKED
  LOOP
    UPDATE cross_post_jobs SET
      status = 'cancelled',
      error  = 'Publication abandonnée : une information manquait et la question '
            || 'est restée sans réponse pendant au moins 48 heures. '
            || 'Elle ne compte pas dans tes limites — tu peux relancer '
            || 'cette publication quand tu veux depuis ton Stock.'
    WHERE id = r.job_id;
    -- Le trigger cross_post_job_settle_reservation fait le 'release' au passage
    -- en 'cancelled' : on ne le double PAS ici.
    n_nu := n_nu + 1;
  END LOOP;

  -- 2. Filet historique a 30 jours, inchange.
  FOR r IN
    SELECT id FROM coin_reservations
    WHERE status = 'held' AND created_at < now() - interval '30 days'
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE cross_post_jobs SET
      status = 'cancelled',
      error = COALESCE(NULLIF(error, ''),
        'Publication jamais exécutée en 30 jours — elle ne compte pas dans tes limites.')
    WHERE reservation_id = r.id AND status IN ('pending', 'processing', 'needs_user');
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    n_jobs := n_jobs + v_cnt;
    PERFORM settle_publish_reservation(r.id, 'release', 2147483647, 'expired');
    UPDATE coin_reservations SET expired_at = now() WHERE id = r.id;
    n_res := n_res + 1;
  END LOOP;

  -- 3. (24/09) PUBLICATIONS SANS RESERVATION — bascule des prix a 0 du 02/09 :
  -- les branches 1 et 2 ne les voient plus. Sortie 'cancelled', comme partout.
  FOR r IN
    SELECT j.id,
      CASE
        WHEN j.inventaire_id IS NOT NULL AND i.id IS NULL THEN 'article_supprime'
        WHEN i.statut = 'vendu' THEN 'article_vendu'
        WHEN EXISTS (SELECT 1 FROM cross_post_jobs o
                     WHERE o.user_id = j.user_id AND o.inventaire_id = j.inventaire_id
                       AND o.platform = j.platform AND o.id <> j.id
                       AND o.action IN ('publish', 'republish')
                       AND o.status = 'published' AND o.sold_at IS NULL
                       AND NULLIF(trim(o.listing_url), '') IS NOT NULL) THEN 'deja_en_ligne'
        WHEN j.status = 'needs_user' AND GREATEST(j.created_at,
               COALESCE(republish_ts_safe(j.platform_fields, 'derniere_relance_manuelle'), '-infinity'::timestamptz),
               COALESCE(republish_ts_safe(j.platform_fields, 'pending_muet_clos_le'), '-infinity'::timestamptz))
             < now() - interval '14 days' THEN 'attente_14j'
        -- MODIF 2026-09-25 : jamais pendant une pause anti-robot du compte Vinted, et le temps passé en pause ne compte pas.
        WHEN j.created_at + make_interval(secs => COALESCE(NULLIF(j.platform_fields ->> 'antirobot_pause_cumul_ms', '')::double precision, 0) / 1000)
               < now() - interval '30 days'
             AND NOT (j.platform = 'vinted' AND compte_en_pause_antirobot(j.user_id)) THEN 'filet_30j'
      END AS motif
    FROM cross_post_jobs j
    LEFT JOIN inventaire i ON i.id = j.inventaire_id
    WHERE j.action = 'publish'
      AND j.status IN ('pending', 'needs_user')
      AND j.reservation_id IS NULL
      AND NULLIF(trim(j.listing_url), '') IS NULL
      AND NULLIF(trim(j.platform_listing_id), '') IS NULL
      AND j.created_at < now() - interval '1 hour'
    FOR UPDATE OF j SKIP LOCKED
  LOOP
    CONTINUE WHEN r.motif IS NULL;
    UPDATE cross_post_jobs SET
      status = 'cancelled',
      error = CASE r.motif
        WHEN 'article_vendu'    THEN 'Publication arrêtée : cet article est vendu.'
        WHEN 'article_supprime' THEN 'Publication arrêtée : cet article n''est plus dans ton stock.'
        WHEN 'deja_en_ligne'    THEN 'Publication arrêtée : cet article est déjà en ligne sur cette plateforme.'
        WHEN 'attente_14j'      THEN 'Cette publication attendait une réponse depuis plus de deux semaines : nous l''avons arrêtée. '
                                  || 'Relance-la depuis la fiche de l''article quand tu veux.'
        ELSE 'Publication jamais exécutée en 30 jours : nous l''avons arrêtée. '
          || 'Relance-la depuis la fiche de l''article quand tu veux.'
      END,
      platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
        'expiree_sans_reservation', jsonb_build_object('at', now(), 'motif', r.motif),
        'erreurs_archivees', COALESCE(platform_fields -> 'erreurs_archivees', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object('le', now(), 'statut', status,
               'erreur', left(COALESCE(error, ''), 600), 'par', 'expire_publish_reservations')))
    WHERE id = r.id AND status IN ('pending', 'needs_user');
    IF FOUND THEN n_sans := n_sans + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'reservations_expirees', n_res,
    'jobs_annules', n_jobs,
    'needs_user_48h', n_nu,
    'sans_reservation', n_sans
  );
END;
$function$;
COMMIT;
