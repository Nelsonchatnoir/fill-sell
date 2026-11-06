-- INVERSE de 20261106_retrait_lbc_cedric_clos.sql : le retrait 1b7be2d6 et sa copie publiée reprennent statut, message et
-- champs d'avant (sauvegarde public._backup_0611_retrait_lbc_cedric).
BEGIN;
UPDATE public.cross_post_jobs j SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_0611_retrait_lbc_cedric b WHERE j.id = b.id;
COMMIT;
