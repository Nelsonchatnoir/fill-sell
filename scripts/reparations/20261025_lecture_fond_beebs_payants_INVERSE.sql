-- INVERSE de 20261025_lecture_fond_beebs_payants.sql : retour au mode par défaut (1 = le poste pilote seul, en mesure).
-- Pour COUPER tout le monde à la place : UPDATE public.coin_config SET value = 0 WHERE key = 'lecture_fond_mode_beebs';
BEGIN;
SET LOCAL lock_timeout = '5s';
INSERT INTO public.coin_config_journal (key, avant, apres, par)
SELECT 'lecture_fond_mode_beebs', value, NULL, 'inverse de scripts/reparations/20261025_lecture_fond_beebs_payants.sql'
  FROM public.coin_config WHERE key = 'lecture_fond_mode_beebs';
DELETE FROM public.coin_config WHERE key = 'lecture_fond_mode_beebs';
SELECT count(*) AS reste FROM public.coin_config WHERE key = 'lecture_fond_mode_beebs';
COMMIT;
