-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PREUVE (lecture seule) de 20261113_de63ca45_date_de_test.sql — avant ET après, sans rien écrire
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Lu le 13/11 (AVANT) : aujourdhui_dans_le_texte 94 · modele_exact_sur_sa_ligne 92 (réparables) · forme_plus_tard 72
-- (« Jeu testé le <date> et fonctionnel. », non visée : elle n'est pas fausse, et get-pending-jobs la réécrit au jour de
-- l'envoi depuis la date qu'elle porte) · avec_teste_le 0 · poses_par_la_reparation 0.
-- ATTENDU APRÈS : aujourdhui_dans_le_texte 2 (les deux phrases hors modèle, question à Nico) · modele_exact_sur_sa_ligne 0
-- · poses_par_la_reparation = fiches_reparees du script (92 si rien n'a bougé) · forme_plus_tard 72.
-- À jouer : npx supabase db query --linked --read-only -f scripts/reparations/20261113_de63ca45_date_de_test_PREUVE.sql
WITH f AS (
  SELECT i.id, i.description d, i.attributs a
    FROM public.inventaire i
   WHERE i.user_id = 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e' AND i.statut = 'stock'
)
SELECT
  count(*) FILTER (WHERE d ~ 'testé aujourd.hui, le') AS aujourdhui_dans_le_texte,
  count(*) FILTER (WHERE d ~ '(^|\n)Jeu testé aujourd[’'']hui, le ((lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) )?\d{1,2}(er)? (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) \d{4}, et fonctionnel\.[ \t]*(\n|$)') AS modele_exact_sur_sa_ligne,
  count(*) FILTER (WHERE d ~ 'Jeu testé le \d') AS forme_plus_tard,
  count(*) FILTER (WHERE a ? 'teste_le') AS avec_teste_le,
  count(*) FILTER (WHERE a -> 'teste_le' ->> 'origine' = 'reparation_20261113_date_de_test') AS poses_par_la_reparation,
  string_agg(id::text, ', ') FILTER (WHERE d ~ 'testé aujourd.hui, le' AND d !~ '(^|\n)Jeu testé aujourd[’'']hui, le ((lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) )?\d{1,2}(er)? (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) \d{4}, et fonctionnel\.[ \t]*(\n|$)') AS hors_modele
FROM f;
