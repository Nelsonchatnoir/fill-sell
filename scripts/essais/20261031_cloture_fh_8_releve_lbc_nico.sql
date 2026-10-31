-- CLÔTURE DES LOTS F ET H (31/10) — compte de Nico, point 7a : le geste « Synchroniser » Leboncoin de l'app
-- (demander_sync_plateforme, sous ses claims) PENDANT que la republication de test fc8c5e64 attend à l'étape
-- « captured » (republication engagée). Attendu : relevé complet, aucune annonce datée disparue (republication_engagee),
-- puis la republication aboutit normalement ; après elle, la nouvelle annonce se rattache PAR SON NUMÉRO. Aucun mail.
begin;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select public.demander_sync_plateforme('leboncoin') as releve_leboncoin;
reset role;
select left(id::text, 8) job, platform, status, platform_fields ->> 'republish_step' etape, platform_listing_id
  from cross_post_jobs where id::text like 'fc8c5e64%';
commit;
