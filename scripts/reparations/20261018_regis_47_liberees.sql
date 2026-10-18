-- 18/10 — Régis (309d0787) : libère les 47 republications Vinted retenues par Claude (retenu_par_claude_1810,
-- next_action_after au 25/10). À lancer SEULEMENT quand get-pending-jobs et update-job-status portent le correctif
-- « jamais un essai de plus sans relire le dressing » (déployés) et que la migration 20261018170000 est appliquée.
-- Elles repartent par le chemin normal, une à la fois (retenue « une seule annonce hors ligne »).
-- Sauvegarde : _backup_1810_regis_47. Inverse : 20261018_regis_47_liberees_INVERSE.sql.
begin;
create table if not exists public._backup_1810_regis_47 as
  select id, status, platform_fields, now() as sauve_le from public.cross_post_jobs
   where user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41' and status = 'pending'
     and coalesce((platform_fields ->> 'retenu_par_claude_1810')::boolean, false);

update public.cross_post_jobs
   set platform_fields = (platform_fields - 'retenu_par_claude_1810' - 'next_action_after')
         || jsonb_build_object('liberee_par_claude_1810', now())
 where id in (select id from public._backup_1810_regis_47) and status = 'pending';
commit;
