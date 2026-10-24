-- INVERSE de scripts/reparations/20261024_thibault_copies_depop.mjs (SQL _APPLIQUE) : rend aux republications Depop de
-- thibault la copie et le statut d'avant (première sauvegarde de chacune dans _backup_2410_thibault_depop_copies) —
-- seulement pour celles encore en file AVANT tout retrait (pending ou needs_user, étape a_capturer / captured). Une
-- republication déjà partie plus loin (retrait engagé, recréée) ne se défait pas ici.
BEGIN;
SET LOCAL statement_timeout = '60s';
SELECT set_config('fillsell.restauration', 'on', true);
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET status = b.status, error = b.error, description = b.description, platform_fields = b.platform_fields
    FROM (SELECT DISTINCT ON (s.id) s.* FROM public._backup_2410_thibault_depop_copies s ORDER BY s.id, s.sauvegarde_le ASC) b
   WHERE c.id = b.id AND c.status IN ('pending', 'needs_user')
     AND coalesce(c.platform_fields ->> 'republish_step', 'a_capturer') IN ('a_capturer', 'captured')
     AND c.platform_fields ? 'relance_support';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'republications rendues à leur état d''avant : %', n;
END $$;
COMMIT;
