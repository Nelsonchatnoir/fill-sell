-- 01/11 — Jocabroc (53efea05…) : la publication Vinted de « Lot 16 vêtements femme DESIGUAL S XL » (fiche 1793426438309,
-- 24 photos, quantité 1) a échoué deux fois (07:56 → ffd0c9d4, 08:08 → df47c657) : « Les photos ne sont pas arrivées
-- sur Vinted : 20/24 confirmée(s) après 96/97 s. Publication interrompue AVANT le dépôt » — Vinted garde 20 photos au
-- plus. Jocabroc a ensuite arrêté les deux dans sa file (08:05 et 08:14). Correctif de la RÈGLE : get-pending-jobs v316
-- (_shared/photos-limite-plateforme.js) n'envoie à Vinted que les 20 premières photos du job.
-- CE SCRIPT (relance autorisée par Nico, « une fois le correctif en place ») : le geste « Relancer » de l'app
-- (relancerJobEchoue), à l'identique, sur UNE seule des deux tâches — la plus récente, df47c657. Les deux publient le
-- MÊME article (quantité 1) : relancer les deux mettrait deux annonces Vinted pour un seul exemplaire. ffd0c9d4 reste
-- arrêtée. Pending, erreur effacée et archivée, reprises remises à zéro, marques d'arrêt de la personne retirées (gardées
-- dans la sauvegarde) ; photos, texte, prix, quota : intouchés. Aucune autre tâche, aucun mail. Sauvegarde + inverse.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public._backup_0111_jocabroc_relance_vinted (
  job_id uuid PRIMARY KEY, status text, error text, platform_fields jsonb, le timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._backup_0111_jocabroc_relance_vinted ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_0111_jocabroc_relance_vinted FROM anon, authenticated;

DO $$
BEGIN
  -- Aucune annonce Vinted vivante ni tâche Vinted en cours pour cet article : sinon rien.
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs k WHERE k.inventaire_id = 1793426438309 AND k.platform = 'vinted'
              AND k.status IN ('pending', 'processing', 'published', 'needs_user'))
     OR EXISTS (SELECT 1 FROM public.inventaire i WHERE i.id = 1793426438309 AND (i.statut <> 'stock' OR i.vinted_item_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'l''article a déjà une annonce ou une tâche Vinted, ou n''est plus en stock : rien n''est écrit';
  END IF;
END
$$;

WITH cible AS (
  SELECT j.id, j.status, j.error, j.platform_fields FROM public.cross_post_jobs j
   WHERE j.id = 'df47c657-6b1c-43c0-b6a1-b5260dc6adfd' AND j.user_id = '53efea05-dc2d-4467-a8cd-c6fa52a47a61'
     AND j.platform = 'vinted' AND j.action = 'publish' AND j.status = 'cancelled' AND j.inventaire_id = 1793426438309
     AND j.platform_fields->>'error_technique' LIKE '%confirmée(s) après%'
), sauve AS (
  INSERT INTO public._backup_0111_jocabroc_relance_vinted (job_id, status, error, platform_fields)
  SELECT id, status, error, platform_fields FROM cible
  ON CONFLICT (job_id) DO NOTHING RETURNING job_id
)
UPDATE public.cross_post_jobs j
   SET status = 'pending', error = NULL,
       platform_fields = (j.platform_fields - 'next_action_after' - 'arret_utilisateur' - 'annulee_dans_la_file'
                          - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le' - 'needs_user_vu_erreur'
                          - 'attente_session' - 'refus_passager')
         || jsonb_build_object(
              'needsUserAttempts', 0,
              'relances_manuelles', coalesce((j.platform_fields->>'relances_manuelles')::int, 0) + 1,
              'derniere_relance_manuelle', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'erreurs_archivees', coalesce(j.platform_fields->'erreurs_archivees', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                'le', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'statut', 'cancelled',
                'erreur', left(coalesce(j.error, ''), 500), 'par', 'relance_manuelle')),
              'reparation_0111_relance', jsonb_build_object('le', now(), 'par', 'scripts/reparations/20261101_jocabroc_relance_vinted_24_photos.sql',
                'motif', 'relance autorisée par Nico après le correctif « Vinted : 20 photos au plus » (get-pending-jobs v316)'))
  FROM cible
 WHERE j.id = cible.id AND j.status = 'cancelled'
RETURNING left(j.id::text, 8) AS job, j.status, jsonb_array_length(j.photos) AS photos_en_base;

COMMIT;
