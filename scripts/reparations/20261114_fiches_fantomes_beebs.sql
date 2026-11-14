-- 20261114_fiches_fantomes_beebs.sql — (14/11/2026 15:10, décision 1 de Nico) LES 14 FICHES FANTÔMES BEEBS SUPPRIMÉES.
-- Fiches créées par l'import depuis une annonce fantôme de l'index Beebs (origine « releve_beebs »), restées en stock une fois
-- les fantômes réparés (20261114_beebs_fantomes.sql) : 13e274de 5 (recréées le 14/11 à 12:21 et 14:11), ebdf29f0 9 (07/11).
-- Preuve, relue JUSTE AVANT (navigateur, 14/11 ~15:20, heure de Paris) : chaque annonce d'origine répond 404 (aucune fiche
-- produit), un témoin vivant répond 200 InStock. Gardes, fiche par fiche (sinon RIEN n'est supprimé) : même compte, en stock,
-- origine releve_beebs, aucune annonce vivante rattachée (toutes plateformes), aucune tâche de publication non close sur
-- aucune plateforme, aucune vente. Aucun retrait armé (fillsell.sans_retrait : les annonces sont déjà en 404).
-- Sauvegardes : _backup_1411_fiches_fantomes_inventaire (+ _fiches_annonce, supprimée en cascade). Inverse :
-- 20261114_fiches_fantomes_beebs_INVERSE.sql (réinsère les lignes telles quelles ; les liens SET NULL ne sont pas recréés).
BEGIN;
SET LOCAL fillsell.sans_retrait = '1';
CREATE TABLE IF NOT EXISTS public._backup_1411_fiches_fantomes_inventaire AS SELECT now() AS sauve_le, i.* FROM public.inventaire i WHERE false;
ALTER TABLE public._backup_1411_fiches_fantomes_inventaire ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1411_fiches_fantomes_inventaire FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS public._backup_1411_fiches_fantomes_fiches_annonce AS SELECT now() AS sauve_le, f.* FROM public.fiches_annonce f WHERE false;
ALTER TABLE public._backup_1411_fiches_fantomes_fiches_annonce ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1411_fiches_fantomes_fiches_annonce FROM PUBLIC, anon, authenticated;
CREATE TEMP TABLE cibles (id8 text, id bigint) ON COMMIT DROP;
INSERT INTO cibles VALUES
  ('13e274de', 1794655262926), ('13e274de', 1794661872665), ('13e274de', 1794661872685), ('13e274de', 1794661872697), ('13e274de', 1794661872708),
  ('ebdf29f0', 1794071714445), ('ebdf29f0', 1794071714498), ('ebdf29f0', 1794071714527), ('ebdf29f0', 1794071714534), ('ebdf29f0', 1794071714549),
  ('ebdf29f0', 1794071714554), ('ebdf29f0', 1794071714563), ('ebdf29f0', 1794071714577), ('ebdf29f0', 1794071714595);
DO $$
DECLARE n_ok integer;
BEGIN
  SELECT count(*) INTO n_ok FROM cibles c JOIN public.inventaire i ON i.id = c.id
   WHERE left(i.user_id::text, 8) = c.id8 AND i.statut = 'stock' AND i.origine = 'releve_beebs'
     AND NOT EXISTS (SELECT 1 FROM public.annonces_plateforme a WHERE a.inventaire_id = i.id AND a.disparu_le IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.cross_post_jobs j WHERE j.inventaire_id = i.id AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
                       AND j.status NOT IN ('cancelled', 'failed'))
     AND NOT EXISTS (SELECT 1 FROM public.ventes v WHERE v.inventaire_id = i.id);
  IF n_ok <> 14 THEN RAISE EXCEPTION 'gardes : % fiche(s) sur 14 conformes — RIEN supprimé', n_ok; END IF;
END $$;
INSERT INTO public._backup_1411_fiches_fantomes_inventaire SELECT now(), i.* FROM public.inventaire i WHERE i.id IN (SELECT id FROM cibles)
  AND NOT EXISTS (SELECT 1 FROM public._backup_1411_fiches_fantomes_inventaire b WHERE b.id = i.id);
INSERT INTO public._backup_1411_fiches_fantomes_fiches_annonce SELECT now(), f.* FROM public.fiches_annonce f WHERE f.inventaire_id IN (SELECT id FROM cibles)
  AND NOT EXISTS (SELECT 1 FROM public._backup_1411_fiches_fantomes_fiches_annonce b WHERE b.inventaire_id = f.inventaire_id);
DELETE FROM public.inventaire WHERE id IN (SELECT id FROM cibles);
SELECT (SELECT count(*) FROM public._backup_1411_fiches_fantomes_inventaire) AS fiches_sauvegardees,
       (SELECT count(*) FROM public.inventaire WHERE id IN (SELECT id FROM cibles)) AS fiches_restantes;
COMMIT;
