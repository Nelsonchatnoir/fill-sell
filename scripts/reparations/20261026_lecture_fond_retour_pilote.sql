-- 26/10 (urgence « la publication est devenue lente », décision de Nico : « si elle ralentit, même un peu, on revient
-- comme avant ») : coin_config.lecture_fond_mode revient à la valeur qu'il avait AVANT le 25/10 18:23:21 — la clé
-- n'existait pas (coin_config_journal : avant = NULL), donc mode par défaut 1 = le poste pilote de Nico seul, en
-- mesure. Les comptes payants ne lisent plus en arrière-plan ; la lecture AU CLIC (demandée) reste.
-- Inverse : scripts/reparations/20261025_lecture_fond_payants.sql (remet 2 ; refuse si la clé existe déjà).
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF (SELECT value FROM public.coin_config WHERE key = 'lecture_fond_mode') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'lecture_fond_mode n''est pas 2 (valeur %) : relire avant de toucher', (SELECT value FROM public.coin_config WHERE key = 'lecture_fond_mode');
  END IF;
END $$;
INSERT INTO public.coin_config_journal (key, avant, apres, par)
SELECT 'lecture_fond_mode', value, NULL,
       'décision de Nico 26/10 (lenteur de publication) : retour à la valeur d''avant le 25/10 18:23 (absente = 1, pilote seul) — scripts/reparations/20261026_lecture_fond_retour_pilote.sql'
  FROM public.coin_config WHERE key = 'lecture_fond_mode';
DELETE FROM public.coin_config WHERE key = 'lecture_fond_mode';
SELECT count(*) AS reste FROM public.coin_config WHERE key = 'lecture_fond_mode';
COMMIT;
