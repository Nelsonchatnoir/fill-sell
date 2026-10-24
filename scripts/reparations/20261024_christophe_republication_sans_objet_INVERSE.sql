-- INVERSE de scripts/reparations/20261024_christophe_republication_sans_objet.sql (s'il est encore clos par ce script).
BEGIN;
SET LOCAL statement_timeout = '60s';
SELECT set_config('fillsell.restauration', 'on', true);
UPDATE public.cross_post_jobs c SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM (SELECT DISTINCT ON (s.id) s.* FROM public._backup_2410_zero_blocage_jobs s WHERE s.id = 'a017da53-1a93-4c67-a170-e2e0c1dfb558' ORDER BY s.id, s.sauvegarde_le ASC) b
 WHERE c.id = b.id AND c.status = 'cancelled' AND c.platform_fields ? 'cloture_support';
COMMIT;
