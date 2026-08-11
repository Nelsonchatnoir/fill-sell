-- ✅ APPLIQUÉE EN PROD le 2026-08-11 (feu vert de Nico la nommant).
-- Vérifié après application : la branche 48 h est dans le corps de la fonction,
-- le filet 30 jours est intact, le message porte bien « au moins 48 heures », et
-- le cron jobid 8 est inchangé (« 20 3 * * * », actif).
-- Deux jobs entreront dans la branche au prochain passage utile :
--   beebs  2715ce35 (Medik8 Sérum, repère 10/08 19:04)
--   vinted 69014fb8 (Pot à moutarde, repère 10/08 20:39)
--
-- Dénouement des réservations bloquées sur un job needs_user : 48 h au lieu de
-- 30 jours. Délai arbitré par Nico le 2026-08-11.
--
-- L'EXISTANT : expire_publish_reservations() (cron jobid 8, « 20 3 * * * »)
-- traite DÉJÀ needs_user, mais au même délai que tout le reste — 30 jours. Un
-- needs_user est une QUESTION posée à l'utilisateur : s'il n'a pas répondu en
-- deux jours, il ne répondra pas, et sa Pépite reste immobilisée un mois.
-- Mesuré au 11/08 : 2 réservations `held` de plus de 2 h dans toute la base,
-- 2 Pépites — dont celle de f9423b85 (job vinted/needs_user du 10/08 20:39).
--
-- ⚠️ LE CRON PASSE À 03h20 : le délai RÉEL sera entre 48 h et 72 h. Le message
-- dit donc « au moins 48 heures », jamais « 48 heures » — on ne promet pas une
-- précision qu'on n'a pas.
--
-- Les 30 jours restent en vigueur pour pending/processing : un job qui n'a
-- jamais été distribué (PC éteint, Chrome fermé, extension absente) n'a rien
-- demandé à personne, et l'annuler au bout de 2 jours punirait une absence.
--
-- Idempotente (CREATE OR REPLACE seul, aucun DDL, aucun cron recréé).

CREATE OR REPLACE FUNCTION public.expire_publish_reservations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r        record;
  v_cnt    integer;
  n_res    integer := 0;
  n_jobs   integer := 0;
  n_nu     integer := 0;
BEGIN
  -- ── 1. needs_user seul, à 48 h ────────────────────────────────────────────
  -- On ne touche QUE les jobs needs_user, et on ne relâche QUE leur part : la
  -- réservation peut couvrir d'autres plateformes encore en vol (cas réel
  -- 1f02c097 : ebay published, leboncoin/beebs failed, vinted needs_user).
  -- settle_publish_reservation(..., 'release') sans montant relâche le reliquat
  -- non capturé ; ici on borne au prix unitaire du job, comme partout ailleurs.
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
            || 'Tes Pépites t''ont été rendues sur ton solde — tu peux relancer '
            || 'cette publication quand tu veux depuis ton Stock.'
    WHERE id = r.job_id;
    -- Le trigger cross_post_job_settle_reservation fait le 'release' au passage
    -- en 'cancelled' : on ne le double PAS ici, sinon la part serait rendue
    -- deux fois.
    n_nu := n_nu + 1;
  END LOOP;

  -- ── 2. Filet historique à 30 jours, inchangé ──────────────────────────────
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

  RETURN jsonb_build_object(
    'reservations_expirees', n_res,
    'jobs_annules', n_jobs,
    'needs_user_48h', n_nu
  );
END;
$$;
