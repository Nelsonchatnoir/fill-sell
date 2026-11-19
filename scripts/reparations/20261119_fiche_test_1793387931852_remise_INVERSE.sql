-- INVERSE de 20261119_fiche_test_1793387931852_remise.sql : les attributs reviennent de la sauvegarde.
BEGIN;
UPDATE public.inventaire i SET attributs = b.attributs FROM public._backup_1911_fiche_1793387931852 b WHERE i.id = b.id;
SELECT id, attributs -> 'taille' AS taille, attributs -> 'couleur' AS couleur, attributs -> 'matiere' AS matiere FROM public.inventaire WHERE id = 1793387931852;
COMMIT;
