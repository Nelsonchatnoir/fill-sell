-- Inverse de 20261003_nivake03_beebs_taille_ajustable.sql : remet la tâche
-- telle qu'elle était (needs_user « Taille »), TANT QU'ELLE N'EST PAS
-- recréée (une annonce remise en ligne ne se défait pas par la base).
begin;
update public.cross_post_jobs j
set status = b.ligne->>'status', error = b.ligne->>'error', platform_fields = b.ligne->'platform_fields'
from public._backup_0310_nivake03 b
where b.id = j.id::text and j.id = '8d487ebb-3b50-43cc-afba-435fc7c37f9a'
  and j.status in ('pending', 'needs_user') and j.platform_fields->>'republish_step' = 'deleted';
commit;
