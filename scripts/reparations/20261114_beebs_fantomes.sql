-- 20261114_beebs_fantomes.sql — (14/11/2026, décision 3 de Nico sur le rapport du bloc F) LES FANTÔMES DE L'INDEX BEEBS,
-- PROUVÉS, RETIRÉS DE « EN LIGNE ».
-- Cause (complément 2) : l'index public de Beebs garde des annonces que le vendeur a supprimées ; le relevé les faisait entrer
-- « en ligne » (corrigé : extension 0.6.189, copie Cloud servie depuis le 14/11 12:39) — d'où des fiches réimportées en boucle.
-- « Fantôme PROUVÉ » = la page publique de l'annonce répond 404 (« Oups, page perdue », aucune fiche produit), relue dans un
-- navigateur le 14/11 vers 14:10 (heure de Paris), avec un témoin vivant (/fr/p/34050787 → 200, InStock) : liste ci-dessous.
-- Geste, pour chaque fantôme prouvé ENCORE « en ligne » chez nous (disparu_le NULL) — l'état final d'une annonce retirée :
--   · annonces_plateforme : disparu_le = maintenant ; plus rattachée à une fiche (inventaire_id NULL) ;
--   · ses tâches de publication « published » (rattachement d'import ou de l'utilisateur) : « cancelled », la preuve notée ;
--   · AUCUNE fiche supprimée, aucune tâche de retrait touchée (celles en attente se concluront par la page 404).
-- Sauvegardes : _backup_1411_beebs_fantomes_annonces / _jobs (une fois). Inverse : 20261114_beebs_fantomes_INVERSE.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_1411_beebs_fantomes_annonces AS SELECT now() AS sauve_le, a.* FROM public.annonces_plateforme a WHERE false;
CREATE TABLE IF NOT EXISTS public._backup_1411_beebs_fantomes_jobs AS SELECT now() AS sauve_le, j.* FROM public.cross_post_jobs j WHERE false;
ALTER TABLE public._backup_1411_beebs_fantomes_annonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1411_beebs_fantomes_annonces FROM PUBLIC, anon, authenticated;
ALTER TABLE public._backup_1411_beebs_fantomes_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1411_beebs_fantomes_jobs FROM PUBLIC, anon, authenticated;
CREATE TEMP TABLE fantomes (user_id uuid, listing_id text) ON COMMIT DROP;
INSERT INTO fantomes VALUES
  -- 13e274de : les 6 annonces de l'index réimportées en boucle le 14/11 (404 relu le 14/11 ~14:05)
  ('13e274de-7af1-4368-8c31-afe214252ca2', '27214557'), ('13e274de-7af1-4368-8c31-afe214252ca2', '27214877'),
  ('13e274de-7af1-4368-8c31-afe214252ca2', '27214883'), ('13e274de-7af1-4368-8c31-afe214252ca2', '27214891'),
  ('13e274de-7af1-4368-8c31-afe214252ca2', '27214895'), ('13e274de-7af1-4368-8c31-afe214252ca2', '27214901')
  -- d71db658 : 12 vues dans l'index, 10 en vente ; les 2 en 404 (relu le 14/11 ~14:15)
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'd71db658%'), '7902655')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'd71db658%'), '7903242')
  -- ebdf29f0 : 57 vues dans l'index, 36 en vente ; les 21 en 404 (relu le 14/11 ~14:15)
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '13384680')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '13621355')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '13940291')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '14043805')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '15396253')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '15973489')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '21113649')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '26366024')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '9114350')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '9114365')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '9114370')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '9114410')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '9114412')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '9114419')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '9114492')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '9114531')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '9114532')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '9114533')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '9114536')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '9114543')
  ,((SELECT id FROM auth.users WHERE id::text LIKE 'ebdf29f0%'), '9114545')
;
CREATE TEMP TABLE cibles ON COMMIT DROP AS
  SELECT a.* FROM public.annonces_plateforme a JOIN fantomes f ON f.user_id = a.user_id AND f.listing_id = a.listing_id
   WHERE a.platform = 'beebs' AND a.disparu_le IS NULL;
CREATE TEMP TABLE jobs_cibles ON COMMIT DROP AS
  SELECT j.* FROM public.cross_post_jobs j JOIN cibles c ON c.user_id = j.user_id
   WHERE j.platform = 'beebs' AND j.status = 'published' AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
     AND (j.id = c.job_id OR j.platform_fields -> 'rattachement' ->> 'annonce_id' = c.id::text OR btrim(COALESCE(j.platform_listing_id, '')) = c.listing_id);
INSERT INTO public._backup_1411_beebs_fantomes_annonces SELECT now(), c.* FROM cibles c
  WHERE NOT EXISTS (SELECT 1 FROM public._backup_1411_beebs_fantomes_annonces b WHERE b.id = c.id);
INSERT INTO public._backup_1411_beebs_fantomes_jobs SELECT now(), j.* FROM jobs_cibles j
  WHERE NOT EXISTS (SELECT 1 FROM public._backup_1411_beebs_fantomes_jobs b WHERE b.id = j.id);
UPDATE public.cross_post_jobs j SET status = 'cancelled',
    error = 'Fantôme de l''index Beebs : la page de l''annonce répond 404 (réparation du 14/11, bloc F)',
    platform_fields = COALESCE(j.platform_fields, '{}'::jsonb) || jsonb_build_object('fantome_index_beebs',
      jsonb_build_object('le', now(), 'preuve', 'page publique 404, relue le 14/11 ~14:05 (témoin vivant 200)', 'reparation', '20261114_beebs_fantomes'))
  WHERE j.id IN (SELECT id FROM jobs_cibles);
UPDATE public.annonces_plateforme a SET disparu_le = now(), inventaire_id = NULL, updated_at = now()
  WHERE a.id IN (SELECT id FROM cibles);
SELECT (SELECT count(*) FROM cibles) AS annonces_reparees, (SELECT count(*) FROM jobs_cibles) AS taches_closes,
       (SELECT string_agg(left(user_id::text, 8) || ':' || listing_id, ', ' ORDER BY listing_id) FROM cibles) AS detail;
COMMIT;
