-- INVERSE de scripts/reparations/20261024_zero_blocage_clotures_et_relances.sql : rend aux 6 jobs leur état d'avant
-- (première sauvegarde de chacun dans _backup_2410_zero_blocage_jobs) — seulement s'ils n'ont pas bougé depuis
-- (clos : encore cancelled ; relancés : encore pending, étape a_capturer). Un job reparti plus loin ne se défait pas ici.
BEGIN;
SET LOCAL statement_timeout = '60s';
SELECT set_config('fillsell.restauration', 'on', true);
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET status = b.status, error = b.error, platform_fields = b.platform_fields
    FROM (SELECT DISTINCT ON (s.id) s.* FROM public._backup_2410_zero_blocage_jobs s ORDER BY s.id, s.sauvegarde_le ASC) b
   WHERE c.id = b.id
     AND ((c.status = 'cancelled' AND c.platform_fields ? 'cloture_support')
          OR (c.status = 'pending' AND c.platform_fields ? 'relance_support' AND coalesce(c.platform_fields ->> 'republish_step', 'a_capturer') = 'a_capturer'));
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'jobs rendus à leur état d''avant : %', n;
END $$;
COMMIT;
