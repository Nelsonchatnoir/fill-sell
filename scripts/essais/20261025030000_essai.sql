-- ═══════════════════════════════════════════════════════════════════════════
-- ESSAI À BLANC de 20261025030000_releve_introuvable_a_confirmer.sql (25/10 nuit)
-- ═══════════════════════════════════════════════════════════════════════════
-- Corps de la migration À L'IDENTIQUE, puis les contrôles ; la dernière instruction lève une exception qui
-- porte le bilan, la transaction est annulée. Attendu : « ESSAI À BLANC TERMINÉ — tout est annulé. 0 échec(s) ».
--   npx supabase db query --linked -f scripts/essais/20261025030000_essai.sql
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.releve_est_veille(p_declencheur text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(p_declencheur, '') IN ('cron', 'veilleur', 'serveur:retrait_introuvable',
    'serveur:retrait_sans_numero', 'serveur:verif_redepot', 'serveur:quotidien_api', 'serveur:lecture_origine',
    'serveur:introuvable_a_confirmer')
$function$;

DO $$
DECLARE
  v_bilan text := '';
  v_echecs integer := 0;
  v_cas record;
BEGIN
  FOR v_cas IN
    SELECT * FROM (VALUES
      ('serveur:introuvable_a_confirmer', true),
      ('cron', true), ('veilleur', true), ('serveur:retrait_introuvable', true), ('serveur:retrait_sans_numero', true),
      ('serveur:verif_redepot', true), ('serveur:quotidien_api', true), ('serveur:lecture_origine', true),
      ('app:synchroniser', false), ('serveur:autre', false), ('', false), (NULL, false)
    ) AS t(declencheur, attendu)
  LOOP
    IF public.releve_est_veille(v_cas.declencheur) IS DISTINCT FROM v_cas.attendu THEN
      v_echecs := v_echecs + 1;
      v_bilan := v_bilan || format(E'KO %s → %s (attendu %s)\n', coalesce(v_cas.declencheur, 'NULL'),
        public.releve_est_veille(v_cas.declencheur), v_cas.attendu);
    ELSE
      v_bilan := v_bilan || format(E'OK %s → %s\n', coalesce(v_cas.declencheur, 'NULL'), v_cas.attendu);
    END IF;
  END LOOP;
  RAISE EXCEPTION E'ESSAI À BLANC TERMINÉ — tout est annulé. % échec(s) sur 12 contrôles :\n%', v_echecs, v_bilan;
END $$;

ROLLBACK;
