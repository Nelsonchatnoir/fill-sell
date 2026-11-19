-- (19/11/2026 soir) ALLUMAGE de la relance « Vendu, encore en ligne » / « Déjà vendu ? » (décision de Nico du 19/11 :
-- « La relance automatique, c'est TOI qui l'allumes après selftest et un essai réel »). Interrupteur posé à 0 par la
-- migration 20261119180000. Selftest : rappel-encore-en-ligne (suite complète 897/897 le 19/11). Essai à blanc local sur
-- les données de prod (notesRappel / aMontrer, lecture seule, 19/11 ~15:55) : 167 questions ; bandeau = 86 questions sur
-- 30 comptes ; 24 notes push au premier passage (rang 1), dont 4 comptes avec un appareil ; compte de Nico : bandeau 2.
-- Inverse : 20261119_rappel_encore_en_ligne_on_INVERSE.sql (remet 0 : ni bandeau ni push).
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE public._backup_1911_rappel_encore_en_ligne AS
  SELECT now() AS le, key, value FROM public.coin_config WHERE key = 'rappel_encore_en_ligne_actif';
ALTER TABLE public._backup_1911_rappel_encore_en_ligne ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1911_rappel_encore_en_ligne FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF (SELECT value FROM public.coin_config WHERE key = 'rappel_encore_en_ligne_actif') IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'rappel_encore_en_ligne_actif n''est plus 0 (lu le 19/11) : relire';
  END IF;
END $$;
UPDATE public.coin_config SET value = 1, updated_at = now() WHERE key = 'rappel_encore_en_ligne_actif' AND value = 0;
SELECT key, value, updated_at FROM public.coin_config WHERE key = 'rappel_encore_en_ligne_actif';
COMMIT;
