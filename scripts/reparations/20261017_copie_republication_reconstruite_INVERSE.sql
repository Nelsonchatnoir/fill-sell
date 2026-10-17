-- Inverse de 20261017_copie_republication_reconstruite.sql : chaque republication
-- dont la copie a été reconstruite retrouve son statut, son message et ses champs
-- d'avant — seulement si elle n'a pas bougé depuis (toujours en file, étape
-- 'a_capturer', jamais prise par l'extension) : une republication partie, en
-- cours ou finie n'est pas touchée. Aucun mail, aucune annonce touchée.
begin;

update public.cross_post_jobs j set status = b.status, error = b.error, platform_fields = b.platform_fields
from public._backup_1710_copie_reconstruite b
where j.id = b.id and j.status = 'pending'
  and j.platform_fields ? 'reparation_1710_copie'
  and j.platform_fields->>'republish_step' = 'a_capturer'
  and j.platform_fields->>'processing_since' is null;

select left(b.id::text, 8) as job, b.status as statut_rendu, j.status as statut_maintenant
from public._backup_1710_copie_reconstruite b join public.cross_post_jobs j on j.id = b.id
order by 1;

commit;
