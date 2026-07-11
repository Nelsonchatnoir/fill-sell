-- Synchronisation vente cross-plateforme (2026-07-11, Phase B) :
-- les jobs de SUPPRESSION d'annonce réutilisent le pipeline cross_post_jobs
-- (get-pending-jobs → background → content scripts) avec action='delete'.
--   action  : 'publish' (défaut, tous les jobs existants) | 'delete'
--   status  : + 'deleted' — terminal d'un job delete exécuté en LIVE
--             (le DRY_RUN d'un delete termine en dry_run_completed, comme
--             la publication).
ALTER TABLE public.cross_post_jobs
  ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'publish';

ALTER TABLE public.cross_post_jobs
  ADD CONSTRAINT cross_post_jobs_action_check
  CHECK (action = ANY (ARRAY['publish'::text, 'delete'::text]));

ALTER TABLE public.cross_post_jobs
  DROP CONSTRAINT cross_post_jobs_status_check;

ALTER TABLE public.cross_post_jobs
  ADD CONSTRAINT cross_post_jobs_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'processing'::text, 'published'::text, 'failed'::text,
    'sold'::text, 'cancelled'::text, 'dry_run_completed'::text, 'deleted'::text
  ]));
