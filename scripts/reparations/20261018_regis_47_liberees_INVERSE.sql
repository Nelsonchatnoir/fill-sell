-- Inverse de 20261018_regis_47_liberees.sql : les republications encore en file reprennent la retenue d'avant.
begin;
update public.cross_post_jobs j
   set platform_fields = b.platform_fields
  from public._backup_1810_regis_47 b
 where j.id = b.id and j.status = 'pending';
commit;
