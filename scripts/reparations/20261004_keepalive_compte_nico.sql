-- ═══════════════════════════════════════════════════════════════════════════
-- PORT DE MAINTIEN EN VIE : ALLUMÉ POUR LE COMPTE DE NICO, À L'ESSAI (04/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- Interrupteur général coin_config.keepalive_actif = 0 depuis le 17/09 (les
-- tests réels n'avaient jamais été faits). gpj v210 l'allume compte par
-- compte (profiles.beta_flags.keepalive = true). D'abord le compte de Nico,
-- pour un dépôt réel de test (999 €) sur son poste ; Ciddjy ensuite, si le
-- test passe (20261004_keepalive_compte_ciddjy.sql).
-- Inverse : 20261004_keepalive_compte_nico_INVERSE.sql.
CREATE TABLE IF NOT EXISTS public.sauvegarde_keepalive_20261004 AS
  SELECT id, beta_flags, now() AS sauvegarde_le FROM public.profiles WHERE false;
INSERT INTO public.sauvegarde_keepalive_20261004 (id, beta_flags, sauvegarde_le)
  SELECT id, beta_flags, now() FROM public.profiles
   WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
     AND NOT EXISTS (SELECT 1 FROM public.sauvegarde_keepalive_20261004 s WHERE s.id = profiles.id);
UPDATE public.profiles SET beta_flags = COALESCE(beta_flags, '{}'::jsonb) || '{"keepalive": true}'::jsonb
 WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
SELECT id, beta_flags FROM public.profiles WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
