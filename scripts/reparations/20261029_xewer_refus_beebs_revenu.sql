-- (29/10, lot A point 8 — G6) XEWER, republication Beebs 6a38d0b6 : Beebs a REFUSÉ la nouvelle annonce 34140079 à sa
-- vérification (refus prouvé le 25/10 10:24:02, refus_verification_beebs.numero = 34140079) ; 4 s plus tard la passe
-- « republication déjà recréée » de handler-watch l'a remise « published » sur ce numéro refusé (page publique relue
-- au navigateur le 29/10 : 404). Correctif de la RÈGLE : _shared/republication-finie.js (un numéro refusé n'est jamais
-- une remise en ligne finie) et _shared/beebs-sortie-verification.js (un refus vaut pour SON numéro).
-- CE SCRIPT : la tâche revient à son état refusé (statut et message archivés à 10:24:06), trace de la clôture levée.
-- Rien sur Beebs, aucun mail. Sauvegarde + inverse.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public._backup_2910_xewer_refus_beebs (
  job_id uuid PRIMARY KEY, status text, error text, platform_fields jsonb, le timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._backup_2910_xewer_refus_beebs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_2910_xewer_refus_beebs FROM anon, authenticated;

WITH cible AS (
  SELECT id, status, error, platform_fields FROM public.cross_post_jobs
   WHERE id = '6a38d0b6-ac74-4650-af2c-5454f3d86b4f'
     AND user_id = 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e'
     AND status = 'published' AND platform = 'beebs'
     AND platform_listing_id = '34140079'
     AND platform_fields->'refus_verification_beebs'->>'numero' = '34140079'
), sauve AS (
  INSERT INTO public._backup_2910_xewer_refus_beebs (job_id, status, error, platform_fields)
  SELECT id, status, error, platform_fields FROM cible
  ON CONFLICT (job_id) DO NOTHING RETURNING job_id
), message AS (
  SELECT e->>'erreur' AS texte
    FROM public.cross_post_jobs j, jsonb_array_elements(j.platform_fields->'erreurs_archivees') e
   WHERE j.id = '6a38d0b6-ac74-4650-af2c-5454f3d86b4f'
     AND e->>'par' = 'handler-watch (republication déjà recréée)' AND e->>'statut' = 'failed'
   ORDER BY e->>'le' DESC LIMIT 1
)
UPDATE public.cross_post_jobs j
   SET status = 'failed',
       error = (SELECT texte FROM message),
       platform_fields = (j.platform_fields - 'republication_finie')
         || jsonb_build_object('reparation_2910_refus', jsonb_build_object(
              'le', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'motif', 'numéro refusé par la vérification Beebs remis « published » par la passe « déjà recréée » (25/10 10:24:06) ; page 404 relue le 29/10',
              'republication_finie_avant', j.platform_fields->'republication_finie'))
  FROM sauve s
 WHERE j.id = s.job_id AND (SELECT texte FROM message) IS NOT NULL;

SELECT left(j.id::text, 8) AS job, j.status, left(j.error, 90) AS message
  FROM public.cross_post_jobs j WHERE j.id = '6a38d0b6-ac74-4650-af2c-5454f3d86b4f';
COMMIT;
