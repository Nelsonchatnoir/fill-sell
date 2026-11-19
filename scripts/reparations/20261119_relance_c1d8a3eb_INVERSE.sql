-- INVERSE de 20261119_relance_c1d8a3eb.sql : remet le job c1d8a3eb tel que la sauvegarde l'a lu (statut, erreur, champs).
-- À ne jouer que si le job n'a pas été publié entre-temps (sinon l'annonce eBay existe : ne rien remettre).
BEGIN;
UPDATE public.cross_post_jobs j
   SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_1911_relance_c1d8a3eb b
 WHERE j.id = b.id AND j.status <> 'published';
SELECT id, status FROM public.cross_post_jobs WHERE id = 'c1d8a3eb-89e5-4415-a106-f866058a6a17';
COMMIT;
