-- INVERSE de 20261008_imports_v3_regle_tracee.sql : le détail d'origine revient.
BEGIN;
UPDATE public.rapprochements r SET detail = b.detail
  FROM public._backup_0810_regle_v3 b
 WHERE b.id = r.id AND r.detail ->> 'regle_posee' = '20261008_tracabilite';
SELECT count(*) restaurees FROM public.rapprochements r JOIN public._backup_0810_regle_v3 b ON b.id = r.id WHERE r.detail = b.detail;
COMMIT;
