-- INVERSE de scripts/reparations/20261024_catalogue_vinted_italien.sql : rend aux 8 lignes du catalogue Vinted les
-- libellés et listes qu'elles portaient avant la réparation (première sauvegarde de chacune dans
-- _backup_2410_catalogue_vinted_italien). ⚠️ Cela remet l'écriture ITALIENNE dans le catalogue partagé : à n'employer
-- que pour défaire la réparation elle-même.
BEGIN;
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.platform_category_aspects a
     SET field_label = b.field_label, allowed_values = b.allowed_values
    FROM (SELECT DISTINCT ON (s.id) s.* FROM public._backup_2410_catalogue_vinted_italien s ORDER BY s.id, s.sauvegarde_le ASC) b
   WHERE a.id = b.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'lignes rendues à leur état d''avant la réparation : %', n;
END $$;
SELECT id, field_key, field_label, left(allowed_values::text, 60) FROM public.platform_category_aspects
 WHERE id IN (SELECT id FROM public._backup_2410_catalogue_vinted_italien) ORDER BY field_key;
COMMIT;
