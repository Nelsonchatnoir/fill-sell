-- INVERSE de 20261121_texte_ia_fiches_8fd44622.sql : les 4 fiches reprennent la description d'avant (seulement si aucun
-- texte n'a été lu depuis), le marqueur « à relire » est remplacé par l'ancien s'il existait, les demandes leur état d'avant.
BEGIN;
DO $ecrit$ BEGIN
  PERFORM set_config('fillsell.source_changement', 'reparation:2111_texte_ia_8fd44622_inverse', true);
  UPDATE public.inventaire i SET description = b.description
    FROM public._backup_2111_texte_ia_8fd44622 b
   WHERE i.id = b.id AND i.user_id = b.user_id AND NULLIF(btrim(i.description), '') IS NULL
     AND i.attributs -> 'description_source' ->> 'via' = 'reference_a_relire';
  DELETE FROM public.lectures_origine_demandees d USING public._backup_2111_texte_ia_8fd44622 b
   WHERE d.user_id = b.user_id AND d.inventaire_id = b.id;
  INSERT INTO public.lectures_origine_demandees SELECT (jsonb_populate_record(NULL::public.lectures_origine_demandees, to_jsonb(r) - 'le')).*
    FROM public._backup_2111_lecture_8fd44622 r;
  PERFORM set_config('fillsell.source_changement', '', true);
END $ecrit$;
DROP TABLE public._backup_2111_texte_ia_8fd44622;
DROP TABLE public._backup_2111_lecture_8fd44622;
COMMIT;
