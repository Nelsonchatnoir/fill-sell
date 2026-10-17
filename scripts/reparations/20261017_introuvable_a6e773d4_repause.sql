-- ═══════════════════════════════════════════════════════════════════════════
-- 17/10 — a6e773d4 : remise en pause « introuvable » (suite du rejugement)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le rejugement (20261017_introuvable_rejuge.sql, 13:15) l'a remis en pause ; à
-- 13:18, le « réveil par capture fraîche » de handler-watch v113 l'a re-pendu
-- (capture 9241 du 29/09, valide, ANTÉRIEURE à la lecture ratée : elle ne prouve
-- pas que l'annonce 9362353208 est en ligne — aucun relevé ne la voit depuis le
-- 20/09). Règle corrigée (handler-watch v114, commit a309dd8) : ce réveil saute
-- les pauses « introuvable ». Ce script rend la pause, rien d'autre : étape,
-- capture et copie gardées ; rien n'a été retiré (le poste du compte n'a pas été
-- vu depuis le 13/10). Aucun mail. Sauvegarde : _backup_1710_a6e773d4 ; inverse
-- en bas du fichier.
begin;

create table if not exists public._backup_1710_a6e773d4 as
  select id, status, error, platform_fields, now() as sauve_le from public.cross_post_jobs where false;

insert into public._backup_1710_a6e773d4
select id, status, error, platform_fields, now() from public.cross_post_jobs
 where id = 'a6e773d4-e364-45b1-8ad8-9be48add727e' and status = 'pending'
   and platform_fields ? 'rejuge_1710' and platform_fields->>'reveille_par_capture' = '9241'
   and not exists (select 1 from public._backup_1710_a6e773d4);

update public.cross_post_jobs j set
  status = 'needs_user',
  error = 'Republication en pause, rien n''a été retiré : Vinted n''a pas rendu cette annonce à la dernière lecture. FillSell attend le prochain relevé de ta boutique Vinted pour savoir si elle est encore en ligne ; si elle l''est, la republication repartira toute seule. Pour aller plus vite : « Synchroniser ».',
  platform_fields = (j.platform_fields - 'reveille_par_capture_le')
    || jsonb_build_object('needs_user_source', 'introuvable_a_confirmer',
         'reveil_annule_1710', jsonb_build_object('le', now(), 'capture', j.platform_fields->>'reveille_par_capture',
           'motif', 'capture antérieure à la lecture ratée : elle ne prouve pas que l''annonce est en ligne'))
from public._backup_1710_a6e773d4 b
where j.id = b.id and j.status = 'pending' and j.platform_fields ? 'rejuge_1710';

do $$
begin
  if (select count(*) from public.cross_post_jobs where id = 'a6e773d4-e364-45b1-8ad8-9be48add727e' and status = 'needs_user'
        and platform_fields->>'needs_user_source' = 'introuvable_a_confirmer') <> 1 then
    raise exception 'a6e773d4 : pas remis en pause — tout est annulé';
  end if;
end $$;

select left(id::text, 8) as job, status, platform_fields->>'needs_user_source' as source, platform_fields->>'republish_step' as etape
  from public.cross_post_jobs where id = 'a6e773d4-e364-45b1-8ad8-9be48add727e';

commit;

-- INVERSE : begin; update public.cross_post_jobs j set status = b.status, error = b.error, platform_fields = b.platform_fields
--   from public._backup_1710_a6e773d4 b where j.id = b.id and j.status = 'needs_user' and j.platform_fields ? 'reveil_annule_1710'; commit;
