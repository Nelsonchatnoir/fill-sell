-- BANC FIGÉ « correspondances apprises » (18/10, lot 2) — scripts/banc-deduction-apprise.mjs.
-- Même règle que deduction_apprise_reconstruire() (migration 20261018120000), APPRISE sur les données d'avant la
-- date de coupe, TESTÉE sur les annonces acceptées en ligne après (jobs publiés/vendus). Vérité terrain : la valeur
-- acceptée en ligne. Un champ n'est servi que s'il fait 0 faux ici.
with vcat as (
  select id inventaire_id, vinted_catalog_id::text v from inventaire where vinted_catalog_id is not null
  union all
  select * from (select distinct on (inventaire_id) inventaire_id, platform_fields->'republish_snapshot'->>'catalog_id' v
                 from cross_post_jobs where platform='vinted' and action='republish'
                   and platform_fields->'republish_snapshot' ? 'catalog_id' and inventaire_id is not null
                 order by inventaire_id, created_at desc) x
), vc as (select distinct on (inventaire_id) inventaire_id, v from vcat where v ~ '^\d+$' order by inventaire_id),
acc as (
  select distinct on (j.inventaire_id, j.platform) j.user_id, j.inventaire_id, j.platform, j.created_at, j.platform_fields pf
  from cross_post_jobs j
  where j.status in ('published','sold') and j.action in ('publish','republish')
    and coalesce(j.handler_build,'') not like 'releve%' and j.platform in ('leboncoin','beebs','ebay') and j.inventaire_id is not null
  order by j.inventaire_id, j.platform, j.created_at desc
), obs as (
  select a.user_id, a.inventaire_id, a.created_at, 'leboncoin' platform,
         a.pf->'lbcCategoryPath'->>(jsonb_array_length(a.pf->'lbcCategoryPath')-1) categorie, kv.key champ, btrim(kv.value #>> '{}') valeur, 'job' origine
  from acc a cross join lateral jsonb_each(case when jsonb_typeof(a.pf->'lbcAspects')='object' then a.pf->'lbcAspects' else '{}'::jsonb end) kv
  where a.platform='leboncoin' and jsonb_typeof(a.pf->'lbcCategoryPath')='array' and jsonb_typeof(kv.value) in ('string','number')
  union all
  select a.user_id, a.inventaire_id, a.created_at, 'ebay', a.pf->>'ebayCategoryId', kv.key, btrim(kv.value #>> '{}'), 'job'
  from acc a cross join lateral jsonb_each(case when jsonb_typeof(a.pf->'ebayAspects')='object' then a.pf->'ebayAspects' else '{}'::jsonb end) kv
  where a.platform='ebay' and coalesce(a.pf->>'ebayCategoryId','') <> '' and jsonb_typeof(kv.value) in ('string','number')
  union all
  select a.user_id, a.inventaire_id, a.created_at, 'beebs', btrim(regexp_replace(a.pf->>'beebsCategoryPath', '^.*>', '')), c.k, btrim(a.pf->>c.k), 'job'
  from acc a cross join (values ('genre'), ('age')) c(k)
  where a.platform='beebs' and coalesce(a.pf->>'beebsCategoryPath','') <> '' and jsonb_typeof(a.pf->c.k) in ('string','number')
  union all
  select a.user_id, a.inventaire_id, a.created_at, 'leboncoin', btrim(a.capture->>'categorie'), e->>'key', btrim(e->>'value_label'), 'releve'
  from annonces_plateforme a cross join lateral jsonb_array_elements(a.capture->'attributs_bruts') e
  where a.platform='leboncoin' and a.inventaire_id is not null and jsonb_typeof(a.capture->'attributs_bruts')='array'
    and e->>'key_label' is not null and coalesce(a.capture->>'categorie','') <> ''
), o2 as (
  select o.*, vc.v from obs o left join vc using (inventaire_id)
  where coalesce(o.valeur,'') <> '' and coalesce(o.categorie,'') <> '' and not public.deduction_champ_interdit(o.champ)
    and char_length(o.valeur) <= 120
),
r_v as (select platform, categorie, champ, v, min(valeur) valeur from o2 where created_at < '__COUPE__' and v is not null group by 1,2,3,4
        having count(distinct lower(valeur)) = 1 and count(distinct inventaire_id) >= 4 and count(distinct user_id) >= 2),
r_c as (select platform, categorie, champ, min(valeur) valeur from o2 where created_at < '__COUPE__' group by 1,2,3
        having count(distinct lower(valeur)) = 1 and count(distinct inventaire_id) >= 8 and count(distinct user_id) >= 3),
test as (select * from o2 where origine = 'job' and created_at >= '__COUPE__'),
res as (
  select t.platform, t.champ, t.inventaire_id, t.valeur vraie, coalesce(rv.valeur, rc.valeur) proposee
  from test t
  left join r_v rv on rv.platform=t.platform and rv.categorie=t.categorie and rv.champ=t.champ and rv.v=t.v
  left join r_c rc on rc.platform=t.platform and rc.categorie=t.categorie and rc.champ=t.champ
)
select platform, champ, count(*) test, count(proposee) couverts,
       count(*) filter (where lower(proposee) = lower(vraie)) justes, count(*) filter (where lower(proposee) <> lower(vraie)) faux,
       (array_agg(inventaire_id order by inventaire_id) filter (where proposee is not null))[1:60] articles
from res group by 1, 2 having count(proposee) > 0 order by 1, 4 desc;
