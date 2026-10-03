-- INVERSE de 20261003_louis_beebs_prix_republication.sql (tâches encore en file seulement)
begin;
update public.cross_post_jobs j set price = (b.ligne->>'price')::numeric, platform_fields = b.ligne->'platform_fields'
from public._backup_0310_louis_age b where b.quoi = 'job_prix' and j.id::text = b.id and j.status in ('pending','processing');
commit;
