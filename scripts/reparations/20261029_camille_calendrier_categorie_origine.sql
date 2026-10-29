-- (29/10, lot A point 3 c) camille.ferren — « Kit calendrier de l'avent à construire » (republication Leboncoin c82117cd).
-- CAUSE : le pré-vol du 29/10 11:10 n'a pas LU l'étape catégorie (« Catégorie: ni suggestion ni sélecteur manuel
-- trouvés », page illisible) ; rayon-refuse-moteur prenait tout « Catégorie: » non « ok » pour un refus : la catégorie
-- d'origine (Loisirs › Loisirs créatifs, relevée sur l'annonce en ligne 3288747290 le 28/10 15:19) a été écartée, le
-- moteur a choisi « Jeux & Jouets », puis la même page illisible a posé la question « Leboncoin n'accepte plus la
-- catégorie ». Leboncoin n'a rien retiré. Correctif de la RÈGLE : _shared/rayon-refuse-moteur.js (seul un refus prouvé
-- entre dans le moteur) — à jouer APRÈS le déploiement de handler-watch / get-pending-jobs / update-job-status qui le portent.
-- CE SCRIPT : la catégorie d'origine revient, la question est levée, la republication repart (annonce toujours en ligne,
-- étape « captured » : rien n'a été retiré). Sauvegarde + inverse. Aucun mail.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public._backup_2910_camille_calendrier (
  job_id uuid PRIMARY KEY, status text, error text, platform_fields jsonb, le timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._backup_2910_camille_calendrier ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_2910_camille_calendrier FROM anon, authenticated;

WITH cible AS (
  SELECT id, status, error, platform_fields FROM public.cross_post_jobs
   WHERE id = 'c82117cd-6ec7-41e4-8f75-598ef7183695'
     AND user_id = '6a7595b1-d223-4e33-8951-e32e4ff4ac59'
     AND status = 'needs_user'
     AND platform_fields->>'needs_user_source' = 'champ_a_choisir'
     AND platform_fields->>'republish_step' = 'captured'
), sauve AS (
  INSERT INTO public._backup_2910_camille_calendrier (job_id, status, error, platform_fields)
  SELECT id, status, error, platform_fields FROM cible
  ON CONFLICT (job_id) DO NOTHING RETURNING job_id
)
UPDATE public.cross_post_jobs j
   SET status = 'pending',
       error = NULL,
       platform_fields = (j.platform_fields
         - 'needs_user_source' - 'needsUserField' - 'needsUserAttempts' - 'next_action_after' - 'error_technique'
         - 'processing_since' - 'rayon_moteur')
         || jsonb_build_object(
              'lbcCategoryPath', jsonb_build_array('Loisirs', 'Loisirs créatifs'),
              'erreurs_archivees', coalesce(j.platform_fields->'erreurs_archivees', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                'le', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                'par', 'scripts/reparations/20261029_camille_calendrier_categorie_origine.sql (lot A point 3 c)',
                'erreur', j.error, 'statut', j.status)),
              'reparation_2910_categorie', jsonb_build_object(
                'le', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                'avant', j.platform_fields->'lbcCategoryPath',
                'motif', 'pré-vol illisible pris pour un refus de catégorie ; catégorie d''origine relevée sur l''annonce 3288747290'))
  FROM sauve s
 WHERE j.id = s.job_id;

SELECT left(j.id::text, 8) AS job, j.status, j.platform_fields->'lbcCategoryPath' AS categorie
  FROM public.cross_post_jobs j WHERE j.id = 'c82117cd-6ec7-41e4-8f75-598ef7183695';
COMMIT;
