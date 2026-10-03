-- INVERSE de 20261003_louis_beebs_age_republication.sql : remet les relevés
-- et les tâches telles que sauvegardées dans _backup_0310_louis_age.
-- ⚠️ Une tâche déjà partie (publiée, retirée) n'est PAS remise en arrière :
--    seules celles encore en file (pending) reprennent leur état d'avant.
begin;

update public.annonces_plateforme a
set capture = (b.ligne->'capture'), updated_at = now()
from public._backup_0310_louis_age b
where b.quoi = 'annonce' and a.id::text = b.id;

update public.cross_post_jobs j
set status = b.ligne->>'status', error = b.ligne->>'error', platform_fields = b.ligne->'platform_fields'
from public._backup_0310_louis_age b
where b.quoi = 'job' and j.id::text = b.id and j.status = 'pending';

commit;
