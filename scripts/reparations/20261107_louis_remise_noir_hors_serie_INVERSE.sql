-- INVERSE de 20261107_louis_remise_noir_hors_serie.sql : la tâche cc247496 retrouve son marqueur de série (rang 5) et
-- perd la trace serie_sortie, depuis la sauvegarde _backup_0711_louis_remise_hors_serie — seulement si elle est ENCORE
-- en attente (une remise déjà partie ne se remet pas dans une série).
UPDATE public.cross_post_jobs j
   SET platform_fields = (j.platform_fields - 'serie_sortie')
         || jsonb_build_object('serie_un_par_un', b.platform_fields -> 'serie_un_par_un')
  FROM public._backup_0711_louis_remise_hors_serie b
 WHERE b.id = j.id AND j.status = 'pending' AND b.platform_fields ? 'serie_un_par_un';
