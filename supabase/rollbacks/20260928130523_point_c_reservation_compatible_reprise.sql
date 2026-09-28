-- Retour arrière C2, avant l'inverse C1. Aucun job modifié.
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1s';
DROP TRIGGER IF EXISTS cross_post_jobs_liberer_reservation ON public.cross_post_jobs;
DROP FUNCTION IF EXISTS public.liberer_reservation_job_termine();

-- Retour arrière point C : redéployer d'abord les fonctions sauvegardées.
-- Table de réservation uniquement ; aucun job ni contenu utilisateur supprimé.
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1s';
DROP FUNCTION IF EXISTS public.ecrire_statut_job_extension(uuid,text,uuid,uuid,text,jsonb);
DROP FUNCTION IF EXISTS public.controler_job_extension(uuid,text,uuid,text);
DROP FUNCTION IF EXISTS public.reserver_jobs_extension(uuid,text,uuid[]);
DROP TABLE IF EXISTS public.jobs_reservations_extension;
