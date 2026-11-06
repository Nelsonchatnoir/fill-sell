-- Produit par scripts/reparations/20261106_couples_vrais_retraits.mjs, lot « beebs » : 24 annonce(s).
-- Inverse : 20261106_couples_vrais_retraits_INVERSE.sql (annule les retraits encore en attente).
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0611_couples_retraits (
  le timestamptz NOT NULL DEFAULT now(), lot text NOT NULL, annonce uuid NOT NULL, listing_id text, ligne jsonb,
  garde text, lecture jsonb, retrait_cree uuid);
ALTER TABLE public._backup_0611_couples_retraits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0611_couples_retraits FROM PUBLIC, anon, authenticated;
CREATE TEMP TABLE a_armer (ap uuid, garde text, lecture jsonb) ON COMMIT DROP;
  -- 7fcbdb0c-bc03-4201-90d8-9eb6eb24f61f (garde 28959314) : en vente — n° 11 boncoin59300 : page Beebs 29027429 HTTP 200, InStock, AVAILABLE ; gardée 28959314 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('7fcbdb0c-bc03-4201-90d8-9eb6eb24f61f', '28959314', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 11 boncoin59300 : page Beebs 29027429 HTTP 200, InStock, AVAILABLE ; gardée 28959314 AVAILABLE"}'::jsonb);
  -- 987fcc35-1c4a-41e4-8c66-5e39aa675449 (garde 33965598) : en vente — n° 14 djibril.ziate06 : page Beebs 34005625 HTTP 200, InStock, AVAILABLE ; gardée 33965598 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('987fcc35-1c4a-41e4-8c66-5e39aa675449', '33965598', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 14 djibril.ziate06 : page Beebs 34005625 HTTP 200, InStock, AVAILABLE ; gardée 33965598 AVAILABLE"}'::jsonb);
  -- fe7d7716-307f-4abb-b813-4c392d489c2d (garde 34284590) : en vente — n° 15 dylan.fontaine13 : page Beebs 34284975 HTTP 200, InStock, AVAILABLE ; gardée 34284590 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('fe7d7716-307f-4abb-b813-4c392d489c2d', '34284590', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 15 dylan.fontaine13 : page Beebs 34284975 HTTP 200, InStock, AVAILABLE ; gardée 34284590 AVAILABLE"}'::jsonb);
  -- 1bf07c7e-d9ef-48ce-bdaf-5107626549da (garde 34284576) : en vente — n° 17 dylan.fontaine13 : page Beebs 34297633 HTTP 200, InStock, AVAILABLE ; gardée 34284576 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('1bf07c7e-d9ef-48ce-bdaf-5107626549da', '34284576', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 17 dylan.fontaine13 : page Beebs 34297633 HTTP 200, InStock, AVAILABLE ; gardée 34284576 AVAILABLE"}'::jsonb);
  -- 7059c65f-0231-49c4-b963-d80647892e3f (garde 34284568) : en vente — n° 18 dylan.fontaine13 : page Beebs 34285121 HTTP 200, InStock, AVAILABLE ; gardée 34284568 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('7059c65f-0231-49c4-b963-d80647892e3f', '34284568', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 18 dylan.fontaine13 : page Beebs 34285121 HTTP 200, InStock, AVAILABLE ; gardée 34284568 AVAILABLE"}'::jsonb);
  -- 37e420c4-5359-4c46-ab1b-99862f2a9ea6 (garde 34284556) : en vente — n° 19 dylan.fontaine13 : page Beebs 34297626 HTTP 200, InStock, AVAILABLE ; gardée 34284556 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('37e420c4-5359-4c46-ab1b-99862f2a9ea6', '34284556', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 19 dylan.fontaine13 : page Beebs 34297626 HTTP 200, InStock, AVAILABLE ; gardée 34284556 AVAILABLE"}'::jsonb);
  -- 6ce66900-1f8d-4f61-b68a-495a04197576 (garde 34089460) : en vente — n° 39 misscat801 : page Beebs 34139502 HTTP 200, InStock, AVAILABLE ; gardée 34089460 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('6ce66900-1f8d-4f61-b68a-495a04197576', '34089460', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 39 misscat801 : page Beebs 34139502 HTTP 200, InStock, AVAILABLE ; gardée 34089460 AVAILABLE"}'::jsonb);
  -- c9e41bd4-a039-49ec-ab1e-6e55d8606b38 (garde 34006241) : en vente — n° 42 misscat801 : page Beebs 34139642 HTTP 200, InStock, AVAILABLE ; gardée 34006241 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('c9e41bd4-a039-49ec-ab1e-6e55d8606b38', '34006241', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 42 misscat801 : page Beebs 34139642 HTTP 200, InStock, AVAILABLE ; gardée 34006241 AVAILABLE"}'::jsonb);
  -- 834206ba-33bc-4b14-b1bb-7d91e5a964b0 (garde 34007388) : en vente — n° 43 misscat801 : page Beebs 34092671 HTTP 200, InStock, AVAILABLE ; gardée 34007388 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('834206ba-33bc-4b14-b1bb-7d91e5a964b0', '34007388', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 43 misscat801 : page Beebs 34092671 HTTP 200, InStock, AVAILABLE ; gardée 34007388 AVAILABLE"}'::jsonb);
  -- bb63857a-a684-46a4-b4a0-46574a7a3f10 (garde 34257872) : en vente — n° 52 sebastien64310 : page Beebs 34232750 HTTP 200, InStock, AVAILABLE ; gardée 34257872 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('bb63857a-a684-46a4-b4a0-46574a7a3f10', '34257872', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 52 sebastien64310 : page Beebs 34232750 HTTP 200, InStock, AVAILABLE ; gardée 34257872 AVAILABLE"}'::jsonb);
  -- 5d8f4975-b2a9-4c0d-9c40-743e19e7977e (garde 34219888) : en vente — n° 53 sebastien64310 : page Beebs 34201198 HTTP 200, InStock, AVAILABLE ; gardée 34219888 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('5d8f4975-b2a9-4c0d-9c40-743e19e7977e', '34219888', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 53 sebastien64310 : page Beebs 34201198 HTTP 200, InStock, AVAILABLE ; gardée 34219888 AVAILABLE"}'::jsonb);
  -- fc444ee0-f71d-4ea8-8ad6-c0cc12626d39 (garde 34232738) : en vente — n° 54 sebastien64310 : page Beebs 34207295 HTTP 200, InStock, AVAILABLE ; gardée 34232738 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('fc444ee0-f71d-4ea8-8ad6-c0cc12626d39', '34232738', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 54 sebastien64310 : page Beebs 34207295 HTTP 200, InStock, AVAILABLE ; gardée 34232738 AVAILABLE"}'::jsonb);
  -- cefdfa0a-0bed-4669-a425-1f0084bb3419 (garde 34232729) : en vente — n° 55 sebastien64310 : page Beebs 34207263 HTTP 200, InStock, AVAILABLE ; gardée 34232729 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('cefdfa0a-0bed-4669-a425-1f0084bb3419', '34232729', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 55 sebastien64310 : page Beebs 34207263 HTTP 200, InStock, AVAILABLE ; gardée 34232729 AVAILABLE"}'::jsonb);
  -- 2149c0cc-5ae8-499e-9d6c-9149b4d68c51 (garde 34219780) : en vente — n° 56 sebastien64310 : page Beebs 34201162 HTTP 200, InStock, AVAILABLE ; gardée 34219780 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('2149c0cc-5ae8-499e-9d6c-9149b4d68c51', '34219780', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 56 sebastien64310 : page Beebs 34201162 HTTP 200, InStock, AVAILABLE ; gardée 34219780 AVAILABLE"}'::jsonb);
  -- 769bdeef-1498-4ae0-8a75-81b459d6b91a (garde 34220450) : en vente — n° 60 sebastien64310 : page Beebs 34201500 HTTP 200, InStock, AVAILABLE ; gardée 34220450 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('769bdeef-1498-4ae0-8a75-81b459d6b91a', '34220450', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 60 sebastien64310 : page Beebs 34201500 HTTP 200, InStock, AVAILABLE ; gardée 34220450 AVAILABLE"}'::jsonb);
  -- 59a9eb5a-ee6e-433b-88ba-2bdbef367c51 (garde 34219808) : en vente — n° 61 sebastien64310 : page Beebs 34201152 HTTP 200, InStock, AVAILABLE ; gardée 34219808 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('59a9eb5a-ee6e-433b-88ba-2bdbef367c51', '34219808', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 61 sebastien64310 : page Beebs 34201152 HTTP 200, InStock, AVAILABLE ; gardée 34219808 AVAILABLE"}'::jsonb);
  -- 43efa87c-158b-4b9b-92d6-7c5882f398e4 (garde 34220440) : en vente — n° 62 sebastien64310 : page Beebs 34201455 HTTP 200, InStock, AVAILABLE ; gardée 34220440 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('43efa87c-158b-4b9b-92d6-7c5882f398e4', '34220440', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 62 sebastien64310 : page Beebs 34201455 HTTP 200, InStock, AVAILABLE ; gardée 34220440 AVAILABLE"}'::jsonb);
  -- 6269199c-68bc-41b8-8621-1a1a8fa54570 (garde 34220426) : en vente — n° 63 sebastien64310 : page Beebs 34201445 HTTP 200, InStock, AVAILABLE ; gardée 34220426 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('6269199c-68bc-41b8-8621-1a1a8fa54570', '34220426', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 63 sebastien64310 : page Beebs 34201445 HTTP 200, InStock, AVAILABLE ; gardée 34220426 AVAILABLE"}'::jsonb);
  -- e099d8fa-97e6-424d-bc51-5d7d812ab16d (garde 34219795) : en vente — n° 64 sebastien64310 : page Beebs 34201113 HTTP 200, InStock, AVAILABLE ; gardée 34219795 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('e099d8fa-97e6-424d-bc51-5d7d812ab16d', '34219795', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 64 sebastien64310 : page Beebs 34201113 HTTP 200, InStock, AVAILABLE ; gardée 34219795 AVAILABLE"}'::jsonb);
  -- 026805a3-5baa-467e-805f-e1cd4aaaddd0 (garde 34220422) : en vente — n° 65 sebastien64310 : page Beebs 34201313 HTTP 200, InStock, AVAILABLE ; gardée 34220422 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('026805a3-5baa-467e-805f-e1cd4aaaddd0', '34220422', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 65 sebastien64310 : page Beebs 34201313 HTTP 200, InStock, AVAILABLE ; gardée 34220422 AVAILABLE"}'::jsonb);
  -- 410beede-2b6f-4dc4-9144-80d4c0c38a07 (garde 34220469) : en vente — n° 66 sebastien64310 : page Beebs 34201747 HTTP 200, InStock, AVAILABLE ; gardée 34220469 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('410beede-2b6f-4dc4-9144-80d4c0c38a07', '34220469', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 66 sebastien64310 : page Beebs 34201747 HTTP 200, InStock, AVAILABLE ; gardée 34220469 AVAILABLE"}'::jsonb);
  -- 0cb82db5-065d-4edd-998b-cd0452f10e8a (garde 34220464) : en vente — n° 67 sebastien64310 : page Beebs 34201725 HTTP 200, InStock, AVAILABLE ; gardée 34220464 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('0cb82db5-065d-4edd-998b-cd0452f10e8a', '34220464', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 67 sebastien64310 : page Beebs 34201725 HTTP 200, InStock, AVAILABLE ; gardée 34220464 AVAILABLE"}'::jsonb);
  -- e6e486ba-7b5b-489a-acca-984c0a353262 (garde 34201704) : en vente — n° 68 sebastien64310 : page Beebs 34220457 HTTP 200, InStock, AVAILABLE ; gardée 34201704 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('e6e486ba-7b5b-489a-acca-984c0a353262', '34201704', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 68 sebastien64310 : page Beebs 34220457 HTTP 200, InStock, AVAILABLE ; gardée 34201704 AVAILABLE"}'::jsonb);
  -- 8c5c7233-8c69-4f98-95bf-6c4789bdf7bc (garde 34216511) : en vente — n° 72 tiblancdeshaut : page Beebs 34216423 HTTP 200, InStock, AVAILABLE ; gardée 34216511 AVAILABLE
  INSERT INTO pg_temp.a_armer VALUES ('8c5c7233-8c69-4f98-95bf-6c4789bdf7bc', '34216511', '{"le":"2026-11-06T14:23:00+01:00","fenetre":"relue entre 14:21 et 14:23 (heure de Paris)","etat":"en vente","detail":"n° 72 tiblancdeshaut : page Beebs 34216423 HTTP 200, InStock, AVAILABLE ; gardée 34216511 AVAILABLE"}'::jsonb);
-- Les gardes, en base, maintenant ; chaque annonce gardée ou non est sauvegardée telle quelle.
INSERT INTO public._backup_0611_couples_retraits (lot, annonce, listing_id, ligne, garde, lecture)
SELECT 'beebs', a.id, a.listing_id, to_jsonb(a.*), x.garde, x.lecture
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
  FROM crees c WHERE b.lot = 'beebs' AND b.annonce::text = c.annonce;
SELECT b.lot, b.listing_id, b.garde, b.retrait_cree, j.platform, j.status, j.voie
  FROM public._backup_0611_couples_retraits b LEFT JOIN public.cross_post_jobs j ON j.id = b.retrait_cree
 WHERE b.lot = 'beebs' ORDER BY j.platform, b.listing_id;
COMMIT;
