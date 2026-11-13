-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- RÉPARATION 13/11 (lot « zéro problème », point 5a de Nico) — compte de63ca45 : la date de test SORT du texte
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- NON EXÉCUTÉE : feu vert de Nico requis, et APRÈS le déploiement de get-pending-jobs qui écrit la phrase au service
-- (src/utils/blocsDescription.js, rendreDescriptionAuService) — sinon les fiches réparées partiraient SANS phrase de test
-- jusqu'à ce déploiement (garde ci-dessous : elle ne voit pas le code déployé, c'est à l'opérateur de le vérifier :
-- `npx supabase functions list`, version de get-pending-jobs postérieure au lot).
-- Ce qui se passe (lecture seule du 13/11, heure de Paris) : ses consignes demandent « Jeu testé aujourd’hui, le [date], et
-- fonctionnel. » le jour même, « Jeu testé le [date] et fonctionnel. » plus tard. La phrase du jour même était FIGÉE dans
-- le texte de 94 fiches en stock et recopiée par chaque republication (70 annonces Vinted en ligne, 80 republications
-- Leboncoin en 12 jours avec 17 jours de retard médian, 54 au plus).
-- LA RÈGLE (pour tous les comptes, dans le code) : la date est une donnée — inventaire.attributs.teste_le
-- ({v: 'AAAA-MM-JJ', source: 'manuel'}) — et la phrase est écrite à chaque envoi selon le modèle du vendeur, omise là où la
-- plateforme la refuse (Beebs). Ce script range les 94 fiches dans cette règle :
--   · 92 portent la phrase EXACTE de son modèle, seule sur sa ligne, une seule fois : la phrase sort du texte (avec la
--     ligne vide qui la précède), sa date entre dans attributs.teste_le. Le texte du vendeur ne change en rien d'autre.
--   · 2 ne suivent pas son modèle (« … et fonctionne parfaitement. », « ✅ Ensemble intégralement testé aujourd'hui… ») :
--     NON touchées — question posée à Nico (rapport de l'étape 5, agent H).
-- ⛔ AUCUNE ANNONCE NI AUCUNE TÂCHE N'EST TOUCHÉE : les annonces en ligne gardent leur texte jusqu'à leur prochaine
--    republication, qui recevra la phrase du jour (get-pending-jobs ; recréation Vinted : extension 0.6.187).
-- ⛔ Une fiche dont le texte a changé entre la sauvegarde et l'écriture n'est pas écrite (garde sur le texte exact).
-- Sauvegarde : public._backup_1113_de63ca45_date_de_test (RLS, aucun accès client). Inverse :
-- 20261113_de63ca45_date_de_test_INVERSE.sql. Lecture : 20261113_de63ca45_date_de_test_PREUVE.sql.
-- Essai : remplacer COMMIT par ROLLBACK. À jouer : npx supabase db query --linked -f scripts/reparations/20261113_de63ca45_date_de_test.sql
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $garde$
BEGIN
  IF to_regclass('public._backup_1113_de63ca45_date_de_test') IS NOT NULL THEN
    RAISE EXCEPTION 'script déjà passé (sauvegarde présente) : rien n''est écrit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e') THEN
    RAISE EXCEPTION 'compte de63ca45 introuvable : rien n''est écrit';
  END IF;
END
$garde$;

-- Les fiches : en stock, la phrase EXACTE du modèle « jour même », seule sur sa ligne, une seule fois, date lisible.
CREATE TABLE public._backup_1113_de63ca45_date_de_test AS
WITH mois(nom, n) AS (
  VALUES ('janvier', 1), ('février', 2), ('mars', 3), ('avril', 4), ('mai', 5), ('juin', 6), ('juillet', 7), ('août', 8),
         ('septembre', 9), ('octobre', 10), ('novembre', 11), ('décembre', 12)
), c AS (
  SELECT i.id AS inventaire_id, i.user_id, i.description AS description_avant, i.attributs AS attributs_avant,
         regexp_match(i.description,
           '(?:^|\n)(Jeu testé aujourd[’'']hui, le (?:(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) )?(\d{1,2})(?:er)? (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) (\d{4}), et fonctionnel\.)[ \t]*(?:\n|$)') AS m
    FROM public.inventaire i
   WHERE i.user_id = 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e' AND i.statut = 'stock'
     AND i.description ~ 'testé aujourd.hui, le'
     AND (SELECT count(*) FROM regexp_matches(i.description, 'testé aujourd.hui', 'g')) = 1
     AND NOT (i.attributs ? 'teste_le')
)
SELECT c.inventaire_id, c.user_id, c.description_avant, c.attributs_avant, c.m[1] AS phrase,
       make_date(c.m[4]::int, (SELECT n FROM mois WHERE nom = c.m[3]), c.m[2]::int) AS teste_le,
       -- La phrase sort avec les lignes vides qui la précèdent ; un texte qui commençait par elle perd ses sauts de ligne de tête.
       ltrim(regexp_replace(c.description_avant,
         '\n*(?:^|(?<=\n))' || regexp_replace(c.m[1], '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '[ \t]*', ''), E'\n') AS description_apres,
       NULL::jsonb AS attributs_apres,
       now() AS sauvegarde_le
  FROM c
 WHERE c.m IS NOT NULL;
ALTER TABLE public._backup_1113_de63ca45_date_de_test ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_1113_de63ca45_date_de_test FROM PUBLIC, anon, authenticated;

DO $verif_avant$
DECLARE n int; k int;
BEGIN
  SELECT count(*) INTO n FROM public._backup_1113_de63ca45_date_de_test;
  -- 92 lues le 13/11 : une marge pour les fiches vendues ou retouchées entre-temps, jamais au-delà.
  IF n < 80 OR n > 92 THEN RAISE EXCEPTION 'fiches retenues : % (92 attendues le 13/11) — rien n''est écrit', n; END IF;
  SELECT count(*) INTO k FROM public._backup_1113_de63ca45_date_de_test
   WHERE teste_le IS NULL OR description_apres ~ 'testé aujourd.hui' OR description_apres = description_avant
      OR length(description_avant) - length(description_apres) NOT BETWEEN length(phrase) AND length(phrase) + 4;
  IF k > 0 THEN RAISE EXCEPTION '% fiche(s) dont la phrase ne sort pas proprement : rien n''est écrit', k; END IF;
END
$verif_avant$;

-- La date, posée comme une valeur du vendeur (c'est son texte) ; la fusion des attributs l'ajoute (clé absente).
UPDATE public.inventaire i
   SET description = b.description_apres,
       attributs = COALESCE(i.attributs, '{}'::jsonb) || jsonb_build_object('teste_le', jsonb_build_object(
         'v', to_char(b.teste_le, 'YYYY-MM-DD'), 'source', 'manuel', 'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
         'origine', 'reparation_20261113_date_de_test'))
  FROM public._backup_1113_de63ca45_date_de_test b
 WHERE i.id = b.inventaire_id AND i.description = b.description_avant AND NOT (i.attributs ? 'teste_le');

UPDATE public._backup_1113_de63ca45_date_de_test b SET attributs_apres = i.attributs
  FROM public.inventaire i WHERE i.id = b.inventaire_id;

DO $verif$
DECLARE n int; ecrits int;
BEGIN
  SELECT count(*) INTO n FROM public._backup_1113_de63ca45_date_de_test;
  SELECT count(*) INTO ecrits FROM public._backup_1113_de63ca45_date_de_test b JOIN public.inventaire i ON i.id = b.inventaire_id
   WHERE i.description = b.description_apres AND i.attributs -> 'teste_le' ->> 'v' = to_char(b.teste_le, 'YYYY-MM-DD')
     AND (i.attributs - 'teste_le') = (COALESCE(b.attributs_avant, '{}'::jsonb) - 'teste_le');
  IF ecrits <> n THEN RAISE EXCEPTION 'réparation incomplète ou débordante (% écrites sur %) : rien n''est écrit', ecrits, n; END IF;
END
$verif$;

SELECT count(*) AS fiches_reparees, min(teste_le) AS premiere_date, max(teste_le) AS derniere_date,
       min(sauvegarde_le AT TIME ZONE 'Europe/Paris') AS sauvegarde_paris
  FROM public._backup_1113_de63ca45_date_de_test;
COMMIT;
