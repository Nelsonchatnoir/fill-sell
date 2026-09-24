-- ═══════════════════════════════════════════════════════════════════════════
-- LES PUBLICATIONS SANS RÉSERVATION EXPIRENT DE NOUVEAU (24/09)
-- ═══════════════════════════════════════════════════════════════════════════
-- Depuis 20260902200000 (prix à 0), spend_coins_and_publish ne crée plus de
-- réservation : reservation_id NULL. Or les deux branches de
-- expire_publish_reservations() passent PAR une réservation (JOIN
-- coin_reservations / FOR … FROM coin_reservations). Mesuré : à partir du
-- 03/09, plus aucune publication n'entrait dans l'expiration (68 des 70
-- publications actives du 24/09 ont reservation_id NULL).
-- Avec l'index unique du 23/09 (un seul publish actif par article et
-- plateforme), une publication fantôme en attente BLOQUE la republication de
-- l'article : 38 des 39 fantômes mesurés le 24/09.
--
-- BRANCHE 3, sans réservation. Sortie : 'cancelled', le statut d'expiration
-- existant. On ne supprime aucune ligne et aucune annonce. Jamais processing,
-- jamais un job qui porte un lien ou un identifiant, jamais un job de moins
-- d'une heure. Motifs, dans l'ordre :
--   · article_supprime / article_vendu — la publication n'a plus d'objet ;
--   · deja_en_ligne — un job publié sur la MÊME plateforme existe : partir
--     ferait un DOUBLON (f476feb0, Opla, le 24/09) ;
--   · attente_14j — needs_user depuis plus de 14 jours (horloge murale,
--     relance manuelle comprise). Plus large que les 72 h « extension
--     ouverte » de handler-watch, exprès : ce filet-ci ne vise que les
--     comptes dont l'extension ne revient plus (b5e2b2d3, 40c5168e) ;
--   · filet_30j — le filet historique des 30 jours, rendu aux jobs sans
--     réservation (pending ou needs_user).
-- Aucun trigger de cross_post_jobs n'agit sur 'cancelled' sans réservation
-- (settle court-circuite reservation_id NULL ; republish_refund, rattacher,
-- refus_relance_article_vendu ne concernent pas ce passage).
--
-- CORPS COMPLET, repris du LIVE (md5 78644bab38824ff3300418d9e4d3097b) :
-- branches 1 et 2 inchangées au caractère près, branche 3 ajoutée.

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
        WHEN j.created_at < now() - interval '30 days' THEN 'filet_30j'
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
