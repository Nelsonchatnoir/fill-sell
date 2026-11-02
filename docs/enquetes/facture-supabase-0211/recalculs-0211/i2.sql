select name n, metadata->>'eTag' e, (metadata->>'size')::bigint t, created_at c from storage.objects where bucket_id='listing-photos';
