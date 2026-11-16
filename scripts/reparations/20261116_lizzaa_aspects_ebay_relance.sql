-- 20261116_lizzaa_aspects_ebay_relance.sql — (16/11/2026, lot du matin, point 1.4 de Nico) DÉBLOQUER LES 8 JOBS eBAY DE lizzaa
-- (d5531b8e), lot eBay du 15/11 23:07, voie extension — APRÈS le déploiement d'update-job-status portant la règle
-- « un aspect obligatoire vide au dépôt se déduit avant d'être demandé » (_shared/ebay-aspects-depot.ts).
--   A. Les 7 jobs « aspect(s) obligatoire(s) eBay vide(s) » (Type ; Type, Couleur ; Département) : RELANCÉS comme le bouton
--      « Relancer » de l'app (needs_user → pending, erreur archivée puis effacée, compteurs remis, marqueurs d'attente et
--      question retirés). Au prochain passage, la garde d'ebay.js signale les aspects vides → le serveur les déduit (règle
--      de la voie API) → le job repart seul ; ce qui ne se déduit pas reste demandé, seul.
--   B. Le job « Assiette vintage (1960-70) » (adb7cfe5, 1,20 €) : eBay a refusé le brouillon (« Montant de refus
--      automatique » des offres, réglage du COMPTE eBay que FillSell ne touche jamais). Il reste à la personne ; seul son
--      MESSAGE change : le vrai (messageOffresEbay, _shared/ebay-brouillon-refus.js) au lieu de « n'a pas abouti après
--      plusieurs essais ».
-- Rien d'autre : aucune annonce, aucun autre job, aucun autre compte. Sauvegarde : public._backup_1611_lizzaa_aspects_ebay.
-- Inverse : 20261116_lizzaa_aspects_ebay_relance_INVERSE.sql. Gardes : rien ne bouge si un job n'est plus needs_user ou
-- n'est plus celui de l'audit.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_1611_lizzaa_aspects_ebay AS
  SELECT now() AS sauve_le, j.* FROM public.cross_post_jobs j WHERE false;
ALTER TABLE public._backup_1611_lizzaa_aspects_ebay ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1611_lizzaa_aspects_ebay FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  v_user uuid := 'd5531b8e-ec32-4dd1-8213-bb15e9be479b';
  v_ids uuid[] := ARRAY[
    'bf38369d-fd55-4382-8474-999740c77b76',  -- Montre à gousset (Département)
    '09997a57-de38-4cc7-952d-c664da59520b',  -- Cartouches imprimante 364 (Type)
    '8a8d57ed-e222-4785-bdb3-caeedae3fe74',  -- Ensemble de verres (Type)
    '36d050fe-4c33-49f0-94f4-e8b382d0af15',  -- Set de verres à shot vintage (Type, Couleur)
    '5b22c18f-4f03-46b0-a720-3fa4685482c0',  -- Lot de 6 verres à shot (Type, Couleur)
    'a8f56218-3105-44cf-8767-115b73a51fc4',  -- Verre à shot Jack Daniel's (Type, Couleur)
    '214b52ce-c8e5-4b86-a3ee-7e7c347f3121'   -- Lot de 2 verres à pied (Type)
  ]::uuid[];
  v_assiette uuid := 'adb7cfe5-0a6d-4c4c-bc13-deb7b26c98b5';
  v_msg text := 'eBay refuse de publier l''annonce : il manque le « Montant de refus automatique » des offres. Ce réglage vient des préférences d''offres de ton compte eBay (refus automatique des offres sous un montant), qu''eBay n''a pas pu appliquer à ce prix ; FillSell ne le règle jamais à ta place. Rien n''a été publié. Désactive le refus automatique des offres (ou fixe un montant) dans tes préférences de vente eBay, ou augmente le prix, puis relance d''un clic ci-dessous.';
  j public.cross_post_jobs%ROWTYPE;
  v_pf jsonb;
  v_arch jsonb;
  v_now text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  n int := 0;
  v_id uuid;
BEGIN
  -- A. Les 7 relances.
  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT * INTO j FROM public.cross_post_jobs WHERE id = v_id FOR UPDATE;
    IF NOT FOUND OR j.user_id <> v_user OR j.platform <> 'ebay' OR j.status <> 'needs_user'
       OR coalesce(j.error, '') NOT LIKE '%aspect(s) obligatoire(s) eBay vide(s)%' THEN
      RAISE EXCEPTION 'job % différent de l''audit (statut %, erreur %) : rien fait', v_id, j.status, left(coalesce(j.error, ''), 60);
    END IF;
    INSERT INTO public._backup_1611_lizzaa_aspects_ebay SELECT now(), j.*;
    v_arch := coalesce(j.platform_fields -> 'erreurs_archivees', '[]'::jsonb)
           || jsonb_build_array(jsonb_build_object('erreur', j.error, 'le', v_now, 'par', 'relance_reparation_1611', 'statut', j.status));
    v_pf := (j.platform_fields - 'next_action_after' - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le'
                                - 'needs_user_vu_erreur' - 'needsUserField' - 'needsUserFields' - 'needsUserBoucle'
                                - 'needs_user_source' - 'needs_user_sans_motif' - 'champs_a_completer' - 'processing_since')
         || jsonb_build_object(
              'needsUserAttempts', 0,
              'relances_manuelles', coalesce((j.platform_fields ->> 'relances_manuelles')::int, 0) + 1,
              'derniere_relance_manuelle', v_now,
              'erreurs_archivees', v_arch,
              'relance_reparation_1611', jsonb_build_object('le', now(), 'par', 'point 1.4 de Nico (lot du 16/11 matin)'));
    UPDATE public.cross_post_jobs SET status = 'pending', error = NULL, platform_fields = v_pf WHERE id = v_id AND status = 'needs_user';
    n := n + 1;
  END LOOP;
  RAISE NOTICE '% job(s) relancé(s) (needs_user → pending)', n;
  -- B. L'assiette : le message vrai, rien d'autre.
  SELECT * INTO j FROM public.cross_post_jobs WHERE id = v_assiette FOR UPDATE;
  IF NOT FOUND OR j.user_id <> v_user OR j.status <> 'needs_user'
     OR coalesce(j.platform_fields -> 'ebay_api_publish' ->> 'manquants', '') NOT LIKE '%Montant de refus automatique%' THEN
    RAISE EXCEPTION 'assiette différente de l''audit (statut %) : rien fait', j.status;
  END IF;
  INSERT INTO public._backup_1611_lizzaa_aspects_ebay SELECT now(), j.*;
  UPDATE public.cross_post_jobs
     SET error = v_msg,
         platform_fields = j.platform_fields || jsonb_build_object('needs_user_source', 'relancer',
           'message_reparation_1611', jsonb_build_object('le', now(), 'motif', 'ebay_offres_compte', 'par', 'point 1.3 de Nico (lot du 16/11 matin)'))
   WHERE id = v_assiette AND status = 'needs_user';
  RAISE NOTICE 'assiette % : message vrai posé', v_assiette;
END $$;
COMMIT;
SELECT left(id::text, 8) AS job, status, left(coalesce(error, ''), 80) AS erreur, platform_fields ->> 'relances_manuelles' AS relances
  FROM public.cross_post_jobs WHERE id IN (SELECT id FROM public._backup_1611_lizzaa_aspects_ebay) ORDER BY 1;
