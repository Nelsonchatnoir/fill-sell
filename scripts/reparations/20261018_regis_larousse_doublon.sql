-- 18/10 ~19:15 Paris — Régis : la remise en ligne du Larousse (ed7729dc) a été resservie à 18:58 par une vérification
-- qui ne pouvait pas voir la copie (relevé automatique : aucun article neuf importé). Résultat : 2 copies en ligne,
-- 10431938776 (16:25:54 UTC, une-passe) et 10432668983 (16:59:50 UTC). Décision de Nico pour Régis (18/10) : garder la
-- 1re copie, retirer les autres par le chemin normal (retrait par son extension, numéro exact).
-- Sauvegardes : _backup_1810_regis_larousse (jobs, posée par 20261018_regis_larousse_arret.sql),
--               _backup_1810_regis_larousse_fiche. Inverse : 20261018_regis_larousse_doublon_INVERSE.sql.
begin;
create table if not exists public._backup_1810_regis_larousse_fiche as
  select id, vinted_item_id, disparu_le, listed_at_guess, now() as sauve_le from public.inventaire
   where id = 1792328734917016 and user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41';
do $g$ begin
  if exists (select 1 from public.inventaire where user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41'
               and vinted_item_id in ('10431938776', '10432668983')) then
    raise exception 'une copie est déjà sur une fiche — réparation arrêtée';
  end if;
end $g$;
update public.inventaire set vinted_item_id = '10431938776', disparu_le = null, listed_at_guess = '2026-10-18T16:25:54Z', last_synced_at = now()
 where id = 1792328734917016 and user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41' and vinted_item_id = '7125605802';
update public.cross_post_jobs
   set status = 'published', error = null,
       listing_url = 'https://www.vinted.fr/items/10431938776', platform_listing_id = '10431938776', published_at = '2026-10-18T16:25:54Z',
       platform_fields = (platform_fields - 'retenu_par_claude_1810' - 'next_action_after' - 'recreation_attente_releve' - 'error_technique'
                          - 'recreation_retries' - 'processing_since')
         || jsonb_build_object('republish_step', 'recreated', 'recreated_at', '2026-10-18T16:25:54Z',
              'old_vinted_item_id', '7125605802', 'new_vinted_item_id', '10431938776',
              'reconciliation', 'rattachée le 18/10 (décision de Nico) : 1re des 2 copies nées de nos envois (16:25:54 UTC, une-passe), prouvées par numéro et heure sur le dressing public',
              'doublons_recreation_1810', jsonb_build_object('garde', '10431938776', 'retirees', jsonb_build_array('10432668983'),
                 'le', now(), 'par', 'scripts/reparations/20261018_regis_larousse_doublon.sql'))
 where id = 'ed7729dc-cf2b-4ecf-b26a-492902b5f241' and user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41' and status in ('pending', 'needs_user');
insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, voie, title, listing_url, platform_listing_id, platform_fields)
values ('309d0787-9000-46cc-9c6a-51f7475d7d41', 1792328734917016, 'vinted', 'delete', 'pending', 'original', 'extension',
        'Dictionnaire Larousse français-anglais anglais-français Larousse 2035400503',
        'https://www.vinted.fr/items/10432668983', '10432668983',
        jsonb_build_object('arme_par', jsonb_build_object('chemin', 'doublon_de_republication', 'republication', 'ed7729dc-cf2b-4ecf-b26a-492902b5f241',
                             'garde', '10431938776', 'le', now(), 'pose_par', 'Claude 18/10 — décision de Nico : garder la 1re copie, retirer les autres'),
                           'vinted_account_id', '31995881'));
commit;
