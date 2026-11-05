-- INVERSE de 20261105_regle_vendu_retire_partout_rattrapage_2.sql : annule le retrait Beebs armé tant qu'il n'est pas parti.
BEGIN;
UPDATE public.cross_post_jobs j SET status = 'cancelled', error = 'Retrait annulé (inverse du rattrapage du 05/11).'
  FROM public._backup_0511_vendu_retire_partout_2 b
 WHERE j.id = b.retrait_cree AND j.status = 'pending';
COMMIT;
