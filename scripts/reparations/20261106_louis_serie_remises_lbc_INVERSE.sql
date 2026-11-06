-- INVERSE de 20261106_louis_serie_remises_lbc.sql : retire le marqueur de série des tâches ENCORE en attente.
-- ⚠ Sans règle A (retirée le 06/11 soir), les remises encore en attente partent alors toutes au prochain passage de
-- l'extension de Louis : à n'appliquer que si la série elle-même pose problème, ou après avoir retenu ces tâches autrement.
UPDATE public.cross_post_jobs j
   SET platform_fields = j.platform_fields - 'serie_un_par_un'
 WHERE j.platform_fields #>> '{serie_un_par_un,serie}' = 'louis-remises-lbc-0611'
   AND j.status = 'pending';
