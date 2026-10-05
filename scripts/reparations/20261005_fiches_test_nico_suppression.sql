-- POINT 13 (05/10) — fiches de TEST du compte de Nico (f44b5917…), 999 €,
-- supprimées à la fin du lot, comme le ferait l'app (DELETE de la fiche).
-- Toutes leurs annonces sont hors ligne et vérifiées (404 Vinted dans Chrome ;
-- LBC 3282338760 : 404, absente de « Mes annonces » ; Beebs/LBC du 04/10 : retirées).
-- Sauvegarde avant : fiches, jobs, annonces, file de remise en vente.
-- Inverse : 20261005_fiches_test_nico_suppression_INVERSE.sql
-- Le réglage de test « kodak ektachrome super → Kodak » (essai point 5 b) est retiré aussi.
CREATE TABLE IF NOT EXISTS public._backup_0510_fiches_test_nico AS
  SELECT * FROM public.inventaire WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
     AND id IN (SELECT id FROM public.inventaire WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
                  AND (titre ILIKE 'TEST FILLSELL%' OR id IN (1791139014965, 1791142468699)) AND prix_vente >= 999);
CREATE TABLE IF NOT EXISTS public._backup_0510_fiches_test_nico_jobs AS
  SELECT * FROM public.cross_post_jobs WHERE inventaire_id IN (SELECT id FROM public._backup_0510_fiches_test_nico);
CREATE TABLE IF NOT EXISTS public._backup_0510_fiches_test_nico_annonces AS
  SELECT * FROM public.annonces_plateforme WHERE inventaire_id IN (SELECT id FROM public._backup_0510_fiches_test_nico);
ALTER TABLE public._backup_0510_fiches_test_nico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0510_fiches_test_nico_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0510_fiches_test_nico_annonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0510_fiches_test_nico, public._backup_0510_fiches_test_nico_jobs,
              public._backup_0510_fiches_test_nico_annonces FROM anon, authenticated;

-- Aucune annonce vivante ne doit rester (garde : sinon rien n'est supprimé).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs c
              WHERE c.inventaire_id IN (SELECT id FROM public._backup_0510_fiches_test_nico)
                AND c.status IN ('pending', 'processing', 'needs_user', 'published')) THEN
    RAISE EXCEPTION 'fiche de test encore liée à une annonce vivante ou un job en file — rien supprimé';
  END IF;
END $$;
DELETE FROM public.remises_en_vente WHERE inventaire_id IN (SELECT id FROM public._backup_0510_fiches_test_nico);
DELETE FROM public.inventaire WHERE id IN (SELECT id FROM public._backup_0510_fiches_test_nico)
  AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
RETURNING id, titre;

SELECT public.platform_settings_fusionner(ARRAY['vinted', 'marques_retenues'], '{}'::jsonb,
  ARRAY['kodak ektachrome super'], 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid) AS reglage_test_retire;
