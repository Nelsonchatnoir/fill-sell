-- INVERSE de 20261106_ayadi007_mur_paiements_ebay.sql : les tâches reprennent statut, message et champs d'avant, tant
-- qu'elles attendent encore (needs_user).
BEGIN;
UPDATE public.cross_post_jobs j SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_0611_ayadi007_mur_paiements b WHERE j.id = b.id AND j.status = 'needs_user';
COMMIT;
