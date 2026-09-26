-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260910125227 « profiles_maj_extension_en_attente » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- MISE À JOUR D'EXTENSION EN ATTENTE — mesure (2026-09-10)
-- ═══════════════════════════════════════════════════════════════════════════
-- Chrome TÉLÉCHARGE une nouvelle version puis attend, pour l'installer, que
-- l'extension soit au repos (doc chrome.runtime : « isn't installed
-- immediately because the app is currently running […] the update will be
-- installed the next time the background page gets unloaded »).
-- FillSell poste une alarme toutes les 2 minutes : son service worker n'est
-- quasiment jamais déchargé, et la mise à jour peut attendre indéfiniment.
-- Mesuré le 10/09 : 5 comptes vus dans les 12 h tournaient encore sous 0.6.24,
-- dont josephinecerni en 0.6.22 — le build qui casse Beebs — avec 184 jobs sur
-- 72 h. Et deux comptes SANS aucun job (ibahlife529, anaisb56) étaient tout
-- aussi en retard : ce n'est donc pas le volume, c'est le poll.
--
-- Ces deux colonnes rendent le phénomène LISIBLE : qui a une version qui
-- attend, et depuis quand. Elles ne décident de rien.
--   extension_maj_en_attente : la version que Chrome garde sous le coude
--                              (chrome.runtime.onUpdateAvailable), NULL sinon
--   extension_maj_vue_at     : premier instant où ce build l'a signalée
-- Idempotente : ADD COLUMN IF NOT EXISTS, aucune donnée touchée.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS extension_maj_en_attente text,
  ADD COLUMN IF NOT EXISTS extension_maj_vue_at     timestamptz;

COMMENT ON COLUMN public.profiles.extension_maj_en_attente IS
  'Version d''extension téléchargée par Chrome et EN ATTENTE d''installation (onUpdateAvailable). NULL = rien en attente. Posée et effacée par le background de l''extension via get-pending-jobs.';
COMMENT ON COLUMN public.profiles.extension_maj_vue_at IS
  'Premier instant où la mise à jour en attente a été signalée. Mesure l''ancienneté du blocage.';
