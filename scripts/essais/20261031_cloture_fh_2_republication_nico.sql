-- CLÔTURE DES LOTS F ET H (31/10) — compte de Nico, étape 2 : le geste « Republier » de l'app
-- (spend_coins_and_republish, sous ses claims) sur l'annonce de test Vinted publiée à l'étape 1 (999 €), la file
-- EN PAUSE. Attendu : la republication reste EN ATTENTE (retenue par la pause), rien ne part. Étape 3 : son retrait.
-- Le numéro Vinted est lu dans le job de publication de l'étape 1 (jamais saisi). Aucun mail.
begin;
create temp table _pub on commit drop as
  select j.platform_listing_id from cross_post_jobs j
   where j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and j.inventaire_id = 1793438700000 and j.platform = 'vinted'
     and j.action = 'publish' and j.status = 'published' and j.platform_fields ->> 'test_nico' = 'clôture F-H 31/10'
     and j.platform_listing_id is not null
   order by j.created_at desc limit 1;
grant select on _pub to authenticated;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.spend_coins_and_republish(1793438700000, (select platform_listing_id from _pub), 'manuel', null, null) as republication_vinted;
reset role;
select left(id::text, 8) job, platform, action, status, platform_listing_id, platform_fields ->> 'republish_step' etape, left(coalesce(error, ''), 100) err
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and inventaire_id = 1793438700000
   and status in ('pending', 'processing', 'needs_user') order by created_at;
select platform_settings -> 'file_pause' ->> 'active' file_en_pause from profiles where id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
commit;
