-- Retour arrière point C : redéployer d'abord les fonctions sauvegardées.
-- Table de réservation uniquement ; aucun job ni contenu utilisateur supprimé.
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1s';
DROP FUNCTION IF EXISTS public.ecrire_statut_job_extension(uuid,text,uuid,uuid,text,jsonb);
DROP FUNCTION IF EXISTS public.controler_job_extension(uuid,text,uuid,text);
DROP FUNCTION IF EXISTS public.reserver_jobs_extension(uuid,text,uuid[]);
DROP TABLE IF EXISTS public.jobs_reservations_extension;
