-- ═══════════════════════════════════════════════════════════════════════════
-- BEEBS — LES 93 NUMÉROS POSÉS LE 30/09 SUR UNE PHOTO SEULEMENT PROCHE
-- DEVIENNENT LA QUESTION « EST-CE CETTE ANNONCE ? » (01/10, lot point 5)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le 30/09 (correction 1 de 20260930_corrections_sans_trace.sql), 185 dépôts
-- Beebs ont reçu le numéro de l'annonce relevée dont la photo ressemblait à
-- celle du dépôt. 92 sur une photo IDENTIQUE (dHash 0 et pHash 0) : gardés.
-- 93 sur une photo PROCHE (dHash ou pHash > 0 ; josephinecerni 8,
-- recrutementgroupezk704 85) : ce n'est pas une preuve d'identité.
--
-- Ce fichier, pour ces 93 seulement — et seulement s'ils portent ENCORE le
-- numéro du 30/09 (personne n'y a touché depuis) :
--   1. sauvegarde du dépôt et de l'annonce (_backup_0110_beebs_photo_proche) ;
--   2. le dépôt revient à son état d'AVANT le 30/09 (sauvegardé dans
--      platform_fields.avant_numero_photo_3009) : ni numéro, ni lien,
--      lien_en_attente et identifiant_beebs_non_prouve ; la trace du numéro
--      proposé est gardée (numero_photo_proche_en_question) ; le lien retrouvé
--      par le titre avant le 30/09 (41 dépôts) n'est PAS remis ;
--   3. l'annonce est détachée du dépôt et de la fiche, et porte la question :
--      proposition { inventaire_id = fiche du dépôt, job_id = dépôt,
--      motif = 'depot_beebs_photo_proche' } — l'écran « Annonces à
--      rattacher » la pose ; « oui » rattache par le geste
--      (rapprochement_decider recâble le dépôt sur ce numéro, preuve
--      utilisateur) ; « non » efface la proposition.
-- Tant que la personne n'a pas répondu : le dépôt n'a ni numéro ni lien, donc
-- aucun retrait ne peut le viser (get-pending-jobs retient tout retrait Beebs
-- sans lien, jamais de ciblage par titre). Le relevé laisse la question en
-- place (migration 20261001120000, à appliquer AVANT ce fichier).
-- Inverse : 20261001_beebs_93_numeros_photo_proche_en_question_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $g$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rapprocher_traiter_annonce'
                  AND pg_get_functiondef(oid) LIKE '%depot_beebs_photo_proche%') THEN
    RAISE EXCEPTION 'appliquer d''abord la migration 20261001120000 (garde du relevé)';
  END IF;
END $g$;

CREATE TABLE IF NOT EXISTS public._backup_0110_beebs_photo_proche (
  job_id uuid PRIMARY KEY, job jsonb NOT NULL, annonce jsonb, le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_0110_beebs_photo_proche ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0110_beebs_photo_proche FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE _cibles ON COMMIT DROP AS
SELECT j.id AS job_id, j.user_id, j.inventaire_id,
       j.platform_fields -> 'numero_par_photo' AS npp,
       j.platform_fields -> 'avant_numero_photo_3009' AS avant,
       (j.platform_fields -> 'numero_par_photo' ->> 'annonce')::uuid AS annonce_id
  FROM public.cross_post_jobs j
 WHERE j.platform = 'beebs'
   AND j.platform_fields ? 'numero_par_photo' AND j.platform_fields ? 'avant_numero_photo_3009'
   AND ((j.platform_fields -> 'numero_par_photo' ->> 'dhash')::int > 0
        OR (j.platform_fields -> 'numero_par_photo' ->> 'phash')::int > 0)
   -- intact depuis le 30/09 : le numéro posé ce jour-là est toujours celui du dépôt
   AND j.platform_listing_id = j.platform_fields -> 'numero_par_photo' ->> 'numero'
   AND j.status = 'published'
   -- l'annonce est encore celle du 30/09, rattachée à CE dépôt, et vivante
   AND EXISTS (SELECT 1 FROM public.annonces_plateforme a
                WHERE a.id = (j.platform_fields -> 'numero_par_photo' ->> 'annonce')::uuid
                  AND a.job_id = j.id AND a.inventaire_id = j.inventaire_id
                  AND a.listing_id = j.platform_listing_id AND a.disparu_le IS NULL);

INSERT INTO public._backup_0110_beebs_photo_proche (job_id, job, annonce)
SELECT c.job_id, to_jsonb(j), to_jsonb(a)
  FROM _cibles c
  JOIN public.cross_post_jobs j ON j.id = c.job_id
  JOIN public.annonces_plateforme a ON a.id = c.annonce_id
ON CONFLICT (job_id) DO NOTHING;

UPDATE public.cross_post_jobs j
   -- Ni numéro ni lien. ⚠️ 41 des 93 avaient AVANT le 30/09 un lien retrouvé
   -- par les anciennes extensions sur « Mes annonces » (par le titre, jamais
   -- une preuve — beebs-lien le met en quarantaine) : on ne le remet PAS, il
   -- reste en trace (url_avant_3009).
   SET platform_listing_id = NULL,
       listing_url = NULL,
       platform_fields = (j.platform_fields - 'numero_par_photo' - 'avant_numero_photo_3009')
         || jsonb_strip_nulls(jsonb_build_object(
              'lien_en_attente', c.avant -> 'lien_en_attente',
              'identifiant_beebs_non_prouve', c.avant -> 'identifiant_beebs_non_prouve'))
         || jsonb_build_object('numero_photo_proche_en_question', jsonb_build_object(
              'numero', c.npp ->> 'numero', 'annonce', c.annonce_id,
              'dhash', (c.npp ->> 'dhash')::int, 'phash', (c.npp ->> 'phash')::int,
              'pose_le_3009', c.npp ->> 'le', 'retire_le', now(),
              'url_avant_3009', c.avant ->> 'listing_url',
              'par', 'reparation 20261001 point 5'))
  FROM _cibles c
 WHERE j.id = c.job_id;

UPDATE public.annonces_plateforme a
   SET inventaire_id = NULL, job_id = NULL, source_rapprochement = NULL, ignoree_le = NULL,
       proposition = jsonb_build_object(
         'inventaire_id', c.inventaire_id, 'job_id', c.job_id, 'motif', 'depot_beebs_photo_proche',
         'signaux', jsonb_build_object('dhash', (c.npp ->> 'dhash')::int, 'phash', (c.npp ->> 'phash')::int),
         'at', now()),
       updated_at = now()
  FROM _cibles c
 WHERE a.id = c.annonce_id;

INSERT INTO public.rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
SELECT c.user_id, c.annonce_id, c.inventaire_id, 'propose', 'auto', NULL,
       jsonb_build_object('motif', 'depot_beebs_photo_proche', 'job_id', c.job_id,
                          'reparation', '20261001 point 5', 'numero', c.npp ->> 'numero')
  FROM _cibles c;

SELECT u.email, count(*) AS en_question
  FROM _cibles c JOIN auth.users u ON u.id = c.user_id
 GROUP BY u.email ORDER BY 1;
COMMIT;
