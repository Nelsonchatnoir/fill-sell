-- Inverse de 20261018_regis_larousse_arret.sql : les trois jobs du lot 1 reprennent leur état d'avant l'arrêt.
begin;
update public.cross_post_jobs j set platform_fields = b.platform_fields from public._backup_1810_regis_larousse b where j.id = b.id and j.status in ('pending', 'needs_user');
commit;
