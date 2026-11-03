-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ⛔ PRÉPARÉ le 03/11 soir — NON JOUÉ. Feu vert nommé de Nico requis (rapport docs/enquetes/retraits-a-tort-0311/RAPPORT.md § 3).
-- gjehly (Guillaume JEHLY, 229c7b07) : 93 publications en attente depuis le 03/11 10:49-10:51 (79 Vinted, 12 Leboncoin,
-- 2 eBay) sont nées marquées « programmée » par la marque d'une tâche d'AVANT (lot du 01/11, arrêté le 03/11 à 08:22),
-- recopiée par la carte de la fiche : get-pending-jobs les retient dans le créneau du soir, 8 par jour, sans un mot.
-- Le lot de 10:49 a été envoyé SANS programmation (la marque d'un envoi programmé porte l'heure du clic ; celles-ci
-- datent du 01/11 20:10 au 02/11 12:02, avant la création des tâches).
-- CE QUE ÇA FAIT : retire programmee / programmee_le de CES tâches (relues juste avant : même compte, publish, pending,
-- jamais servies, marque antérieure de plus de 2 min à la création). Elles prennent leur tour dans la file comme toute
-- publication « tout de suite » (cadence de la file inchangée). Rien chez Vinted, Leboncoin ou eBay ; aucun mail ;
-- aucun quota (une publication se compte à la génération). La marque d'origine est gardée dans
-- platform_fields.programmation_heritee_levee.
-- ⚠️ Question de Nico avant le feu vert : gjehly voulait-il « tout de suite » (l'écran le disait) ou son créneau du soir ?
--    S'il voulait son créneau, NE PAS JOUER : elles partiront 8 par soir, comme réglé.
-- Inverse : scripts/reparations/20261103_gjehly_programmation_heritee_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE public._backup_0311_gjehly_programmation AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c
   WHERE c.user_id = '229c7b07-51f8-4ca6-835e-6b658f819427' AND c.action = 'publish' AND c.status = 'pending'
     AND (c.platform_fields ->> 'programmee') = 'true' AND c.platform_fields ->> 'programmee_servie_le' IS NULL
     AND (c.platform_fields ->> 'programmee_le')::timestamptz < c.created_at - interval '2 minutes'
     AND c.created_at BETWEEN '2026-11-03 09:49+00' AND '2026-11-03 09:52+00';
ALTER TABLE public._backup_0311_gjehly_programmation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_0311_gjehly_programmation FROM PUBLIC, anon, authenticated;

DO $$
DECLARE n integer; v_attendu integer;
BEGIN
  -- 93 au 03/11 19:00 ; le créneau du soir en sert jusqu'à 8 par jour d'ici le jeu : 93 AU PLUS, toutes encore en attente.
  SELECT count(*) INTO v_attendu FROM public._backup_0311_gjehly_programmation;
  IF v_attendu < 1 OR v_attendu > 93 THEN RAISE EXCEPTION '1 à 93 tâches attendues, % trouvée(s) : relire avant de jouer', v_attendu; END IF;
  UPDATE public.cross_post_jobs c SET
    platform_fields = (c.platform_fields - ARRAY['programmee', 'programmee_le'])
      || jsonb_build_object('programmation_heritee_levee', jsonb_build_object(
           'le', now(), 'programmee_le', c.platform_fields ->> 'programmee_le',
           'par', 'réparation 03/11 (marque héritée du lot du 01/11, envoi « tout de suite » du 03/11 10:49)'))
   WHERE c.id IN (SELECT id FROM public._backup_0311_gjehly_programmation) AND c.status = 'pending'
     AND (c.platform_fields ->> 'programmee') = 'true' AND c.platform_fields ->> 'programmee_servie_le' IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> v_attendu THEN RAISE EXCEPTION '% mises à jour attendues, % faite(s)', v_attendu, n; END IF;
  RAISE NOTICE '% publications rendues à la file (marque héritée levée)', n;
END $$;
COMMIT;
