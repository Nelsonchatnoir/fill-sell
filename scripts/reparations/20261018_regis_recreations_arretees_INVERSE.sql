-- Inverse de 20261018_regis_recreations_arretees.sql : rend aux deux jobs leur platform_fields d'avant.
-- ⚠️ À ne lancer que si le correctif de reconnaissance est en place, sinon les recréations en double reprennent.
begin;
update public.cross_post_jobs j
set platform_fields = b.platform_fields
from public._backup_1810_regis_recreations b
where j.id = b.id;
commit;
