-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260705215314 « cross_post_jobs_add_dry_run_completed_status » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.cross_post_jobs DROP CONSTRAINT IF EXISTS cross_post_jobs_status_check;
ALTER TABLE public.cross_post_jobs ADD CONSTRAINT cross_post_jobs_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'processing'::text, 'published'::text,
    'failed'::text, 'sold'::text, 'cancelled'::text,
    'dry_run_completed'::text
  ]));
