-- ═══════════════════════════════════════════════════════════════════════════
-- MARIE (mariecreativedigital) — CHEMISE HILFIGER BEEBS : LE VRAI MOTIF DIT
-- ═══════════════════════════════════════════════════════════════════════════
-- Job 0f457c57-7913-4b0e-a689-d534246705f1 (Beebs, publish), needs_user
-- « relancer » après six essais restés sur le formulaire (« Taille 8XL »).
-- Cause : le sélecteur d'adresse (≤ 0.6.82) a validé « 8XL » (option de taille)
-- pour « 9 Rue du 8 Mai 1945 08000 Villers-Semeuse » — rien soumis.
-- Taille : M sur la fiche ET sur son annonce Vinted 10200474158 (attribut
-- Taille 515 = « M », relu le 01/10), présente dans la liste Beebs : rien à
-- changer, elle est déjà posée (taille, beebsAspects).
-- Relevé Beebs du 01/10 16:40 : 0 annonce en ligne — aucun doublon possible.
-- Le job reste needs_user, avec le vrai motif ; il repart TOUT SEUL dès que son
-- poste porte la 0.6.83 (correctif beebs_adresse_suggestion_stricte,
-- get-pending-jobs). Le relancer sur la 0.6.81 refait le même mur.
-- Inverse : 20261001_marie_beebs_chemise_8xl_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public._backup_0110_marie_beebs (
  job_id uuid PRIMARY KEY, error_avant text, platform_fields_avant jsonb, le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_0110_marie_beebs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0110_marie_beebs FROM PUBLIC, anon, authenticated;

INSERT INTO public._backup_0110_marie_beebs (job_id, error_avant, platform_fields_avant)
SELECT id, error, platform_fields FROM cross_post_jobs
 WHERE id = '0f457c57-7913-4b0e-a689-d534246705f1'
ON CONFLICT (job_id) DO NOTHING;

UPDATE cross_post_jobs
   SET error = 'Beebs n''a pas validé ton adresse d''envoi : FillSell a cliqué « 8XL » dans la page au lieu de ton adresse (la taille affichée est devenue « 8XL » au lieu de « M »). Rien n''a été publié sur Beebs. C''est un défaut de FillSell, corrigé dans la prochaine version de l''extension : la publication repartira toute seule dès que ton ordinateur l''aura.',
       platform_fields = platform_fields
         || jsonb_build_object(
              'pas_de_rouge', jsonb_build_object('at', now(), 'motif', 'beebs_adresse_mal_choisie', 'verdict', 'a_toi'),
              'taille_relue_annonce_vinted', jsonb_build_object('valeur', 'M', 'annonce', '10200474158', 'le', now()))
 WHERE id = '0f457c57-7913-4b0e-a689-d534246705f1'
   AND status = 'needs_user'
   AND platform_fields->>'taille' = 'M';

SELECT id, status, left(error, 80) AS error, platform_fields->'pas_de_rouge' AS pas_de_rouge
  FROM cross_post_jobs WHERE id = '0f457c57-7913-4b0e-a689-d534246705f1';
COMMIT;
