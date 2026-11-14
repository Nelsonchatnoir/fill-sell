-- INVERSE de 20261114_beebs_fantomes.sql : les annonces et les tâches rendues à leur état sauvegardé (disparu_le, rattachement
-- à la fiche, statut et champs de la tâche). Une fiche supprimée depuis par la personne n'est pas recréée (le lien reste NULL).
BEGIN;
UPDATE public.annonces_plateforme a SET disparu_le = b.disparu_le,
    inventaire_id = CASE WHEN EXISTS (SELECT 1 FROM public.inventaire i WHERE i.id = b.inventaire_id) THEN b.inventaire_id ELSE NULL END,
    updated_at = now()
  FROM public._backup_1411_beebs_fantomes_annonces b WHERE b.id = a.id;
UPDATE public.cross_post_jobs j SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_1411_beebs_fantomes_jobs b WHERE b.id = j.id;
SELECT (SELECT count(*) FROM public._backup_1411_beebs_fantomes_annonces) AS annonces_rendues, (SELECT count(*) FROM public._backup_1411_beebs_fantomes_jobs) AS taches_rendues;
COMMIT;
