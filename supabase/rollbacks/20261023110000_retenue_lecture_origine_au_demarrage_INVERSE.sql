-- INVERSE de 20261023110000_retenue_lecture_origine_au_demarrage : controler_job_extension reprend son corps lu en
-- prod le 23/10 vers 11:50 (pg_get_functiondef, avant application).
BEGIN;
CREATE OR REPLACE FUNCTION public.controler_job_extension(p_user uuid, p_poste text, p_job uuid, p_statut text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '2s'
 SET lock_timeout TO '500ms'
AS $function$
DECLARE j cross_post_jobs%ROWTYPE; r jobs_reservations_extension%ROWTYPE;
BEGIN
 IF p_user IS NULL OR nullif(p_poste,'') IS NULL OR length(p_poste)>180 THEN
  RETURN jsonb_build_object('ok',false,'reason','Session de ce poste indisponible. Reconnecte FillSell.'); END IF;
 SELECT * INTO j FROM cross_post_jobs WHERE id=p_job AND user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','Job introuvable.'); END IF;
 -- (03/10) Arrêté à la demande de la personne : plus aucune écriture, quel que
 -- soit le statut demandé (le 'failed' tardif d'une ancienne boucle compris).
 IF j.status = 'cancelled' AND COALESCE(j.platform_fields, '{}'::jsonb) ? 'arret_utilisateur' THEN
  RETURN jsonb_build_object('ok',false,'reason','Arrêtée à ta demande : rien à faire.'); END IF;
 IF j.status NOT IN ('pending','processing') THEN
  IF p_statut='processing' THEN RETURN jsonb_build_object('ok',false,'reason','Ce job n’est plus à exécuter. Actualise la file.'); END IF;
  RETURN jsonb_build_object('ok',true,'reservation',null,'statut',j.status);
 END IF;
 SELECT * INTO r FROM jobs_reservations_extension WHERE job_id=p_job FOR UPDATE;
 IF FOUND AND r.poste<>p_poste THEN
  RETURN jsonb_build_object('ok',false,'reason','Ce job est réservé à un autre poste. Rien à exécuter ici.'); END IF;
 IF r.job_id IS NULL THEN
  -- File chargée avant le déploiement : le premier processing obtient le verrou,
  -- sans exiger un nouveau champ des anciennes extensions.
  INSERT INTO jobs_reservations_extension(job_id,user_id,poste) VALUES(p_job,p_user,p_poste)
   RETURNING * INTO r;
 END IF;
 RETURN jsonb_build_object('ok',true,'reservation',r.reservation,'statut',j.status);
END;
$function$;
COMMIT;
