-- Point C, GO Nico passe A à I. Idempotent, aucun balayage ni reprise de données.
-- Toute sortie de processing/pending rend la réservation, y compris une garde
-- écrite avant le verdict final, une réponse utilisateur et le veilleur.
-- Suppression par clé primaire de la table neuve déjà indexée en C1.
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1s';
CREATE OR REPLACE FUNCTION public.liberer_reservation_job_termine()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
BEGIN
 IF TG_OP='DELETE' THEN
  DELETE FROM jobs_reservations_extension WHERE job_id=OLD.id;
  RETURN OLD;
 END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status<>'processing' THEN
  DELETE FROM jobs_reservations_extension WHERE job_id=NEW.id;
 END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS cross_post_jobs_liberer_reservation ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_liberer_reservation AFTER UPDATE OF status OR DELETE ON public.cross_post_jobs
FOR EACH ROW EXECUTE FUNCTION public.liberer_reservation_job_termine();
REVOKE ALL ON FUNCTION public.liberer_reservation_job_termine() FROM PUBLIC,anon,authenticated;
