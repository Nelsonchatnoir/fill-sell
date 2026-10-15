-- ════════════════════════════════════════════════════════════════════════════
-- SEULE LA TÊTE DE FILE COMPTE UN « SERVICE SANS DÉMARRAGE » (15/10/2026, P4)
-- ════════════════════════════════════════════════════════════════════════════
-- Constat prouvé (14/10, Ciddjy, Mac) : lot de 79 dépôts Beebs à 09:29 ; à
-- 16:04-16:09, 68 tâches « mises de côté » (needs_user tache_sans_demarrage,
-- servie_n = 12 chacune). L'extension traite la file UN JOB À LA FOIS ;
-- get-pending-jobs servait la file entière et reserver_jobs_extension comptait
-- un service pour CHAQUE tâche à chaque appel : celles qui attendaient leur tour
-- ont été jugées « jamais démarrées ».
-- Règle : p_tete = la tâche que l'extension commencera en premier
-- (_shared/tete-de-file.js, même ordre que l'extension). Elle seule compte un
-- service ; toute autre tâche servie garde sa réservation, son compteur repart
-- (servi_n = 1, premier_service = maintenant) : « 12 services en 2 h sans
-- démarrer » ne vise plus que la tâche qui bloque vraiment la file (cas du
-- 03/10, doriane-henri). Sans p_tete : comportement d'avant, à l'identique.
-- Définition de départ : pg_get_functiondef EN PROD le 15/10.
-- Inverse : supabase/rollbacks/20261015020000_reservation_tete_de_file_INVERSE.sql
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '3s';

DROP FUNCTION IF EXISTS public.reserver_jobs_extension(uuid, text, uuid[]);

CREATE FUNCTION public.reserver_jobs_extension(p_user uuid, p_poste text, p_jobs uuid[], p_tete uuid DEFAULT NULL)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '2s'
 SET lock_timeout TO '500ms'
AS $function$
DECLARE v_id uuid; j cross_post_jobs%ROWTYPE; r jobs_reservations_extension%ROWTYPE;
 resultat uuid[]:='{}'; v_compte boolean;
BEGIN
 IF p_user IS NULL OR nullif(p_poste,'') IS NULL OR length(p_poste)>180 THEN RETURN resultat; END IF;
 FOR v_id IN SELECT id FROM unnest(p_jobs) WITH ORDINALITY x(id,n) ORDER BY n LIMIT 100 LOOP
  SELECT * INTO j FROM cross_post_jobs WHERE id=v_id AND user_id=p_user
   AND voie='extension' AND status='pending' FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  -- (15/10, P4) Seule la tête de file compte un service sans démarrage.
  v_compte := p_tete IS NULL OR v_id = p_tete;
  SELECT * INTO r FROM jobs_reservations_extension WHERE job_id=v_id FOR UPDATE;
  -- Un processing revenu pending a été rendu par le veilleur ou l'utilisateur.
  -- Une file distribuée mais pas commencée expire ; l'ancien poste devra alors
  -- repasser le contrôle avant tout geste, et sera refusé si un autre l'a prise.
  IF FOUND AND NOT r.commence AND r.expire_le>now() THEN
   -- Le même poste peut relire une file ignorée par une publication ciblée.
   -- Les autres postes attendent ; aucun renouvellement de génération ici.
   IF r.poste=p_poste THEN
    -- (03/10) Servie de nouveau sans avoir été commencée : comptée — en tête
    -- de file seulement (15/10) ; derrière, elle attend son tour.
    IF v_compte THEN
     UPDATE jobs_reservations_extension SET servi_n=servi_n+1 WHERE job_id=v_id;
    ELSE
     UPDATE jobs_reservations_extension SET servi_n=1, premier_service=now() WHERE job_id=v_id;
    END IF;
    resultat:=array_append(resultat,v_id);
   END IF;
   CONTINUE;
  END IF;
  INSERT INTO jobs_reservations_extension(job_id,user_id,poste,servi_n,premier_service)
   VALUES(v_id,p_user,p_poste,1,now()) ON CONFLICT(job_id) DO UPDATE SET
   poste=EXCLUDED.poste,reservation=gen_random_uuid(),expire_le=now()+interval '10 minutes',commence=false,
   -- (03/10) Même poste, jamais commencée : le compte continue ; sinon il repart.
   -- (15/10) … en tête de file seulement.
   servi_n=CASE WHEN v_compte AND jobs_reservations_extension.poste=EXCLUDED.poste AND NOT jobs_reservations_extension.commence
     THEN jobs_reservations_extension.servi_n+1 ELSE 1 END,
   premier_service=CASE WHEN v_compte AND jobs_reservations_extension.poste=EXCLUDED.poste AND NOT jobs_reservations_extension.commence
     THEN jobs_reservations_extension.premier_service ELSE now() END;
  resultat:=array_append(resultat,v_id);
 END LOOP;
 RETURN resultat;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserver_jobs_extension(uuid, text, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserver_jobs_extension(uuid, text, uuid[], uuid) TO service_role;

COMMIT;
