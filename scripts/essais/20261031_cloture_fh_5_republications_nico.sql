-- CLÔTURE DES LOTS F ET H (31/10) — compte de Nico, non-régression : republication MANUELLE (« Remonter »,
-- spend_coins_and_republish, sous ses claims) des annonces de test publiées par …_4 (Vinted, Leboncoin), file ACTIVE,
-- get-pending-jobs v313 en production. Attendu : chaque annonce retirée puis recréée sous un nouveau numéro, aucune
-- annonce en double. Les numéros sont lus dans les jobs de …_4 (jamais saisis). Aucun mail.
begin;
create temp table _pub on commit drop as
  select j.platform, j.inventaire_id, j.platform_listing_id from cross_post_jobs j
   where j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and j.inventaire_id in (1793438700000, 1793438700001)
     and j.action = 'publish' and j.status = 'published' and j.platform_fields ->> 'test_nico' = 'clôture F-H 31/10 non-régression'
     and j.platform_listing_id is not null;
grant select on _pub to authenticated;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.spend_coins_and_republish(1793438700000, (select platform_listing_id from _pub where platform = 'vinted'), 'manuel', null, null) as republication_vinted;
select public.spend_coins_and_republish(1793438700001, null, 'manuel', null, 'leboncoin') as republication_leboncoin;
reset role;
select left(id::text, 8) job, platform, action, status, platform_listing_id, platform_fields ->> 'republish_step' etape
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and inventaire_id in (1793438700000, 1793438700001)
   and action = 'republish' and status in ('pending', 'processing', 'needs_user') order by platform;
commit;
