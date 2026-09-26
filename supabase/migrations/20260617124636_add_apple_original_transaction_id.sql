-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260617124636 « add_apple_original_transaction_id » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT;

COMMENT ON COLUMN public.profiles.apple_original_transaction_id
  IS 'Apple originalTransactionId — set by apple-iap-webhook on first SUBSCRIBED/DID_RENEW, used to query App Store Server API';
