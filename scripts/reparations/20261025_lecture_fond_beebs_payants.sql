-- PRÉPARÉ, NON LANCÉ (décision de Nico, 25/10 soir : « Prépare dès maintenant l'activation chez les payants, derrière
-- un interrupteur DÉSACTIVÉ ») — OUVRIR la lecture de fond BEEBS aux comptes payants.
-- À lancer SEULEMENT quand : (1) le pilote sur le poste de Nico est PROPRE (depuis le 25/10 19:18, ≥ 48 h, critères dans
-- docs/enquetes/soir-2510/RAPPORT.md § Beebs) ; (2) la 0.6.145 est ACCEPTÉE et SERVIE par le Chrome Web Store (le serveur
-- ne sert la lecture Beebs qu'aux postes ≥ 0.6.145 : les autres ne lisent rien).
-- Interrupteur : coin_config.lecture_fond_mode_beebs — absent = 1 (le pilote seul, en mesure) ; 2 = payants ; 3 = tous ;
-- 0 = coupé partout. Couper : UPDATE public.coin_config SET value = 0 WHERE key = 'lecture_fond_mode_beebs';
-- Inverse : 20261025_lecture_fond_beebs_payants_INVERSE.sql (retour au pilote seul).
BEGIN;
SET LOCAL lock_timeout = '5s';
INSERT INTO public.coin_config (key, value, updated_at) VALUES ('lecture_fond_mode_beebs', 2, now())
ON CONFLICT (key) DO UPDATE SET value = 2;     -- une modification est journalisée par coin_config_trace
INSERT INTO public.coin_config_journal (key, avant, apres, par)
SELECT 'lecture_fond_mode_beebs', NULL, 2, 'création : scripts/reparations/20261025_lecture_fond_beebs_payants.sql'
 WHERE NOT EXISTS (SELECT 1 FROM public.coin_config_journal WHERE key = 'lecture_fond_mode_beebs');
SELECT key, value, updated_at FROM public.coin_config WHERE key = 'lecture_fond_mode_beebs';
COMMIT;
