-- Point C, GO Nico passe A à I : réservation par poste, compatible ancien parc.
-- Idempotent. Table neuve ; aucun balayage ni réécriture des jobs existants.
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1s';
CREATE TABLE IF NOT EXISTS public.jobs_reservations_extension (
 job_id uuid PRIMARY KEY, user_id uuid NOT NULL, poste text NOT NULL,
 reservation uuid NOT NULL DEFAULT gen_random_uuid(),
 expire_le timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 commence boolean NOT NULL DEFAULT false
);
ALTER TABLE public.jobs_reservations_extension ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jobs_reservations_extension FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.jobs_reservations_extension TO service_role;

CREATE OR REPLACE FUNCTION public.reserver_jobs_extension(p_user uuid,p_poste text,p_jobs uuid[])
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
SET statement_timeout='2s' SET lock_timeout='500ms' AS $function$
DECLARE v_id uuid; j cross_post_jobs%ROWTYPE; r jobs_reservations_extension%ROWTYPE;
 resultat uuid[]:='{}';
BEGIN
 IF p_user IS NULL OR nullif(p_poste,'') IS NULL OR length(p_poste)>180 THEN RETURN resultat; END IF;
 FOR v_id IN SELECT id FROM unnest(p_jobs) WITH ORDINALITY x(id,n) ORDER BY n LIMIT 100 LOOP
  SELECT * INTO j FROM cross_post_jobs WHERE id=v_id AND user_id=p_user
   AND voie='extension' AND status='pending' FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT * INTO r FROM jobs_reservations_extension WHERE job_id=v_id FOR UPDATE;
  -- Un processing revenu pending a été rendu par le veilleur ou l'utilisateur.
  -- Une file distribuée mais pas commencée expire ; l'ancien poste devra alors
  -- repasser le contrôle avant tout geste, et sera refusé si un autre l'a prise.
  IF FOUND AND NOT r.commence AND r.expire_le>now() THEN CONTINUE; END IF;
  INSERT INTO jobs_reservations_extension(job_id,user_id,poste)
   VALUES(v_id,p_user,p_poste) ON CONFLICT(job_id) DO UPDATE SET
   poste=EXCLUDED.poste,reservation=gen_random_uuid(),expire_le=now()+interval '10 minutes',commence=false;
  resultat:=array_append(resultat,v_id);
 END LOOP;
 RETURN resultat;
END;
$function$;

CREATE OR REPLACE FUNCTION public.controler_job_extension(p_user uuid,p_poste text,p_job uuid,p_statut text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
SET statement_timeout='2s' SET lock_timeout='500ms' AS $function$
DECLARE j cross_post_jobs%ROWTYPE; r jobs_reservations_extension%ROWTYPE;
BEGIN
 IF p_user IS NULL OR nullif(p_poste,'') IS NULL OR length(p_poste)>180 THEN
  RETURN jsonb_build_object('ok',false,'reason','Session de ce poste indisponible. Reconnecte FillSell.'); END IF;
 SELECT * INTO j FROM cross_post_jobs WHERE id=p_job AND user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','Job introuvable.'); END IF;
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

CREATE OR REPLACE FUNCTION public.ecrire_statut_job_extension(
 p_user uuid,p_poste text,p_job uuid,p_reservation uuid,p_avant text,p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
SET statement_timeout='3s' SET lock_timeout='1s' AS $function$
DECLARE j cross_post_jobs%ROWTYPE; r jobs_reservations_extension%ROWTYPE; nouveau cross_post_jobs%ROWTYPE;
BEGIN
 SELECT * INTO j FROM cross_post_jobs WHERE id=p_job AND user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','Job introuvable.'); END IF;
 IF j.status IS DISTINCT FROM p_avant THEN
  RETURN jsonb_build_object('ok',false,'reason','Le job a changé entre-temps. Actualise la file.'); END IF;
 IF p_reservation IS NOT NULL THEN
  SELECT * INTO r FROM jobs_reservations_extension WHERE job_id=p_job FOR UPDATE;
  IF r.reservation IS DISTINCT FROM p_reservation OR r.poste IS DISTINCT FROM p_poste THEN
   RETURN jsonb_build_object('ok',false,'reason','La réservation de ce poste a changé. Actualise la file.'); END IF;
  IF j.status NOT IN ('pending','processing') AND p_patch->>'status'='processing' THEN
   RETURN jsonb_build_object('ok',false,'reason','Ce job a été arrêté entre-temps.'); END IF;
 ELSIF j.status IS DISTINCT FROM p_avant THEN
  RETURN jsonb_build_object('ok',false,'reason','Le job a changé entre-temps. Actualise la file.');
 END IF;
 -- Liste fermée des colonnes écrites par update-job-status : pas de SQL dynamique.
 SELECT * INTO nouveau FROM jsonb_populate_record(j,p_patch);
 UPDATE cross_post_jobs SET status=nouveau.status,error=nouveau.error,
  platform_fields=nouveau.platform_fields,handler_build=nouveau.handler_build,
  listing_url=nouveau.listing_url,platform_listing_id=nouveau.platform_listing_id,
  published_at=nouveau.published_at WHERE id=p_job;
 IF nouveau.status='processing' THEN
  UPDATE jobs_reservations_extension SET commence=true WHERE job_id=p_job AND reservation=p_reservation;
 ELSE
  DELETE FROM jobs_reservations_extension WHERE job_id=p_job AND reservation=p_reservation;
 END IF;
 RETURN jsonb_build_object('ok',true,'job',jsonb_build_object('id',p_job,'status',nouveau.status));
END;
$function$;
REVOKE ALL ON FUNCTION public.reserver_jobs_extension(uuid,text,uuid[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.controler_job_extension(uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ecrire_statut_job_extension(uuid,text,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserver_jobs_extension(uuid,text,uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.controler_job_extension(uuid,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ecrire_statut_job_extension(uuid,text,uuid,uuid,text,jsonb) TO service_role;
