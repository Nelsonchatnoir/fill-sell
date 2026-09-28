-- Retour arrière C2, avant l'inverse C1. Aucun job modifié.
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1s';
DROP TRIGGER IF EXISTS cross_post_jobs_liberer_reservation ON public.cross_post_jobs;
DROP FUNCTION IF EXISTS public.liberer_reservation_job_termine();
