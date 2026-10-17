-- Inverse de 20261017_introuvable_rejuge.sql : chaque job remis en pause par le
-- rejugement retrouve son statut, son message et ses champs d'avant — seulement
-- s'il est ENCORE dans cette pause (needs_user introuvable_a_confirmer, marque
-- rejuge_1710) : un job reparti ou clos depuis par la règle n'est pas touché.
-- Aucun mail, aucun retrait, aucun crédit (le remboursement d'une unité ne
-- rejoue pas : pepite_remboursee revient avec les champs sauvegardés).
begin;

update public.cross_post_jobs j set status = b.status, error = b.error, platform_fields = b.platform_fields
from public._backup_1710_introuvable_rejuge b
where j.id = b.id and j.status = 'needs_user'
  and j.platform_fields->>'needs_user_source' = 'introuvable_a_confirmer'
  and j.platform_fields ? 'rejuge_1710';

select left(b.id::text, 8) as job, b.status as statut_rendu, j.status as statut_maintenant
from public._backup_1710_introuvable_rejuge b join public.cross_post_jobs j on j.id = b.id
order by 1;

commit;
