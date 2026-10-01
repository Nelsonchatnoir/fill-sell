-- ═══════════════════════════════════════════════════════════════════════════
-- BEEBS — LES 93 « PHOTO PROCHE » : NUMÉROS POSÉS PAR LA MÉTHODE DU MOMENT DU
-- DÉPÔT, QUESTION LEVÉE (01/10 suite, point 3, GO Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- beebs_numeros_par_sequence(..., p_questions_photo := true) — migration
-- 20261001130000 : seuls les dépôts en question « photo proche » ; chacun ne
-- prend que l'annonce de sa question, si rang + titre exact + photo
-- concordent encore AU MOMENT D'ÉCRIRE ; sinon il garde sa question.
-- Rejeu annulé (01/10 ~11:50) : josephinecerni 8/8, recrutementgroupezk704
-- 85/85 ; 0 question photo restante, 2 questions du point 4 intactes, 92
-- numéros « photo identique » intacts, 0 numéro sur deux fiches.
-- Sauvegarde : _backup_0110_beebs_q93. Inverse : …_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public._backup_0110_beebs_q93 (
  quoi text NOT NULL, id uuid NOT NULL, ligne jsonb NOT NULL, le timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (quoi, id));
ALTER TABLE public._backup_0110_beebs_q93 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0110_beebs_q93 FROM PUBLIC, anon, authenticated;

INSERT INTO public._backup_0110_beebs_q93 (quoi, id, ligne)
SELECT 'job', j.id, to_jsonb(j) FROM cross_post_jobs j
 WHERE j.platform_fields ? 'numero_photo_proche_en_question' AND j.platform_listing_id IS NULL
ON CONFLICT DO NOTHING;
INSERT INTO public._backup_0110_beebs_q93 (quoi, id, ligne)
SELECT 'annonce', a.id, to_jsonb(a) - 'capture' FROM annonces_plateforme a
 WHERE a.proposition ->> 'motif' = 'depot_beebs_photo_proche'
ON CONFLICT DO NOTHING;

SELECT 'josephinecerni' AS compte, public.beebs_numeros_par_sequence('afeef3c7-0b0b-408c-a25b-3823448e3eb1'::uuid, false, true) - 'detail' AS resultat
UNION ALL
SELECT 'recrutementgroupezk704', public.beebs_numeros_par_sequence('7373c96c-c0ed-4947-a4c5-ee1b0d2b8d28'::uuid, false, true) - 'detail';
COMMIT;
