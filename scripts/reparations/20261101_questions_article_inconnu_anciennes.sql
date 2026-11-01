-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 01/11 — LES QUESTIONS « RETIRE-LE AILLEURS » POSÉES CETTE NUIT SUR DES VENTES ANCIENNES : NEUTRALISÉES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Autorisation de Nico (01/11, point 4) : neutraliser la question sur les ventes de cette nuit (the_closet72, PILOU,
-- nadegemarcelin78), avec sauvegarde et inverse ; aucune vente supprimée, aucun mail.
-- Périmètre = la RÈGLE de 20261101073000 appliquée à l'instant où chaque question a été posée (même expression que
-- question_article_inconnu_due(vente.vendu_le, question.created_at), écrite ici pour que la réparation ne dépende pas
-- de la migration : date de vente connue et de moins de 48 h quand la commande a été lue) : sur les 125 questions
-- écrites entre 00:28 et
-- 02:52 (heure de Paris) le 01/11 pour ces trois comptes, les 123 qui portent sur une vente ancienne (the_closet72 106,
-- vendues du 29/08 au 11/11/2025 ; PILOU 17, du 30/12/2025 au 16/01/2026). Les 2 de nadegemarcelin78 portent sur des
-- ventes du 31/10 (07:36 et 14:06), lues moins de 24 h après : la règle les garde (une copie peut encore être en ligne
-- ailleurs) — elles ne sont pas touchées.
-- Neutraliser = la ligne usage_logs change de feature (« vente_vinted_article_inconnu_ancienne ») et perd son texte de
-- question ; elle garde commande, annonce, vente et prix, plus la trace de ce script. Les ventes, leurs compositions
-- (vinted_commandes_articles) et ventes_operations ne sont pas touchées.
-- Sauvegarde : _backup_0111_questions_article_inconnu (lignes entières). Inverse : …_INVERSE.sql.
-- Lancement : npx supabase db query --linked -f scripts/reparations/20261101_questions_article_inconnu_anciennes.sql
BEGIN;

DO $$
BEGIN
  IF to_regclass('public._backup_0111_questions_article_inconnu') IS NOT NULL THEN
    RAISE EXCEPTION 'déjà passé (_backup_0111_questions_article_inconnu existe) : rien n''est écrit';
  END IF;
END
$$;

CREATE TEMP TABLE _q ON COMMIT DROP AS
SELECT u.id, u.user_id, (u.metadata ->> 'vente')::bigint AS vente_id, v.vendu_le, u.created_at,
       (v.vendu_le IS NOT NULL AND v.vendu_le >= u.created_at - interval '48 hours') AS due
  FROM usage_logs u LEFT JOIN ventes v ON v.id = (u.metadata ->> 'vente')::bigint AND v.user_id = u.user_id
 WHERE u.feature = 'vente_vinted_article_inconnu'
   AND u.user_id IN ('8ac5bbda-0947-4612-82fd-effdaa3ca84a',   -- the_closet72
                     'cae7a20d-56c8-46a6-868c-ae1f885faa70',   -- PILOU
                     '8a2eba68-7a2d-4fc1-aab0-aba23189c33b')   -- nadegemarcelin78
   AND u.created_at >= '2026-11-01 00:00:00 Europe/Paris'::timestamptz
   AND u.created_at <  '2026-11-01 03:00:00 Europe/Paris'::timestamptz;

DO $$
DECLARE n_tot int; n_anc int; n_due int; n_sans int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE NOT due), count(*) FILTER (WHERE due), count(*) FILTER (WHERE vendu_le IS NULL)
    INTO n_tot, n_anc, n_due, n_sans FROM _q;
  IF n_tot <> 125 OR n_anc <> 123 OR n_due <> 2 OR n_sans <> 0 THEN
    RAISE EXCEPTION 'périmètre inattendu : % questions, % anciennes, % récentes, % sans vente datée (attendu 125/123/2/0) : rien n''est écrit',
      n_tot, n_anc, n_due, n_sans;
  END IF;
  IF EXISTS (SELECT 1 FROM _q WHERE NOT due AND user_id = '8a2eba68-7a2d-4fc1-aab0-aba23189c33b') THEN
    RAISE EXCEPTION 'une question de nadegemarcelin78 serait neutralisée : rien n''est écrit';
  END IF;
END
$$;

CREATE TABLE public._backup_0111_questions_article_inconnu AS
SELECT u.* FROM usage_logs u WHERE u.id IN (SELECT id FROM _q WHERE NOT due);
REVOKE ALL ON public._backup_0111_questions_article_inconnu FROM anon, authenticated;
ALTER TABLE public._backup_0111_questions_article_inconnu ENABLE ROW LEVEL SECURITY;

UPDATE usage_logs u
   SET feature = 'vente_vinted_article_inconnu_ancienne',
       metadata = (u.metadata - 'question') || jsonb_build_object('neutralisee', jsonb_build_object(
         'le', now(), 'motif', 'vente ancienne (plus de 48 h quand la commande a été lue) : aucune question',
         'par', 'scripts/reparations/20261101_questions_article_inconnu_anciennes.sql'))
 WHERE u.id IN (SELECT id FROM _q WHERE NOT due) AND u.feature = 'vente_vinted_article_inconnu';

DO $$
DECLARE n int; v int;
BEGIN
  SELECT count(*) INTO n FROM usage_logs WHERE feature = 'vente_vinted_article_inconnu_ancienne'
     AND id IN (SELECT id FROM public._backup_0111_questions_article_inconnu);
  SELECT count(*) INTO v FROM ventes WHERE id IN (SELECT vente_id FROM _q);
  IF n <> 123 OR v <> 125 THEN RAISE EXCEPTION 'contrôle après : % neutralisées, % ventes (attendu 123 / 125)', n, v; END IF;
  RAISE NOTICE 'OK : 123 questions neutralisées, 2 gardées (ventes récentes), 125 ventes intactes';
END
$$;

SELECT u.user_id, u.feature, count(*) FROM usage_logs u
 WHERE u.id IN (SELECT id FROM _q) GROUP BY 1, 2 ORDER BY 1, 2;

COMMIT;
