-- ═══════════════════════════════════════════════════════════════════════════
-- 25/10 soir — feu vert nommé de Nico (point 4) : « Lecture des descriptions dès l'import : ouverte aux comptes payants
-- dès que la 0.6.144 est servie. »
-- coin_config.lecture_fond_mode = 2 (comptes payants : Premium, Pro, Business, et le pilote). Le serveur ne sert la
-- lecture qu'à une extension ≥ 0.6.144 (get-pending-jobs : versionAuMoins(version, LECTURE_FOND_VERSION_MIN)) : poser
-- le mode maintenant l'ouvre à chaque compte payant AU MOMENT où son Chrome reçoit la 0.6.144 du Web Store — aucun
-- compte en 0.6.141 ne lit rien d'ici là. Relu le 25/10 à 18:25 : la 0.6.144 n'est encore que sur le poste de Nico ;
-- 36 comptes payants ont une extension vue depuis 3 jours.
-- Rythme inchangé (_shared/lecture-fond.js) : 3 pages publiques par poll (un poll toutes les 2 min), 20 à 45 s entre
-- deux pages, 300 par jour et par compte ; le premier refus de Vinted coupe le compte 6 h (serveur ET extension) ;
-- ops-digest compte les refus du parc chaque jour. Coût serveur mesuré (EXPLAIN ANALYZE, compte payant de 1 380
-- fiches) : 6 ms par poll.
-- Couper tout le monde : UPDATE coin_config SET value = 0 WHERE key = 'lecture_fond_mode'.
-- Inverse : 20261025_lecture_fond_payants_INVERSE.sql (retour au mode par défaut 1 : le pilote seul, en mesure).
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.coin_config WHERE key = 'lecture_fond_mode') THEN
    RAISE EXCEPTION 'lecture_fond_mode existe déjà (valeur %) : relire avant de toucher', (SELECT value FROM public.coin_config WHERE key = 'lecture_fond_mode');
  END IF;
  INSERT INTO public.coin_config (key, value, updated_at) VALUES ('lecture_fond_mode', 2, now());
  -- Le déclencheur coin_config_trace ne journalise qu'une MODIFICATION : la création est journalisée ici.
  INSERT INTO public.coin_config_journal (key, avant, apres, par)
  VALUES ('lecture_fond_mode', NULL, 2, 'feu vert de Nico 25/10 soir : payants dès la 0.6.144 servie (scripts/reparations/20261025_lecture_fond_payants.sql)');
END $$;
SELECT key, value, updated_at FROM public.coin_config WHERE key = 'lecture_fond_mode';
COMMIT;
