-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260915122754 « opla_plateformes_visibles_colonne » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plateformes_visibles text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.profiles.plateformes_visibles IS
  'Plateformes visibles PAR AVANCE pour ce compte (avant ouverture générale). '
  'AFFICHAGE UNIQUEMENT : n''autorise aucune publication — OPLA_ACTIF '
  '(chrome-extension/handlers/opla.js) reste le seul interrupteur de dépôt, et '
  'il est séparé. Pas d''UPDATE accordé à authenticated : bascule en SQL.';
