-- INVERSE de 20261106_doudou_lbc_retraits.sql : annule les deux retraits Leboncoin armés tant qu'ils ne sont pas partis.
BEGIN;
UPDATE public.cross_post_jobs j SET status = 'cancelled', error = 'Retrait annulé (inverse du rattrapage du 06/11).'
  FROM public._backup_0611_doudou_lbc_retraits b
 WHERE j.id = b.retrait_cree AND j.status = 'pending';
COMMIT;
