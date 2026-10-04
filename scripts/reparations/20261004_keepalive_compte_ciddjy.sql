-- ═══════════════════════════════════════════════════════════════════════════
-- PORT DE MAINTIEN EN VIE : ALLUMÉ POUR CIDDJY (cielmo) — À LANCER APRÈS LE
-- TEST RÉEL CHEZ NICO SEULEMENT (04/10) — NON LANCÉ
-- ═══════════════════════════════════════════════════════════════════════════
-- Chez Ciddjy (9cdr9rm4rn, eacbe32c), le remplissage Vinted prend 4 à 5 min
-- avant le retrait (mesuré sur 25 republications du 03-04/10) : la borne de
-- 5 min du chemin classique le coupe parfois, la tâche boucle (sortie de
-- boucle depuis ujs v124). Le port (borne 10 min, battement 20 s) le laisse
-- finir. gpj v210 lit profiles.beta_flags.keepalive.
-- Inverse : 20261004_keepalive_compte_ciddjy_INVERSE.sql.
CREATE TABLE IF NOT EXISTS public.sauvegarde_keepalive_20261004 AS
  SELECT id, beta_flags, now() AS sauvegarde_le FROM public.profiles WHERE false;
INSERT INTO public.sauvegarde_keepalive_20261004 (id, beta_flags, sauvegarde_le)
  SELECT id, beta_flags, now() FROM public.profiles
   WHERE id = 'eacbe32c-1929-41a8-927d-7f3cff621f5a'
     AND NOT EXISTS (SELECT 1 FROM public.sauvegarde_keepalive_20261004 s WHERE s.id = profiles.id);
UPDATE public.profiles SET beta_flags = COALESCE(beta_flags, '{}'::jsonb) || '{"keepalive": true}'::jsonb
 WHERE id = 'eacbe32c-1929-41a8-927d-7f3cff621f5a';
SELECT id, beta_flags FROM public.profiles WHERE id = 'eacbe32c-1929-41a8-927d-7f3cff621f5a';
