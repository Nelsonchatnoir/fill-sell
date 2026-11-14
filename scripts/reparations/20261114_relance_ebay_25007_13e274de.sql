-- 20261114_relance_ebay_25007_13e274de.sql — (14/11/2026 soir, point 2c de Nico) RELANCER LE SEUL JOB REFUSÉ PAR eBAY (25007)
-- une fois ebay-api-worker corrigé (_shared/ebay-livraison-refusee.js : la règle de livraison du compte refusée → une
-- autre règle prouvée du vendeur pour l'article).
-- Job 7b2c5d53-d2c5-4143-a9fb-16595536c06f (« Bracelet jonc manchette large résine marron… », compte 13e274de),
-- needs_user depuis 19:12:10 (2e refus 25007 avec la règle du compte 327113190011).
-- L'écriture est EXACTEMENT celle du bouton « Relancer » de l'app (StockTab.relancerJobEchoue, needs_user → pending) :
-- statut pending, erreur archivée (par « relance_reparation_1411 ») puis effacée, needsUserAttempts 0, compteur de
-- relances +1, marqueurs d'attente retirés. Rien d'autre : aucune annonce, aucune règle eBay, aucun autre job.
-- Sauvegarde : public._backup_1411_relance_ebay_25007 (la ligne telle qu'elle est). Inverse : …_INVERSE.sql.
-- Gardes : rien ne bouge si le job n'est plus needs_user avec le refus 25007, ou s'il porte déjà une règle choisie.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_1411_relance_ebay_25007 AS
  SELECT now() AS sauve_le, j.* FROM public.cross_post_jobs j WHERE false;
ALTER TABLE public._backup_1411_relance_ebay_25007 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1411_relance_ebay_25007 FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  v_id uuid := '7b2c5d53-d2c5-4143-a9fb-16595536c06f';
  j public.cross_post_jobs%ROWTYPE;
  v_pf jsonb;
  v_arch jsonb;
BEGIN
  SELECT * INTO j FROM public.cross_post_jobs WHERE id = v_id FOR UPDATE;
  IF NOT FOUND OR j.user_id <> '13e274de-7af1-4368-8c31-afe214252ca2'::uuid OR j.platform <> 'ebay' OR j.status <> 'needs_user'
     OR coalesce(j.error, '') NOT LIKE '%25007%' OR coalesce(j.platform_fields ->> 'ebayFulfillmentPolicyId', '') <> '' THEN
    RAISE EXCEPTION 'job différent de l''audit (statut %, erreur %) : rien fait', j.status, left(coalesce(j.error, ''), 60);
  END IF;
  INSERT INTO public._backup_1411_relance_ebay_25007 SELECT now(), j.*;
  v_arch := coalesce(j.platform_fields -> 'erreurs_archivees', '[]'::jsonb)
         || jsonb_build_array(jsonb_build_object('erreur', j.error, 'le', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'par', 'relance_reparation_1411', 'statut', j.status));
  v_pf := (j.platform_fields - 'next_action_after' - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le' - 'needs_user_vu_erreur'
                              - 'attente_session' - 'refus_passager')
       || jsonb_build_object(
            'needsUserAttempts', 0,
            'relances_manuelles', coalesce((j.platform_fields ->> 'relances_manuelles')::int, 0) + 1,
            'derniere_relance_manuelle', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'erreurs_archivees', v_arch,
            'relance_reparation_1411', jsonb_build_object('le', now(), 'par', 'point 2c de Nico (lot du 14/11 soir)'));
  UPDATE public.cross_post_jobs SET status = 'pending', error = NULL, platform_fields = v_pf WHERE id = v_id AND status = 'needs_user';
  RAISE NOTICE 'job % relancé (needs_user → pending)', v_id;
END $$;
COMMIT;
SELECT id, status, error, platform_fields ->> 'relances_manuelles' AS relances, platform_fields ->> 'derniere_relance_manuelle' AS relance_le
  FROM public.cross_post_jobs WHERE id = '7b2c5d53-d2c5-4143-a9fb-16595536c06f';
