-- Produit par scripts/reparations/20261106_couples_vrais_retraits.mjs, lot « ebay » : 17 annonce(s).
-- Inverse : 20261106_couples_vrais_retraits_INVERSE.sql (annule les retraits encore en attente).
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0611_couples_retraits (
  le timestamptz NOT NULL DEFAULT now(), lot text NOT NULL, annonce uuid NOT NULL, listing_id text, ligne jsonb,
  garde text, lecture jsonb, retrait_cree uuid);
ALTER TABLE public._backup_0611_couples_retraits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0611_couples_retraits FROM PUBLIC, anon, authenticated;
CREATE TEMP TABLE a_armer (ap uuid, garde text, lecture jsonb) ON COMMIT DROP;
  -- a080a56b-5896-4066-91e7-29321b69071b (garde 287540150666) : en vente — n° 4 benjamin.ployer : page eBay 287584370345 en cours, achat immédiat, aucune quantité affichée ; gardée 287540150666 en cours
  INSERT INTO pg_temp.a_armer VALUES ('a080a56b-5896-4066-91e7-29321b69071b', '287540150666', '{"le":"2026-11-06T14:20:00+01:00","fenetre":"relue entre 14:10 et 14:20 (heure de Paris)","etat":"en vente","detail":"n° 4 benjamin.ployer : page eBay 287584370345 en cours, achat immédiat, aucune quantité affichée ; gardée 287540150666 en cours"}'::jsonb);
  -- e5a52e15-9728-446e-8fa3-10f3fbb31d8e (garde 287504538358) : en vente — n° 5 benjamin.ployer : page eBay 287584255535 en cours, achat immédiat, aucune quantité affichée ; gardée 287504538358 en cours
  INSERT INTO pg_temp.a_armer VALUES ('e5a52e15-9728-446e-8fa3-10f3fbb31d8e', '287504538358', '{"le":"2026-11-06T14:20:00+01:00","fenetre":"relue entre 14:10 et 14:20 (heure de Paris)","etat":"en vente","detail":"n° 5 benjamin.ployer : page eBay 287584255535 en cours, achat immédiat, aucune quantité affichée ; gardée 287504538358 en cours"}'::jsonb);
  -- 47b461c5-3dec-49a9-9499-4da766572a97 (garde 287540148962) : en vente — n° 7 benjamin.ployer : page eBay 287583815402 en cours, achat immédiat, aucune quantité affichée ; gardée 287540148962 en cours
  INSERT INTO pg_temp.a_armer VALUES ('47b461c5-3dec-49a9-9499-4da766572a97', '287540148962', '{"le":"2026-11-06T14:20:00+01:00","fenetre":"relue entre 14:10 et 14:20 (heure de Paris)","etat":"en vente","detail":"n° 7 benjamin.ployer : page eBay 287583815402 en cours, achat immédiat, aucune quantité affichée ; gardée 287540148962 en cours"}'::jsonb);
  -- 4b428919-c056-40e8-8c34-7d77c0565e31 (garde 287641633341) : en vente — n° 8 benjamin.ployer : page eBay 287663196561 en cours, achat immédiat, aucune quantité affichée ; gardée 287641633341 en cours
  INSERT INTO pg_temp.a_armer VALUES ('4b428919-c056-40e8-8c34-7d77c0565e31', '287641633341', '{"le":"2026-11-06T14:20:00+01:00","fenetre":"relue entre 14:10 et 14:20 (heure de Paris)","etat":"en vente","detail":"n° 8 benjamin.ployer : page eBay 287663196561 en cours, achat immédiat, aucune quantité affichée ; gardée 287641633341 en cours"}'::jsonb);
  -- e8002f42-2a5a-4a0f-a149-2eda7dcfbd52 (garde 287513346600) : en vente — n° 9 benjamin.ployer : page eBay 287584346000 en cours, achat immédiat, aucune quantité affichée ; gardée 287513346600 en cours
  INSERT INTO pg_temp.a_armer VALUES ('e8002f42-2a5a-4a0f-a149-2eda7dcfbd52', '287513346600', '{"le":"2026-11-06T14:20:00+01:00","fenetre":"relue entre 14:10 et 14:20 (heure de Paris)","etat":"en vente","detail":"n° 9 benjamin.ployer : page eBay 287584346000 en cours, achat immédiat, aucune quantité affichée ; gardée 287513346600 en cours"}'::jsonb);
  -- 6fe7a709-6309-4524-aa68-3fc4f6107785 (garde 287540152728) : en vente — n° 10 benjamin.ployer : page eBay 287584354628 en cours, achat immédiat, aucune quantité affichée ; gardée 287540152728 en cours
  INSERT INTO pg_temp.a_armer VALUES ('6fe7a709-6309-4524-aa68-3fc4f6107785', '287540152728', '{"le":"2026-11-06T14:20:00+01:00","fenetre":"relue entre 14:10 et 14:20 (heure de Paris)","etat":"en vente","detail":"n° 10 benjamin.ployer : page eBay 287584354628 en cours, achat immédiat, aucune quantité affichée ; gardée 287540152728 en cours"}'::jsonb);
  -- ab737cdc-ed92-4a17-99c5-fe18abad58b6 (garde 128026815082) : en vente — n° 13 boncoin59300 : page eBay 128027987580 en cours, achat immédiat, aucune quantité affichée ; gardée 128026815082 en cours
  INSERT INTO pg_temp.a_armer VALUES ('ab737cdc-ed92-4a17-99c5-fe18abad58b6', '128026815082', '{"le":"2026-11-06T14:20:00+01:00","fenetre":"relue entre 14:10 et 14:20 (heure de Paris)","etat":"en vente","detail":"n° 13 boncoin59300 : page eBay 128027987580 en cours, achat immédiat, aucune quantité affichée ; gardée 128026815082 en cours"}'::jsonb);
  -- 237451a8-efd7-469a-b393-0152e6125799 (garde 820266799154) : en vente — n° 46 nino57270 : page eBay 820293053095 en cours, achat immédiat, aucune quantité affichée ; gardée 820266799154 en cours
  INSERT INTO pg_temp.a_armer VALUES ('237451a8-efd7-469a-b393-0152e6125799', '820266799154', '{"le":"2026-11-06T14:20:00+01:00","fenetre":"relue entre 14:10 et 14:20 (heure de Paris)","etat":"en vente","detail":"n° 46 nino57270 : page eBay 820293053095 en cours, achat immédiat, aucune quantité affichée ; gardée 820266799154 en cours"}'::jsonb);
  -- c5e60d4d-d9b9-4710-9f62-dcf2337a32ff (garde 820199979900) : en vente — n° 47 nino57270 : page eBay 820287270026 en cours, achat immédiat, aucune quantité affichée ; gardée 820199979900 en cours
  INSERT INTO pg_temp.a_armer VALUES ('c5e60d4d-d9b9-4710-9f62-dcf2337a32ff', '820199979900', '{"le":"2026-11-06T14:20:00+01:00","fenetre":"relue entre 14:10 et 14:20 (heure de Paris)","etat":"en vente","detail":"n° 47 nino57270 : page eBay 820287270026 en cours, achat immédiat, aucune quantité affichée ; gardée 820199979900 en cours"}'::jsonb);
  -- d788b5dd-31d4-487f-913c-e1cbd862b54d (garde 820199979900) : en vente — n° 47 nino57270 : page eBay 820287273237 en cours, achat immédiat, aucune quantité affichée ; gardée 820199979900 en cours
  INSERT INTO pg_temp.a_armer VALUES ('d788b5dd-31d4-487f-913c-e1cbd862b54d', '820199979900', '{"le":"2026-11-06T14:20:00+01:00","fenetre":"relue entre 14:10 et 14:20 (heure de Paris)","etat":"en vente","detail":"n° 47 nino57270 : page eBay 820287273237 en cours, achat immédiat, aucune quantité affichée ; gardée 820199979900 en cours"}'::jsonb);
  -- b62567f4-a2ec-4991-be56-f654ac36908d (garde 820199979900) : en vente — n° 47 nino57270 : page eBay 820287278635 en cours, achat immédiat, aucune quantité affichée ; gardée 820199979900 en cours
  INSERT INTO pg_temp.a_armer VALUES ('b62567f4-a2ec-4991-be56-f654ac36908d', '820199979900', '{"le":"2026-11-06T14:20:00+01:00","fenetre":"relue entre 14:10 et 14:20 (heure de Paris)","etat":"en vente","detail":"n° 47 nino57270 : page eBay 820287278635 en cours, achat immédiat, aucune quantité affichée ; gardée 820199979900 en cours"}'::jsonb);
  -- 23106e5b-5347-44d6-b3be-d5d7146cab93 (garde 820283667716) : en vente — n° 49 nino57270 : page eBay 820285486592 en cours, achat immédiat, aucune quantité affichée ; gardée 820283667716 en cours
  INSERT INTO pg_temp.a_armer VALUES ('23106e5b-5347-44d6-b3be-d5d7146cab93', '820283667716', '{"le":"2026-11-06T14:20:00+01:00","fenetre":"relue entre 14:10 et 14:20 (heure de Paris)","etat":"en vente","detail":"n° 49 nino57270 : page eBay 820285486592 en cours, achat immédiat, aucune quantité affichée ; gardée 820283667716 en cours"}'::jsonb);
  -- 8b5d2890-d87c-4048-b2f5-2ad974c8a9ff (garde 820283667716) : en vente — n° 49 nino57270 : page eBay 820285488550 en cours, achat immédiat, aucune quantité affichée ; gardée 820283667716 en cours
  INSERT INTO pg_temp.a_armer VALUES ('8b5d2890-d87c-4048-b2f5-2ad974c8a9ff', '820283667716', '{"le":"2026-11-06T14:20:00+01:00","fenetre":"relue entre 14:10 et 14:20 (heure de Paris)","etat":"en vente","detail":"n° 49 nino57270 : page eBay 820285488550 en cours, achat immédiat, aucune quantité affichée ; gardée 820283667716 en cours"}'::jsonb);
  -- ed5a60b6-fa91-483e-bdd6-1d2c22ccdfab (garde 820283667716) : en vente — n° 49 nino57270 : page eBay 820285490088 en cours, achat immédiat, aucune quantité affichée ; gardée 820283667716 en cours
  INSERT INTO pg_temp.a_armer VALUES ('ed5a60b6-fa91-483e-bdd6-1d2c22ccdfab', '820283667716', '{"le":"2026-11-06T14:20:00+01:00","fenetre":"relue entre 14:10 et 14:20 (heure de Paris)","etat":"en vente","detail":"n° 49 nino57270 : page eBay 820285490088 en cours, achat immédiat, aucune quantité affichée ; gardée 820283667716 en cours"}'::jsonb);
  -- 781258c2-f468-4cb0-b908-22265c80404c (garde 820283667716) : en vente — n° 49 nino57270 : page eBay 820285507441 en cours, achat immédiat, aucune quantité affichée ; gardée 820283667716 en cours
  INSERT INTO pg_temp.a_armer VALUES ('781258c2-f468-4cb0-b908-22265c80404c', '820283667716', '{"le":"2026-11-06T14:20:00+01:00","fenetre":"relue entre 14:10 et 14:20 (heure de Paris)","etat":"en vente","detail":"n° 49 nino57270 : page eBay 820285507441 en cours, achat immédiat, aucune quantité affichée ; gardée 820283667716 en cours"}'::jsonb);
  -- 84192eac-7368-4f27-9def-8247e896bb08 (garde 820283667716) : en vente — n° 49 nino57270 : page eBay 820293059700 en cours, achat immédiat, aucune quantité affichée ; gardée 820283667716 en cours
  INSERT INTO pg_temp.a_armer VALUES ('84192eac-7368-4f27-9def-8247e896bb08', '820283667716', '{"le":"2026-11-06T14:20:00+01:00","fenetre":"relue entre 14:10 et 14:20 (heure de Paris)","etat":"en vente","detail":"n° 49 nino57270 : page eBay 820293059700 en cours, achat immédiat, aucune quantité affichée ; gardée 820283667716 en cours"}'::jsonb);
  -- c284a6cb-0c7f-4df3-ab8b-0cb3f3d06c31 (garde 326909517725) : en vente — n° 51 quartierdeschineurs : page eBay 327006243111 en cours, achat immédiat, aucune quantité affichée ; gardée 326909517725 en cours
  INSERT INTO pg_temp.a_armer VALUES ('c284a6cb-0c7f-4df3-ab8b-0cb3f3d06c31', '326909517725', '{"le":"2026-11-06T14:20:00+01:00","fenetre":"relue entre 14:10 et 14:20 (heure de Paris)","etat":"en vente","detail":"n° 51 quartierdeschineurs : page eBay 327006243111 en cours, achat immédiat, aucune quantité affichée ; gardée 326909517725 en cours"}'::jsonb);
-- Les gardes, en base, maintenant ; chaque annonce gardée ou non est sauvegardée telle quelle.
INSERT INTO public._backup_0611_couples_retraits (lot, annonce, listing_id, ligne, garde, lecture)
SELECT 'ebay', a.id, a.listing_id, to_jsonb(a.*), x.garde, x.lecture
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
  FROM crees c WHERE b.lot = 'ebay' AND b.annonce::text = c.annonce;
SELECT b.lot, b.listing_id, b.garde, b.retrait_cree, j.platform, j.status, j.voie
  FROM public._backup_0611_couples_retraits b LEFT JOIN public.cross_post_jobs j ON j.id = b.retrait_cree
 WHERE b.lot = 'ebay' ORDER BY j.platform, b.listing_id;
COMMIT;
