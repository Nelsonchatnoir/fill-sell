-- INVERSE de 20261114_fiches_fantomes_beebs.sql : les 14 fiches (et leurs fiches_annonce) réinsérées telles qu'elles étaient
-- sauvegardées. Les liens mis à NULL par la suppression (annonces, tâches) ne sont pas recréés : ils étaient déjà détachés.
BEGIN;
SET LOCAL fillsell.sans_retrait = '1';
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventaire' AND is_generated = 'NEVER';
  EXECUTE format('INSERT INTO public.inventaire (%s) SELECT %s FROM public._backup_1411_fiches_fantomes_inventaire b
    WHERE NOT EXISTS (SELECT 1 FROM public.inventaire i WHERE i.id = b.id)', cols, cols);
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fiches_annonce' AND is_generated = 'NEVER';
  EXECUTE format('INSERT INTO public.fiches_annonce (%s) SELECT %s FROM public._backup_1411_fiches_fantomes_fiches_annonce b
    WHERE NOT EXISTS (SELECT 1 FROM public.fiches_annonce f WHERE f.inventaire_id = b.inventaire_id)', cols, cols);
END $$;
SELECT (SELECT count(*) FROM public.inventaire WHERE id IN (SELECT id FROM public._backup_1411_fiches_fantomes_inventaire)) AS fiches_rendues;
COMMIT;
