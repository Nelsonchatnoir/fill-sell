-- ═══════════════════════════════════════════════════════════════════════════
-- DEPOP : ACCÈS BÊTA DU SEUL COMPTE DE NICO (09/10/2026, chantier Depop, § 3)
-- Pose profiles.beta_flags.depop = true sur nicolas.svobodny (f44b5917…) et
-- RIEN d'autre (fusion de clé : les autres drapeaux du compte restent).
-- Sauvegarde avant, inverse : 20261009_depop_beta_nico_INVERSE.sql.
--   npx supabase db query --linked -f scripts/reparations/20261009_depop_beta_nico.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0910_depop_beta AS
  SELECT id, beta_flags, now() AS sauvegarde_le FROM public.profiles WHERE false;
INSERT INTO public._backup_0910_depop_beta (id, beta_flags, sauvegarde_le)
  SELECT id, beta_flags, now() FROM public.profiles WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
UPDATE public.profiles SET beta_flags = COALESCE(beta_flags, '{}'::jsonb) || '{"depop": true}'::jsonb
 WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
SELECT id, beta_flags -> 'depop' AS depop, public.depop_autorise(id) AS autorise FROM public.profiles WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
COMMIT;
