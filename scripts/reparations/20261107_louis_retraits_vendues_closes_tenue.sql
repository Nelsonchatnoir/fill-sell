-- ═══════════════════════════════════════════════════════════════════════════
-- LOUIS (Amiral) — RETRAIT DES 4 ANNONCES « ARTICLE VENDU » (feu vert nommé de Nico, 07/11 nuit) — ÉTAPE 0 : TENUE
-- ═══════════════════════════════════════════════════════════════════════════
-- Ordre de Nico : retirer une par une, par le chemin normal de l'extension, les 4 annonces vendues dont la vente est
-- CLOSE (transaction « sold », page publique « Article vendu ») — Noir et Rouge 3297400164, Adaptateurs Orange
-- 3298491503, Blanc 3280443604, Noir et Gris 3297299585 — puis, APRÈS avoir relu chaque page publique hors ligne,
-- laisser la remise partir seule, hors de toute série qui la bloquerait. Les 4 achats en cours (3295743872,
-- 3295398035, 3298021777, 3297234692) ne sont JAMAIS touchés.
-- Cette étape TIENT les 4 remises (exige_version « 9.9.9 » dans leur marqueur de série : le mécanisme de tenue propre à
-- une série posée par réparation, lu par get-pending-jobs) pour qu'aucune ne parte entre la fin d'un retrait et la
-- relecture de la page publique. Chaque remise est ensuite libérée par
-- 20261107_louis_retraits_vendues_closes_liberer_<annonce>.sql (sortie de série), seulement après cette relecture.
-- Inverse : 20261107_louis_retraits_vendues_closes_INVERSE.sql (marqueurs d'avant, retraits encore en attente annulés).

CREATE TABLE IF NOT EXISTS public._backup_0711_louis_retraits_vendues (
  le timestamptz NOT NULL DEFAULT now(), t text NOT NULL, cle text NOT NULL, ligne jsonb, retrait_cree uuid);
ALTER TABLE public._backup_0711_louis_retraits_vendues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0711_louis_retraits_vendues FROM PUBLIC, anon, authenticated;

INSERT INTO public._backup_0711_louis_retraits_vendues (t, cle, ligne)
SELECT 'remise', j.id::text, jsonb_build_object('status', j.status, 'platform_fields', j.platform_fields)
  FROM public.cross_post_jobs j
 WHERE j.id IN ('18af38a2-8b0d-4c93-b86e-db04086bf1d5', 'fdda158a-3bcf-4ac6-9695-8615379a035c',
                '886605bf-8aaa-42d2-98ed-75b56756a5ae', '951cc7fc-5fb1-4698-9895-6664ece9c21d')
   AND NOT EXISTS (SELECT 1 FROM public._backup_0711_louis_retraits_vendues b WHERE b.t = 'remise' AND b.cle = j.id::text);

INSERT INTO public._backup_0711_louis_retraits_vendues (t, cle, ligne)
SELECT 'annonce', a.listing_id, to_jsonb(a.*)
  FROM public.annonces_plateforme a
 WHERE a.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND a.platform = 'leboncoin'
   AND a.listing_id IN ('3297400164', '3298491503', '3280443604', '3297299585')
   AND NOT EXISTS (SELECT 1 FROM public._backup_0711_louis_retraits_vendues b WHERE b.t = 'annonce' AND b.cle = a.listing_id);

UPDATE public.cross_post_jobs j
   SET platform_fields = jsonb_set(j.platform_fields, '{serie_un_par_un}',
         (j.platform_fields -> 'serie_un_par_un') || jsonb_build_object('exige_version', '9.9.9',
           'tenue_retrait_vendue', jsonb_build_object('le', now(), 'annonce_vendue', j.platform_fields #>> '{remise_en_vente,annonce_vendue}',
             'pose_par', 'réparation 07/11 nuit (feu vert de Nico : retrait des vendues closes ; libérée après relecture de la page)')))
 WHERE j.id IN ('18af38a2-8b0d-4c93-b86e-db04086bf1d5', 'fdda158a-3bcf-4ac6-9695-8615379a035c',
                '886605bf-8aaa-42d2-98ed-75b56756a5ae', '951cc7fc-5fb1-4698-9895-6664ece9c21d')
   AND j.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND j.platform = 'leboncoin' AND j.action = 'publish'
   AND j.status = 'pending' AND j.platform_fields ? 'serie_un_par_un'
   AND j.platform_fields #>> '{remise_en_vente,annonce_vendue}' IN ('3297400164', '3298491503', '3280443604', '3297299585');

SELECT left(j.id::text, 8) AS id, j.status, j.platform_fields #>> '{remise_en_vente,annonce_vendue}' AS vendue,
       j.platform_fields #>> '{serie_un_par_un,rang}' AS rang, j.platform_fields #>> '{serie_un_par_un,exige_version}' AS tenue
  FROM public.cross_post_jobs j
 WHERE j.id IN ('18af38a2-8b0d-4c93-b86e-db04086bf1d5', 'fdda158a-3bcf-4ac6-9695-8615379a035c',
                '886605bf-8aaa-42d2-98ed-75b56756a5ae', '951cc7fc-5fb1-4698-9895-6664ece9c21d');
