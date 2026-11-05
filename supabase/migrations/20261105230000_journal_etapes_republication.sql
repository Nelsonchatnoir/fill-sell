-- ═══════════════════════════════════════════════════════════════════════════
-- LOT « OUVERTURE DU CLOUD », POINT 10 (05/11 soir) : L'HEURE DE CHAQUE ÉTAPE D'UNE REPUBLICATION, ENREGISTRÉE PAR LA BASE
-- ═══════════════════════════════════════════════════════════════════════════
-- PRÉPARÉE, NON APPLIQUÉE : feu vert NOMMÉ de Nico requis. Preuve sur Postgres jetable :
--   node scripts/preuve-journal-etapes-republication.mjs
-- Constat (05/11) : une republication ne garde que la DERNIÈRE heure de chaque étape (processing_since repart à chaque
-- essai, deleted_at / recreated_at sont écrits par l'horloge de l'ordinateur ou du Cloud, rien ne dit quand la tâche a
-- été prise) — impossible de dire, après coup, combien de temps chaque étape a pris ni où elle a attendu.
-- La règle : la BASE note chaque passage d'étape d'une republication, à SON heure (horloge du serveur), quel que soit
-- celui qui écrit (extension sur l'ordinateur, FillSell Cloud, fonctions edge, crons, fonctions SQL).
--   platform_fields.journal_etapes = [{ etape, statut, le }, …] — une entrée quand republish_step OU status change
--   (et à la création) ; 30 entrées au plus (les plus récentes) ; le journal est TENU PAR LA BASE : un client qui
--   réécrit platform_fields (copie ancienne, objet neuf) ne peut ni l'effacer ni le modifier, il est repris de la ligne.
-- Déclencheur BEFORE nommé zz_… : il passe APRÈS tous les autres déclencheurs BEFORE de cross_post_jobs (ordre
-- alphabétique ; les cross_post_jobs_* et garde_* peuvent encore changer le statut) — il note l'état FINAL de l'écriture.
-- Coût : republications seulement (WHEN), une comparaison de deux textes par écriture, un tableau de 30 entrées au plus ;
-- aucune écriture de plus (il complète la ligne déjà écrite), aucune ligne inchangée réécrite.
-- Inchangés : toutes les fonctions, la logique et l'ordre des étapes, les autres déclencheurs. Aucune donnée réécrite.
-- Inverse : supabase/rollbacks/20261105230000_journal_etapes_republication_INVERSE.sql (le journal déjà écrit reste,
-- inerte : rien ne le lit hors de l'affichage).

CREATE OR REPLACE FUNCTION public.journal_etapes_republication()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_etape text := COALESCE(NEW.platform_fields->>'republish_step', 'a_capturer');
  v_journal jsonb := '[]'::jsonb;
  v_n integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF jsonb_typeof(OLD.platform_fields->'journal_etapes') = 'array' THEN
      v_journal := OLD.platform_fields->'journal_etapes';
    END IF;
    IF v_etape IS NOT DISTINCT FROM COALESCE(OLD.platform_fields->>'republish_step', 'a_capturer')
       AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      -- Aucune étape franchie : le journal reste celui de la ligne (jamais celui d'une copie du client).
      IF jsonb_array_length(v_journal) > 0
         AND (NEW.platform_fields->'journal_etapes') IS DISTINCT FROM v_journal THEN
        NEW.platform_fields := COALESCE(NEW.platform_fields, '{}'::jsonb) || jsonb_build_object('journal_etapes', v_journal);
      END IF;
      RETURN NEW;
    END IF;
  END IF;
  v_journal := v_journal || jsonb_build_array(jsonb_build_object(
    'etape', v_etape,
    'statut', NEW.status,
    'le', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  v_n := jsonb_array_length(v_journal);
  IF v_n > 30 THEN
    SELECT jsonb_agg(x.e ORDER BY x.i) INTO v_journal
      FROM jsonb_array_elements(v_journal) WITH ORDINALITY AS x(e, i)
     WHERE x.i > v_n - 30;
  END IF;
  NEW.platform_fields := COALESCE(NEW.platform_fields, '{}'::jsonb) || jsonb_build_object('journal_etapes', v_journal);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.journal_etapes_republication() IS
  'Lot Ouverture du Cloud, point 10 (05/11) : note dans platform_fields.journal_etapes chaque passage d''étape (republish_step ou status) d''une republication, à l''heure du serveur ; 30 entrées au plus ; journal tenu par la base.';

DROP TRIGGER IF EXISTS zz_journal_etapes_republication ON public.cross_post_jobs;
CREATE TRIGGER zz_journal_etapes_republication
  BEFORE INSERT OR UPDATE OF status, platform_fields ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (NEW.action = 'republish')
  EXECUTE FUNCTION public.journal_etapes_republication();
