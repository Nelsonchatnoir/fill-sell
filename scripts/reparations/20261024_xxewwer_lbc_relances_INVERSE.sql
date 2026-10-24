-- INVERSE de scripts/reparations/20261024_xxewwer_lbc_relances.sql : rend aux 5 jobs leur état d'avant (première
-- sauvegarde dans _backup_2410_zero_blocage_jobs) s'ils sont encore en file avant tout retrait.
BEGIN;
SET LOCAL statement_timeout = '60s';
SELECT set_config('fillsell.restauration', 'on', true);
UPDATE public.cross_post_jobs c SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM (SELECT DISTINCT ON (s.id) s.* FROM public._backup_2410_zero_blocage_jobs s WHERE s.id IN ('248dcbf3-b44b-42b6-bc3d-e965aa68afb5', 'ba629cd2-dc0e-4604-97b5-76dabe9e6060', '8ca2071f-e6a2-4f55-b83b-51f1b34df5d1', '9ed000c9-390f-45b8-8aaa-22ba29ce6bd4', '8b8a1d62-5a3c-402a-84de-de8afc1e6207') ORDER BY s.id, s.sauvegarde_le ASC) b
 WHERE c.id = b.id AND c.status = 'pending' AND c.platform_fields ? 'relance_support'
   AND coalesce(c.platform_fields ->> 'republish_step', 'a_capturer') = 'a_capturer';
COMMIT;
