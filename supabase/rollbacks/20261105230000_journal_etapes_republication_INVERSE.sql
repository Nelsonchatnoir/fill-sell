-- INVERSE de 20261105230000_journal_etapes_republication.sql (lot « Ouverture du Cloud », point 10, 05/11 soir).
-- Retire le déclencheur et sa fonction. Le journal déjà écrit (platform_fields.journal_etapes) reste, inerte : seul
-- l'affichage de la file le lit, et il retombe alors sur les horodatages d'avant (created_at, captured_at, deleted_at…).
DROP TRIGGER IF EXISTS zz_journal_etapes_republication ON public.cross_post_jobs;
DROP FUNCTION IF EXISTS public.journal_etapes_republication();
