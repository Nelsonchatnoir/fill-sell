-- (06/11 ~10:00, ordre de Nico, points 2 et 3) Fiche 1790106697754007 de nicolas.menar (« Doudou Marie les Aristochats »),
-- VENDUE sur Vinted le 06/10 (vente 94135, annonce Vinted 10101127941). Deux annonces Leboncoin de cette fiche encore EN
-- VENTE, relues sur leur page publique le 06/11 à 09:57 (heure de Paris) : HTTP 200, status « active », aucune transaction.
--   · 37c21107 = Leboncoin 3274924341 « Doudou Marie… » 24 € — même photo que la fiche (feu vert de Nico, point 2) ;
--   · 2524f6ca = Leboncoin 3267000921 « Lot 2 doudous Marie… » 36 € — comparé photo par photo (point 3) : le doudou du
--     BAS de la photo du lot porte la même tache brune ovale, au même endroit (bordure grise, couture gauche de la
--     mousseline, petit point sombre juste au-dessus) que le doudou vendu → le lot contient le doudou vendu : retrait.
-- Circuit normal (depuis 20261105240000) : armer_retrait_annonce_pour, qui retire L'ANNONCE MONTRÉE par son numéro et son
-- lien, sur le geste (la vérification de Nico). Rien d'autre n'est touché (ni fiche, ni rattachement, ni autre annonce).
-- Sauvegarde : public._backup_0611_doudou_lbc_retraits. Inverse : 20261106_doudou_lbc_retraits_INVERSE.sql.
BEGIN;
DO $garde$
BEGIN
  IF to_regclass('public._backup_0611_doudou_lbc_retraits') IS NOT NULL THEN
    RAISE EXCEPTION 'script déjà passé : rien n''est écrit';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs WHERE action = 'delete' AND platform = 'leboncoin'
               AND inventaire_id = 1790106697754007 AND status IN ('pending', 'processing', 'needs_user')) THEN
    RAISE EXCEPTION 'un retrait Leboncoin est déjà en cours sur cette fiche : rien n''est écrit';
  END IF;
END $garde$;
CREATE TABLE public._backup_0611_doudou_lbc_retraits AS
SELECT now() AS le, 'annonces_plateforme' AS t, a.id::text AS cle, a.listing_id, to_jsonb(a.*) AS ligne, NULL::uuid AS retrait_cree
  FROM public.annonces_plateforme a
 WHERE a.id IN ('37c21107-c0d9-44a3-b12f-891f7d027b34', '2524f6ca-195c-4d59-afd7-03ed0332da30');
ALTER TABLE public._backup_0611_doudou_lbc_retraits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0611_doudou_lbc_retraits FROM PUBLIC, anon, authenticated;
UPDATE public._backup_0611_doudou_lbc_retraits
   SET retrait_cree = public.armer_retrait_annonce_pour(cle::uuid, 'rattrapage_vendu_retire_partout', '0'::interval, true);
SELECT b.listing_id, b.retrait_cree, j.platform, j.action, j.status, j.platform_listing_id, j.listing_url, left(j.title, 60) AS titre
  FROM public._backup_0611_doudou_lbc_retraits b LEFT JOIN public.cross_post_jobs j ON j.id = b.retrait_cree;
COMMIT;
