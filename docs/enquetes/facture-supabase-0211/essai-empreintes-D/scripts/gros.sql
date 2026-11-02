with o as (
  select name, (metadata->>'size')::bigint as taille, metadata->>'mimetype' as type
  from storage.objects where bucket_id = 'listing-photos' and name not like '%__mini%'
)
select 'stats' as k, count(*) as n, round(avg(taille)) as moyenne, max(taille) as max,
  count(*) filter (where taille > 8*1024*1024) as plus_8mo,
  count(*) filter (where taille > 4*1024*1024) as plus_4mo,
  count(*) filter (where taille > 2*1024*1024) as plus_2mo,
  string_agg(distinct type, ',') as types, null::text as name
from o
union all
select * from (select 'gros', null::bigint, null::numeric, taille, null::bigint, null::bigint, null::bigint, type, name from o order by taille desc nulls last limit 40) g
