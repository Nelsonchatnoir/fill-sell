-- INVERSE de 20261003_retrait_ebay_nala_question.sql
begin;
update public.cross_post_jobs j set status = b.status, error = b.error, platform_fields = b.platform_fields
from public._backup_0310_retrait_nala b where j.id = b.id and j.status = 'cancelled';
commit;
