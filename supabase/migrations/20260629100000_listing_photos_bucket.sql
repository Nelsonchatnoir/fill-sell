-- Create listing-photos bucket (public, 50 MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('listing-photos', 'listing-photos', true, 52428800)
ON CONFLICT (id) DO NOTHING;

-- INSERT: authenticated users can upload to their own folder (userId/...)
DROP POLICY IF EXISTS "listing_photos_insert" ON storage.objects;
CREATE POLICY "listing_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'listing-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT: public read — extension Chrome + acheteurs peuvent lire les photos
DROP POLICY IF EXISTS "listing_photos_select" ON storage.objects;
CREATE POLICY "listing_photos_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'listing-photos');

-- DELETE: owner only
DROP POLICY IF EXISTS "listing_photos_delete" ON storage.objects;
CREATE POLICY "listing_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'listing-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
