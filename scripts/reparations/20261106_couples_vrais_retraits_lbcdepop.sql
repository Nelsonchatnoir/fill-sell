-- Produit par scripts/reparations/20261106_couples_vrais_retraits.mjs, lot « lbcdepop » : 4 annonce(s).
-- Inverse : 20261106_couples_vrais_retraits_INVERSE.sql (annule les retraits encore en attente).
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0611_couples_retraits (
  le timestamptz NOT NULL DEFAULT now(), lot text NOT NULL, annonce uuid NOT NULL, listing_id text, ligne jsonb,
  garde text, lecture jsonb, retrait_cree uuid);
ALTER TABLE public._backup_0611_couples_retraits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0611_couples_retraits FROM PUBLIC, anon, authenticated;
CREATE TEMP TABLE a_armer (ap uuid, garde text, lecture jsonb) ON COMMIT DROP;
  -- 448abc2d-3876-4329-9a47-4e1e4b04a3f4 (garde 3285567619) : en vente — n° 16 dylan.fontaine13 : page Leboncoin 3286667636 status active, achat possible, aucune transaction ; gardée 3285567619 active
  INSERT INTO pg_temp.a_armer VALUES ('448abc2d-3876-4329-9a47-4e1e4b04a3f4', '3285567619', '{"le":"2026-11-06T14:25:00+01:00","fenetre":"relue entre 14:24 et 14:25 (heure de Paris)","etat":"en vente","detail":"n° 16 dylan.fontaine13 : page Leboncoin 3286667636 status active, achat possible, aucune transaction ; gardée 3285567619 active"}'::jsonb);
  -- 72524031-b561-4903-b442-0aafbdc204bb (garde 3293252854) : en vente — n° 50 paugues.contact : page Leboncoin 3293061757 status active, achat possible, aucune transaction ; gardée 3293252854 active
  INSERT INTO pg_temp.a_armer VALUES ('72524031-b561-4903-b442-0aafbdc204bb', '3293252854', '{"le":"2026-11-06T14:25:00+01:00","fenetre":"relue entre 14:24 et 14:25 (heure de Paris)","etat":"en vente","detail":"n° 50 paugues.contact : page Leboncoin 3293061757 status active, achat possible, aucune transaction ; gardée 3293252854 active"}'::jsonb);
  -- 8d1b0c85-32b0-41f3-9c66-31ca0a39743b (garde se2astien64-superbe-sweat-shirt-vintage-en-provenance-6145) : en vente — n° 58 sebastien64310 : page Depop sebastienz4-superbe-sweat-shirt-vintage-en-provenance-815c STATUS_ONSALE ; gardée se2astien64-superbe-sweat-shirt-vintage-en-provenance-6145 STATUS_ONSALE
  INSERT INTO pg_temp.a_armer VALUES ('8d1b0c85-32b0-41f3-9c66-31ca0a39743b', 'se2astien64-superbe-sweat-shirt-vintage-en-provenance-6145', '{"le":"2026-11-06T14:25:00+01:00","fenetre":"relue entre 14:24 et 14:25 (heure de Paris)","etat":"en vente","detail":"n° 58 sebastien64310 : page Depop sebastienz4-superbe-sweat-shirt-vintage-en-provenance-815c STATUS_ONSALE ; gardée se2astien64-superbe-sweat-shirt-vintage-en-provenance-6145 STATUS_ONSALE"}'::jsonb);
  -- 5bdd142a-8075-4c6b-974f-84f927e6613f (garde johanetalexis-bottines-dr-martens-1460-bex-bdb9) : en vente — n° 73 tiblancdeshaut : page Depop joha4etalexia-bottines-dr-martens-1460-bex-fefa STATUS_ONSALE ; gardée johanetalexis-bottines-dr-martens-1460-bex-bdb9 STATUS_ONSALE
  INSERT INTO pg_temp.a_armer VALUES ('5bdd142a-8075-4c6b-974f-84f927e6613f', 'johanetalexis-bottines-dr-martens-1460-bex-bdb9', '{"le":"2026-11-06T14:25:00+01:00","fenetre":"relue entre 14:24 et 14:25 (heure de Paris)","etat":"en vente","detail":"n° 73 tiblancdeshaut : page Depop joha4etalexia-bottines-dr-martens-1460-bex-fefa STATUS_ONSALE ; gardée johanetalexis-bottines-dr-martens-1460-bex-bdb9 STATUS_ONSALE"}'::jsonb);
-- Les gardes, en base, maintenant ; chaque annonce gardée ou non est sauvegardée telle quelle.
INSERT INTO public._backup_0611_couples_retraits (lot, annonce, listing_id, ligne, garde, lecture)
SELECT 'lbcdepop', a.id, a.listing_id, to_jsonb(a.*), x.garde, x.lecture
  FROM pg_temp.a_armer x JOIN public.annonces_plateforme a ON a.id = x.ap;
WITH cibles AS (
  SELECT a.*, x.garde, x.lecture, i.titre AS titre_fiche
    FROM pg_temp.a_armer x
    JOIN public.annonces_plateforme a ON a.id = x.ap
    JOIN public.inventaire i ON i.id = a.inventaire_id AND i.user_id = a.user_id
   WHERE a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL
     AND length(btrim(COALESCE(a.listing_id, ''))) >= 4 AND a.platform <> 'opla'
     AND COALESCE(a.transaction_plateforme, '') NOT IN ('pending', 'sold')
     AND i.fusionne_dans IS NULL AND i.statut = 'stock' AND COALESCE(i.quantite, 1) = 1
     AND btrim(a.listing_id) <> btrim(x.garde)
     AND EXISTS (SELECT 1 FROM public.annonces_plateforme g
                  WHERE g.user_id = a.user_id AND g.platform = a.platform AND g.inventaire_id = a.inventaire_id
                    AND btrim(g.listing_id) = btrim(x.garde)
                    AND g.disparu_le IS NULL AND g.retiree_le IS NULL AND g.ignoree_le IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.cross_post_jobs d
                      WHERE d.user_id = a.user_id AND d.platform = a.platform AND d.action = 'delete'
                        AND d.status IN ('pending', 'processing', 'needs_user')
                        AND public.listing_designe(a.listing_id, d.listing_url, d.platform_listing_id))
), crees AS (
  INSERT INTO public.cross_post_jobs
    (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
  SELECT c.user_id, c.inventaire_id, c.platform, 'delete', 'pending', 'original',
         COALESCE(NULLIF(btrim(COALESCE(c.titre, '')), ''), c.titre_fiche), NULLIF(btrim(COALESCE(c.url, '')), ''), btrim(c.listing_id),
         jsonb_build_object(
           'arme_par', jsonb_build_object('chemin', 'couple_vrai_meme_plateforme_0611', 'le', now(), 'annonce', c.id,
             'depot', c.job_id, 'garde', c.garde, 'pose_par', 'réparation 06/11 (feu vert de Nico, point 2 : couples vrais)'),
           'preuve', 'tri_photo_0611_couple_vrai', 'lecture_avant_retrait', c.lecture)
         || CASE WHEN NULLIF(btrim(COALESCE(c.url, '')), '') IS NULL THEN jsonb_build_object('removal_url_missing', true) ELSE '{}'::jsonb END
    FROM cibles c
  RETURNING id, platform_fields->'arme_par'->>'annonce' AS annonce, user_id, platform, inventaire_id, platform_listing_id
), journal AS (
  INSERT INTO public.usage_logs (user_id, feature, metadata)
  SELECT c.user_id, 'retrait_annonces', jsonb_build_object('chemin', 'couple_vrai_meme_plateforme_0611',
           'plateformes', jsonb_build_array(c.platform), 'n_annonces', 1, 'n_articles', 1,
           'article_id', c.inventaire_id::text, 'annonce', c.annonce, 'listing_id', c.platform_listing_id)
    FROM crees c
  RETURNING 1
)
UPDATE public._backup_0611_couples_retraits b SET retrait_cree = c.id
  FROM crees c WHERE b.lot = 'lbcdepop' AND b.annonce::text = c.annonce;
SELECT b.lot, b.listing_id, b.garde, b.retrait_cree, j.platform, j.status, j.voie
  FROM public._backup_0611_couples_retraits b LEFT JOIN public.cross_post_jobs j ON j.id = b.retrait_cree
 WHERE b.lot = 'lbcdepop' ORDER BY j.platform, b.listing_id;
COMMIT;
