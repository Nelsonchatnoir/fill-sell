-- ═══════════════════════════════════════════════════════════════════════════
-- REPRISE (phase 3, 15/10) : TÂCHES « MISES DE CÔTÉ » À TORT PAR LA FILE SERVIE ENTIÈRE
-- ═══════════════════════════════════════════════════════════════════════════
-- Cause prouvée : get-pending-jobs servait la file entière et la réservation
-- comptait un « service sans démarrage » pour chaque tâche à chaque appel ; les
-- tâches qui attendaient leur tour étaient passées needs_user
-- « tache_sans_demarrage » (Ciddjy : 68 dépôts Beebs le 14/10 16:04-16:09).
-- Règle corrigée : migration 20261015020000 + get-pending-jobs v243 (tête de
-- file seule). Ces tâches n'ont JAMAIS commencé (aucun dépôt, aucun risque de
-- doublon) : elles reprennent leur place, par PAQUETS (variable :paquet / :n).
-- Relance = status pending, error NULL, attentes retirées (R11) ; erreurs_archivees
-- reçoit le message effacé ; republish_step n'existe pas (dépôts). Aucun mail.
-- Sauvegarde : _backup_1510_reprise (fermée à l'API). Inverse :
--   UPDATE cross_post_jobs j SET status = b.status, error = b.error, platform_fields = b.platform_fields
--     FROM _backup_1510_reprise b WHERE b.job_id = j.id AND b.paquet = '<paquet>' AND j.status = 'pending';
-- Usage : remplacer __USER__, __PAQUET__ et __N__ (taille du paquet) avant de jouer.

BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_1510_reprise (
  job_id uuid PRIMARY KEY, user_id uuid NOT NULL, status text, error text,
  platform_fields jsonb, paquet text NOT NULL, sauve_le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_1510_reprise ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1510_reprise FROM anon, authenticated;

WITH cible AS (
  SELECT j.id FROM public.cross_post_jobs j
   WHERE j.user_id = '__USER__' AND j.status = 'needs_user'
     AND j.platform_fields ->> 'needs_user_source' = 'tache_sans_demarrage'
     AND j.action = 'publish'  -- dépôts seulement : une republication se juge à part (étape)
   ORDER BY j.created_at, j.id
   LIMIT __N__
), sauve AS (
  INSERT INTO public._backup_1510_reprise (job_id, user_id, status, error, platform_fields, paquet)
  SELECT j.id, j.user_id, j.status, j.error, j.platform_fields, '__PAQUET__'
    FROM public.cross_post_jobs j JOIN cible c ON c.id = j.id
  ON CONFLICT (job_id) DO NOTHING
  RETURNING job_id
)
UPDATE public.cross_post_jobs j
   SET status = 'pending', error = NULL,
       platform_fields = (coalesce(j.platform_fields, '{}'::jsonb)
         - ARRAY['needs_user_source', 'needsUserField', 'needsUserAttempts', 'needsUserBoucle', 'needsUserResolved',
                 'next_action_after', 'error_technique', 'processing_since', 'needs_user_actif_ms', 'needs_user_tick_le',
                 'needs_user_vu_le', 'needs_user_vu_erreur', 'needs_user_sans_motif', 'tache_sans_demarrage'])
         || jsonb_build_object(
              'erreurs_archivees', coalesce(j.platform_fields -> 'erreurs_archivees', '[]'::jsonb)
                || jsonb_build_array(jsonb_build_object('le', now(), 'statut', j.status, 'erreur', left(coalesce(j.error, ''), 600),
                                                        'par', 'reprise 15/10 (tâche mise de côté à tort)')),
              'reprise_1510', jsonb_build_object('le', now(), 'paquet', '__PAQUET__',
                'motif', 'tache_sans_demarrage posée à tort (file servie entière) — règle corrigée, migration 20261015020000',
                'avant', j.platform_fields -> 'tache_sans_demarrage'))
 WHERE j.id IN (SELECT job_id FROM sauve) AND j.status = 'needs_user';
COMMIT;
