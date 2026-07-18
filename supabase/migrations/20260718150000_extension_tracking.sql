-- Télémétrie extension Chrome (2026-07-18) — support du mail « mise à jour
-- extension » (email-tunnel, mode extension_update) et du futur bandeau de
-- version dans l'app.
--
-- Écrites UNIQUEMENT par get-pending-jobs (service_role) à chaque poll du
-- background de l'extension (~30 min). Nullables : null = extension jamais vue.
-- Aucun GRANT supplémentaire nécessaire (colonnes sur profiles, policies
-- existantes ; le client lit sa propre ligne, service_role bypass RLS).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS extension_last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS extension_build text;

COMMENT ON COLUMN public.profiles.extension_last_seen_at IS
  'Dernier poll get-pending-jobs du background de l''extension Chrome (service_role). Null = extension jamais vue.';
COMMENT ON COLUMN public.profiles.extension_build IS
  'Dernier FILLSELL_BUILD_ID rapporté par l''extension (null tant que l''extension installée ne l''envoie pas encore).';
