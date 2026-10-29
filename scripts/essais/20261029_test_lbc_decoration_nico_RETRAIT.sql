-- RETRAIT du test Leboncoin « Décoration » du 29/10 soir (scripts/essais/20261029_test_lbc_decoration_nico.sql), compte de Nico.
--   npx supabase db query --linked -f scripts/essais/20261029_test_lbc_decoration_nico_RETRAIT.sql
-- Le geste « Retirer de Leboncoin » de l'app (StockTab, armRemoveJob), sous les claims de Nico. Le job de dépôt ne porte
-- pas encore d'URL (le relevé la pose) : l'adresse est celle que l'extension et le serveur ouvrent pour une annonce
-- Leboncoin (/ad/decoration/<numéro>, _shared/annonce-lien.ts), relue en ligne le 29/10 au soir (panneau « Gestion de mon
-- annonce »). Puis la file remise en pause (scripts/essais/20261029_test_bijoux_ebay_nico_FIN.sql).
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
select j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original', j.title,
       coalesce(j.listing_url, 'https://www.leboncoin.fr/ad/decoration/' || j.platform_listing_id), '{}'::jsonb
from public.cross_post_jobs j
where j.inventaire_id = 1793287500000 and j.platform = 'leboncoin' and j.action = 'publish' and j.status = 'published'
  and j.platform_listing_id = '3297735492'
  and not exists (select 1 from public.cross_post_jobs d where d.inventaire_id = j.inventaire_id and d.platform = j.platform and d.action = 'delete');
select left(id::text, 8) as job, platform, action, status, listing_url from public.cross_post_jobs
where inventaire_id = 1793287500000 order by action;
commit;
