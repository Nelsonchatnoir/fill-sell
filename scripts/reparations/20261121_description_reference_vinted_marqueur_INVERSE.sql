-- INVERSE de 20261121_description_reference_vinted_marqueur.sql : le marqueur d'avant (daté) revient sur les fiches encore
-- sans description et toujours « à relire » (jamais par-dessus une vraie lecture faite depuis).
BEGIN;
UPDATE public.inventaire i SET attributs = jsonb_build_object('description_source', b.description_source)
  FROM public._backup_2111_description_reference b
 WHERE i.id = b.id AND i.user_id = b.user_id AND b.description_source IS NOT NULL
   AND NULLIF(btrim(i.description), '') IS NULL AND i.attributs -> 'description_source' ->> 'via' = 'reference_a_relire';
COMMIT;
