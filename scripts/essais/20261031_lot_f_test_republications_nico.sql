-- LOT F (31/10) — non-régression, compte de Nico : republication des 4 annonces de test à 999 € (Vinted, Depop,
-- Leboncoin, Beebs) par le geste de l'app (spend_coins_and_republish, comme src/utils/republication.js et
-- src/utils/vintedSync.js), sous ses claims. Les annonces viennent d'être publiées par l'extension 0.6.162 (leur numéro
-- n'est encore dans aucun relevé : la garde « cible actuelle » les laisse partir). Retrait : …_RETRAIT.sql.
begin;
create temp table _cibles on commit drop as
  select j.inventaire_id, j.platform, j.platform_listing_id
    from cross_post_jobs j
   where j.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and j.inventaire_id in (1793438600000, 1793438600001)
     and j.action = 'publish' and j.status = 'published';
grant select on _cibles to authenticated;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
set local role authenticated;
select c.platform,
       case when c.platform = 'vinted'
            then public.spend_coins_and_republish(c.inventaire_id, c.platform_listing_id, 'manuel', null, null)
            else public.spend_coins_and_republish(c.inventaire_id, null, 'manuel', null, c.platform) end as republication
  from _cibles c order by c.platform;
reset role;
select left(id::text, 8) job, platform, action, status, platform_listing_id, platform_fields ->> 'republish_step' etape
  from cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and inventaire_id in (1793438600000, 1793438600001)
   and action = 'republish' order by platform;
commit;
