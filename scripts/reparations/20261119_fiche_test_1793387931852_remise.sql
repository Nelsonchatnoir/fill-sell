-- (19/11/2026 soir, ordre de Nico) Réparation de MON erreur d'essai (16:46) : la fiche de test 1793387931852 (« TEST
-- FillSell 30/10 — T-shirt femme Picture blanc taille S — ne pas acheter », compte de Nico f44b5917) a reçu par erreur
-- les corrections de la fiche A (taille L, couleur Noir, matière Coton, « manuel », 19/11 15:46 UTC). Elle revient à
-- Blanc / S / sans matière (valeurs de ses captures Vinted 21893 et 23392 et de ses annonces Leboncoin / Beebs / Depop).
-- Sauvegarde : _backup_1911_fiche_1793387931852. Inverse : 20261119_fiche_test_1793387931852_remise_INVERSE.sql.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE public._backup_1911_fiche_1793387931852 AS
  SELECT now() AS le, id, attributs FROM public.inventaire WHERE id = 1793387931852;
ALTER TABLE public._backup_1911_fiche_1793387931852 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1911_fiche_1793387931852 FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventaire WHERE id = 1793387931852 AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
                  AND attributs -> 'taille' ->> 'v' = 'L' AND attributs -> 'couleur' ->> 'v' = 'Noir' AND attributs -> 'matiere' ->> 'v' = 'Coton') THEN
    RAISE EXCEPTION 'fiche 1793387931852 : plus dans l''état de l''erreur (relire)';
  END IF;
END $$;
UPDATE public.inventaire
   SET attributs = (attributs - 'matiere')
     || jsonb_build_object('taille', jsonb_build_object('v', 'S', 'source', 'manuel', 'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
                           'couleur', jsonb_build_object('v', 'Blanc', 'source', 'manuel', 'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
 WHERE id = 1793387931852 AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
SELECT id, attributs -> 'taille' AS taille, attributs -> 'couleur' AS couleur, attributs -> 'matiere' AS matiere FROM public.inventaire WHERE id = 1793387931852;
COMMIT;
