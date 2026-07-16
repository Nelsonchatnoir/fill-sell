-- Fix CHECK constraints on cross_post_jobs (too restrictive for current code)

-- status: add 'sold' and 'cancelled'
ALTER TABLE public.cross_post_jobs
  DROP CONSTRAINT IF EXISTS cross_post_jobs_status_check;
ALTER TABLE public.cross_post_jobs
  ADD CONSTRAINT cross_post_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'published', 'failed', 'sold', 'cancelled'));

-- photo_option: add 'ia_multi', 'ia_simple', 'original'
ALTER TABLE public.cross_post_jobs
  DROP CONSTRAINT IF EXISTS cross_post_jobs_photo_option_check;
ALTER TABLE public.cross_post_jobs
  ADD CONSTRAINT cross_post_jobs_photo_option_check
    CHECK (photo_option IN ('standard', 'ia', 'ia_multi', 'ia_simple', 'original'));
