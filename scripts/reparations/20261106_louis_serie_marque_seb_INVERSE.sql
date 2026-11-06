-- INVERSE de 20261106_louis_serie_marque_seb.sql : la série telle qu'elle était à 20:05 (ordre et marqueurs d'avant),
-- pour les tâches ENCORE en attente, depuis la sauvegarde _backup_0611_louis_serie_marque.
UPDATE public.cross_post_jobs j
   SET platform_fields = jsonb_set(j.platform_fields, '{serie_un_par_un}', b.platform_fields -> 'serie_un_par_un')
  FROM public._backup_0611_louis_serie_marque b
 WHERE b.id = j.id AND j.status = 'pending';
