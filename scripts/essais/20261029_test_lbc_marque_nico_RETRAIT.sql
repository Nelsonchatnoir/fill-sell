-- RETRAIT du test du 29/10 soir (scripts/essais/20261029_test_lbc_marque_nico.sql), compte de Nico.
--   npx supabase db query --linked -f scripts/essais/20261029_test_lbc_marque_nico_RETRAIT.sql
-- Le dépôt ne porte pas encore d'URL (le relevé la pose) : l'adresse /ad/vetements/<numéro> est celle que l'app ouvre.
-- Le geste « Retirer de <plateforme> » de l'app, à l'identique (StockTab, armRemoveJob : action delete, pending,
-- photo_option original, titre et listing_url de la publication), sous les claims de Nico. Leboncoin part par l'extension.
-- Joué pour chaque dépôt du test (0.6.156 puis 0.6.157) : un retrait par dépôt publié sans retrait.
-- La pause de sa file se remet APRÈS les retraits (scripts/essais/20261029_test_texte_vendeur_vinted_nico_FIN.sql).
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_fields)
select j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original', j.title,
       coalesce(j.listing_url, 'https://www.leboncoin.fr/ad/vetements/' || j.platform_listing_id), '{}'::jsonb
from public.cross_post_jobs j
where j.inventaire_id in (1793300200000, 1793300300000) and j.action = 'publish' and j.status = 'published'
  and (j.listing_url is not null or j.platform_listing_id ~ '^[0-9]{6,}$')
  and not exists (select 1 from public.cross_post_jobs d where d.inventaire_id = j.inventaire_id and d.platform = j.platform
                  and d.action = 'delete' and d.created_at > j.created_at);
select left(id::text, 8) as job, inventaire_id, platform, action, status, listing_url from public.cross_post_jobs
where inventaire_id in (1793300200000, 1793300300000) order by inventaire_id, action;
commit;
