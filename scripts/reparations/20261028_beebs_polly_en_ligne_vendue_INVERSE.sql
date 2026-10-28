-- Inverse de 20261028_beebs_polly_en_ligne_vendue.sql : la ligne reprend son état sauvegardé ; le retrait armé par la
-- règle est annulé s'il n'a pas encore été fait (jamais un retrait déjà exécuté chez Beebs).
BEGIN;
UPDATE public.cross_post_jobs c SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_2810_beebs_polly b WHERE c.id = b.id;
UPDATE public.cross_post_jobs SET status = 'cancelled', error = 'Annulé : inverse de la réparation du 28/10'
 WHERE inventaire_id = 1792501756264003 AND platform = 'beebs' AND action = 'delete' AND status = 'pending'
   AND platform_fields #>> '{arme_par,depot}' = '4cdadbc1-886e-4af1-a40c-37bfa2f805ff';
COMMIT;
