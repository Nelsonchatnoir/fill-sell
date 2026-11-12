-- (11/11/2026 soir) REMETTRE UNE TÂCHE EN FILE = REMETTRE À ZÉRO TOUS SES COMPTEURS D'ESSAIS.
-- Compte 64eab2f9 : cinq republications Vinted remises en file le 11/11 (correctif d'extension 12:50:49, relance à la
-- main 18:57:10) avec recreation_tentee {n: 3} gardé → handler-watch les ressortait de la file dans la minute
-- (essaisRates = 2, _shared/recreation-bloquee.js). La RPC du bouton « Republier maintenant » (relancer_republish,
-- src/utils/vintedSync.js) ne remettait AUCUN compteur à zéro : sur une remise en ligne sortie de la file, la relance
-- de la personne était défaite au passage suivant de handler-watch si son poste ne l'avait pas encore prise.
--
-- 1. public.republication_remise_en_file(pf, par, motif) : la jumelle SQL de remettreEnFile
--    (supabase/functions/_shared/remise-en-file.js) — MÊME liste de compteurs (verrou selftest:remise-en-file) :
--    compteurs archivés dans recreation_essais_avant_relance puis retirés ; recreation_tentee garde son heure (garde
--    du dressing) et repart à n = 0 ; les traces anti-doublon (recreation_envois, recreation_depot_parti, …) ne sont
--    JAMAIS retirées ; marque remise_en_file { le, par, motif }. Pure : ne lit ni n'écrit aucune table.
--    Pour les scripts de réparation : UPDATE … SET platform_fields = public.republication_remise_en_file(platform_fields, '<qui>', '<pourquoi>').
-- 2. public.relancer_republish(uuid) : réécrite depuis pg_get_functiondef de PROD (lu le 11/11 vers 20:35) ; seul
--    ajout : la remise en file (une ligne). Droits inchangés (CREATE OR REPLACE les garde).
-- Inverse : supabase/rollbacks/20261111210000_remise_en_file_compteurs_INVERSE.sql. Aucune transaction ici.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.republication_remise_en_file(p_pf jsonb, p_par text, p_motif text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- ⛔ Même liste que COMPTEURS_D_ESSAIS (_shared/remise-en-file.js), dans le même ordre.
  v_compteurs text[] := ARRAY['recreation_retries', 'recreation_reprises', 'recreation_reprise', 'recreation_bloquee',
                              'needsUserAttempts', 'needsUserBoucle', 'needs_user_tick_le', 'needs_user_actif_ms',
                              'pas_de_rouge_reprises', 'stale_recoveries', 'deleted_hang_count'];
  v_pf jsonb := CASE WHEN jsonb_typeof(p_pf) = 'object' THEN p_pf ELSE '{}'::jsonb END;
  v_le text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_archive jsonb := '{}'::jsonb;
  v_tentee jsonb := CASE WHEN jsonb_typeof(v_pf -> 'recreation_tentee') = 'object' THEN v_pf -> 'recreation_tentee' END;
  k text;
BEGIN
  FOREACH k IN ARRAY v_compteurs LOOP
    IF v_pf ? k THEN v_archive := v_archive || jsonb_build_object(k, v_pf -> k); END IF;
  END LOOP;
  IF v_tentee IS NOT NULL THEN v_archive := v_archive || jsonb_build_object('recreation_tentee', v_tentee); END IF;
  IF v_archive <> '{}'::jsonb THEN
    v_pf := v_pf || jsonb_build_object('recreation_essais_avant_relance',
      v_archive || jsonb_build_object('le', v_le, 'par', coalesce(p_par, '?'), 'motif', p_motif));
  END IF;
  v_pf := v_pf - v_compteurs;
  IF v_tentee IS NOT NULL THEN
    v_pf := v_pf || jsonb_build_object('recreation_tentee', v_tentee || jsonb_build_object('n', 0));
  END IF;
  IF v_pf ->> 'needs_user_source' = 'recreation_bloquee' THEN v_pf := v_pf - 'needs_user_source'; END IF;
  v_pf := v_pf - 'next_action_after' - 'processing_since';
  RETURN v_pf || jsonb_build_object('remise_en_file', jsonb_build_object('le', v_le, 'par', coalesce(p_par, '?'), 'motif', p_motif));
END;
$function$;

REVOKE ALL ON FUNCTION public.republication_remise_en_file(jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.republication_remise_en_file(jsonb, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.relancer_republish(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- (11/11 soir) Budget d'essais entier : tous les compteurs remis à zéro, traces anti-doublon gardées.
  v_pf   := public.republication_remise_en_file(COALESCE(v_job.platform_fields, '{}'::jsonb), 'relancer_republish', 'Republier maintenant (app)');
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
$function$;

RESET lock_timeout;
