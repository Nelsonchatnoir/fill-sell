-- ALLUMER le rythme par plateforme (migration 20261025200000) — décision de Nico : SEULEMENT quand la 0.6.144 est
-- acceptée par le Chrome Web Store ET servie (profiles.extension_build des postes : build 2026-10-25T15:28:19Z+7b08e45).
-- Effet au passage suivant du balayage (3 min) : chaque plateforme compte son attente depuis SA dernière republication.
-- Éteindre : 20261025_rythme_par_plateforme_eteindre.sql (effet immédiat, rien d'autre ne bouge).
BEGIN;
SET LOCAL lock_timeout = '5s';
INSERT INTO public.coin_config (key, value, updated_at) VALUES ('republish_rythme_par_plateforme', 1, now())
ON CONFLICT (key) DO UPDATE SET value = 1;     -- une modification est journalisée par coin_config_trace
INSERT INTO public.coin_config_journal (key, avant, apres, par)
SELECT 'republish_rythme_par_plateforme', NULL, 1, 'création : scripts/reparations/20261025_rythme_par_plateforme_allumer.sql'
 WHERE NOT EXISTS (SELECT 1 FROM public.coin_config_journal WHERE key = 'republish_rythme_par_plateforme');
SELECT key, value, updated_at FROM public.coin_config WHERE key = 'republish_rythme_par_plateforme';
COMMIT;
