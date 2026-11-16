-- 20261116_joshua_prevol_borne_relance.sql — (16/11/2026, lot du midi, point 6 de Nico) LES DEUX VESTES BEEBS DE
-- joshua.sapone (f8a94c06), republications créées le 15/11 20:02, en needs_user « relancer » après 3 contrôles d'avant
-- retrait « trop lents » (292 s et 299 s sur une borne de 300 s) — APRÈS le déploiement de la règle « le premier contrôle
-- trop lent élargit la borne » (pas-de-rouge prevol_trop_lent, update-job-status) et du port allumé après un contrôle
-- trop lent (get-pending-jobs).
-- Ce que fait le script : la relance du bouton « Relancer » de l'app (needs_user → pending, erreur archivée puis effacée,
-- compteurs remis, marqueurs d'attente retirés) AVEC la borne de remplissage élargie à 20 min (fill_borne_ms, lue par
-- l'extension ≥ 0.6.178 même port éteint — son poste est en 0.6.186) : le contrôle d'avant retrait aura 14 min (0,7 × 20)
-- au lieu de 3 min 30. Rien n'est retiré par ce script : le contrôle passe d'abord, comme toujours.
-- Rien d'autre : aucune annonce, aucun autre job, aucun autre compte. Sauvegarde : public._backup_1611_joshua_prevol.
-- Inverse : 20261116_joshua_prevol_borne_relance_INVERSE.sql. Gardes : rien ne bouge si un job n'est plus needs_user, n'a
-- plus le motif prevol_trop_lent, ou n'est plus à l'étape « captured » (rien retiré).
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_1611_joshua_prevol AS
  SELECT now() AS sauve_le, j.* FROM public.cross_post_jobs j WHERE false;
ALTER TABLE public._backup_1611_joshua_prevol ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1611_joshua_prevol FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  v_user uuid := 'f8a94c06-51c5-4289-b434-8cc456e74c20';
  v_ids uuid[] := ARRAY[
    '3bb03a62-e10e-4d24-96f4-955c7f1dbc20',  -- Veste / manteau Salvatore Ferragamo (Beebs 34325556)
    'cc0479d6-93b9-45ac-8e91-e4c46d6e0a8e'   -- Veste noire VERSUS (Beebs 34325300)
  ]::uuid[];
  j public.cross_post_jobs%ROWTYPE;
  v_pf jsonb;
  v_arch jsonb;
  v_now text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  n int := 0;
  v_id uuid;
BEGIN
  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT * INTO j FROM public.cross_post_jobs WHERE id = v_id FOR UPDATE;
    IF NOT FOUND OR j.user_id <> v_user OR j.platform <> 'beebs' OR j.action <> 'republish' OR j.status <> 'needs_user'
       OR coalesce(j.platform_fields -> 'pas_de_rouge' ->> 'motif', '') <> 'prevol_trop_lent'
       OR coalesce(j.platform_fields ->> 'republish_step', '') <> 'captured' THEN
      RAISE EXCEPTION 'job % différent de l''audit (statut %, étape %) : rien fait', v_id, j.status, j.platform_fields ->> 'republish_step';
    END IF;
    INSERT INTO public._backup_1611_joshua_prevol SELECT now(), j.*;
    v_arch := coalesce(j.platform_fields -> 'erreurs_archivees', '[]'::jsonb)
           || jsonb_build_array(jsonb_build_object('erreur', j.error, 'le', v_now, 'par', 'relance_reparation_1611_prevol', 'statut', j.status));
    v_pf := (j.platform_fields - 'next_action_after' - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le'
                                - 'needs_user_vu_erreur' - 'needsUserField' - 'needsUserFields' - 'needsUserBoucle'
                                - 'needs_user_source' - 'needs_user_sans_motif' - 'processing_since')
         || jsonb_build_object(
              'needsUserAttempts', 0,
              'pas_de_rouge_reprises', 0,
              'fill_borne_ms', 1200000,
              'relances_manuelles', coalesce((j.platform_fields ->> 'relances_manuelles')::int, 0) + 1,
              'derniere_relance_manuelle', v_now,
              'erreurs_archivees', v_arch,
              'relance_reparation_1611', jsonb_build_object('le', now(), 'par', 'point 6 de Nico (lot du 16/11 midi)', 'fill_borne_ms', 1200000));
    UPDATE public.cross_post_jobs SET status = 'pending', error = NULL, platform_fields = v_pf WHERE id = v_id AND status = 'needs_user';
    n := n + 1;
  END LOOP;
  RAISE NOTICE '% job(s) relancé(s) avec une borne de 20 min (needs_user → pending)', n;
END $$;
COMMIT;
SELECT left(id::text, 8) AS job, status, platform_fields ->> 'fill_borne_ms' AS borne, platform_fields ->> 'pas_de_rouge_reprises' AS reprises
  FROM public.cross_post_jobs WHERE id IN (SELECT id FROM public._backup_1611_joshua_prevol) ORDER BY 1;
