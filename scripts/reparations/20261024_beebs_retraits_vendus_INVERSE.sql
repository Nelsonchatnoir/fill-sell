-- INVERSE de scripts/reparations/20261024_beebs_retraits_vendus.sql : les deux retraits Beebs et leurs publications
-- d'origine reprennent leur état d'avant (retraits « pending », publications « published »), depuis
-- _backup_2410_beebs_retraits_vendus — seulement s'ils n'ont pas bougé depuis la réparation.
BEGIN;
SET LOCAL statement_timeout = '60s';
SELECT set_config('fillsell.restauration', 'on', true);
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET status = b.status, error = b.error, platform_fields = b.platform_fields
    FROM public._backup_2410_beebs_retraits_vendus b
   WHERE c.id = b.id
     AND ((c.action = 'delete' AND c.status = 'deleted' AND c.platform_fields ? 'ferme_par_support')
          OR (c.action IN ('publish', 'republish') AND c.status = 'cancelled'));
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 4 THEN RAISE EXCEPTION '% ligne(s) rendue(s) au lieu de 4 — rien n''est fait', n; END IF;
END $$;
SELECT id, action, status FROM public.cross_post_jobs WHERE id IN (SELECT id FROM public._backup_2410_beebs_retraits_vendus);
COMMIT;
