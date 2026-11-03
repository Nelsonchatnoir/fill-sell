-- INVERSE de 20261103_retraits_a_tort_etape2.sql : les remises encore EN ATTENTE (jamais prises par l'extension) sont
-- annulées. Une remise prise, publiée ou en cours n'est jamais touchée ici (l'annonce est peut-être déjà en ligne :
-- la retirer serait un nouveau retrait, sur décision seulement).
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.cross_post_jobs SET status = 'cancelled',
       error = 'Remise en ligne du 03/11 annulée (inverse de la réparation)'
 WHERE platform_fields ? 'remise_en_ligne_0311' AND status = 'pending';
COMMIT;
