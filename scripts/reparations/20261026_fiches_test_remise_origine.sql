-- 26/10 (étape 6) : les deux fiches TEST de Nico qui ont servi aux essais « SuperCard » de la nuit (1791730636507,
-- 1791729478750) reprennent leur titre et leur texte d'origine, maintenant que leurs annonces Leboncoin d'essai sont
-- closes (Leboncoin : « Cette annonce est désactivée », absentes de « Mes annonces » ; lignes FillSell closes par
-- « Oublier » le 26/10 vers 09:00). Le texte d'origine est celui de la fiche 1791299785299, déjà remise cette nuit
-- (« Jeu vidéo Call of Duty Modern Warfare pour PlayStation 4, version française PAL FR. … Classé PEGI 18. »).
-- Compte de Nico seulement. Sauvegarde : _backup_2610_fiches_test_remise. Inverse : …_INVERSE.sql.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.inventaire WHERE id IN (1791730636507, 1791729478750)
        AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND description LIKE 'TEST FillSell, ne pas acheter.%WWE 2K20%') <> 2 THEN
    RAISE EXCEPTION 'les deux fiches ne portent pas le texte d''essai attendu : relire avant de toucher';
  END IF;
  IF (SELECT description FROM public.inventaire WHERE id = 1791299785299) NOT LIKE 'Jeu vidéo Call of Duty Modern Warfare pour PlayStation 4%' THEN
    RAISE EXCEPTION 'la fiche de référence 1791299785299 n''a plus le texte d''origine';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs WHERE inventaire_id IN (1791730636507, 1791729478750)
               AND status IN ('published', 'pending', 'processing', 'needs_user')) THEN
    RAISE EXCEPTION 'une publication est encore ouverte sur une des deux fiches';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public._backup_2610_fiches_test_remise AS
  SELECT id, titre, description, attributs, now() AS sauvegarde_le FROM public.inventaire WHERE false;
ALTER TABLE public._backup_2610_fiches_test_remise ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2610_fiches_test_remise FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2610_fiches_test_remise
  SELECT id, titre, description, attributs, now() FROM public.inventaire WHERE id IN (1791730636507, 1791729478750);
UPDATE public.inventaire i
   SET titre = CASE i.id WHEN 1791730636507 THEN 'TEST FillSell ne pas acheter - jeu PS4'
                         ELSE 'TEST FillSell ne pas acheter - Call of Duty Modern Warfare PS4' END,
       description = (SELECT description FROM public.inventaire WHERE id = 1791299785299),
       attributs = jsonb_build_object(
         'description_source', jsonb_build_object('v', 'manuel', 'source', 'manuel', 'at', now(), 'par', 'scripts/reparations/20261026_fiches_test_remise_origine.sql'),
         'titre_source', jsonb_build_object('v', 'manuel', 'source', 'manuel', 'at', now(), 'par', 'scripts/reparations/20261026_fiches_test_remise_origine.sql'))
 WHERE i.id IN (1791730636507, 1791729478750) AND i.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
SELECT id, titre, left(description, 70) AS texte FROM public.inventaire WHERE id IN (1791730636507, 1791729478750) ORDER BY id;
COMMIT;
