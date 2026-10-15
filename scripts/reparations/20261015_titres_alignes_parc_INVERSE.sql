-- Inverse de 20261015_titres_alignes_parc.sql
begin;
update public.cross_post_jobs j set title = b.title, platform_fields = b.platform_fields from public._backup_1510_titres_alignes b where b.id = j.id;
commit;
