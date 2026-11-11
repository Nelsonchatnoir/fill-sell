-- (08/11, point 2 de Nico) Relance de la publication eBay 8d59f147 de Sébastien (compte 48dd94f7, CD « Mort
-- Shuman - Compilation "Expression" (16 titres) »), refusée deux fois (14:16, 14:22) en 25002 « code JavaScript »
-- [0=DESCRIPTION] : le filtre « contenu actif » d'eBay lisait `expression (` dans « collection Expression (PolyGram) ».
-- La RÈGLE est corrigée (supabase/functions/_shared/ebay-publication.ts, sansContenuActifEbay — ebay-api-worker et
-- ebay-account redéployés AVANT ce script) ; ce script ne fait que la remise en file prévue par la règle de relance de
-- Nico : status 'pending', error NULL, retrait de needs_user_*, needsUserAttempts, next_action_after, error_technique,
-- processing_since ; erreurs_archivees (l'erreur actuelle y est ajoutée) et tout le reste CONSERVÉS.
-- needs_user_source = « relancer » posé par défaut (needs_user_sans_motif) : pas une garde volontaire.
-- Le cron ebay-api-worker-2min (voie api) la reprend seul ; l'offre 349330011011 est mise à jour avant publishOffer.
-- Inverse : 20261108_relance_ebay_contenu_actif_INVERSE.sql (sauvegarde _backup_0811_ebay_contenu_actif).
BEGIN;
DO $garde$ BEGIN
  IF to_regclass('public._backup_0811_ebay_contenu_actif') IS NOT NULL THEN RAISE EXCEPTION 'script déjà passé : rien n''est écrit'; END IF;
END $garde$;
CREATE TABLE public._backup_0811_ebay_contenu_actif AS
SELECT now() AS le, j.id, j.status, j.error, j.platform_fields FROM public.cross_post_jobs j
 WHERE j.id = '8d59f147-a423-45d0-8b54-1d60a9d3c36f';
ALTER TABLE public._backup_0811_ebay_contenu_actif ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0811_ebay_contenu_actif FROM PUBLIC, anon, authenticated;
DO $ecrit$ DECLARE n int; BEGIN
  UPDATE public.cross_post_jobs j SET status = 'pending', error = NULL,
    platform_fields = (j.platform_fields
        - 'needs_user_source' - 'needsUserAttempts' - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le'
        - 'needs_user_vu_erreur' - 'needs_user_sans_motif' - 'next_action_after' - 'error_technique' - 'processing_since')
      || jsonb_build_object(
        'erreurs_archivees', (COALESCE(j.platform_fields->'erreurs_archivees', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object('le', now(), 'statut', 'needs_user', 'erreur', left(j.error, 600),
               'par', 'réparation 08/11 (point 2 : motif de code neutralisé)'))),
        'relance_contenu_actif_ebay', jsonb_build_object('le', now(), 'par', 'scripts/reparations/20261108_relance_ebay_contenu_actif.sql'))
   WHERE j.id = '8d59f147-a423-45d0-8b54-1d60a9d3c36f' AND j.status = 'needs_user' AND j.platform = 'ebay' AND j.voie = 'api'
     AND j.error LIKE '%25002%JavaScript%';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'la tâche a bougé : rien n''est écrit'; END IF;
END $ecrit$;
SELECT id, status, error, jsonb_array_length(platform_fields->'erreurs_archivees') archivees, platform_fields->'relance_contenu_actif_ebay' relance
  FROM public.cross_post_jobs WHERE id = '8d59f147-a423-45d0-8b54-1d60a9d3c36f';
COMMIT;
