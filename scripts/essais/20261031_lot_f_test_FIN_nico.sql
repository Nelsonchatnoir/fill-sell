-- LOT F (31/10) — fin des essais sur le compte de Nico : retrait des annonces de test encore en ligne (geste « Retirer de
-- X » de l'app : job « delete » sur l'annonce actuelle de chaque plateforme, sous ses claims), puis sa file remise EN PAUSE
-- comme il l'avait laissée (bouton de l'app). L'annonce Vinted de la fiche « vendue » pour l'essai (vente déclarée, pas réelle)
-- reçoit aussi son retrait. Les fiches de test restent dans son stock (comme les essais précédents).
begin;
create temp table _actuelles on commit drop as
  select distinct on (j.inventaire_id, j.platform) j.user_id, j.inventaire_id, j.platform, j.title, j.platform_listing_id, j.listing_url
    from cross_post_jobs j
   where j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and j.inventaire_id in (1793438600000, 1793438600001)
     and j.action in ('publish', 'republish') and j.status in ('published', 'sold') and j.platform_listing_id is not null
   order by j.inventaire_id, j.platform, coalesce(j.published_at, j.created_at) desc;
grant select on _actuelles to authenticated;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
select a.user_id, a.inventaire_id, a.platform, 'delete', 'pending', 'original', a.title,
       coalesce(a.listing_url, case a.platform when 'leboncoin' then 'https://www.leboncoin.fr/ad/vetements/' || a.platform_listing_id
                                               when 'vinted' then 'https://www.vinted.fr/items/' || a.platform_listing_id end),
       a.platform_listing_id, '{}'::jsonb
  from _actuelles a
 where not exists (select 1 from public.cross_post_jobs d where d.user_id = a.user_id and d.inventaire_id = a.inventaire_id
                     and d.platform = a.platform and d.action = 'delete' and d.status in ('pending', 'processing', 'needs_user', 'deleted')
                     and coalesce(d.platform_listing_id, '') = coalesce(a.platform_listing_id, ''));
select public.file_pause_basculer(true) as file_remise_en_pause;
reset role;
select left(id::text, 8) job, platform, action, status, platform_listing_id, listing_url
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and inventaire_id in (1793438600000, 1793438600001)
   and action = 'delete' order by platform;
commit;
