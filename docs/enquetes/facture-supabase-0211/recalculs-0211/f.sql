with pe as (select * from photo_empreintes where url like 'https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/%')
select (select count(*) from photo_empreintes) total,
       (select count(*) from pe) bucket,
       (select count(*) from pe where variantes is null) bucket_sans_variantes,
       (select count(*) from photo_empreintes where variantes is null) tout_sans_variantes,
       (select count(*) from pe where url like '%?%') avec_query,
       (select count(*) from pe where calculee_le > now() - interval '24 hours') bucket_24h,
       (select count(*) from pe where calculee_le > now() - interval '24 hours' and source='empreintes-urls') bucket_24h_urls,
       (select json_object_agg(source, n) from (select source, count(*) n from pe where calculee_le > now() - interval '24 hours' group by 1) s) src_24h,
       (select count(*) from storage.objects where bucket_id='listing-photos') objets,
       (select count(*) from storage.objects where bucket_id='listing-photos' and created_at > now() - interval '24 hours') objets_24h,
       now() at time zone 'Europe/Paris' as maintenant;
