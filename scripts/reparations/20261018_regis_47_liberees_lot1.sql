-- 18/10 soir — Régis (309d0787) : 1er petit lot (3) des 47 républications Vinted retenues, libérées APRÈS le
-- déploiement de la garde (get-pending-jobs v262, update-job-status v144) et la migration 20261018170000.
-- Chacune doit être prouvée (une seule annonce en ligne, rattachée à sa fiche) avant le reste
-- (20261018_regis_47_liberees.sql). Sauvegarde des 47 : _backup_1810_regis_47. Inverse : …_47_liberees_INVERSE.sql.
begin;
create table if not exists public._backup_1810_regis_47 as
  select id, status, platform_fields, now() as sauve_le from public.cross_post_jobs
   where user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41' and status = 'pending'
     and coalesce((platform_fields ->> 'retenu_par_claude_1810')::boolean, false);

update public.cross_post_jobs
   set platform_fields = (platform_fields - 'retenu_par_claude_1810' - 'next_action_after')
         || jsonb_build_object('liberee_par_claude_1810', now(), 'lot_liberation_1810', 1)
 where id in (select b.id from public._backup_1810_regis_47 b
               join public.cross_post_jobs j on j.id = b.id
              order by j.created_at, j.id limit 3)
   and status = 'pending';
commit;
