-- INVERSE de 20261121_description_reference_vinted.sql : les 8 fiches reprennent leur « description » et leur marqueur
-- d'avant (seulement si personne n'a encore écrit de texte dessus), les demandes de lecture leur état d'avant.
BEGIN;
DO $ecrit$ BEGIN
  PERFORM set_config('fillsell.source_changement', 'reparation:2111_description_reference_inverse', true);
  UPDATE public.inventaire i SET description = b.description,
         attributs = CASE WHEN b.description_source IS NULL THEN i.attributs ELSE i.attributs || jsonb_build_object('description_source', b.description_source) END
    FROM public._backup_2111_description_reference b
   WHERE i.id = b.id AND i.user_id = b.user_id AND NULLIF(btrim(i.description), '') IS NULL;
  DELETE FROM public.lectures_origine_demandees d USING public._backup_2111_description_reference b
   WHERE d.user_id = b.user_id AND d.inventaire_id = b.id;
  INSERT INTO public.lectures_origine_demandees SELECT (jsonb_populate_record(NULL::public.lectures_origine_demandees, to_jsonb(r) - 'le')).*
    FROM public._backup_2111_lecture_reference r;
  PERFORM set_config('fillsell.source_changement', '', true);
END $ecrit$;
DROP TABLE public._backup_2111_description_reference;
DROP TABLE public._backup_2111_lecture_reference;
COMMIT;
