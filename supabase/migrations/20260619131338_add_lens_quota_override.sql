-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260619131338 « add_lens_quota_override » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS lens_daily_override integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS lens_monthly_override integer DEFAULT NULL;

COMMENT ON COLUMN public.profiles.lens_daily_override IS 'Si non NULL, remplace la limite Lens/jour par défaut pour ce user (ex: reward early user)';
COMMENT ON COLUMN public.profiles.lens_monthly_override IS 'Si non NULL, remplace la limite Lens/mois par défaut pour ce user';
