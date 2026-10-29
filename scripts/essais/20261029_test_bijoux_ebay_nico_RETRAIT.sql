-- RETRAIT du test du 29/10 soir (scripts/essais/20261029_test_bijoux_ebay_nico.sql), compte de Nico.
--   npx supabase db query --linked -f scripts/essais/20261029_test_bijoux_ebay_nico_RETRAIT.sql
-- Le geste « Retirer de <plateforme> » de l'app, à l'identique (StockTab, armRemoveJob : action delete, pending,
-- photo_option original, titre et listing_url de la publication), sous les claims de Nico. Vinted part par l'extension,
-- eBay par l'API. La fiche et la pause de sa file se remettent APRÈS les retraits
-- (scripts/essais/20261029_test_bijoux_ebay_nico_FIN.sql).
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
select j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original', j.title, j.listing_url, '{}'::jsonb
from public.cross_post_jobs j
where j.inventaire_id = 1793287300000 and j.action = 'publish' and j.status = 'published' and j.listing_url is not null
  and not exists (select 1 from public.cross_post_jobs d where d.inventaire_id = j.inventaire_id and d.platform = j.platform and d.action = 'delete');
select left(id::text, 8) as job, platform, action, status, listing_url from public.cross_post_jobs
where inventaire_id = 1793287300000 order by platform, action;
commit;
