-- Bucket temporaire pour les photos Lens (supprimées après analyse)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('lens-temp', 'lens-temp', true, 20971520)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "lens_temp_insert" ON storage.objects;
DROP POLICY IF EXISTS "lens_temp_delete" ON storage.objects;
DROP POLICY IF EXISTS "lens_temp_select" ON storage.objects;

CREATE POLICY "lens_temp_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lens-temp'
    AND (storage.foldername(name))[1] = 'lens'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "lens_temp_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'lens-temp'
    AND (storage.foldername(name))[1] = 'lens'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "lens_temp_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'lens-temp');
