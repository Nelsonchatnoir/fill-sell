-- (05/11 22:25, feu vert NOMMÉ de Nico, point 1 b) Le Doudou, 3e geste : ni le « Oui » de la question (hors session de la
-- personne) ni armer_retrait_job_pour (le dépôt d23190b7 n'est rattaché que par le titre : retrait_job_prouve = faux) n'ont
-- armé le retrait. Le circuit normal depuis 20261105240000 : armer_retrait_annonce_pour, qui retire L'ANNONCE MONTRÉE
-- (285e5620 = Beebs 34032772, relue EN VENTE le 05/11 à 22:21, même article que Vinted 10101127941 « Vendu »), sur le geste
-- (la vérification de Nico). Rien d'autre.
-- Sauvegarde : public._backup_0511_vendu_retire_partout_3. Inverse : 20261105_regle_vendu_retire_partout_rattrapage_3_INVERSE.sql.
BEGIN;
DO $garde$
BEGIN
  IF to_regclass('public._backup_0511_vendu_retire_partout_3') IS NOT NULL THEN
    RAISE EXCEPTION 'script déjà passé : rien n''est écrit';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs WHERE action = 'delete' AND platform = 'beebs'
               AND inventaire_id = 1790106697754007 AND status IN ('pending', 'processing', 'needs_user')) THEN
    RAISE EXCEPTION 'un retrait Beebs est déjà en cours sur cette fiche : rien n''est écrit';
  END IF;
END $garde$;
CREATE TABLE public._backup_0511_vendu_retire_partout_3 AS
SELECT now() AS le, 'annonces_plateforme' AS t, a.id::text AS cle, to_jsonb(a.*) AS ligne, NULL::uuid AS retrait_cree
  FROM public.annonces_plateforme a WHERE a.id = '285e5620-fc56-43f9-8503-52c268dd8b08';
ALTER TABLE public._backup_0511_vendu_retire_partout_3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0511_vendu_retire_partout_3 FROM PUBLIC, anon, authenticated;
UPDATE public._backup_0511_vendu_retire_partout_3
   SET retrait_cree = public.armer_retrait_annonce_pour('285e5620-fc56-43f9-8503-52c268dd8b08'::uuid,
                        'rattrapage_vendu_retire_partout', '0'::interval, true);
SELECT b.retrait_cree, j.platform, j.action, j.status, j.platform_listing_id, j.listing_url, left(j.title, 60) AS titre
  FROM public._backup_0511_vendu_retire_partout_3 b LEFT JOIN public.cross_post_jobs j ON j.id = b.retrait_cree;
COMMIT;
