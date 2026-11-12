-- INVERSE de 20261111210000_remise_en_file_compteurs (11/11/2026 soir) : relancer_republish revient à sa définition de
-- PROD (pg_get_functiondef lu le 11/11 vers 20:35, recopiée à l'octet ci-dessous), puis la jumelle SQL de
-- remettreEnFile est retirée. Ce qui reste, volontairement : les marques déjà posées sur des tâches
-- (remise_en_file, recreation_essais_avant_relance, recreation_tentee.n = 0) — des clés que plus rien n'écrit après
-- l'inverse, et que les lecteurs tolèrent (essaisRates borne à 0). Aucune transaction ici.
SET lock_timeout = '5s';

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
$function$;

DROP FUNCTION IF EXISTS public.republication_remise_en_file(jsonb, text, text);

RESET lock_timeout;
