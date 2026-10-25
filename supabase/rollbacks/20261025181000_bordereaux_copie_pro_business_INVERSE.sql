-- INVERSE de 20261025181000_bordereaux_copie_pro_business : la politique d'avant, relue en prod le 25/10 à 18:03
-- (pg_policies : bordereaux_insert, INSERT, authenticated, messagerie_beta seul).
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP POLICY IF EXISTS bordereaux_insert ON storage.objects;
CREATE POLICY bordereaux_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bordereaux' AND (storage.foldername(name))[1] = (auth.uid())::text AND public.messagerie_beta(auth.uid()));
COMMIT;
