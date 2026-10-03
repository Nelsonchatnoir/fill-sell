-- Inverse de 20261003_louis_beebs_creneau_exception.sql : retire l'exception
-- (les tâches retombent sous le créneau). Aucune autre valeur touchée.
begin;
update public.cross_post_jobs j
set platform_fields = j.platform_fields - 'creneau_exception'
where j.id in ('cf867d47-6d54-4886-ba87-4683513fb0cc','af0c95c3-6290-4cb4-b19f-7872e42239b0',
               'd64f7a1d-fb9e-4cdd-9953-03612bcaa196','f7e1fe3d-9cfb-44c1-9a02-d20eeeb32cdd')
  and j.platform_fields ? 'creneau_exception';
commit;
