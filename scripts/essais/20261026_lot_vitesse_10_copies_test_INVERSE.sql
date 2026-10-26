-- INVERSE de 20261026_lot_vitesse_10_copies_test.sql : supprime les 10 copies de test (1793100000001..010) du compte
-- de Nico et leurs fiches_annonce. Refuse si une publication (cross_post_jobs) en est partie : on retire d'abord
-- l'annonce par l'app, puis on relance cet inverse.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs WHERE inventaire_id BETWEEN 1793100000001 AND 1793100000010
               AND status NOT IN ('cancelled')) THEN
    RAISE EXCEPTION 'une publication est partie d''une copie de test : la retirer d''abord';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inventaire WHERE id BETWEEN 1793100000001 AND 1793100000010
               AND (user_id <> 'f44b5917-bccc-4431-ba41-f40571a2ed18' OR NOT (attributs ? 'essai_vitesse_2610'))) THEN
    RAISE EXCEPTION 'une ligne de cette plage n''est pas une copie de test de Nico : rien supprimé';
  END IF;
END $$;
DELETE FROM public.cross_post_jobs WHERE inventaire_id BETWEEN 1793100000001 AND 1793100000010 AND status = 'cancelled';
DELETE FROM public.fiches_annonce WHERE inventaire_id BETWEEN 1793100000001 AND 1793100000010;
DELETE FROM public.inventaire WHERE id BETWEEN 1793100000001 AND 1793100000010;
SELECT count(*) AS reste FROM public.inventaire WHERE id BETWEEN 1793100000001 AND 1793100000010;
COMMIT;
