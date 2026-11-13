-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PREUVE (lecture seule) de 20261113_de63ca45_date_de_test.sql — avant ET après, sans rien écrire
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Lu le 13/11 (AVANT) : aujourdhui_dans_le_texte 94 · modele_exact_sur_sa_ligne 92 (réparables, famille « aujourdhui »)
-- · testé_le_dans_le_texte 72 · forme_plus_tard_reparable 67 (famille « plus_tard », décision de Nico du 13/11, H2 :
-- « Jeu testé le <date complète>, fonctionne correctement. » seulement) · hors_modele_plus_tard 5 (1789717142347006
-- « UMD testé le … », 1789717145612007 « … le 17 août, … » et 1789717154274004 « … le 31 mai, … » sans année, et les deux
-- autres fins « fonctionne parfaitement » / « se lance et fonctionne correctement », gardées mot pour mot : non touchées)
-- · avec_teste_le 0 · poses_par_la_reparation 0.
-- ⚠️ (13/11, lot NU) La note d'avant disait les 72 « Jeu testé le <date> » « réécrites au jour de l'envoi » par
-- get-pending-jobs : FAUX — aucune ne suit son modèle (« Jeu testé le [date] et fonctionnel. »), le service ne les
-- reconnaît pas et les envoie telles quelles (scripts/date-test-forme-plus-tard-selftest.mjs).
-- ATTENDU APRÈS : aujourdhui_dans_le_texte 2 (les deux phrases hors modèle, question à Nico) · modele_exact_sur_sa_ligne 0
-- · forme_plus_tard_reparable 0 · testé_le_dans_le_texte 5 (les 5 hors modèle) · poses_par_la_reparation = fiches_reparees
-- du script (92 + 67 = 159 si rien n'a bougé).
-- À jouer : npx supabase db query --linked --read-only -f scripts/reparations/20261113_de63ca45_date_de_test_PREUVE.sql
WITH f AS (
  SELECT i.id, i.description d, i.attributs a,
         (SELECT count(*) FROM regexp_matches(i.description, 'testé (aujourd.hui|le )', 'g')) AS n_phrases
    FROM public.inventaire i
   WHERE i.user_id = 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e' AND i.statut = 'stock'
), p AS (
  SELECT f.*, d ~ '(^|\n)Jeu testé le ((lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) )?\d{1,2}(er)? (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) \d{4}, fonctionne correctement\.[ \t]*(\n|$)' AS plus_tard_modele
    FROM f
)
SELECT
  count(*) FILTER (WHERE d ~ 'testé aujourd.hui, le') AS aujourdhui_dans_le_texte,
  count(*) FILTER (WHERE d ~ '(^|\n)Jeu testé aujourd[’'']hui, le ((lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) )?\d{1,2}(er)? (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) \d{4}, et fonctionnel\.[ \t]*(\n|$)') AS modele_exact_sur_sa_ligne,
  count(*) FILTER (WHERE d ~ 'Jeu testé le \d') AS forme_plus_tard,
  count(*) FILTER (WHERE d ~ 'testé le (\d|1er)') AS "testé_le_dans_le_texte",
  count(*) FILTER (WHERE plus_tard_modele AND n_phrases = 1 AND NOT (a ? 'teste_le')) AS forme_plus_tard_reparable,
  count(*) FILTER (WHERE a ? 'teste_le') AS avec_teste_le,
  count(*) FILTER (WHERE a -> 'teste_le' ->> 'origine' = 'reparation_20261113_date_de_test') AS poses_par_la_reparation,
  string_agg(id::text, ', ') FILTER (WHERE d ~ 'testé aujourd.hui, le' AND d !~ '(^|\n)Jeu testé aujourd[’'']hui, le ((lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) )?\d{1,2}(er)? (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) \d{4}, et fonctionnel\.[ \t]*(\n|$)') AS hors_modele,
  string_agg(id::text, ', ') FILTER (WHERE d ~ 'testé le (\d|1er)' AND NOT (plus_tard_modele AND n_phrases = 1)) AS hors_modele_plus_tard
FROM p;
