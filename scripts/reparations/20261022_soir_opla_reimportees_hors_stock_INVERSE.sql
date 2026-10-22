-- INVERSE de 20261022_soir_opla_reimportees_hors_stock.sql : les fiches reviennent au stock telles quelles (même
-- numéro), leurs annonces et leurs jobs Opla leur sont rattachés à nouveau. Source : _backup_2210_soir_opla.
BEGIN;
INSERT INTO public.inventaire
SELECT (jsonb_populate_record(NULL::public.inventaire, b.fiche)).*
  FROM public._backup_2210_soir_opla b
 WHERE NOT EXISTS (SELECT 1 FROM public.inventaire i WHERE i.id = b.inventaire_id);
UPDATE public.annonces_plateforme a SET inventaire_id = b.inventaire_id
  FROM public._backup_2210_soir_opla b, jsonb_array_elements(b.annonces) x
 WHERE a.id = (x ->> 'id')::uuid AND a.inventaire_id IS NULL;
UPDATE public.cross_post_jobs j SET inventaire_id = b.inventaire_id
  FROM public._backup_2210_soir_opla b, jsonb_array_elements(b.jobs) x
 WHERE j.id = (x ->> 'id')::uuid AND j.inventaire_id IS NULL;
SELECT b.inventaire_id, EXISTS (SELECT 1 FROM public.inventaire i WHERE i.id = b.inventaire_id) AS revenue FROM public._backup_2210_soir_opla b;
COMMIT;
