-- INVERSE de 20261025_descriptions_depuis_captures.sql : remet la description (vide), les attributs et le rayon d'avant,
-- sur les seules fiches dont la description est TOUJOURS celle posée par le rattrapage (jamais un texte retouché depuis).
-- ⚠️ Le déclencheur inventaire_attributs_fusion_trg FUSIONNE tout nouvel objet attributs avec l'ancien : il ne laisse
-- jamais retirer une clé. Pour remettre l'objet sauvegardé tel quel, les déclencheurs sont suspendus le temps de cette
-- transaction seulement (session_replication_role = replica, SET LOCAL) — seules description, attributs et
-- vinted_catalog_id sont réécrits, rien d'autre.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL session_replication_role = replica;
UPDATE public.inventaire i
   SET description = b.description, attributs = b.attributs, vinted_catalog_id = b.vinted_catalog_id
  FROM public._backup_2510_descriptions_captures b
 WHERE i.id = b.id
   AND i.attributs->'description_source'->>'pose_par' = 'scripts/reparations/20261025_descriptions_depuis_captures.sql';
SELECT count(*) AS remises FROM public.inventaire i JOIN public._backup_2510_descriptions_captures b ON b.id = i.id
 WHERE coalesce(btrim(i.description), '') = '';
COMMIT;
