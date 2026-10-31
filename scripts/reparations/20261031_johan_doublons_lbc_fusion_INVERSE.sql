-- INVERSE de scripts/reparations/20261031_johan_doublons_lbc_fusion.sql (lot F, 31/10).
-- Défait les fusions de la réparation par la fonction « Défaire » de l'app (inventaire_defusionner_pour, journalisée),
-- dans l'ordre inverse, puis rouvre les 13 questions telles que sauvegardées (_backup_3110_johan_doublons_questions).
-- Les fusions visées sont celles que la réparation a tracées (usage_logs « reparation_lot_f_doublons_lbc »).
BEGIN;
CREATE TEMP TABLE _fusions ON COMMIT DROP AS
  SELECT (f ->> 'ordre')::int ordre, (f ->> 'fusion_id')::uuid fusion_id
    FROM usage_logs u, jsonb_array_elements(u.metadata -> 'fusions') f
   WHERE u.user_id = '7b9d8a71-6464-457f-abdc-9baee2a8543f' AND u.feature = 'reparation_lot_f_doublons_lbc'
     AND u.created_at = (SELECT max(created_at) FROM usage_logs WHERE user_id = '7b9d8a71-6464-457f-abdc-9baee2a8543f' AND feature = 'reparation_lot_f_doublons_lbc');
DO $$
DECLARE r record; res jsonb;
BEGIN
  IF (SELECT count(*) FROM _fusions) <> 13 THEN RAISE EXCEPTION 'trace de la réparation introuvable ou incomplète'; END IF;
  FOR r IN SELECT * FROM _fusions ORDER BY ordre DESC LOOP
    res := public.inventaire_defusionner_pour('7b9d8a71-6464-457f-abdc-9baee2a8543f', r.fusion_id, 'reparation_inverse_lot_f');
    IF NOT coalesce((res ->> 'ok')::boolean, false) THEN RAISE EXCEPTION 'défusion % refusée : %', r.ordre, res; END IF;
  END LOOP;
END $$;
UPDATE inventaire_doublons q
   SET statut = b.statut, decide_le = b.decide_le, decide_par = b.decide_par, fusion_id = b.fusion_id
  FROM (SELECT DISTINCT ON (id) * FROM _backup_3110_johan_doublons_questions ORDER BY id, sauve_le) b
 WHERE q.id = b.id;
INSERT INTO usage_logs (user_id, feature, metadata)
VALUES ('7b9d8a71-6464-457f-abdc-9baee2a8543f', 'reparation_lot_f_doublons_lbc_inverse', jsonb_build_object('par', 'claude (inverse du lot F)'));
COMMIT;
