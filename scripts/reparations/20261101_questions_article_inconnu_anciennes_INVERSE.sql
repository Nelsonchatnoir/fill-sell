-- INVERSE de scripts/reparations/20261101_questions_article_inconnu_anciennes.sql : les 123 lignes usage_logs reprennent
-- leur feature et leur metadata d'avant (copie entière dans _backup_0111_questions_article_inconnu), puis la sauvegarde
-- est retirée. Aucune autre table touchée.
-- Lancement : npx supabase db query --linked -f scripts/reparations/20261101_questions_article_inconnu_anciennes_INVERSE.sql
BEGIN;

DO $$
BEGIN
  IF to_regclass('public._backup_0111_questions_article_inconnu') IS NULL THEN
    RAISE EXCEPTION 'sauvegarde _backup_0111_questions_article_inconnu absente : rien n''est écrit';
  END IF;
  IF (SELECT count(*) FROM public._backup_0111_questions_article_inconnu) <> 123 THEN
    RAISE EXCEPTION 'sauvegarde incomplète : rien n''est écrit';
  END IF;
END
$$;

UPDATE usage_logs u SET feature = b.feature, metadata = b.metadata
  FROM public._backup_0111_questions_article_inconnu b
 WHERE u.id = b.id AND u.feature = 'vente_vinted_article_inconnu_ancienne';

DO $$
BEGIN
  IF (SELECT count(*) FROM usage_logs u JOIN public._backup_0111_questions_article_inconnu b
        ON b.id = u.id AND b.feature = u.feature AND b.metadata = u.metadata) <> 123 THEN
    RAISE EXCEPTION 'inverse incomplet : rien n''est écrit';
  END IF;
END
$$;

DROP TABLE public._backup_0111_questions_article_inconnu;

COMMIT;
