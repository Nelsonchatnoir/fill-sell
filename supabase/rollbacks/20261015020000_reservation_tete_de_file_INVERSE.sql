-- INVERSE de 20261015020000_reservation_tete_de_file : définition EN PROD relue le
-- 15/10 (pg_get_functiondef) juste avant la migration. À jouer APRÈS avoir redéployé
-- un get-pending-jobs qui n'envoie plus p_tete (sinon l'appel tombe).
BEGIN;

DROP FUNCTION IF EXISTS public.reserver_jobs_extension(uuid, text, uuid[], uuid);

CREATE FUNCTION public.reserver_jobs_extension(p_user uuid, p_poste text, p_jobs uuid[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '2s'
 SET lock_timeout TO '500ms'
AS $function$
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
  IF FOUND AND NOT r.commence AND r.expire_le>now() THEN
   -- Le même poste peut relire une file ignorée par une publication ciblée.
   -- Les autres postes attendent ; aucun renouvellement de génération ici.
   IF r.poste=p_poste THEN
    -- (03/10) Servie de nouveau sans avoir été commencée : comptée.
    UPDATE jobs_reservations_extension SET servi_n=servi_n+1 WHERE job_id=v_id;
    resultat:=array_append(resultat,v_id);
   END IF;
   CONTINUE;
  END IF;
  INSERT INTO jobs_reservations_extension(job_id,user_id,poste,servi_n,premier_service)
   VALUES(v_id,p_user,p_poste,1,now()) ON CONFLICT(job_id) DO UPDATE SET
   poste=EXCLUDED.poste,reservation=gen_random_uuid(),expire_le=now()+interval '10 minutes',commence=false,
   -- (03/10) Même poste, jamais commencée : le compte continue ; sinon il repart.
   servi_n=CASE WHEN jobs_reservations_extension.poste=EXCLUDED.poste AND NOT jobs_reservations_extension.commence
     THEN jobs_reservations_extension.servi_n+1 ELSE 1 END,
   premier_service=CASE WHEN jobs_reservations_extension.poste=EXCLUDED.poste AND NOT jobs_reservations_extension.commence
     THEN jobs_reservations_extension.premier_service ELSE now() END;
  resultat:=array_append(resultat,v_id);
 END LOOP;
 RETURN resultat;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserver_jobs_extension(uuid, text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserver_jobs_extension(uuid, text, uuid[]) TO service_role;

COMMIT;
