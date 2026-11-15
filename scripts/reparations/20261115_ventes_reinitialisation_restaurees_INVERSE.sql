-- 20261115_ventes_reinitialisation_restaurees_INVERSE.sql — inverse de 20261115_ventes_reinitialisation_restaurees.sql.
-- Retire de `ventes` les seules lignes remises par la restauration (id d'origine, décision « restauree »), SANS
-- déclencheur (ni pierre tombale, ni journal, ni push : c'est notre propre insertion qu'on défait), puis rend aux lignes
-- ventes_supprimees leur source et leur motif d'avant. Une vente remise puis MODIFIÉE depuis (prix d'achat saisi, etc.)
-- est retirée aussi : relire d'abord le VERIFIER § 4 (lignes modifiées depuis la restauration).
-- À jouer (décision de Nico) : npx supabase db query --linked -f scripts/reparations/20261115_ventes_reinitialisation_restaurees_INVERSE.sql
BEGIN;
SET LOCAL lock_timeout = '10s';
DO $inverse$
DECLARE
  v_n integer;
  v_t integer;
BEGIN
  IF to_regclass('public._backup_1511_ventes_reinitialisation') IS NULL THEN
    RAISE EXCEPTION 'sauvegarde absente (restauration jamais jouée, ou inverse déjà joué) : rien n''est écrit';
  END IF;
  ALTER TABLE public.ventes DISABLE TRIGGER USER;
  DELETE FROM public.ventes v USING public._backup_1511_ventes_reinitialisation b
   WHERE v.id = b.vente_id AND v.user_id = b.user_id AND b.decision = 'restauree';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  ALTER TABLE public.ventes ENABLE TRIGGER USER;
  UPDATE public.ventes_supprimees s SET source = b.source_avant, motif = b.motif_avant
    FROM public._backup_1511_ventes_reinitialisation b
   WHERE b.supprimee_id = s.id AND b.decision = 'restauree' AND s.motif LIKE 'restauree 15/11%';
  GET DIAGNOSTICS v_t = ROW_COUNT;
  RAISE NOTICE 'ventes retirées : % ; pierres tombales rendues à leur état d''avant : %', v_n, v_t;
END $inverse$;
ALTER TABLE public._backup_1511_ventes_reinitialisation RENAME TO _backup_1511_ventes_reinitialisation_inverse_joue;
COMMIT;
