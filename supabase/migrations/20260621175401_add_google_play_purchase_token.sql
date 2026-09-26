-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260621175401 « add_google_play_purchase_token » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS google_purchase_token text,
  ADD COLUMN IF NOT EXISTS google_product_id text;

COMMENT ON COLUMN public.profiles.google_purchase_token IS 'Google Play purchaseToken — set by google-play-webhook au premier achat/renouvellement, utilisé pour requêter purchases.subscriptionsv2:get';
COMMENT ON COLUMN public.profiles.google_product_id IS 'Product ID Google Play actif (ex: premium_monthly)';
