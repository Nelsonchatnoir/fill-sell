-- INVERSE de scripts/reparations/20261113_meme_objet_import_groupe.sql (13/11/2026, lot du 13/11, agent N6a).
-- 1. Défait chaque fusion faite par le rattrapage, par le circuit de l'app (inventaire_defusionner_pour : chaque annonce
--    et chaque tâche reviennent à leur fiche, les champs repris sont rendus), de la plus récente à la plus ancienne —
--    seulement celles du rattrapage (signées par la règle, après la sauvegarde, sur les paires des cibles).
-- 2. Rend aux questions leur état d'avant (« proposee ») depuis _backup_1311_meme_objet_questions ; retire les traces
--    « rattrapage » de rapprochements.
-- Aucun mail, aucune vente, aucun retrait. Les sauvegardes restent (à effacer sur décision de Nico).
BEGIN;
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE f record; v jsonb; n integer;
BEGIN
  FOR f IN SELECT x.id, x.user_id FROM public.inventaire_fusions x
             JOIN public._backup_1311_meme_objet_cibles c ON c.user_id = x.user_id AND c.garde = x.garde AND c.absorbe = x.absorbe
            WHERE x.par = 'auto:photo_rapprochement_v3 (photo_identique)' AND x.defait_le IS NULL AND x.created_at >= c.sauvegarde_le
            ORDER BY x.created_at DESC
  LOOP
    v := public.inventaire_defusionner_pour(f.user_id, f.id, 'support (inverse 20261113_meme_objet_import_groupe)');
    IF COALESCE((v ->> 'ok')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'défusion % refusée : %', f.id, v; END IF;
  END LOOP;

  UPDATE public.inventaire_doublons d
     SET statut = b.statut, decide_le = b.decide_le, decide_par = b.decide_par, fusion_id = b.fusion_id
    FROM public._backup_1311_meme_objet_questions b
   WHERE d.id = b.id AND d.statut IN ('fusionnee', 'caduque') AND d.decide_par = 'rapprochement_v3' AND d.decide_le >= b.sauvegarde_le;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'questions rendues : %', n;

  DELETE FROM public.rapprochements r
   WHERE r.detail ->> 'rattrapage' = '20261113_meme_objet_import_groupe'
     AND r.user_id IN (SELECT user_id FROM public._backup_1311_meme_objet_cibles);
END $$;

SELECT left(c.user_id::text, 8) AS compte, left(c.question::text, 8) AS question, c.garde, c.absorbe,
       i.fusionne_dans AS import_fusionne_dans, d.statut AS question_maintenant
  FROM public._backup_1311_meme_objet_cibles c
  JOIN public.inventaire i ON i.id = c.absorbe
  JOIN public.inventaire_doublons d ON d.id = c.question
 ORDER BY 1;
COMMIT;
