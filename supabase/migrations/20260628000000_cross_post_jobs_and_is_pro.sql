-- Add is_pro flag to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_pro BOOLEAN DEFAULT FALSE;

-- cross_post_jobs : listing engine jobs (unit + bulk)
CREATE TABLE IF NOT EXISTS public.cross_post_jobs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  inventaire_id    BIGINT      REFERENCES public.inventaire(id) ON DELETE SET NULL,
  platform         TEXT        NOT NULL CHECK (platform IN ('vinted', 'leboncoin', 'beebs', 'ebay', 'vestiaire')),
  status           TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'published', 'failed')),
  photo_option     TEXT        NOT NULL DEFAULT 'standard' CHECK (photo_option IN ('standard', 'ia')),
  bulk_batch_id    UUID,
  title            TEXT,
  description      TEXT,
  price            NUMERIC,
  photos           JSONB,      -- [{original, bg_removed, enhanced}]
  platform_listing_id TEXT,   -- URL ou ID de l'annonce publiée côté plateforme
  generated_at     TIMESTAMPTZ,
  published_at     TIMESTAMPTZ,
  error            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.cross_post_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cross_post_jobs"
  ON public.cross_post_jobs
  FOR ALL
  TO authenticated
  USING  ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cross_post_jobs TO authenticated;

-- Indexes
CREATE INDEX IF NOT EXISTS cross_post_jobs_user_status  ON public.cross_post_jobs (user_id, status);
CREATE INDEX IF NOT EXISTS cross_post_jobs_bulk_batch   ON public.cross_post_jobs (bulk_batch_id) WHERE bulk_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cross_post_jobs_created      ON public.cross_post_jobs (created_at DESC);
