-- 25/10 matin — Vincent A. (67a8b907), boutique Vinted @striike (21011125), fiche 1792842213155002 « Champavert, le
-- lycanthrope⏎Par Pétrus Borel » (UN exemplaire). Republication 9138772c : ancienne annonce 3532781567 retirée le 24/10
-- à 18:52:54 (Vinted HTTP 200), puis DEUX envois — 18:53:11 (canal coupé, onglet sur /member = dépôt réussi, copie non
-- reconnue : le champ titre d'une ligne a mangé le saut de ligne, « lycanthropePar ») et 19:46:01 (resservi malgré le
-- depot_incertain). Relu ce matin (09:3x) sur le dressing public de @striike : DEUX annonces en ligne, titre exact
-- « Champavert, le lycanthropePar Pétrus Borel », 9 €, 3 photos, état Satisfaisant, 0 favori, 0 vue — 10514173498
-- (née du 1er envoi) et 10514978864 (née du 2e). Aucune n'est connue de FillSell (ni fiche ni job).
-- Règle déjà tranchée par Nico pour ce cas (18/10, Régis : 20261018_regis_doublons_recreation.sql) : GARDER LA 1re COPIE,
-- rattachée à sa fiche (job publié), et RETIRER L'AUTRE par le circuit normal (retrait par l'extension de Vincent, numéro
-- exact, gardes comprises). Aucune annonce touchée à la main. 0 mail. Cause corrigée dans la règle (25/10) : titre servi
-- sans saut de ligne, copie reconnue au texte reçu par le formulaire, dépôt d'issue inconnue retenu jusqu'à la preuve.
-- Sauvegarde : _backup_2510_vincent_champavert. Inverse : 20261025_vincent_champavert_doublon_INVERSE.sql (un retrait
-- déjà exécuté chez Vinted ne se défait pas).
begin;
set local lock_timeout = '5s';

create table if not exists public._backup_2510_vincent_champavert (
  quoi text primary key, ligne jsonb not null, le timestamptz not null default now());
alter table public._backup_2510_vincent_champavert enable row level security;
revoke all on table public._backup_2510_vincent_champavert from public, anon, authenticated;

-- Gardes : l'état relu ce matin, sinon rien n'est écrit.
do $$
begin
  if not exists (select 1 from public.cross_post_jobs
                  where id = '9138772c-07a1-41cd-ba0c-38d7ed2497a8' and user_id = '67a8b907-29dd-4454-9d40-db8dd9107236'
                    and status = 'needs_user' and platform_fields ->> 'republish_step' = 'deleted') then
    raise exception 'job 9138772c plus dans l''état relu (needs_user, étape deleted) — réparation arrêtée';
  end if;
  if not exists (select 1 from public.inventaire
                  where id = 1792842213155002 and user_id = '67a8b907-29dd-4454-9d40-db8dd9107236'
                    and statut = 'stock' and coalesce(quantite, 1) = 1 and vinted_item_id = '3532781567') then
    raise exception 'fiche 1792842213155002 plus dans l''état relu — réparation arrêtée';
  end if;
  if exists (select 1 from public.inventaire where user_id = '67a8b907-29dd-4454-9d40-db8dd9107236'
               and vinted_item_id in ('10514173498', '10514978864'))
     or exists (select 1 from public.cross_post_jobs where user_id = '67a8b907-29dd-4454-9d40-db8dd9107236'
               and (platform_listing_id in ('10514173498', '10514978864')
                    or listing_url ~ '/items/(10514173498|10514978864)')) then
    raise exception 'une des deux copies est déjà connue de FillSell — réparation arrêtée';
  end if;
end $$;

insert into public._backup_2510_vincent_champavert (quoi, ligne)
select 'job_9138772c', to_jsonb(j) from public.cross_post_jobs j where j.id = '9138772c-07a1-41cd-ba0c-38d7ed2497a8'
on conflict (quoi) do nothing;
insert into public._backup_2510_vincent_champavert (quoi, ligne)
select 'fiche_1792842213155002', jsonb_build_object('vinted_item_id', i.vinted_item_id, 'disparu_le', i.disparu_le,
         'listed_at_guess', i.listed_at_guess, 'last_synced_at', i.last_synced_at)
  from public.inventaire i where i.id = 1792842213155002
on conflict (quoi) do nothing;

-- 1. La fiche prend le numéro de la 1re copie (comme le chemin de succès de l'extension).
update public.inventaire set vinted_item_id = '10514173498', disparu_le = null,
       listed_at_guess = '2026-10-24T16:53:11Z', last_synced_at = now()
 where id = 1792842213155002 and user_id = '67a8b907-29dd-4454-9d40-db8dd9107236' and vinted_item_id = '3532781567';

-- 2. La republication est close en succès sur la 1re copie (plus jamais servie : aucun troisième dépôt).
update public.cross_post_jobs
   set status = 'published', error = null,
       listing_url = 'https://www.vinted.fr/items/10514173498', platform_listing_id = '10514173498',
       published_at = '2026-10-24T16:53:11Z',
       platform_fields = (platform_fields - 'next_action_after' - 'needs_user_source' - 'error_technique'
                          - 'processing_since' - 'mur_geste' - 'mur_antirobot' - 'depot_incertain')
         || jsonb_build_object('republish_step', 'recreated', 'recreated_at', '2026-10-24T16:53:11Z',
              'old_vinted_item_id', '3532781567', 'new_vinted_item_id', '10514173498',
              'depot_incertain_tranche', platform_fields -> 'depot_incertain',
              'reconciliation', 'rattachée le 25/10 (règle du 18/10, Régis) : 1re des 2 copies nées de nos deux envois (18:53:11 et 19:46:01 Paris), relues sur le dressing public de @striike (titre tapé sans le saut de ligne, prix, photos, état)',
              'doublons_recreation_2510', jsonb_build_object('garde', '10514173498',
                 'retirees', jsonb_build_array('10514978864'),
                 'le', now(), 'par', 'scripts/reparations/20261025_vincent_champavert_doublon.sql'))
 where id = '9138772c-07a1-41cd-ba0c-38d7ed2497a8' and user_id = '67a8b907-29dd-4454-9d40-db8dd9107236'
   and status = 'needs_user';

-- 3. La copie en trop part par le circuit normal de retrait (même forme que le 18/10, doublon_de_republication).
insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, voie, title,
                                    listing_url, platform_listing_id, platform_fields)
values ('67a8b907-29dd-4454-9d40-db8dd9107236', 1792842213155002, 'vinted', 'delete', 'pending', 'original', 'extension',
        'Champavert, le lycanthrope Par Pétrus Borel',
        'https://www.vinted.fr/items/10514978864', '10514978864',
        jsonb_build_object(
          'arme_par', jsonb_build_object('chemin', 'doublon_de_republication', 'republication', '9138772c-07a1-41cd-ba0c-38d7ed2497a8',
                                         'garde', '10514173498', 'le', now(),
                                         'pose_par', 'Claude 25/10 — règle du 18/10 (Régis) : garder la 1re copie, retirer l''autre'),
          'vinted_account_id', '21011125'));

-- Relecture (attendu : job publié sur 10514173498, fiche sur 10514173498, un retrait pending sur 10514978864, 0 mail).
select j.status, j.platform_listing_id, i.vinted_item_id,
       (select count(*) from public.cross_post_jobs d where d.user_id = j.user_id and d.action = 'delete'
          and d.platform_listing_id = '10514978864' and d.status = 'pending') as retrait_en_file,
       (select count(*) from public.email_logs e where e.user_id = j.user_id and e.sent_at > now() - interval '5 minutes') as mails
  from public.cross_post_jobs j join public.inventaire i on i.id = j.inventaire_id
 where j.id = '9138772c-07a1-41cd-ba0c-38d7ed2497a8';

commit;
