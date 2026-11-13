-- INVERSE de 20261113_comptes_plateformes_remplissage.sql (13/11/2026, étape 4 L1).
-- Retire les lignes que le script a écrites ET qui n'ont pas changé depuis (la ligne entière égale à sa sauvegarde) ;
-- une ligne réécrite depuis par une fonction (site changé, relu) ou marquée pilote par Nico est GARDÉE (elle dit une
-- lecture plus récente que le script) et comptée. Puis la sauvegarde est retirée. Rien d'autre n'est touché.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $garde$
BEGIN
  IF to_regclass('public._backup_1311_comptes_plateformes') IS NULL THEN
    RAISE EXCEPTION 'sauvegarde absente : le script n''a pas été passé, rien à défaire';
  END IF;
  IF to_regclass('public.comptes_plateformes') IS NULL THEN
    RAISE EXCEPTION 'table comptes_plateformes absente (M1 déjà retirée) : seule la sauvegarde reste — DROP TABLE public._backup_1311_comptes_plateformes';
  END IF;
END
$garde$;

-- 1. Les lignes du script, inchangées depuis : retirées.
WITH retirees AS (
  DELETE FROM public.comptes_plateformes c
   USING public._backup_1311_comptes_plateformes b
   WHERE c.user_id = b.user_id AND c.plateforme = b.plateforme AND c.compte = b.compte
     AND to_jsonb(c) = b.ligne
  RETURNING c.plateforme
)
SELECT 'retirees' AS quoi, plateforme, count(*) AS lignes FROM retirees GROUP BY plateforme
UNION ALL
-- 2. Les lignes du script qui ont changé depuis (relues par une fonction, ou pilote) : gardées.
SELECT 'gardees_changees_depuis', b.plateforme, count(*)
  FROM public._backup_1311_comptes_plateformes b
  JOIN public.comptes_plateformes c ON c.user_id = b.user_id AND c.plateforme = b.plateforme AND c.compte = b.compte
 WHERE to_jsonb(c) <> b.ligne
 GROUP BY b.plateforme;

DROP TABLE public._backup_1311_comptes_plateformes;

COMMIT;
