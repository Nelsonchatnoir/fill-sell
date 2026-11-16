-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261116_ayadi_remplacer_compte_lbc.sql — le compte cfdfda6f (cfdfda6f-d182-4974-81b2-07050fc95d37)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Remet ses annonces et ses tâches Leboncoin dans l'état gardé par la trace du DERNIER remplacement fait par ce script
-- (comptes_plateforme_remplacements, par = 'script'), sans déclencher aucun effet (session_replication_role = replica,
-- comme l'inverse de la migration) ; seulement les lignes encore dans l'état où le remplacement les a mises (une ligne
-- changée depuis est laissée et nommée) ; une tâche dont la clôture a rendu des quotas ou libéré une réservation n'est
-- pas remise en file. Puis le registre d'avant (cfdfda6f n'avait aucun compte suivi : ses lignes partent). Les questions
-- « Vendue ? » reviennent avec leurs tâches (état d'avant). Compteurs de tâches : remis à « inconnu » (le poll relit).
-- Seconde source si la trace manquait : _backup_1611_ayadi_lbc_annonces / _backup_1611_ayadi_lbc_taches.
-- JOUER : npx supabase db query --linked -f scripts/reparations/20261116_ayadi_remplacer_compte_lbc_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL session_replication_role = replica;
DO $inverse_compte$
DECLARE r public.comptes_plateforme_remplacements%ROWTYPE; x jsonb; v int; n_a int := 0; n_t int := 0; n_saut int := 0; n_paye int := 0;
BEGIN
  SELECT * INTO r FROM public.comptes_plateforme_remplacements
   WHERE user_id = 'cfdfda6f-d182-4974-81b2-07050fc95d37' AND platform = 'leboncoin' AND par = 'script'
   ORDER BY le DESC LIMIT 1;
  IF r.id IS NULL THEN RAISE EXCEPTION 'aucun remplacement « script » du compte cfdfda6f à défaire'; END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(COALESCE(r.avant -> 'taches', '[]'::jsonb)) LOOP
    IF EXISTS (SELECT 1 FROM public.cross_post_jobs j WHERE j.id = (x ->> 'id')::uuid
                 AND (((j.platform_fields ->> 'pepite_remboursee') = 'true' AND (x #>> '{platform_fields,pepite_remboursee}') IS DISTINCT FROM 'true')
                      OR (j.reservation_settled_at IS NOT NULL AND (x ->> 'reservation_settled_at') IS NULL))) THEN
      n_paye := n_paye + 1; RAISE NOTICE 'tâche % non remise en file (quotas rendus)', x ->> 'id'; CONTINUE;
    END IF;
    UPDATE public.cross_post_jobs j SET status = x ->> 'status', error = x ->> 'error', platform_fields = x -> 'platform_fields'
     WHERE j.id = (x ->> 'id')::uuid AND j.status = 'cancelled' AND (j.platform_fields #>> '{compte_quitte,remplacement}') = r.id::text;
    GET DIAGNOSTICS v = ROW_COUNT;
    IF v = 0 THEN n_saut := n_saut + 1; RAISE NOTICE 'tâche % changée depuis, laissée', x ->> 'id'; END IF;
    n_t := n_t + v;
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(COALESCE(r.avant -> 'annonces', '[]'::jsonb)) LOOP
    UPDATE public.annonces_plateforme a SET disparu_le = NULLIF(x ->> 'disparu_le', '')::timestamptz,
           compte_quitte_le = NULLIF(x ->> 'compte_quitte_le', '')::timestamptz, updated_at = (x ->> 'updated_at')::timestamptz
     WHERE a.id = (x ->> 'id')::uuid AND a.compte_quitte_le IS NOT NULL AND a.disparu_le IS NOT DISTINCT FROM a.compte_quitte_le;
    GET DIAGNOSTICS v = ROW_COUNT; n_a := n_a + v;
    UPDATE public.annonces_plateforme a SET compte_quitte_le = NULL WHERE a.id = (x ->> 'id')::uuid AND a.compte_quitte_le IS NOT NULL;
  END LOOP;
  DELETE FROM public.comptes_plateforme_suivi WHERE user_id = r.user_id AND platform = r.platform;
  INSERT INTO public.comptes_plateforme_suivi
  SELECT * FROM jsonb_populate_recordset(NULL::public.comptes_plateforme_suivi, COALESCE(r.avant -> 'registre', '[]'::jsonb));
  UPDATE public.compte_signal SET jobs = NULL, maj_le = now() WHERE user_id = r.user_id;
  RAISE NOTICE 'inverse cfdfda6f (remplacement %) : % annonce(s), % tâche(s) remises ; % laissée(s) ; % non remise(s) en file',
    r.id, n_a, n_t, n_saut, n_paye;
END $inverse_compte$;
COMMIT;
