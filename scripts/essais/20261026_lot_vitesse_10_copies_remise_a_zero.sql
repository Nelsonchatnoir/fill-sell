-- 26/10 (étape 3) : remet les 10 copies de test de Nico (1793100000001..010) dans l'état « juste importées et lues »
-- avant chaque chronométrage : le titre et le texte sont ceux du vendeur (marqueurs titre_source / description_source
-- « vinted », comme une fiche importée de Vinted puis lue), et aucune préparation enregistrée (fiches_annonce).
-- Ne touche que ces 10 lignes de test (garde : marqueur essai_vitesse_2610, compte de Nico).
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.inventaire WHERE id BETWEEN 1793100000001 AND 1793100000010
               AND (user_id <> 'f44b5917-bccc-4431-ba41-f40571a2ed18' OR NOT (attributs ? 'essai_vitesse_2610'))) THEN
    RAISE EXCEPTION 'une ligne de cette plage n''est pas une copie de test de Nico : rien touché';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs WHERE inventaire_id BETWEEN 1793100000001 AND 1793100000010) THEN
    RAISE EXCEPTION 'une publication existe pour une copie de test : rien touché';
  END IF;
END $$;
UPDATE public.inventaire
   SET attributs = attributs || jsonb_build_object(
         'titre_source', jsonb_build_object('v', 'vinted', 'source', 'vinted_detail', 'at', now()),
         'description_source', jsonb_build_object('v', 'vinted', 'source', 'vinted_detail', 'at', now()))
 WHERE id BETWEEN 1793100000001 AND 1793100000010 AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
DELETE FROM public.fiches_annonce WHERE inventaire_id BETWEEN 1793100000001 AND 1793100000010;
SELECT count(*) FILTER (WHERE attributs->'titre_source'->>'v' = 'vinted') AS titres_vendeur,
       (SELECT count(*) FROM public.fiches_annonce WHERE inventaire_id BETWEEN 1793100000001 AND 1793100000010) AS fiches_restantes
  FROM public.inventaire WHERE id BETWEEN 1793100000001 AND 1793100000010;
COMMIT;
