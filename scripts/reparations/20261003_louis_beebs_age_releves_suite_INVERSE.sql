-- INVERSE de 20261003_louis_beebs_age_releves_suite.sql (relevés, et tâches encore en file)
begin;
update public.annonces_plateforme a set capture = (b.ligne->'capture'), updated_at = now()
from public._backup_0310_louis_age b where b.quoi = 'annonce2' and a.id::text = b.id;
update public.cross_post_jobs j set status = b.ligne->>'status', error = b.ligne->>'error', platform_fields = b.ligne->'platform_fields'
from public._backup_0310_louis_age b where b.quoi = 'job2' and j.id::text = b.id and j.status = 'pending';
commit;
