-- ═══════════════════════════════════════════════════════════════════════════
-- RATTRAPAGE — LES REPUBLICATIONS « MISES DE CÔTÉ » À TORT REPARTENT (11/10, A3)
-- ═══════════════════════════════════════════════════════════════════════════
-- jonathanrabany : 8 republications Vinted à l'étape 'captured', mises de côté
-- « tâche sans démarrage » (servies 61-62 fois) alors que l'extension les
-- retenait EN SILENCE derrière une autre republication du compte à l'étape
-- 'deleted' (166e5729, Vinted restreint les mises en vente du compte depuis le
-- 07/10). PAR LA RÈGLE (la même que get-pending-jobs, règle « retenue hors
-- ligne ») : toute republication en needs_user « tache_sans_demarrage » à
-- l'étape 'captured' dont une AUTRE republication du compte, sur la même
-- plateforme, est à l'étape 'deleted' (pending/processing) repart par la voie
-- de la relance (mêmes champs que « Relancer » dans l'app) :
--   · status 'pending', error null, l'erreur archivée (erreurs_archivees) ;
--   · le mur levé (needs_user_source, tache_sans_demarrage) ;
--   · la copie d'annonce SERVIE figée par erreur (servi_par_le_serveur,
--     republish_copie_servie) retirée : le job revient à « pas de copie »,
--     comme les 1 009 republications réussies — l'extension recapture
--     (capture > 24 h) et reconstruit sa copie AVANT tout retrait.
-- get-pending-jobs les retient alors avec leur motif (« En attente : ton
-- annonce … a été retirée et n'est pas encore revenue en ligne … ») jusqu'à
-- la remise en ligne de 166e5729 — RIEN n'est retiré de Vinted entre-temps.
-- Sauvegarde AVANT (_backup_1110_republications_retenues). Aucun mail.
--   npx supabase db query --linked -f scripts/reparations/20261011_republications_retenues_relance.sql
-- Inverse : remettre les lignes sauvegardées (status, error, platform_fields).
BEGIN;
SET LOCAL statement_timeout = '30s';
CREATE TEMP TABLE _cibles ON COMMIT DROP AS
  SELECT j.id FROM public.cross_post_jobs j
   WHERE j.status = 'needs_user' AND j.action = 'republish'
     AND j.platform_fields ->> 'needs_user_source' = 'tache_sans_demarrage'
     AND j.platform_fields ->> 'republish_step' = 'captured'
     AND EXISTS (SELECT 1 FROM public.cross_post_jobs f
                  WHERE f.user_id = j.user_id AND f.platform = j.platform AND f.action = 'republish'
                    AND f.id <> j.id AND f.status IN ('pending', 'processing')
                    AND f.platform_fields ->> 'republish_step' = 'deleted');
CREATE TABLE IF NOT EXISTS public._backup_1110_republications_retenues AS SELECT now() AS sauve_le, j.* FROM public.cross_post_jobs j WHERE false;
ALTER TABLE public._backup_1110_republications_retenues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1110_republications_retenues FROM anon, authenticated;
INSERT INTO public._backup_1110_republications_retenues SELECT now(), j.* FROM public.cross_post_jobs j WHERE j.id IN (SELECT id FROM _cibles);

UPDATE public.cross_post_jobs j
   SET status = 'pending', error = NULL,
       platform_fields = (
         (coalesce(j.platform_fields, '{}'::jsonb)
           - 'needs_user_source' - 'tache_sans_demarrage' - 'next_action_after' - 'needsUserAttempts'
           - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le' - 'needs_user_vu_erreur'
           - 'attente_session' - 'refus_passager' - 'republish_copie_servie'
           - CASE WHEN (j.platform_fields -> 'republish_snapshot' ->> 'servi_par_le_serveur') = 'true' THEN 'republish_snapshot' ELSE '' END)
         || jsonb_build_object(
              'needsUserAttempts', 0,
              'erreurs_archivees', coalesce(j.platform_fields -> 'erreurs_archivees', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                'erreur', j.error, 'statut', j.status, 'archive_le', now(), 'par', 'relance_serveur_1110 (retenue par une annonce hors ligne)')),
              'relance_serveur', jsonb_build_object('le', now(), 'par', 'rattrapage_1110_republications_retenues',
                'motif', 'mise de côté à tort : retenue par une autre republication à l''étape « deleted »')))
 WHERE j.id IN (SELECT id FROM _cibles) AND j.status = 'needs_user';
COMMIT;

SELECT j.id, j.status, j.platform_fields ? 'republish_snapshot' AS copie, jsonb_array_length(j.platform_fields -> 'erreurs_archivees') AS erreurs_archivees
  FROM public.cross_post_jobs j WHERE j.id IN (SELECT id FROM public._backup_1110_republications_retenues);
