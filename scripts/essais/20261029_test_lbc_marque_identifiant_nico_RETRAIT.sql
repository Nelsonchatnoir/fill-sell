-- RETRAIT du test du 29/10 (scripts/essais/20261029_test_lbc_marque_identifiant_nico.sql), compte de Nico — le geste
-- « Retirer de Leboncoin » de l'app (StockTab, armRemoveJob : action delete, pending), sous ses claims. Puis la file
-- remise en pause (même geste que le bouton de l'app). La fiche de test reste dans son stock (la supprimer est à lui).
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
select j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original', j.title,
       coalesce(j.listing_url, 'https://www.leboncoin.fr/ad/vetements/' || j.platform_listing_id), '{}'::jsonb
from public.cross_post_jobs j
where j.inventaire_id = 1793310000000 and j.action = 'publish' and j.status = 'published'
  and (j.listing_url is not null or j.platform_listing_id ~ '^[0-9]{6,}$')
  and not exists (select 1 from public.cross_post_jobs d where d.inventaire_id = j.inventaire_id and d.platform = j.platform
                  and d.action = 'delete' and d.created_at > j.created_at);
select left(id::text, 8) as job, platform, action, status, listing_url from public.cross_post_jobs
where inventaire_id = 1793310000000 order by action;
commit;
