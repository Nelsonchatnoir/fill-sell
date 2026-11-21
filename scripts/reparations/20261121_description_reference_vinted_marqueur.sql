-- (21/11/2026 11:2x, complément de 20261121_description_reference_vinted.sql) La fusion des attributs
-- (inventaire_attributs_avant_update → inventaire_attributs_fusion) ne retire JAMAIS une clé : « attributs - 'description_source' »
-- n'a rien retiré. 6 fiches (52f5dc70 ×5, d87570eb ×1) gardaient leur marqueur de lecture daté du 20/11 (et du 01/11) :
-- fiches_contenu_vendeur y lit « description lue », get-pending-jobs ne retenait donc plus leurs publications (description
-- vide = « rien chez le vendeur »). Le marqueur est REMPLACÉ (même source vinted_detail, rang égal : la fusion le prend)
-- par un marqueur SANS date de lecture : « à relire ». Une vraie lecture (0.6.196) le remplacera avec sa date.
-- Seules les fiches de la réparation, encore sans description. Sauvegarde : _backup_2111_description_reference (déjà prise).
-- Inverse : 20261121_description_reference_vinted_marqueur_INVERSE.sql.
BEGIN;
DO $ecrit$ DECLARE n int; BEGIN
  IF to_regclass('public._backup_2111_description_reference') IS NULL THEN RAISE EXCEPTION 'réparation d''origine absente : rien n''est écrit'; END IF;
  UPDATE public.inventaire i
     SET attributs = jsonb_build_object('description_source', jsonb_build_object(
           'v', 'vinted', 'source', 'vinted_detail', 'at', NULL, 'via', 'reference_a_relire', 'motif', 'reparation_2111'))
    FROM public._backup_2111_description_reference b
   WHERE i.id = b.id AND i.user_id = b.user_id AND NULLIF(btrim(i.description), '') IS NULL
     AND (i.attributs -> 'description_source' ->> 'at') IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION 'attendu 6 fiches, % touchées : rien n''est écrit', n; END IF;
END $ecrit$;
SELECT left(i.user_id::text, 8) AS compte, i.id, i.description, i.attributs -> 'description_source' AS marqueur
  FROM public.inventaire i JOIN public._backup_2111_description_reference b ON b.id = i.id ORDER BY 1, 2;
COMMIT;
