-- ═══════════════════════════════════════════════════════════════════════════
-- UNE ANNONCE RATTACHÉE À UN ARTICLE DÉJÀ VENDU ARME SON RETRAIT TOUT DE SUITE (03/11, point 1 — feu vert de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- cross_post_jobs_publie_sur_article_vendu (prod, relue le 03/11) n'était appelée que par le déclencheur
--   AFTER UPDATE OF status … WHEN (new.status = 'published' AND old.status IS DISTINCT FROM 'published' …).
-- Une annonce INSÉRÉE déjà « published » (relevé : rattachement, import) ou re-pointée sur une autre fiche
-- (UPDATE OF inventaire_id) d'un article déjà vendu n'armait donc aucun retrait : 4 cas en 60 jours (rapport
-- docs/enquetes/six-points-0311/RAPPORT.md § 1). MÊME fonction, mêmes gardes, rien de réécrit :
--   · armer_retrait_job_pour : vente prouvée sur une AUTRE plateforme que celle de l'annonce (jamais l'annonce vendue
--     elle-même), annonce prouvée sur SA fiche (retrait_job_prouve), jamais deux exemplaires, jamais deux retraits de
--     la même annonce, jamais sur une annonce dite vendue ; Opla : rien (sortie du 10/10) ;
--   · fillsell.sans_retrait = '1' coupe tout (réparations).
-- Coût : une lecture article_vendu par annonce publiée insérée ou re-pointée (indexée), comme le déclencheur d'avant.
-- Inverse : supabase/rollbacks/20261103140000_armer_retrait_rattachee_apres_vente_INVERSE.sql

BEGIN;

DROP TRIGGER IF EXISTS cross_post_jobs_inseree_sur_article_vendu ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_inseree_sur_article_vendu
  AFTER INSERT ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (new.status = 'published' AND COALESCE(new.action, 'publish') IN ('publish', 'republish') AND new.inventaire_id IS NOT NULL)
  EXECUTE FUNCTION public.cross_post_jobs_publie_sur_article_vendu();

DROP TRIGGER IF EXISTS cross_post_jobs_repointee_sur_article_vendu ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_repointee_sur_article_vendu
  AFTER UPDATE OF inventaire_id ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (new.status = 'published' AND new.inventaire_id IS NOT NULL AND new.inventaire_id IS DISTINCT FROM old.inventaire_id
        AND COALESCE(new.action, 'publish') IN ('publish', 'republish'))
  EXECUTE FUNCTION public.cross_post_jobs_publie_sur_article_vendu();

COMMIT;
