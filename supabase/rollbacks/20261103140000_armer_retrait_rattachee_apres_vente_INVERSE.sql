-- Inverse de 20261103140000_armer_retrait_rattachee_apres_vente : les deux déclencheurs partent, la fonction reste
-- (elle sert toujours le déclencheur d'avant, cross_post_jobs_publie_sur_article_vendu sur UPDATE OF status).
BEGIN;
DROP TRIGGER IF EXISTS cross_post_jobs_inseree_sur_article_vendu ON public.cross_post_jobs;
DROP TRIGGER IF EXISTS cross_post_jobs_repointee_sur_article_vendu ON public.cross_post_jobs;
COMMIT;
