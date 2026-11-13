-- ═══════════════════════════════════════════════════════════════════════════
-- RATTRAPAGE (13/11/2026, lot du 13/11, agent N6a) — PRÉPARÉ, JAMAIS EXÉCUTÉ SANS LE FEU VERT DE NICO
-- « Un import qui retrouve le même objet le rattache » : la règle de la migration 20261113180000, appliquée aux
-- questions DÉJÀ posées (et encore ouvertes) qu'elle aurait réglées d'elle-même.
-- ═══════════════════════════════════════════════════════════════════════════
-- POURQUOI : la règle corrigée ne rejuge pas une fiche du dressing déjà jugée (rapprochement_comptes.vinted_juge_le l'a
-- dépassée) ; ces questions restent ouvertes tant que la personne ne répond pas, et le même objet reste vendable deux
-- fois (fiche du dressing sur Vinted d'un côté, import sur Leboncoin/eBay/Beebs de l'autre : une vente d'un côté ne
-- retire rien de l'autre). Réunies, une vente retire les copies (fusion automatique par photo identique : preuve de
-- retrait_job_prouve, comme toute fusion de la passe).
-- CIBLES (relues le 13/11, lecture seule : scripts/reparations/20261113_meme_objet_import_groupe_PREUVE.sql) : 3 questions,
-- 3 comptes — 25caeedd (7ee10946), bf85d176 (892d1bf0 : 1794494010078017 ← 1790174130756, le cas du 12/11), ebdf29f0
-- (359a4f52). Le script relit les cibles AU MOMENT de l'exécution par la fonction de la règle
-- (rapprochement_v3_import_rattachable) : une question répondue, une fiche touchée, vendue ou publiée entre-temps sort
-- d'elle-même de la liste.
-- GESTE : le circuit de l'app (inventaire_fusionner_pour, défaisable par « Défaire la fusion »), signé comme la règle
-- (« auto:photo_rapprochement_v3 (photo_identique) » : jamais « utilisateur ») ; la question passe « fusionnee »
-- (decide_par rapprochement_v3) ; la trace dans rapprochements (detail.rattrapage). Aucun retrait, aucune vente, aucun
-- mail, aucune notification, aucun quota (compteurs relus dans la transaction : la transaction s'annule sinon).
-- PRÉALABLE : la migration 20261113180000 appliquée (la fonction de la règle doit exister — sinon arrêt).
-- Sauvegardes : _backup_1311b_meme_objet_* (cibles, fiches, annonces, tâches, questions). Inverse :
-- scripts/reparations/20261113_meme_objet_import_groupe_INVERSE.sql.
--   npx supabase db query --linked -f scripts/reparations/20261113_meme_objet_import_groupe.sql
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('public.rapprochement_v3_import_rattachable(uuid,bigint,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'la migration 20261113180000 d''abord (rapprochement_v3_import_rattachable absente) : rien n''est fait';
  END IF;
END $$;

-- 1. LES CIBLES, figées (la règle elle-même, relue maintenant)
CREATE TABLE public._backup_1311b_meme_objet_cibles AS
  SELECT now() AS sauvegarde_le, d.id AS question, d.user_id, d.garde, d.absorbe, d.statut, d.decide_le, d.decide_par, d.fusion_id, d.preuves
    FROM public.inventaire_doublons d
    JOIN public.inventaire g ON g.id = d.garde AND g.user_id = d.user_id
    JOIN public.inventaire i ON i.id = d.absorbe AND i.user_id = d.user_id
   -- (13/11, 2e passage, feu vert de Nico : « réunis 25caeedd et ebdf29f0 comme le clavier »).
   WHERE (d.user_id::text LIKE '25caeedd%' OR d.user_id::text LIKE 'ebdf29f0%')
     AND d.statut = 'proposee' AND d.motif = 'photo_identique' AND d.preuves ->> 'article_modifie' = 'true'
     AND d.preuves ? 'vinted_nouvelle' AND jsonb_typeof(d.preuves -> 'groupe') = 'array'
     AND g.origine = 'vinted_sync' AND g.statut = 'stock' AND g.fusionne_dans IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.ventes v WHERE v.inventaire_id = g.id)
     AND public.rapprochement_v3_import_rattachable(d.user_id, d.absorbe, d.preuves -> 'groupe')
     AND NOT EXISTS (SELECT 1 FROM public.annonces_plateforme x JOIN public.annonces_plateforme y ON y.platform = x.platform
                      WHERE x.inventaire_id = i.id AND y.inventaire_id = g.id AND x.disparu_le IS NULL AND y.disparu_le IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.cross_post_jobs j JOIN public.annonces_plateforme x ON x.platform = j.platform
                      WHERE j.inventaire_id = g.id AND x.inventaire_id = i.id AND x.disparu_le IS NULL
                        AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
                        AND j.status IN ('published', 'pending', 'processing', 'needs_user'));
ALTER TABLE public._backup_1311b_meme_objet_cibles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1311b_meme_objet_cibles FROM PUBLIC, anon, authenticated;

CREATE TABLE public._backup_1311b_meme_objet_fiches AS
  SELECT now() AS sauvegarde_le, i.* FROM public.inventaire i
   WHERE i.id IN (SELECT garde FROM public._backup_1311b_meme_objet_cibles UNION SELECT absorbe FROM public._backup_1311b_meme_objet_cibles);
ALTER TABLE public._backup_1311b_meme_objet_fiches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1311b_meme_objet_fiches FROM PUBLIC, anon, authenticated;

CREATE TABLE public._backup_1311b_meme_objet_annonces AS
  SELECT now() AS sauvegarde_le, a.* FROM public.annonces_plateforme a
   WHERE a.inventaire_id IN (SELECT id FROM public._backup_1311b_meme_objet_fiches);
ALTER TABLE public._backup_1311b_meme_objet_annonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1311b_meme_objet_annonces FROM PUBLIC, anon, authenticated;

CREATE TABLE public._backup_1311b_meme_objet_jobs AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c
   WHERE c.inventaire_id IN (SELECT id FROM public._backup_1311b_meme_objet_fiches);
ALTER TABLE public._backup_1311b_meme_objet_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1311b_meme_objet_jobs FROM PUBLIC, anon, authenticated;

CREATE TABLE public._backup_1311b_meme_objet_questions AS
  SELECT now() AS sauvegarde_le, d.* FROM public.inventaire_doublons d
   WHERE d.statut = 'proposee'
     AND (d.garde IN (SELECT id FROM public._backup_1311b_meme_objet_fiches) OR d.absorbe IN (SELECT id FROM public._backup_1311b_meme_objet_fiches));
ALTER TABLE public._backup_1311b_meme_objet_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1311b_meme_objet_questions FROM PUBLIC, anon, authenticated;

-- Les compteurs « avant » des comptes touchés : aucun déclencheur ne doit avoir d'effet de bord.
CREATE TEMP TABLE _avant ON COMMIT DROP AS
  SELECT (SELECT count(*) FROM public.email_logs WHERE user_id IN (SELECT user_id FROM public._backup_1311b_meme_objet_cibles)) AS mails,
         (SELECT count(*) FROM public.push_ventes WHERE user_id IN (SELECT user_id FROM public._backup_1311b_meme_objet_cibles)) AS push,
         (SELECT count(*) FROM public.coin_ledger WHERE user_id IN (SELECT user_id FROM public._backup_1311b_meme_objet_cibles)) AS quotas,
         (SELECT count(*) FROM public.ventes WHERE user_id IN (SELECT user_id FROM public._backup_1311b_meme_objet_cibles)) AS ventes,
         (SELECT count(*) FROM public.cross_post_jobs WHERE action = 'delete' AND user_id IN (SELECT user_id FROM public._backup_1311b_meme_objet_cibles)) AS retraits;

-- 2. LA RÈGLE, question par question (le circuit de l'app, signé comme la passe)
DO $$
DECLARE c record; v jsonb; n_ok integer := 0; n_refus integer := 0;
BEGIN
  FOR c IN SELECT * FROM public._backup_1311b_meme_objet_cibles ORDER BY question LOOP
    v := public.inventaire_fusionner_pour(c.user_id, c.garde, c.absorbe, 'auto:photo_rapprochement_v3 (photo_identique)');
    IF NOT COALESCE((v ->> 'ok')::boolean, false) THEN
      n_refus := n_refus + 1;
      RAISE NOTICE 'question % (% ← %) : fusion refusée par le circuit (%), la question reste posée', c.question, c.garde, c.absorbe, v;
      CONTINUE;
    END IF;
    UPDATE public.inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'rapprochement_v3', fusion_id = (v ->> 'fusion_id')::uuid
     WHERE id = c.question AND statut = 'proposee';
    UPDATE public.inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
     WHERE user_id = c.user_id AND statut = 'proposee' AND (garde = c.absorbe OR absorbe = c.absorbe) AND motif IS DISTINCT FROM 'copie_non_prouvee';
    INSERT INTO public.rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    SELECT c.user_id, a.id, c.garde, 'attache', 'auto', 1,
           jsonb_build_object('motif', 'photo_identique', 'regle', 'rapprochement_v3', 'fusion', v ->> 'fusion_id', 'absorbe', c.absorbe,
                              'portee', 'vinted_nouvelle', 'import_groupe', true, 'question', c.question,
                              'rattrapage', '20261113_meme_objet_import_groupe', 'groupe', c.preuves -> 'groupe')
      FROM public._backup_1311b_meme_objet_annonces a WHERE a.inventaire_id = c.absorbe AND a.disparu_le IS NULL;
    n_ok := n_ok + 1;
  END LOOP;
  RAISE NOTICE 'rattrapage : % réunie(s), % refusée(s) par le circuit', n_ok, n_refus;
END $$;

-- 3. LA PREUVE dans la transaction : aucun mail, aucune notification, aucun quota, aucune vente, aucun retrait
DO $$
DECLARE a record; m bigint; p bigint; q bigint; v bigint; r bigint;
BEGIN
  SELECT * INTO a FROM _avant;
  SELECT count(*) INTO m FROM public.email_logs WHERE user_id IN (SELECT user_id FROM public._backup_1311b_meme_objet_cibles);
  SELECT count(*) INTO p FROM public.push_ventes WHERE user_id IN (SELECT user_id FROM public._backup_1311b_meme_objet_cibles);
  SELECT count(*) INTO q FROM public.coin_ledger WHERE user_id IN (SELECT user_id FROM public._backup_1311b_meme_objet_cibles);
  SELECT count(*) INTO v FROM public.ventes WHERE user_id IN (SELECT user_id FROM public._backup_1311b_meme_objet_cibles);
  SELECT count(*) INTO r FROM public.cross_post_jobs WHERE action = 'delete' AND user_id IN (SELECT user_id FROM public._backup_1311b_meme_objet_cibles);
  IF (m, p, q, v, r) IS DISTINCT FROM (a.mails, a.push, a.quotas, a.ventes, a.retraits) THEN
    RAISE EXCEPTION 'effet de bord : avant % / après %', row(a.mails, a.push, a.quotas, a.ventes, a.retraits), row(m, p, q, v, r);
  END IF;
END $$;

SELECT left(c.user_id::text, 8) AS compte, left(c.question::text, 8) AS question, c.garde, c.absorbe,
       i.fusionne_dans AS import_fusionne_dans, d.statut AS question_maintenant
  FROM public._backup_1311b_meme_objet_cibles c
  JOIN public.inventaire i ON i.id = c.absorbe
  JOIN public.inventaire_doublons d ON d.id = c.question
 ORDER BY 1;
COMMIT;
