-- Inverse de 20261015_introuvable_a_confirmer.sql : chaque job repris retrouve
-- son statut, son message et ses champs d'avant (seulement s'il est encore en
-- pause « introuvable » : un job reparti ou clos depuis n'est pas touché), et
-- chaque fiche sa date « disparue ».
begin;
update public.cross_post_jobs j set status = b.status, error = b.error, platform_fields = b.platform_fields
from public._backup_1510_introuvable_jobs b
where j.id = b.id and j.status = 'needs_user' and j.platform_fields->>'needs_user_source' = 'introuvable_a_confirmer';
update public.inventaire i set disparu_le = b.disparu_le
from public._backup_1510_introuvable_fiches b
where i.id = b.id and i.disparu_le is null;
commit;
