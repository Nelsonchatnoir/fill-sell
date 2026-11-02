-- 02/11 16:20 — Relance des trois rouges, APRÈS leurs correctifs de règle (ordre de Nico : « dès qu'un correctif est
-- déployé, relance ce qu'il débloque »). Le geste « Relancer » à l'identique : pending, erreur effacée et ARCHIVÉE,
-- needs_user_*, needsUserAttempts, next_action_after, error_technique, processing_since retirés ; erreurs_archivees et
-- republish_step CONSERVÉS. Photos, texte, prix, quotas, cadence : intouchés. Aucun mail. Sauvegarde + inverse.
--   1. gjehly (229c7b07…) : la tâche Vinted 3bd3cc17 (« content script ne répond pas », 13:00) — get-pending-jobs v326
--      (_shared/rotation-figes.js : une plateforme figée n'est plus affamée). Les 76 autres Vinted n'ont rien à effacer.
--   2. labrunettedu44 (d9a805cc…) : les republications Leboncoin en pause « Leboncoin a accepté cette même adresse… »
--      (faux) — update-job-status v167 (_shared/lbc-voie-des-reglages.js : autres écritures de la rue, puis la commune
--      prouvée). Pas retirées (étape captured). La tâche « le prix manque » (needs_user) n'est pas touchée.
--   3. sebastien64310 (48dd94f7…) : l'eBay 35926533 « aucune catégorie eBay sûre » (cassette VHS en « DVD, cinéma ›
--      Cassettes vidéo ») — ebay-api-worker v106 (rayons médias de la famille livres_medias). ebayCategorieAttente
--      retirée aussi : la relance repart en première passe (jamais « relancer = prendre la proposition d'eBay »).
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public._backup_0211_relances_trois_rouges (
  job_id uuid PRIMARY KEY, status text, error text, platform_fields jsonb, le timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._backup_0211_relances_trois_rouges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_0211_relances_trois_rouges FROM anon, authenticated;

WITH cible AS (
  SELECT j.id, j.status, j.error, j.platform_fields FROM public.cross_post_jobs j
   WHERE (j.user_id = '229c7b07-51f8-4ca6-835e-6b658f819427' AND j.platform = 'vinted' AND j.action = 'publish'
          AND j.status = 'pending' AND left(j.id::text, 8) = '3bd3cc17' AND j.error IS NOT NULL)
      OR (j.user_id = 'd9a805cc-61eb-4ca5-8d2e-a8095764b85f' AND j.platform = 'leboncoin' AND j.action = 'republish'
          AND j.status = 'pending' AND j.platform_fields->>'republish_step' = 'captured'
          AND j.error LIKE 'Republication Leboncoin en pause AVANT tout retrait : Leboncoin a accepté cette même adresse%')
      OR (j.id = '35926533-6da2-47a5-a89d-1c01f5629484' AND j.user_id = '48dd94f7-3105-49a7-af54-24d9c479a980'
          AND j.platform = 'ebay' AND j.status = 'needs_user' AND j.error LIKE 'Aucune catégorie eBay sûre%')
), sauve AS (
  INSERT INTO public._backup_0211_relances_trois_rouges (job_id, status, error, platform_fields)
  SELECT id, status, error, platform_fields FROM cible
  ON CONFLICT (job_id) DO NOTHING RETURNING job_id
)
UPDATE public.cross_post_jobs j
   SET status = 'pending', error = NULL,
       platform_fields = (j.platform_fields - 'next_action_after' - 'error_technique' - 'processing_since'
                          - 'needsUserAttempts' - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le'
                          - 'needs_user_vu_erreur' - 'needs_user_source' - 'needsUserField' - 'needsUserFields'
                          - 'ebayCategorieAttente')
         || jsonb_build_object(
              'erreurs_archivees', coalesce(j.platform_fields->'erreurs_archivees', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                'le', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'statut', cible.status,
                'erreur', left(coalesce(cible.error, ''), 500), 'par', 'relance_apres_correctif')),
              'reparation_0211_relance', jsonb_build_object('le', now(), 'par', 'scripts/reparations/20261102_relances_trois_rouges.sql',
                'motif', 'relance ordonnée par Nico après le correctif de la règle (get-pending-jobs v326, update-job-status v167, ebay-api-worker v106)'))
  FROM cible
 WHERE j.id = cible.id AND j.status = cible.status
RETURNING left(j.id::text, 8) AS job, j.platform, j.action, j.status;

COMMIT;
