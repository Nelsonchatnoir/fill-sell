-- (05/11 22:25, feu vert NOMMÉ de Nico, point 1 b) Suite de 20261105_regle_vendu_retire_partout_rattrapage.sql : le « Oui » de
-- la question du Doudou (inventaire_doublon_decider) n'arme rien hors d'une session de la personne (la question est restée
-- « proposée », aucun retrait créé). Même geste par le circuit normal des retraits : armer_retrait_job_pour sur le dépôt
-- Beebs d23190b7, qui porte l'annonce 34032772 par son lien (relue EN VENTE le 05/11 à 22:21 : « Ajouter au panier »,
-- 24 € — même article que Vinted 10101127941 « Vendu » le 06/10, même titre, même prix, même photo), avec la preuve du geste
-- (la vérification de Nico). Rien d'autre.
-- Sauvegarde : public._backup_0511_vendu_retire_partout_2. Inverse : 20261105_regle_vendu_retire_partout_rattrapage_2_INVERSE.sql.
BEGIN;
DO $garde$
BEGIN
  IF to_regclass('public._backup_0511_vendu_retire_partout_2') IS NOT NULL THEN
    RAISE EXCEPTION 'script déjà passé : rien n''est écrit';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs WHERE action = 'delete' AND platform = 'beebs'
               AND inventaire_id = 1790106697754007 AND status IN ('pending', 'processing', 'needs_user')) THEN
    RAISE EXCEPTION 'un retrait Beebs est déjà en cours sur cette fiche : rien n''est écrit';
  END IF;
END $garde$;
CREATE TABLE public._backup_0511_vendu_retire_partout_2 AS
SELECT now() AS le, 'cross_post_jobs' AS t, j.id::text AS cle, to_jsonb(j.*) AS ligne, NULL::uuid AS retrait_cree
  FROM public.cross_post_jobs j WHERE j.id = 'd23190b7-f0ec-4224-8f46-e34fdd33c716';
ALTER TABLE public._backup_0511_vendu_retire_partout_2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0511_vendu_retire_partout_2 FROM PUBLIC, anon, authenticated;
UPDATE public._backup_0511_vendu_retire_partout_2
   SET retrait_cree = public.armer_retrait_job_pour('d23190b7-f0ec-4224-8f46-e34fdd33c716'::uuid,
                        'rattrapage_vendu_retire_partout', '0'::interval, true);
SELECT b.retrait_cree, j.platform, j.action, j.status, j.listing_url, left(j.title, 60) AS titre
  FROM public._backup_0511_vendu_retire_partout_2 b LEFT JOIN public.cross_post_jobs j ON j.id = b.retrait_cree;
COMMIT;
