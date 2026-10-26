-- INVERSE de 20261026_fiches_test_remise_origine.sql : remet titre et texte d'essai des deux fiches TEST de Nico
-- depuis la sauvegarde (les attributs ne reculent pas : la base n'efface jamais une clé, inventaire_attributs_fusion).
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.inventaire i SET titre = b.titre, description = b.description
  FROM (SELECT DISTINCT ON (id) id, titre, description FROM public._backup_2610_fiches_test_remise ORDER BY id, sauvegarde_le) b
 WHERE i.id = b.id AND i.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
SELECT id, titre, left(description, 70) AS texte FROM public.inventaire WHERE id IN (1791730636507, 1791729478750) ORDER BY id;
COMMIT;
