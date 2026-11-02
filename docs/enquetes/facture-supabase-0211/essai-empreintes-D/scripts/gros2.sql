select * from (select name, (metadata->>'size')::bigint as taille, metadata->>'mimetype' as type from storage.objects where bucket_id = 'listing-photos' and metadata->>'mimetype' = 'image/png' order by (metadata->>'size')::bigint desc nulls last limit 20) a
union all
select * from (select name, (metadata->>'size')::bigint, metadata->>'mimetype' from storage.objects where bucket_id = 'listing-photos' and metadata->>'mimetype' = 'image/jpeg' order by (metadata->>'size')::bigint desc nulls last limit 20) b
union all
select * from (select name, (metadata->>'size')::bigint, metadata->>'mimetype' from storage.objects where bucket_id = 'listing-photos' and metadata->>'mimetype' = 'image/webp' order by (metadata->>'size')::bigint desc nulls last limit 5) c
