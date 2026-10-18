-- 18/10 ~17:00 Paris — Régis (juchsregis@gmail.com, 309d0787), boutique Vinted asgarde67 (31995881).
-- Chaque « canal coupé » de recréation était un dépôt RÉUSSI non reconnu : 7 copies du short Levi's, 4 du bloc-feuillet
-- (relevé public du dressing, 18/10 16:45-16:50 Paris ; heure de chaque copie = heure d'une de nos tentatives ;
-- 0 favori, 0 vue). Décision de Nico (18/10, question posée en séance) : GARDER LA 1re COPIE de chaque article,
-- rattachée à sa fiche (job publié), et RETIRER LES AUTRES par le chemin normal (retrait par l'extension de Régis,
-- numéro exact). Aucune annonce touchée à la main : les retraits partent par l'extension, gardes comprises.
-- Sauvegardes : _backup_1810_regis_recreations (jobs, posée par 20261018_regis_recreations_arretees.sql),
--               _backup_1810_regis_doublons_inventaire (fiches).
-- Inverse : 20261018_regis_doublons_recreation_INVERSE.sql (un retrait déjà exécuté chez Vinted ne se défait pas).
begin;

create table if not exists public._backup_1810_regis_doublons_inventaire as
  select id, vinted_item_id, disparu_le, listed_at_guess, vinted_status, now() as sauve_le
  from public.inventaire
  where id in (1792328734917018, 1792328734917017) and user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41';

-- Garde : aucune des copies ne doit déjà exister sur une fiche ou un job (sinon on s'arrête).
do $$
begin
  if exists (select 1 from public.inventaire where user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41'
               and vinted_item_id in ('10427468367','10427636564','10427925202','10428072925','10428341748','10428571122',
                                      '10428708416','10428851595','10429030601','10429313096','10429497006')) then
    raise exception 'une copie est déjà rattachée à une fiche — réparation arrêtée';
  end if;
end $$;

-- 1. La fiche prend le numéro de la 1re copie (comme le chemin de succès de l'extension, cloreRepublishSurAnnonceExistante).
update public.inventaire set vinted_item_id = '10427468367', disparu_le = null,
       listed_at_guess = '2026-10-18T13:11:49Z', last_synced_at = now()
 where id = 1792328734917018 and user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41' and vinted_item_id = '7125590020';
update public.inventaire set vinted_item_id = '10428851595', disparu_le = null,
       listed_at_guess = '2026-10-18T14:13:56Z', last_synced_at = now()
 where id = 1792328734917017 and user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41' and vinted_item_id = '7125601367';

-- 2. Les deux republications sont closes en succès sur la 1re copie.
update public.cross_post_jobs
   set status = 'published', error = null,
       listing_url = 'https://www.vinted.fr/items/10427468367', platform_listing_id = '10427468367',
       published_at = '2026-10-18T13:11:49Z',
       platform_fields = (platform_fields - 'retenu_par_claude_1810' - 'next_action_after' - 'needs_user_source'
                          - 'error_technique' - 'recreation_retries' - 'processing_since')
         || jsonb_build_object('republish_step', 'recreated', 'recreated_at', '2026-10-18T13:11:49Z',
              'old_vinted_item_id', '7125590020', 'new_vinted_item_id', '10427468367',
              'reconciliation', 'rattachée le 18/10 (décision de Nico) : 1re des 7 copies nées de nos tentatives (13:11:49 UTC, une-passe), prouvées par numéro et heure sur le dressing public',
              'doublons_recreation_1810', jsonb_build_object('garde', '10427468367',
                 'retirees', jsonb_build_array('10427636564','10427925202','10428072925','10428341748','10428571122','10428708416'),
                 'le', now(), 'par', 'scripts/reparations/20261018_regis_doublons_recreation.sql'))
 where id = 'f33d2e5d-da62-4e91-a9e8-c1ec28fca882' and user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41'
   and status in ('pending', 'needs_user');
update public.cross_post_jobs
   set status = 'published', error = null,
       listing_url = 'https://www.vinted.fr/items/10428851595', platform_listing_id = '10428851595',
       published_at = '2026-10-18T14:13:56Z',
       platform_fields = (platform_fields - 'retenu_par_claude_1810' - 'next_action_after' - 'needs_user_source'
                          - 'error_technique' - 'recreation_retries' - 'processing_since')
         || jsonb_build_object('republish_step', 'recreated', 'recreated_at', '2026-10-18T14:13:56Z',
              'old_vinted_item_id', '7125601367', 'new_vinted_item_id', '10428851595',
              'reconciliation', 'rattachée le 18/10 (décision de Nico) : 1re des 4 copies nées de nos tentatives (14:13:56 UTC, une-passe), prouvées par numéro et heure sur le dressing public',
              'doublons_recreation_1810', jsonb_build_object('garde', '10428851595',
                 'retirees', jsonb_build_array('10429030601','10429313096','10429497006'),
                 'le', now(), 'par', 'scripts/reparations/20261018_regis_doublons_recreation.sql'))
 where id = '8ab903a4-74f5-42f8-b096-5ae341f41175' and user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41'
   and status in ('pending', 'needs_user');

-- 3. Les copies en trop partent par le circuit normal de retrait (même forme que get-pending-jobs, doublon_de_republication).
insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, voie, title,
                                    listing_url, platform_listing_id, platform_fields)
select '309d0787-9000-46cc-9c6a-51f7475d7d41', c.fiche, 'vinted', 'delete', 'pending', 'original', 'extension', c.titre,
       'https://www.vinted.fr/items/' || c.id, c.id,
       jsonb_build_object(
         'arme_par', jsonb_build_object('chemin', 'doublon_de_republication', 'republication', c.job, 'garde', c.garde,
                                        'le', now(), 'pose_par', 'Claude 18/10 — décision de Nico : garder la 1re copie, retirer les autres'),
         'vinted_account_id', '31995881')
from (values
  ('10427636564', 1792328734917018, 'f33d2e5d-da62-4e91-a9e8-c1ec28fca882', '10427468367', 'Short jean Levi''s levi Strauss 24x32 525 8501'),
  ('10427925202', 1792328734917018, 'f33d2e5d-da62-4e91-a9e8-c1ec28fca882', '10427468367', 'Short jean Levi''s levi Strauss 24x32 525 8501'),
  ('10428072925', 1792328734917018, 'f33d2e5d-da62-4e91-a9e8-c1ec28fca882', '10427468367', 'Short jean Levi''s levi Strauss 24x32 525 8501'),
  ('10428341748', 1792328734917018, 'f33d2e5d-da62-4e91-a9e8-c1ec28fca882', '10427468367', 'Short jean Levi''s levi Strauss 24x32 525 8501'),
  ('10428571122', 1792328734917018, 'f33d2e5d-da62-4e91-a9e8-c1ec28fca882', '10427468367', 'Short jean Levi''s levi Strauss 24x32 525 8501'),
  ('10428708416', 1792328734917018, 'f33d2e5d-da62-4e91-a9e8-c1ec28fca882', '10427468367', 'Short jean Levi''s levi Strauss 24x32 525 8501'),
  ('10429030601', 1792328734917017, '8ab903a4-74f5-42f8-b096-5ae341f41175', '10428851595', 'France bloc feuillet n° 10 BF10 Révolution française NEUF++'),
  ('10429313096', 1792328734917017, '8ab903a4-74f5-42f8-b096-5ae341f41175', '10428851595', 'France bloc feuillet n° 10 BF10 Révolution française NEUF++'),
  ('10429497006', 1792328734917017, '8ab903a4-74f5-42f8-b096-5ae341f41175', '10428851595', 'France bloc feuillet n° 10 BF10 Révolution française NEUF++')
) as c(id, fiche, job, garde, titre);

commit;
